import { bodyAsForm, handler, runAction } from '@/lib/movil/http';
import { registerAction } from '@/app/(plataforma)/ingresar/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Mismo registro que la web: campos del formulario y finalidades de consentimiento como booleanos. */
export const POST = handler(async (request: Request) => runAction(registerAction, await bodyAsForm(request)));
