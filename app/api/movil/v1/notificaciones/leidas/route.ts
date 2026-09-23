import { z } from 'zod';
import { apiSession, ApiError, handler, json } from '@/lib/movil/http';
import { getPrisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({ ids: z.array(z.string().uuid()).max(200).optional() });

/** Marca como leídas todas (cuerpo vacío) o solo las indicadas en `ids`. Solo toca las del propio usuario. */
export const POST = handler(async (request: Request) => {
  const session = await apiSession();
  const text = await request.text();
  let raw: unknown = {};
  if (text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      throw new ApiError('Cuerpo JSON inválido.', 400);
    }
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ApiError('Identificadores inválidos.', 400);
  const { count } = await getPrisma().notification.updateMany({
    where: { userId: session.user.id, readAt: null, ...(parsed.data.ids ? { id: { in: parsed.data.ids } } : {}) },
    data: { readAt: new Date() },
  });
  return json({ ok: true, message: 'Listo.', updated: count });
});
