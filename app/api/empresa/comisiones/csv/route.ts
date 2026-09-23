import type { Prisma } from '@/app/generated/prisma/client';
import type { CommissionStatus } from '@/app/generated/prisma/enums';
import { bogotaDayEnd, bogotaDayStart, csvRow, todayBogota } from '@/lib/empresa/params';
import { COMMISSION_STATUS, PRODUCTS } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { audit } from '@/lib/security/audit';
import { can } from '@/lib/security/rbac';
import { requestMetaFrom } from '@/lib/security/request';
import { getSession } from '@/lib/security/session';

export const dynamic = 'force-dynamic';

const STATUSES: CommissionStatus[] = ['CAUSED', 'APPROVED', 'SCHEDULED', 'PAID', 'REVERSED'];
const MAX_ROWS = 20_000;
const isYmd = (v: string | null): v is string => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)));
const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '');
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : '');

/** Cierre de periodo: exporta las comisiones causadas en el rango (auditado). */
export async function GET(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session || !session.mfaPassed || !session.user.totpEnabled) return new Response('Sesión no válida.', { status: 401 });
  if (!can(session.user.role, 'commission.approve')) return new Response('No tienes permiso para exportar comisiones.', { status: 403 });

  const url = new URL(request.url);
  const today = todayBogota();
  const desde = url.searchParams.get('desde');
  const hasta = url.searchParams.get('hasta');
  const estadoRaw = url.searchParams.get('estado') ?? '';
  const aliadoRaw = url.searchParams.get('aliado') ?? '';
  if ((desde && !isYmd(desde)) || (hasta && !isYmd(hasta))) return new Response('Fechas inválidas (usa AAAA-MM-DD).', { status: 400 });
  const from = desde || `${today.slice(0, 7)}-01`;
  const to = hasta || today;
  if (from > to) return new Response('La fecha inicial es posterior a la final.', { status: 400 });
  if (estadoRaw && !STATUSES.includes(estadoRaw as CommissionStatus)) return new Response('Estado inválido.', { status: 400 });
  if (aliadoRaw && !/^[0-9a-f-]{36}$/i.test(aliadoRaw)) return new Response('Aliado inválido.', { status: 400 });

  const where: Prisma.CommissionWhereInput = {
    causedAt: { gte: bogotaDayStart(from), lt: bogotaDayEnd(to) },
    ...(estadoRaw ? { status: estadoRaw as CommissionStatus } : {}),
    ...(aliadoRaw ? { allyOrgId: aliadoRaw } : {}),
  };
  const prisma = getPrisma();
  const rows = await prisma.commission.findMany({
    where,
    orderBy: { causedAt: 'asc' },
    take: MAX_ROWS,
    include: {
      opportunity: { select: { code: true, product: true, person: { select: { firstName: true, lastName: true, documentLast4: true } }, entity: { select: { name: true } }, allyOrg: { select: { name: true, taxId: true } } } },
      allyUser: { select: { name: true, email: true } },
      rule: { select: { name: true, version: true } },
    },
  });

  const header = ['Caso', 'Cliente', 'Documento (últimos 4)', 'Producto', 'Entidad', 'Aliado', 'NIT aliado', 'Usuario aliado', 'Correo aliado', 'Base', 'Porcentaje', 'Bruto', 'Retención', 'Neto', 'Estado', 'Regla', 'Versión regla', 'Causada', 'Aprobada', 'Pago previsto', 'Pagada', 'Referencia de pago', 'Reversada', 'Motivo del reverso'];
  const lines = [csvRow(header)];
  for (const c of rows) {
    lines.push(csvRow([
      c.opportunity.code,
      `${c.opportunity.person.firstName} ${c.opportunity.person.lastName}`,
      c.opportunity.person.documentLast4,
      PRODUCTS[c.opportunity.product] ?? c.opportunity.product,
      c.opportunity.entity?.name ?? '',
      c.opportunity.allyOrg?.name ?? '',
      c.opportunity.allyOrg?.taxId ?? '',
      c.allyUser?.name ?? '',
      c.allyUser?.email ?? '',
      c.baseAmount.toString(),
      c.percent.toString(),
      c.gross.toString(),
      c.withholding.toString(),
      c.net.toString(),
      COMMISSION_STATUS[c.status]?.label ?? c.status,
      c.rule.name,
      c.rule.version,
      iso(c.causedAt),
      iso(c.approvedAt),
      ymd(c.expectedPayAt),
      iso(c.paidAt),
      c.paymentRef ?? '',
      iso(c.reversedAt),
      c.reverseReason ?? '',
    ]));
  }

  const meta = requestMetaFrom(request);
  await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'commission.exported', entity: 'Commission', after: { desde: from, hasta: to, estado: estadoRaw || null, aliado: aliadoRaw || null, rows: rows.length, truncated: rows.length === MAX_ROWS }, ipHash: meta.ipHash });

  return new Response(`﻿${lines.join('\r\n')}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="comisiones_${from}_${to}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
