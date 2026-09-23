import { submitQuizAction } from '@/app/(plataforma)/aliado/academia/actions';
import { apiSession, bodyAsForm, handler, runAction } from '@/lib/movil/http';
import { slugParam, withFields, type SlugContext } from '@/lib/movil/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Presenta la evaluación: { answers: number[] } (índice elegido por pregunta) o { a0, a1, … } como la web.
 * Se califica en el servidor; si aprueba, `href` apunta al certificado.
 */
export const POST = handler(async (request: Request, ctx: SlugContext) => {
  const slug = await slugParam(ctx);
  await apiSession({ portal: 'aliado', permission: 'academy.take' });
  const form = await bodyAsForm(request);
  const answers = form.getAll('answers');
  form.delete('answers');
  answers.forEach((value, i) => form.set(`a${i}`, String(value)));
  return runAction(submitQuizAction, withFields(form, { slug }));
});
