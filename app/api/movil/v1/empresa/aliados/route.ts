import { createAllyAction } from '@/app/(plataforma)/empresa/aliados/actions';
import { formOf } from '@/lib/movil/empresa/common';
import { aliados } from '@/lib/movil/empresa/red';
import { apiSession, handler, json, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/movil/v1/empresa/aliados — Ranking responsable con desempeño por organización. */
export const GET = handler(async () => {
  await apiSession({ portal: 'empresa', permission: 'ally.manage' });
  return json(await aliados());
});

/** POST /api/movil/v1/empresa/aliados — Crea organización: { kind: ALLY_COMPANY|ALLY_PERSON, name, taxId?, territory?, tier, monthlyGoal?, active?: boolean }. */
export const POST = handler(async (request: Request) => {
  await apiSession({ portal: 'empresa', permission: 'ally.manage' });
  return runAction(createAllyAction, await formOf(request));
});
