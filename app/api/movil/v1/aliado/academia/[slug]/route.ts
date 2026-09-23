import { aliadoCurso } from '@/lib/movil/aliado';
import { apiSession, handler, json } from '@/lib/movil/http';
import { slugParam, type SlugContext } from '@/lib/movil/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Lecciones y preguntas del curso (sin la respuesta correcta). */
export const GET = handler(async (_request: Request, ctx: SlugContext) => {
  const slug = await slugParam(ctx);
  const session = await apiSession({ portal: 'aliado', permission: 'academy.take' });
  return json(await aliadoCurso(session, slug));
});
