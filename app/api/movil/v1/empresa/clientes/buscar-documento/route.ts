import { z } from 'zod';
import { clientes } from '@/lib/movil/empresa/personas';
import { apiSession, ApiError, handler, json } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({ tipo: z.string().max(8), doc: z.string().max(40), pagina: z.coerce.number().int().min(1).max(10_000).optional() });

/** POST /api/movil/v1/empresa/clientes/buscar-documento — { tipo: 'CC'|'CE'|'PA'|'PPT'|'NIT', doc } → misma respuesta que GET clientes (el número no viaja en la URL). */
export const POST = handler(async (request: Request) => {
  const session = await apiSession({ portal: 'empresa', permission: 'person.read' });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new ApiError('Indica el tipo y el número de documento.', 400);
  return json(await clientes(session, { tipo: parsed.data.tipo, doc: parsed.data.doc, pagina: String(parsed.data.pagina ?? 1) }));
});
