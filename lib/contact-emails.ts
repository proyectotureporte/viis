import nodemailer from 'nodemailer';

interface ContactEmailInput {
  name: string;
  email?: string;
  phone?: string;
  city?: string;
  message: string;
  source: string;
}

export interface ContactEmailResult {
  notificationMessageId?: string;
}

export function mailServerConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASSWORD,
  );
}

export function escapeEmailHtml(value: string): string {
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

export async function sendContactEmails(input: ContactEmailInput): Promise<ContactEmailResult> {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD;
  if (!host || !user || !password) throw new Error('Servidor de correo no configurado.');

  const port = Number(process.env.SMTP_PORT || 465);
  const secure = process.env.SMTP_SECURE !== 'false';
  const recipient = process.env.EMAIL_TO?.trim() || 'gerencia@viis.app';
  const senderName = process.env.EMAIL_FROM_NAME?.trim() || 'VIIS';
  const from = { name: senderName, address: user };
  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure,
    auth: { user, pass: password },
  });

  const errors: string[] = [];
  let notificationMessageId: string | undefined;

  try {
    try {
      const notification = await transport.sendMail({
        from,
        to: recipient,
        replyTo: input.email || undefined,
        subject: `Nueva solicitud de ${input.name}`,
        text: [
          'Nueva solicitud desde viis.app',
          `Nombre: ${input.name}`,
          `Teléfono: ${input.phone || 'No indicado'}`,
          `Correo: ${input.email || 'No indicado'}`,
          `Ciudad: ${input.city || 'No indicada'}`,
          `Origen: ${input.source}`,
          '',
          input.message,
        ].join('\n'),
        html: `
          <h1>Nueva solicitud desde viis.app</h1>
          <p><strong>Nombre:</strong> ${escapeEmailHtml(input.name)}</p>
          <p><strong>Teléfono:</strong> ${escapeEmailHtml(input.phone || 'No indicado')}</p>
          <p><strong>Correo:</strong> ${escapeEmailHtml(input.email || 'No indicado')}</p>
          <p><strong>Ciudad:</strong> ${escapeEmailHtml(input.city || 'No indicada')}</p>
          <p><strong>Origen:</strong> ${escapeEmailHtml(input.source)}</p>
          <p><strong>Mensaje:</strong></p>
          <p>${escapeEmailHtml(input.message).replaceAll('\n', '<br>')}</p>
        `,
      });
      notificationMessageId = notification.messageId;
    } catch (error) {
      errors.push(`aviso interno: ${error instanceof Error ? error.message : 'error desconocido'}`);
    }

    if (input.email) {
      try {
        await transport.sendMail({
          from,
          to: input.email,
          replyTo: user,
          subject: 'Recibimos tu solicitud en VIIS',
          text: `Hola ${input.name},\n\nRecibimos tu solicitud y nuestro equipo la revisará. Te contactaremos lo antes posible.\n\nEquipo VIIS\n${user}`,
          html: `
            <div style="font-family:Arial,sans-serif;color:#001649;line-height:1.6;max-width:620px">
              <h1 style="font-size:26px">Recibimos tu solicitud</h1>
              <p>Hola ${escapeEmailHtml(input.name)},</p>
              <p>Nuestro equipo ya recibió la información y la revisará. Te contactaremos lo antes posible.</p>
              <p style="margin-top:28px">Equipo VIIS<br><a href="mailto:${escapeEmailHtml(user)}">${escapeEmailHtml(user)}</a></p>
            </div>
          `,
        });
      } catch (error) {
        errors.push(`confirmación al cliente: ${error instanceof Error ? error.message : 'error desconocido'}`);
      }
    }
  } finally {
    transport.close();
  }

  if (errors.length) throw new Error(errors.join('; ').slice(0, 500));
  return { notificationMessageId };
}
