import { bodyAsForm, handler, runAction } from '@/lib/movil/http';
import { requestResetAction } from '@/app/(plataforma)/ingresar/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handler(async (request: Request) => runAction(requestResetAction, await bodyAsForm(request)));
