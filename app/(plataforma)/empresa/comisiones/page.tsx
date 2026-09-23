import type { Metadata } from 'next';
import Link from 'next/link';
import type { Prisma } from '@/app/generated/prisma/client';
import type { CommissionStatus } from '@/app/generated/prisma/enums';
import { Pager } from '@/components/empresa/ui';
import { ActionForm, SubmitButton } from '@/components/ov/forms';
import { Empty, Kpi, Notice, PageHeader, Status } from '@/components/ov/ui';
import { bogotaDayEnd, bogotaDayStart, fullName, qs, sp, spDate, spEnum, spPage, spUuid, todayBogota, type SearchParams } from '@/lib/empresa/params';
import { COMMISSION_STATUS, fecha, fechaDia, money, pct, PRODUCTS, toNumber } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { can } from '@/lib/security/rbac';
import { requireUser } from '@/lib/security/session';
import {
  approveCommissionsAction,
  closeRuleAction,
  createRuleAction,
  payCommissionAction,
  reverseCommissionAction,
  scheduleCommissionAction,
  versionRuleAction,
} from './actions';
import { FormWithId } from './FormWithId';

export const metadata: Metadata = { title: 'Comisiones' };

const PAGE_SIZE = 25;
const STATUSES = ['CAUSED', 'APPROVED', 'SCHEDULED', 'PAID', 'REVERSED'] as const satisfies readonly CommissionStatus[];
const TABS = [
  { key: 'liquidacion', label: 'Liquidación' },
  { key: 'resumen', label: 'Resumen por aliado y cierre' },
  { key: 'reglas', label: 'Reglas versionadas' },
] as const;

const pctDec = (v: { toString(): string }) => pct(Number(v.toString()), 2);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export default async function ComisionesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireUser({ portal: 'empresa', permission: 'commission.approve' });
  const params = await searchParams;
  const tabParam = sp(params, 'tab');
  const tab = TABS.some((t) => t.key === tabParam) ? tabParam : 'liquidacion';
  const canPay = can(session.user.role, 'commission.pay');
  const canRules = can(session.user.role, 'commission.rules');
  const prisma = getPrisma();

  const orgs = await prisma.organization.findMany({ where: { kind: { in: ['ALLY_PERSON', 'ALLY_COMPANY'] } }, select: { id: true, name: true, tier: true, active: true }, orderBy: { name: 'asc' } });
  const orgName = (id: string | null) => orgs.find((o) => o.id === id)?.name ?? 'Aliado';

  return (
    <>
      <PageHeader title="Comisiones" subtitle="Liquidación trazable de comisiones de aliados: regla aplicada, base, retención, estado y pago." />
      <nav className="ov-tabs" aria-label="Secciones de comisiones">
        {TABS.map((t) => (
          <Link key={t.key} href={`/empresa/comisiones${qs({ tab: t.key === 'liquidacion' ? undefined : t.key })}`} aria-current={tab === t.key ? 'page' : undefined}>{t.label}</Link>
        ))}
      </nav>
      {tab === 'liquidacion' && <Liquidacion params={params} orgs={orgs} orgName={orgName} canPay={canPay} />}
      {tab === 'resumen' && <Resumen params={params} orgName={orgName} />}
      {tab === 'reglas' && <Reglas orgs={orgs} canRules={canRules} />}
    </>
  );
}

async function Liquidacion({ params, orgs, orgName, canPay }: { params: SearchParams; orgs: Array<{ id: string; name: string }>; orgName: (id: string | null) => string; canPay: boolean }) {
  const prisma = getPrisma();
  const estado = spEnum(params, 'estado', STATUSES);
  const aliado = spUuid(params, 'aliado');
  const desde = spDate(params, 'desde');
  const hasta = spDate(params, 'hasta');
  const page = spPage(params);
  const where: Prisma.CommissionWhereInput = {
    ...(estado ? { status: estado } : {}),
    ...(aliado ? { allyOrgId: aliado } : {}),
    ...(desde || hasta ? { causedAt: { ...(desde ? { gte: bogotaDayStart(desde) } : {}), ...(hasta ? { lt: bogotaDayEnd(hasta) } : {}) } } : {}),
  };
  const [total, rows, totals] = await Promise.all([
    prisma.commission.count({ where }),
    prisma.commission.findMany({
      where,
      orderBy: [{ causedAt: 'asc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        opportunity: { select: { id: true, code: true, product: true, person: { select: { firstName: true, lastName: true } }, entity: { select: { name: true } } } },
        allyUser: { select: { name: true } },
        rule: { select: { name: true, version: true } },
      },
    }),
    prisma.commission.aggregate({ where, _sum: { gross: true, withholding: true, net: true } }),
  ]);
  const base = { estado, aliado, desde, hasta };
  const today = todayBogota();
  const hasCaused = rows.some((r) => r.status === 'CAUSED');

  return (
    <>
      <form className="ov-filters" method="get">
        <label className="ov-field"><span>Estado</span>
          <select name="estado" defaultValue={estado}>
            <option value="">Todos</option>
            {STATUSES.map((s) => <option key={s} value={s}>{COMMISSION_STATUS[s].label}</option>)}
          </select>
        </label>
        <label className="ov-field"><span>Aliado</span>
          <select name="aliado" defaultValue={aliado}>
            <option value="">Todos</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <label className="ov-field"><span>Causada desde</span><input type="date" name="desde" defaultValue={desde} /></label>
        <label className="ov-field"><span>Causada hasta</span><input type="date" name="hasta" defaultValue={hasta} /></label>
        <button className="ov-btn ov-btn--secondary" type="submit">Filtrar</button>
        {(estado || aliado || desde || hasta) && <Link className="ov-btn ov-btn--ghost" href="/empresa/comisiones">Limpiar</Link>}
      </form>

      <div className="ov-grid" style={{ marginBottom: 16 }}>
        <Kpi label="Comisiones" value={total.toLocaleString('es-CO')} sub="con los filtros actuales" />
        <Kpi label="Bruto" value={money(totals._sum.gross, true)} />
        <Kpi label="Retención" value={money(totals._sum.withholding, true)} />
        <Kpi label="Neto" value={money(totals._sum.net, true)} />
      </div>

      {rows.length === 0 ? (
        <Empty>No hay comisiones con estos filtros. Las comisiones se causan automáticamente cuando un caso de un aliado pasa a Desembolsado con una regla vigente.</Empty>
      ) : (
        <>
          {hasCaused && (
            <FormWithId id="aprobar-lote" action={approveCommissionsAction}>
              <p className="ov-meta" style={{ margin: 0, flex: '1 1 260px' }}>Marca las comisiones causadas que revisaste y apruébalas en lote.</p>
              <SubmitButton className="ov-btn ov-btn--small">Aprobar seleccionadas</SubmitButton>
            </FormWithId>
          )}
          <div className="ov-card">
            <div className="ov-tablewrap">
              <table className="ov-table" style={{ minWidth: 1100 }}>
                <thead>
                  <tr>
                    <th className="ove-table-check"><span className="ove-sr">Seleccionar</span></th>
                    <th>Caso y cliente</th>
                    <th>Aliado</th>
                    <th className="num">Base</th>
                    <th className="num">%</th>
                    <th className="num">Bruto</th>
                    <th className="num">Retención</th>
                    <th className="num">Neto</th>
                    <th>Regla</th>
                    <th>Estado y fechas</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const st = COMMISSION_STATUS[c.status];
                    return (
                      <tr key={c.id}>
                        <td className="ove-table-check">
                          {c.status === 'CAUSED' && <input type="checkbox" name="ids" value={c.id} form="aprobar-lote" aria-label={`Seleccionar comisión ${c.opportunity.code}`} />}
                        </td>
                        <td>
                          <Link href={`/empresa/casos/${c.opportunity.id}`}>{c.opportunity.code}</Link>
                          <small>{fullName(c.opportunity.person)}</small>
                          <small>{PRODUCTS[c.opportunity.product] ?? c.opportunity.product} · {c.opportunity.entity?.name ?? 'Sin entidad'}</small>
                        </td>
                        <td>{orgName(c.allyOrgId)}<small>{c.allyUser?.name ?? '—'}</small></td>
                        <td className="num">{money(c.baseAmount)}</td>
                        <td className="num">{pctDec(c.percent)}</td>
                        <td className="num">{money(c.gross)}</td>
                        <td className="num">{money(c.withholding)}</td>
                        <td className="num"><span className="ov-money">{money(c.net)}</span></td>
                        <td>{c.rule.name}<small>versión {c.rule.version}</small></td>
                        <td>
                          <Status tone={st.tone}>{st.label}</Status>
                          <small>Causada {fecha(c.causedAt)}</small>
                          {c.approvedAt && <small>Aprobada {fecha(c.approvedAt)}</small>}
                          {c.status !== 'PAID' && c.status !== 'REVERSED' && <small>Pago previsto {fechaDia(c.expectedPayAt)}</small>}
                          {c.paidAt && <small>Pagada {fecha(c.paidAt)} · Ref. {c.paymentRef}</small>}
                          {c.reversedAt && <small>Reversada {fecha(c.reversedAt)}: {c.reverseReason}</small>}
                        </td>
                        <td style={{ minWidth: 230 }}>
                          <div style={{ display: 'grid', gap: 8 }}>
                            {c.status === 'CAUSED' && (
                              <ActionForm action={approveCommissionsAction} className="ove-inline-form">
                                <input type="hidden" name="ids" value={c.id} />
                                <SubmitButton className="ov-btn ov-btn--small">Aprobar</SubmitButton>
                              </ActionForm>
                            )}
                            {(c.status === 'APPROVED' || c.status === 'SCHEDULED') && (
                              <ActionForm action={scheduleCommissionAction} className="ove-inline-form">
                                <input type="hidden" name="id" value={c.id} />
                                <input type="date" name="payDate" min={today} defaultValue={ymd(c.expectedPayAt) >= today ? ymd(c.expectedPayAt) : today} aria-label="Fecha de pago" required />
                                <SubmitButton className="ov-btn ov-btn--secondary ov-btn--small">{c.status === 'SCHEDULED' ? 'Reprogramar' : 'Programar'}</SubmitButton>
                              </ActionForm>
                            )}
                            {canPay && (c.status === 'APPROVED' || c.status === 'SCHEDULED') && (
                              <ActionForm action={payCommissionAction} className="ove-inline-form">
                                <input type="hidden" name="id" value={c.id} />
                                <input name="paymentRef" required minLength={3} maxLength={120} placeholder="Referencia de pago" aria-label="Referencia de pago" />
                                <SubmitButton className="ov-btn ov-btn--small" confirm={`¿Confirmas el pago de ${money(c.net)}?`}>Marcar pagada</SubmitButton>
                              </ActionForm>
                            )}
                            {c.status !== 'REVERSED' && (
                              <details className="ove-details">
                                <summary>Reversar</summary>
                                <ActionForm action={reverseCommissionAction}>
                                  <input type="hidden" name="id" value={c.id} />
                                  <label className="ov-field"><span>Motivo</span><textarea name="reason" required minLength={5} maxLength={300} /></label>
                                  <SubmitButton className="ov-btn ov-btn--danger ov-btn--small">Reversar comisión</SubmitButton>
                                </ActionForm>
                              </details>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pager page={page} pageSize={PAGE_SIZE} total={total} href={(n) => `/empresa/comisiones${qs(base, { p: n > 1 ? n : undefined })}`} />
          </div>
        </>
      )}
      {!canPay && <p className="ov-meta" style={{ marginTop: 12 }}>Marcar comisiones como pagadas corresponde a Tesorería o Administración.</p>}
    </>
  );
}

async function Resumen({ params, orgName }: { params: SearchParams; orgName: (id: string | null) => string }) {
  const prisma = getPrisma();
  const today = todayBogota();
  const desde = spDate(params, 'desde') || `${today.slice(0, 7)}-01`;
  const hasta = spDate(params, 'hasta') || today;
  const estado = spEnum(params, 'estado', STATUSES);
  const groups = await prisma.commission.groupBy({
    by: ['allyOrgId', 'status'],
    where: { causedAt: { gte: bogotaDayStart(desde), lt: bogotaDayEnd(hasta) } },
    _sum: { net: true, gross: true },
    _count: { _all: true },
  });
  const orgIds = [...new Set(groups.map((g) => g.allyOrgId))];
  const cell = (org: string, s: CommissionStatus) => groups.find((g) => g.allyOrgId === org && g.status === s);
  const rows = orgIds
    .map((org) => ({ org, total: STATUSES.reduce((a, s) => a + toNumber(cell(org, s)?._sum.net), 0) }))
    .sort((a, b) => b.total - a.total);
  const csvHref = `/api/empresa/comisiones/csv${qs({ desde, hasta, estado })}`;

  return (
    <>
      <form className="ov-filters" method="get">
        <input type="hidden" name="tab" value="resumen" />
        <label className="ov-field"><span>Causadas desde</span><input type="date" name="desde" defaultValue={desde} /></label>
        <label className="ov-field"><span>Causadas hasta</span><input type="date" name="hasta" defaultValue={hasta} /></label>
        <label className="ov-field"><span>Estado (para el CSV)</span>
          <select name="estado" defaultValue={estado}>
            <option value="">Todos</option>
            {STATUSES.map((s) => <option key={s} value={s}>{COMMISSION_STATUS[s].label}</option>)}
          </select>
        </label>
        <button className="ov-btn ov-btn--secondary" type="submit">Aplicar</button>
      </form>
      <article className="ov-card">
        <header>
          <h2>Neto por aliado · {fechaDia(desde)} a {fechaDia(hasta)}</h2>
          <a className="ov-btn ov-btn--small" href={csvHref}>Descargar cierre del periodo (CSV)</a>
        </header>
        {rows.length === 0 ? (
          <Empty>No hay comisiones causadas en este periodo.</Empty>
        ) : (
          <div className="ov-tablewrap">
            <table className="ov-table">
              <thead>
                <tr>
                  <th>Aliado</th>
                  {STATUSES.map((s) => <th key={s} className="num">{COMMISSION_STATUS[s].label}</th>)}
                  <th className="num">Total neto</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.org}>
                    <td><Link href={`/empresa/comisiones${qs({ aliado: r.org, desde, hasta })}`}>{orgName(r.org)}</Link></td>
                    {STATUSES.map((s) => {
                      const g = cell(r.org, s);
                      return <td key={s} className="num">{g ? <>{money(g._sum.net)}<small>{g._count._all} neg.</small></> : '—'}</td>;
                    })}
                    <td className="num"><span className="ov-money">{money(r.total)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="ov-meta" style={{ marginTop: 12 }}>
          El cierre del periodo se hace descargando el CSV (queda registrado en la bitácora) y confirmando que todas las comisiones causadas estén aprobadas, programadas o reversadas con motivo.
        </p>
      </article>
    </>
  );
}

async function Reglas({ orgs, canRules }: { orgs: Array<{ id: string; name: string }>; canRules: boolean }) {
  const prisma = getPrisma();
  const [rules, usage] = await Promise.all([
    prisma.commissionRule.findMany({ orderBy: [{ name: 'asc' }, { version: 'desc' }], include: { organization: { select: { name: true } } } }),
    prisma.commission.groupBy({ by: ['ruleId'], _count: { _all: true } }),
  ]);
  const used = (id: string) => usage.find((u) => u.ruleId === id)?._count._all ?? 0;
  const today = todayBogota();
  const latestByName = new Map<string, string>();
  for (const r of rules) if (!latestByName.has(r.name)) latestByName.set(r.name, r.id);
  const inForce = (r: (typeof rules)[number]) => r.active && ymd(r.validFrom) <= today && (!r.validTo || ymd(r.validTo) >= today);

  return (
    <>
      <Notice tone="info">
        Las reglas nunca se modifican: cambiar un porcentaje crea una nueva versión con su vigencia y cierra la anterior. Cada comisión guarda una copia de la regla con la que se causó, y los negocios ya protegidos conservan la regla vigente cuando se creó el caso. Prioridad: organización &gt; nivel &gt; general; producto exacto &gt; cualquiera; mayor versión.
      </Notice>
      {canRules && (
        <article className="ov-card" style={{ marginTop: 16 }}>
          <h2>Nueva regla</h2>
          <ActionForm action={createRuleAction} className="ov-form ov-form--3" resetOnSuccess>
            <label className="ov-field full"><span>Nombre</span><input name="name" required minLength={3} maxLength={120} placeholder="Ej.: Comisión general compra de cartera" /></label>
            <label className="ov-field"><span>Organización aliada (opcional)</span>
              <select name="organizationId" defaultValue="">
                <option value="">Todas</option>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>
            <label className="ov-field"><span>O nivel (opcional)</span><input name="tier" maxLength={24} placeholder="BASE, PLATA, ORO…" /></label>
            <label className="ov-field"><span>Producto</span>
              <select name="product" defaultValue="">
                <option value="">Todos los productos</option>
                {Object.entries(PRODUCTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="ov-field"><span>Base</span><input value="Monto desembolsado" readOnly /></label>
            <label className="ov-field"><span>Comisión (%)</span><input name="percent" inputMode="decimal" required placeholder="1,2" /></label>
            <label className="ov-field"><span>Retención (%)</span><input name="withholdingPct" inputMode="decimal" required defaultValue="0" /></label>
            <label className="ov-field"><span>Días para pagar</span><input name="paymentDays" type="number" min={0} max={365} defaultValue={30} required /></label>
            <label className="ov-field"><span>Vigente desde</span><input name="validFrom" type="date" required defaultValue={today} /></label>
            <label className="ov-field"><span>Vigente hasta (opcional)</span><input name="validTo" type="date" /></label>
            <div className="full"><SubmitButton>Crear regla</SubmitButton></div>
          </ActionForm>
        </article>
      )}
      <article className="ov-card" style={{ marginTop: 16 }}>
        <h2>Reglas y versiones</h2>
        {rules.length === 0 ? (
          <Empty>Aún no hay reglas de comisión. Sin una regla vigente, un desembolso de aliado queda registrado en la bitácora como &quot;sin regla&quot; y no causa comisión.</Empty>
        ) : (
          <div className="ov-tablewrap">
            <table className="ov-table" style={{ minWidth: 980 }}>
              <thead>
                <tr><th>Regla</th><th>Alcance</th><th>Producto</th><th className="num">%</th><th className="num">Retención</th><th className="num">Días</th><th>Vigencia</th><th className="num">Usos</th>{canRules && <th>Acciones</th>}</tr>
              </thead>
              <tbody>
                {rules.map((r) => {
                  const isLatest = latestByName.get(r.name) === r.id;
                  return (
                    <tr key={r.id}>
                      <td>{r.name}<small>versión {r.version}{isLatest ? ' · última' : ''}</small></td>
                      <td>{r.organization ? r.organization.name : r.tier ? `Nivel ${r.tier}` : 'General'}</td>
                      <td>{r.product ? PRODUCTS[r.product] ?? r.product : 'Todos'}</td>
                      <td className="num">{pctDec(r.percent)}</td>
                      <td className="num">{pctDec(r.withholdingPct)}</td>
                      <td className="num">{r.paymentDays}</td>
                      <td>
                        {fechaDia(r.validFrom)} → {r.validTo ? fechaDia(r.validTo) : 'sin fin'}
                        <small>{inForce(r) ? <Status>Vigente</Status> : <Status tone="gray">{r.active ? 'No vigente hoy' : 'Inactiva'}</Status>}</small>
                      </td>
                      <td className="num">{used(r.id)}</td>
                      {canRules && (
                        <td style={{ minWidth: 260 }}>
                          {isLatest && (
                            <details className="ove-details">
                              <summary>Nueva versión</summary>
                              <ActionForm action={versionRuleAction}>
                                <input type="hidden" name="ruleId" value={r.id} />
                                <label className="ov-field"><span>Comisión (%)</span><input name="percent" inputMode="decimal" required defaultValue={(Number(r.percent.toString()) * 100).toString().replace('.', ',')} /></label>
                                <label className="ov-field"><span>Retención (%)</span><input name="withholdingPct" inputMode="decimal" required defaultValue={(Number(r.withholdingPct.toString()) * 100).toString().replace('.', ',')} /></label>
                                <label className="ov-field"><span>Días para pagar</span><input name="paymentDays" type="number" min={0} max={365} defaultValue={r.paymentDays} required /></label>
                                <label className="ov-field"><span>Vigente desde</span><input name="validFrom" type="date" required /></label>
                                <label className="ov-field"><span>Vigente hasta (opcional)</span><input name="validTo" type="date" /></label>
                                <label className="ov-field"><span>Nota del cambio</span><input name="note" maxLength={300} /></label>
                                <SubmitButton className="ov-btn ov-btn--small">Crear versión {r.version + 1}</SubmitButton>
                              </ActionForm>
                            </details>
                          )}
                          {(!r.validTo || ymd(r.validTo) > today) && (
                            <details className="ove-details" style={{ marginTop: 8 }}>
                              <summary>Cerrar vigencia</summary>
                              <ActionForm action={closeRuleAction}>
                                <input type="hidden" name="ruleId" value={r.id} />
                                <label className="ov-field"><span>Última fecha vigente</span><input name="validTo" type="date" required defaultValue={today} /></label>
                                <label className="ov-field"><span>Motivo</span><input name="reason" required minLength={5} maxLength={300} /></label>
                                <SubmitButton className="ov-btn ov-btn--danger ov-btn--small">Cerrar vigencia</SubmitButton>
                              </ActionForm>
                            </details>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </>
  );
}
