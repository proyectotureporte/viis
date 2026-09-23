import type { Metadata } from 'next';
import Link from 'next/link';
import { Empty, Kpi, PageHeader, Status } from '@/components/ov/ui';
import { BASIS_LABELS, ratePct, readSnapshot, scopedCommissions } from '@/lib/aliado/commission';
import { TIER_LABELS } from '@/lib/aliado/labels';
import { isAllyAdmin, personName } from '@/lib/aliado/scope';
import { computeCommission, pickRule } from '@/lib/domain/cases';
import { COMMISSION_STATUS, fecha, fechaDia, money, pct, PRODUCTS, toNumber } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { requireUser } from '@/lib/security/session';

export const metadata: Metadata = { title: 'Comisiones' };

const EXAMPLE_BASE = 100_000_000;
const STATUS_ORDER = ['CAUSED', 'APPROVED', 'SCHEDULED', 'PAID', 'REVERSED'] as const;

export default async function ComisionesPage() {
  const session = await requireUser({ portal: 'aliado', permission: 'commission.read' });
  const { user } = session;
  const admin = isAllyAdmin(user);
  const prisma = getPrisma();
  const [commissions, org, rules] = await Promise.all([
    scopedCommissions(user),
    user.organizationId ? prisma.organization.findUnique({ where: { id: user.organizationId }, select: { id: true, name: true, tier: true } }) : Promise.resolve(null),
    user.organizationId
      ? prisma.commissionRule.findMany({ where: { active: true, OR: [{ organizationId: null }, { organizationId: user.organizationId }] } })
      : Promise.resolve([]),
  ]);

  const totals = STATUS_ORDER.map((status) => {
    const rows = commissions.filter((c) => c.status === status);
    return { status, count: rows.length, net: rows.reduce((s, c) => s + toNumber(c.net), 0) };
  });
  const total = (status: string) => totals.find((t) => t.status === status)!;
  const now = new Date();
  const myRules = org
    ? Object.entries(PRODUCTS).map(([code, label]) => ({ code, label, rule: pickRule(rules, org, code, now) }))
    : [];

  return (
    <>
      <PageHeader
        title="Comisiones"
        subtitle="Cada liquidación se puede reconstruir: base, regla aplicada, cálculo, estado y pago."
        actions={commissions.length > 0 ? <a className="ov-btn ov-btn--secondary" href="/api/aliado/comisiones" download>Exportar CSV</a> : undefined}
      />

      <div className="ov-grid">
        <Kpi label="Causada" value={money(total('CAUSED').net, true)} sub={`${total('CAUSED').count} en validación`} />
        <Kpi label="Aprobada o programada" value={money(total('APPROVED').net + total('SCHEDULED').net, true)} sub={`${total('APPROVED').count + total('SCHEDULED').count} por pagar`} />
        <Kpi label="Pagada" value={money(total('PAID').net, true)} sub={`${total('PAID').count} negocios`} tone={total('PAID').count ? 'positive' : undefined} />
        <Kpi label="Reversada" value={money(total('REVERSED').net, true)} sub={`${total('REVERSED').count} con motivo registrado`} />
      </div>

      <div className="ov-section"><h2>Liquidaciones</h2><span className="ov-pill">Montos netos de retención</span></div>
      {commissions.length === 0 ? (
        <Empty>Aún no tienes comisiones. Se causan automáticamente cuando un caso tuyo se desembolsa, con la regla vigente cuando se creó el caso.</Empty>
      ) : (
        <div className="ov-list">
          {commissions.map((c) => {
            const snap = readSnapshot(c.ruleSnapshot);
            const status = COMMISSION_STATUS[c.status] ?? { label: c.status, tone: 'gray' };
            const disbursedAt = c.opportunity.stages[0]?.createdAt;
            return (
              <details key={c.id} id={`c-${c.id}`} className="ov-card ov-details">
                <summary>
                  <span style={{ display: 'inline-flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span>{personName(c.opportunity.person)} · {c.opportunity.code}</span>
                    <span className="ov-money">{money(c.net)}</span>
                    <Status tone={status.tone}>{status.label}</Status>
                  </span>
                </summary>
                <div className="ov-grid">
                  <div className="s6">
                    <dl className="ov-dl">
                      <dt>Cliente</dt><dd><Link href={`/aliado/clientes/${c.opportunity.id}`}>{personName(c.opportunity.person)}</Link> · {c.opportunity.code}</dd>
                      <dt>Producto</dt><dd>{PRODUCTS[c.opportunity.product] ?? c.opportunity.product}</dd>
                      <dt>Entidad</dt><dd>{c.opportunity.entity?.name ?? '—'}</dd>
                      {admin && <><dt>Aliado</dt><dd>{c.allyUser?.name ?? '—'}</dd></>}
                      <dt>Desembolso</dt><dd>{money(c.opportunity.disbursedAmount ?? c.baseAmount)}{disbursedAt ? ` · ${fecha(disbursedAt)}` : ''}</dd>
                      <dt>Regla aplicada</dt><dd>{snap.name}{snap.version !== null ? ` · versión ${snap.version}` : ''}</dd>
                      <dt>Alcance de la regla</dt><dd>{snap.scope}</dd>
                      <dt>Vigencia de la regla</dt><dd>{snap.validFrom ? fechaDia(snap.validFrom) : '—'} a {snap.validTo ? fechaDia(snap.validTo) : 'sin fecha de fin'}</dd>
                      <dt>Base</dt><dd>{BASIS_LABELS[snap.basis ?? ''] ?? snap.basis ?? 'Monto desembolsado'}</dd>
                    </dl>
                  </div>
                  <div className="s6">
                    <h3 style={{ fontSize: 15, margin: '0 0 4px' }}>Cálculo paso a paso</h3>
                    <dl className="al-calc">
                      <dt>Base</dt><dd>{money(c.baseAmount)}</dd>
                      <dt>× Porcentaje</dt><dd>{pct(Number(c.percent), 2)}</dd>
                      <dt>= Comisión bruta</dt><dd>{money(c.gross)}</dd>
                      <dt>− Retención ({ratePct(snap.withholdingPct)})</dt><dd>{money(c.withholding)}</dd>
                      <dt className="al-total">= Neto a pagar</dt><dd className="al-total">{money(c.net)}</dd>
                    </dl>
                    <dl className="ov-dl" style={{ marginTop: 14 }}>
                      <dt>Causada</dt><dd>{fecha(c.causedAt)}</dd>
                      <dt>Aprobada</dt><dd>{c.approvedAt ? fecha(c.approvedAt) : 'Pendiente'}</dd>
                      <dt>Pago previsto</dt><dd>{fechaDia(c.expectedPayAt)}{snap.paymentDays !== null ? ` (${snap.paymentDays} días tras la causación)` : ''}</dd>
                      <dt>Pagada</dt><dd>{c.paidAt ? fecha(c.paidAt) : '—'}</dd>
                      <dt>Soporte de pago</dt><dd>{c.paymentRef ?? '—'}</dd>
                      {c.status === 'REVERSED' && <><dt>Reverso</dt><dd className="ov-negative">{c.reversedAt ? fecha(c.reversedAt) : ''}{c.reverseReason ? ` · ${c.reverseReason}` : ''}</dd></>}
                    </dl>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}

      <div className="ov-section" id="reglas">
        <h2>Reglas vigentes para mí</h2>
        {org && <span className="ov-pill">{org.name} · nivel {TIER_LABELS[org.tier] ?? org.tier}</span>}
      </div>
      <article className="ov-card ov-tablewrap">
        <p className="ov-meta" style={{ marginTop: 0 }}>
          Así sabes cuánto ganarás antes de vender. La regla que se aplica a un negocio es la vigente el día en que se creó el caso; los cambios posteriores no lo afectan. Ejemplo calculado sobre un desembolso de {money(EXAMPLE_BASE, true)}.
        </p>
        {myRules.length === 0 || myRules.every((r) => !r.rule) ? (
          <Empty>OpenV aún no ha publicado reglas de comisión para tu organización. Cuando existan las verás aquí con su vigencia y versión.</Empty>
        ) : (
          <table className="ov-table">
            <thead><tr><th>Producto</th><th>Regla</th><th className="num">Porcentaje</th><th className="num">Retención</th><th>Pago</th><th className="num">Neto por {money(EXAMPLE_BASE, true)}</th></tr></thead>
            <tbody>
              {myRules.map(({ code, label, rule }) => {
                if (!rule) return <tr key={code}><td>{label}</td><td colSpan={5} className="ov-meta">Sin regla vigente: consulta con tu coordinador antes de ofrecerlo.</td></tr>;
                const example = computeCommission(EXAMPLE_BASE, Number(rule.percent), Number(rule.withholdingPct));
                return (
                  <tr key={code}>
                    <td>{label}</td>
                    <td>{rule.name}<small>Versión {rule.version} · desde {fechaDia(rule.validFrom)}{rule.validTo ? ` hasta ${fechaDia(rule.validTo)}` : ''}</small></td>
                    <td className="num">{pct(Number(rule.percent), 2)}</td>
                    <td className="num">{pct(Number(rule.withholdingPct), 2)}</td>
                    <td>{rule.paymentDays} días</td>
                    <td className="num ov-money">{money(example.net)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </article>
    </>
  );
}
