import { NextResponse } from 'next/server';
import { auditWhere, readAuditFilters } from '@/app/(plataforma)/empresa/auditoria/filters';
import { csvRow, todayBogota, type SearchParams } from '@/lib/empresa/params';
import { getPrisma } from '@/lib/prisma';
import { audit } from '@/lib/security/audit';
import { can } from '@/lib/security/rbac';
import { requestMetaFrom } from '@/lib/security/request';
import { getSession } from '@/lib/security/session';

export const dynamic = 'force-dynamic';

const MAX_ROWS = 20_000;

/** Exportación CSV de la bitácora con los filtros de la consola. La exportación misma queda auditada. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !session.mfaPassed || !session.user.totpEnabled) {
    return NextResponse.json({ error: 'Sesión no válida.' }, { status: 401 });
  }
  if (!can(session.user.role, 'audit.read')) {
    return NextResponse.json({ error: 'No tienes permiso para esta acción.' }, { status: 403 });
  }
  const url = new URL(request.url);
  const params: SearchParams = Object.fromEntries(url.searchParams.entries());
  const filters = readAuditFilters(params);
  const prisma = getPrisma();
  const events = await prisma.auditEvent.findMany({ where: await auditWhere(filters), orderBy: { id: 'desc' }, take: MAX_ROWS });
  const meta = requestMetaFrom(request);
  await audit({
    actorId: session.user.id,
    actorRole: session.user.role,
    action: 'audit.exported',
    entity: 'AuditEvent',
    after: { filters, rows: events.length, truncated: events.length === MAX_ROWS },
    ipHash: meta.ipHash,
  });
  const lines = [
    csvRow(['id', 'fecha_utc', 'actor_id', 'actor_rol', 'accion', 'entidad', 'entidad_id', 'canal', 'antes', 'despues', 'prev_hash', 'hash']),
    ...events.map((e) =>
      csvRow([e.id.toString(), e.at.toISOString(), e.actorId, e.actorRole, e.action, e.entity, e.entityId, e.channel, e.before, e.after, e.prevHash, e.hash]),
    ),
  ];
  return new NextResponse(`﻿${lines.join('\r\n')}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="auditoria-${todayBogota()}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
