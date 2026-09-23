'use server';

import { z } from 'zod';
import { fail, ok, secureAction } from '@/lib/actions';
import { audit, verifyAuditChain } from '@/lib/security/audit';

/** Recorre toda la bitácora y comprueba cada eslabón del encadenamiento por hash. */
export const verifyChainAction = secureAction('audit.read', z.object({}), async (_input, { session, meta }) => {
  const result = await verifyAuditChain();
  await audit({
    actorId: session.user.id,
    actorRole: session.user.role,
    action: 'audit.chain_verified',
    entity: 'AuditEvent',
    after: { ok: result.ok, checked: result.checked, brokenAt: result.brokenAt ?? null },
    ipHash: meta.ipHash,
  });
  if (result.ok) {
    return ok(`Cadena íntegra: ${result.checked.toLocaleString('es-CO')} eventos verificados sin alteraciones.`);
  }
  return fail(`¡Alerta! La cadena está rota en el evento #${result.brokenAt} (se verificaron ${result.checked.toLocaleString('es-CO')} eventos antes). Escala de inmediato a cumplimiento.`);
});
