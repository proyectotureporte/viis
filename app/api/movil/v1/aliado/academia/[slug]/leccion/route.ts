import { markLessonAction } from '@/app/(plataforma)/aliado/academia/actions';
import { apiSession, bodyAsForm, handler, runAction } from '@/lib/movil/http';
import { slugParam, withFields, type SlugContext } from '@/lib/movil/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Marca una lección como vista: { lesson: 0 } (índice). */
export const POST = handler(async (request: Request, ctx: SlugContext) => {
  const slug = await slugParam(ctx);
  await apiSession({ portal: 'aliado', permission: 'academy.take' });
  return runAction(markLessonAction, withFields(await bodyAsForm(request), { slug }));
});
