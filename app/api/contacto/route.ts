import { createHash } from 'node:crypto';
import { Resend } from 'resend';
import { contactRequestSchema, firstValidationMessage } from '@/lib/contacto-schema';
import { getPrisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_REQUESTS_PER_WINDOW = 5;
const RATE_WINDOW_MS = 15 * 60 * 1_000;
const MINIMUM_FORM_TIME_MS = 1_200;

function json(body: object, status: number): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function clientIp(request: Request): string | undefined {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    undefined
  );
}

function hashIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  const salt = process.env.AUTH_SECRET;
  if (!salt) throw new Error('AUTH_SECRET no está configurada.');
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
      })[character] ?? character,
  );
}

export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: false, message: 'La solicitud no tiene un formato válido.' }, 400);
  }

  if (
    raw &&
    typeof raw === 'object' &&
    'website' in raw &&
    typeof raw.website === 'string' &&
    raw.website.trim().length > 0
  ) {
    return json({ ok: true, message: 'Recibimos tu solicitud.' }, 201);
  }

  const parsed = contactRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ ok: false, message: firstValidationMessage(parsed.error) }, 422);
  }

  const formAge = Date.now() - parsed.data.startedAt;
  if (formAge < MINIMUM_FORM_TIME_MS || formAge > 24 * 60 * 60 * 1_000) {
    return json({ ok: false, message: 'Actualiza la página e inténtalo de nuevo.' }, 422);
  }

  try {
    const prisma = getPrisma();
    const ipHash = hashIp(clientIp(request));

    if (ipHash) {
      const recentRequests = await prisma.contactRequest.count({
        where: {
          ipHash,
          createdAt: { gte: new Date(Date.now() - RATE_WINDOW_MS) },
        },
      });

      if (recentRequests >= MAX_REQUESTS_PER_WINDOW) {
        return json(
          { ok: false, message: 'Recibimos varias solicitudes. Inténtalo de nuevo en unos minutos.' },
          429,
        );
      }
    }

    const contactRequest = await prisma.contactRequest.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        city: parsed.data.city,
        message: parsed.data.message,
        source: parsed.data.source,
        ipHash,
      },
    });

    const resendApiKey = process.env.RESEND_API_KEY?.trim();
    if (!resendApiKey) {
      await prisma.contactRequest.update({
        where: { id: contactRequest.id },
        data: { notificationStatus: 'SKIPPED' },
      });
      return json(
        { ok: true, message: 'Recibimos tu solicitud. Te responderemos lo antes posible.' },
        201,
      );
    }

    try {
      const resend = new Resend(resendApiKey);
      const { data, error } = await resend.emails.send({
        from: process.env.EMAIL_FROM || 'OpenV <contacto@viis.app>',
        to: [process.env.EMAIL_TO || 'gerencia@viis.app'],
        replyTo: parsed.data.email,
        subject: `Nueva solicitud de ${parsed.data.name}`,
        html: `
          <h1>Nueva solicitud desde viis.app</h1>
          <p><strong>Nombre:</strong> ${escapeHtml(parsed.data.name)}</p>
          <p><strong>Teléfono:</strong> ${escapeHtml(parsed.data.phone || 'No indicado')}</p>
          <p><strong>Correo:</strong> ${escapeHtml(parsed.data.email || 'No indicado')}</p>
          <p><strong>Ciudad:</strong> ${escapeHtml(parsed.data.city || 'No indicada')}</p>
          <p><strong>Origen:</strong> ${escapeHtml(parsed.data.source)}</p>
          <p><strong>Mensaje:</strong></p>
          <p>${escapeHtml(parsed.data.message).replaceAll('\n', '<br>')}</p>
        `,
      });

      if (error) throw new Error(error.message);

      await prisma.contactRequest.update({
        where: { id: contactRequest.id },
        data: {
          notificationStatus: 'SENT',
          notificationMessageId: data?.id,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : 'Error desconocido';
      await prisma.contactRequest.update({
        where: { id: contactRequest.id },
        data: { notificationStatus: 'FAILED', notificationError: message },
      });
      console.error('No se pudo enviar la notificación de contacto.', { contactRequestId: contactRequest.id });
    }

    return json(
      { ok: true, message: 'Recibimos tu solicitud. Te responderemos lo antes posible.' },
      201,
    );
  } catch (error) {
    console.error('No se pudo registrar la solicitud de contacto.', {
      error: error instanceof Error ? error.message : 'Error desconocido',
    });
    return json(
      { ok: false, message: 'No pudimos guardar tu solicitud. Escríbenos a gerencia@viis.app.' },
      500,
    );
  }
}
