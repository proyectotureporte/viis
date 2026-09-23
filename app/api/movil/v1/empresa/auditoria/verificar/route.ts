import { verifyChainAction } from '@/app/(plataforma)/empresa/auditoria/actions';
import { formOf } from '@/lib/movil/empresa/common';
import { apiSession, handler, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/movil/v1/empresa/auditoria/verificar — Verifica la cadena de hash completa (queda auditado). `ok:false` (422) si la cadena está rota. */
export const POST = handler(async (request: Request) => {
  await apiSession({ portal: 'empresa', permission: 'audit.read' });
  return runAction(verifyChainAction, await formOf(request));
});
