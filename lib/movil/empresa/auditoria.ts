import { auditWhere, readAuditFilters } from '@/app/(plataforma)/empresa/auditoria/filters';
import { qs, sp, type SearchParams } from '@/lib/empresa/params';
import { getPrisma } from '@/lib/prisma';
import type { AuditEventView, AuditoriaResponse } from '@/lib/movil/contract-empresa';
import { plainJson, roleLabel, userNames } from './common';

type EventRow = { id: bigint; at: Date; action: string; entity: string; entityId: string | null; actorId: string | null; actorRole: string | null; channel: string; before: unknown; after: unknown; hash: string };

export function auditEventView(e: EventRow, names: Map<string, { name: string; email: string }>): AuditEventView {
  const actor = e.actorId ? names.get(e.actorId) : undefined;
  return {
    id: e.id.toString(),
    at: e.at.toISOString(),
    action: e.action,
    entity: e.entity,
    entityId: e.entityId,
    actor: {
      id: e.actorId,
      name: actor ? actor.name : e.actorId ? 'Usuario' : 'Sistema',
      email: actor?.email ?? null,
      role: e.actorRole,
      roleLabel: e.actorRole ? roleLabel(e.actorRole) : null,
    },
    channel: e.channel,
    before: plainJson(e.before),
    after: plainJson(e.after),
    hashPrefix: e.hash.slice(0, 12),
  };
}

const PAGE = 50;

/** Misma búsqueda que `/empresa/auditoria`, con cursor `antes` / `despues` (id del evento). */
export async function auditoria(params: SearchParams): Promise<AuditoriaResponse> {
  const filters = readAuditFilters(params);
  const antes = /^\d{1,19}$/.test(sp(params, 'antes')) ? BigInt(sp(params, 'antes')) : null;
  const despues = !antes && /^\d{1,19}$/.test(sp(params, 'despues')) ? BigInt(sp(params, 'despues')) : null;
  const prisma = getPrisma();
  const where = await auditWhere(filters);

  let events;
  if (despues) {
    events = (await prisma.auditEvent.findMany({ where: { ...where, id: { gt: despues } }, orderBy: { id: 'asc' }, take: PAGE + 1 })).reverse();
  } else {
    events = await prisma.auditEvent.findMany({ where: antes ? { ...where, id: { lt: antes } } : where, orderBy: { id: 'desc' }, take: PAGE + 1 });
  }
  let hasOlder: boolean;
  let hasNewer: boolean;
  if (despues) {
    hasNewer = events.length > PAGE;
    if (hasNewer) events = events.slice(1);
    hasOlder = true;
  } else {
    hasOlder = events.length > PAGE;
    if (hasOlder) events = events.slice(0, PAGE);
    hasNewer = Boolean(antes);
  }
  const [entities, names] = await Promise.all([
    prisma.auditEvent.groupBy({ by: ['entity'], orderBy: { entity: 'asc' } }),
    userNames(events.map((e) => e.actorId)),
  ]);
  const newest = events[0]?.id;
  const oldest = events[events.length - 1]?.id;
  return {
    ok: true,
    filters,
    cursor: {
      antes: hasOlder && oldest !== undefined ? oldest.toString() : null,
      despues: hasNewer && newest !== undefined ? newest.toString() : null,
      hasOlder,
      hasNewer,
    },
    pageSize: PAGE,
    rows: events.map((e) => auditEventView(e, names)),
    entities: entities.map((e) => e.entity),
    csvPath: `/api/empresa/auditoria/csv${qs({ ...filters })}`,
  };
}
