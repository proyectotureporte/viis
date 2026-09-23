import { readSnapshot, scopedCommissions } from '@/lib/aliado/commission';
import { csvRow } from '@/lib/aliado/export';
import { personName } from '@/lib/aliado/scope';
import { bogotaYmd } from '@/lib/aliado/time';
import { COMMISSION_STATUS, PRODUCTS, toNumber } from '@/lib/labels';
import { audit } from '@/lib/security/audit';
import { ALLY_ROLES, can } from '@/lib/security/rbac';
import { requestMetaFrom } from '@/lib/security/request';
import { getSession } from '@/lib/security/session';

export const dynamic = 'force-dynamic';

const day = (d: Date | null | undefined) => (d ? bogotaYmd(d) : '');
/** 0.015 → "1,5" (porcentaje con coma decimal, sin ceros de sobra). */
const percentText = (fraction: number) => String(Math.round(fraction * 1_000_000) / 10_000).replace('.', ',');
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '');

/** CSV de las comisiones del alcance del aliado (sus propias o las de su organización si es administrador). */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !session.mfaPassed || !session.user.totpEnabled) return new Response('Sesión no válida.', { status: 401 });
  if (!ALLY_ROLES.includes(session.user.role) || !can(session.user.role, 'commission.read')) return new Response('No autorizado.', { status: 403 });

  const commissions = await scopedCommissions(session.user, 10_000);
  const header = [
    'Caso', 'Cliente', 'Producto', 'Entidad', 'Aliado', 'Monto desembolsado', 'Regla', 'Versión regla', 'Vigencia desde', 'Vigencia hasta',
    'Base', 'Porcentaje (%)', 'Bruto', 'Retención (%)', 'Retención', 'Neto', 'Estado', 'Causada', 'Aprobada', 'Pago previsto', 'Pagada', 'Soporte de pago', 'Reversada', 'Motivo reverso',
  ];
  const lines = commissions.map((c) => {
    const snap = readSnapshot(c.ruleSnapshot);
    return csvRow([
      c.opportunity.code,
      personName(c.opportunity.person),
      PRODUCTS[c.opportunity.product] ?? c.opportunity.product,
      c.opportunity.entity?.name ?? '',
      c.allyUser?.name ?? '',
      toNumber(c.opportunity.disbursedAmount ?? c.baseAmount),
      snap.name,
      snap.version,
      snap.validFrom?.slice(0, 10) ?? '',
      snap.validTo?.slice(0, 10) ?? '',
      toNumber(c.baseAmount),
      percentText(Number(c.percent)),
      toNumber(c.gross),
      snap.withholdingPct === null ? '' : percentText(snap.withholdingPct),
      toNumber(c.withholding),
      toNumber(c.net),
      COMMISSION_STATUS[c.status]?.label ?? c.status,
      day(c.causedAt),
      day(c.approvedAt),
      iso(c.expectedPayAt),
      day(c.paidAt),
      c.paymentRef ?? '',
      day(c.reversedAt),
      c.reverseReason ?? '',
    ]);
  });

  const meta = requestMetaFrom(request);
  await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'commission.exported', entity: 'Commission', after: { rows: commissions.length }, ipHash: meta.ipHash });

  // BOM para que Excel reconozca UTF-8; separador punto y coma (configuración regional de Colombia).
  const body = `﻿${[csvRow(header), ...lines].join('\r\n')}\r\n`;
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="comisiones-openv-${bogotaYmd()}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
