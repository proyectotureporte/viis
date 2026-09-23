import type { Metadata } from 'next';
import Link from 'next/link';
import { KeepForm, Submit } from '@/components/cliente/Form';
import { NoPerson, PesoMap, PESO_COLORS } from '@/components/cliente/ui';
import { Confidence, Empty, Kpi, Notice, PageHeader, Section, Status } from '@/components/ov/ui';
import { isoDay, isoMonthText, isoText, monthsText, rateText, todayBogota } from '@/lib/cliente/format';
import { clientPage } from '@/lib/cliente/page';
import { interestAvoided, loadLoanViews } from '@/lib/cliente/twin';
import { fechaDia, fechaHora, money, PAYMENT_STATUS, toNumber } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { closeLoanAction } from './actions';
import { LoanForm } from './LoanForm';

export const metadata: Metadata = { title: 'Mi crédito' };

const PAGE_SIZE = 24;

export default async function CreditoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { person } = await clientPage();
  if (!person) {
    return (
      <>
        <PageHeader title="Mi crédito" />
        <NoPerson />
      </>
    );
  }
  const params = await searchParams;
  const prisma = getPrisma();
  const today = todayBogota();
  const [{ views, params: uvrParams }, entities, properties] = await Promise.all([
    loadLoanViews(person.id, today),
    prisma.entity.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.property.findMany({ where: { personId: person.id }, select: { id: true, alias: true }, orderBy: { createdAt: 'asc' } }),
  ]);

  if (!views.length) {
    return (
      <>
        <PageHeader title="Mi crédito" subtitle="¿Qué debo, cuánto cuesta y cómo se comporta?" />
        <div className="ov-grid">
          <article className="ov-card s12">
            <h2>Registra tu crédito de vivienda</h2>
            <p className="ov-meta">Ten a mano tu último extracto: ahí están la tasa, el saldo de capital, las cuotas pagadas y los seguros. Si no tienes crédito aún, puedes <Link href="/cliente/decidir?sim=TARGET_PAYMENT">simular una cuota</Link> o <Link href="/cliente/ayuda#asesor">hablar con un asesor</Link>.</p>
            <LoanForm entities={entities} properties={properties} />
          </article>
        </div>
      </>
    );
  }

  const selectedId = typeof params.id === 'string' ? params.id : undefined;
  const view = views.find((v) => v.loan.id === selectedId) ?? views[0];
  const { loan, state, schedule, notices, nextRow } = view;
  const [snapshots, payments] = await Promise.all([
    prisma.loanSnapshot.findMany({ where: { loanId: loan.id }, orderBy: { createdAt: 'desc' }, take: 30 }),
    prisma.paymentReport.findMany({ where: { loanId: loan.id }, orderBy: { paidOn: 'desc' }, take: 50 }),
  ]);
  const validatedPrepayments = payments.filter((p) => p.kind === 'PREPAYMENT' && (p.status === 'VALIDATED' || p.status === 'RECONCILED'));
  const avoided = state ? interestAvoided(state, validatedPrepayments) : 0;
  const prepaid = validatedPrepayments.reduce((a, p) => a + toNumber(p.amount), 0);

  const pageCount = schedule ? Math.ceil(schedule.rows.length / PAGE_SIZE) : 0;
  const pageRaw = Number(typeof params.pagina === 'string' ? params.pagina : '1');
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 && pageRaw <= pageCount ? pageRaw : 1;
  const rows = schedule ? schedule.rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : [];
  const pageHref = (p: number) => `/cliente/credito?id=${loan.id}&pagina=${p}#tabla`;

  const monthlyInterestNow = nextRow?.interest ?? schedule?.rows[0]?.interest;

  const timeline: Array<{ date: string; title: string; detail?: string }> = [
    { date: isoDay(loan.disbursedAt), title: 'Desembolso', detail: `${money(loan.originalAmount)} a ${loan.termMonths} meses` },
    ...snapshots.map((s) => ({ date: isoDay(s.createdAt), title: s.reason, detail: `Registrado ${fechaHora(s.createdAt)}` })),
    ...payments
      .filter((p) => p.status === 'VALIDATED' || p.status === 'RECONCILED')
      .map((p) => ({ date: isoDay(p.paidOn), title: p.kind === 'PREPAYMENT' ? `Abono a capital validado: ${money(p.amount)}` : `Cuota validada: ${money(p.amount)}` })),
  ];
  if (schedule) timeline.push({ date: schedule.payoffDate, title: 'Terminación estimada', detail: 'Si pagas las cuotas como están hoy.' });
  timeline.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return (
    <>
      <PageHeader
        title="Mi crédito"
        subtitle="¿Qué debo, cuánto cuesta y cómo se comporta?"
        actions={<Link className="ov-btn ov-btn--secondary" href={`/cliente/gestiones?credito=${loan.id}#pago`}>Reportar pago</Link>}
      />

      {views.length > 1 && (
        <nav className="ov-tabs" aria-label="Mis créditos">
          {views.map((v) => (
            <Link key={v.loan.id} href={`/cliente/credito?id=${v.loan.id}`} aria-current={v.loan.id === loan.id ? 'page' : undefined}>{v.loan.alias}</Link>
          ))}
        </nav>
      )}

      <div className="ov-grid">
        <Kpi label="Saldo de capital" value={money(loan.balance, true)} sub={<Confidence level={loan.confidence} source={loan.source} asOf={fechaDia(loan.balanceAsOf)} />} />
        <Kpi
          label="Tasa"
          value={`${rateText(Number(loan.rateEa))} EA`}
          sub={`${loan.system === 'UVR' ? 'UVR + tasa real' : 'Fija en pesos'}${loan.entity ? ` · ${loan.entity.name}` : ''}${monthlyInterestNow !== undefined ? ` · este mes ≈ ${money(monthlyInterestNow)} en intereses` : ''}`}
        />
        <Kpi label="Cuota estimada" value={nextRow ? money(nextRow.payment) : '—'} sub={nextRow ? `Próxima: ${isoText(view.due)} (día ${loan.paymentDay})` : 'Completa los datos para estimarla'} />
        <Kpi label="Tiempo restante" value={monthsText(loan.termMonths - loan.paidInstallments)} sub={schedule ? `Terminarías en ${isoMonthText(schedule.payoffDate)} · ${loan.paidInstallments} de ${loan.termMonths} cuotas pagadas` : `${loan.paidInstallments} de ${loan.termMonths} cuotas pagadas`} />
      </div>

      <p className="ov-meta" style={{ marginTop: 8 }}>
        Supuesto del cálculo: el saldo que registraste corresponde al corte de tu última cuota (día {loan.paymentDay}); las cifras son estimaciones del motor OpenV con tus datos declarados.
      </p>
      {notices.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {notices.map((n) => <Notice key={n} tone="info">{n}</Notice>)}
        </div>
      )}
      {loan.system === 'UVR' && (
        <p className="ov-meta" style={{ marginTop: 8 }}>
          Parámetros UVR: {uvrParams.uvr ? `UVR ${uvrParams.uvr.value} (${uvrParams.uvr.source}, ${isoText(uvrParams.uvr.asOf)})` : 'UVR no cargada'} ·{' '}
          {uvrParams.inflation ? `inflación proyectada ${rateText(uvrParams.inflation.value)} (${uvrParams.inflation.source}, ${isoText(uvrParams.inflation.asOf)})` : 'inflación proyectada no cargada'}.
        </p>
      )}

      <Section title="Mapa de cada peso" />
      <div className="ov-grid">
        <article className="ov-card s6">
          <h2>Tu próxima cuota</h2>
          {nextRow ? (
            <PesoMap
              parts={[
                { label: 'Capital (lo que ya es tuyo)', value: nextRow.principal, color: PESO_COLORS.capital },
                { label: 'Intereses (costo del dinero)', value: nextRow.interest, color: PESO_COLORS.interest },
                { label: 'Seguros', value: nextRow.insurance, color: PESO_COLORS.insurance },
              ]}
              caption={`Cuota del ${isoText(nextRow.date)} estimada con el motor OpenV. De cada $100 que pagas, $${Math.round((nextRow.principal / nextRow.payment) * 100)} bajan tu deuda.`}
            />
          ) : (
            <Empty>Completa los datos del crédito para desglosar la cuota.</Empty>
          )}
        </article>
        <article className="ov-card s6">
          <h2>Lo que te falta pagar</h2>
          {schedule ? (
            <PesoMap
              parts={[
                { label: 'Capital', value: schedule.totals.principal, color: PESO_COLORS.capital },
                { label: 'Intereses', value: schedule.totals.interest, color: PESO_COLORS.interest },
                { label: 'Seguros', value: schedule.totals.insurance, color: PESO_COLORS.insurance },
              ]}
              caption={`Total restante estimado: ${money(schedule.totals.paid)} en ${schedule.months} cuotas, sin abonos.`}
            />
          ) : (
            <Empty>Sin cronograma calculado.</Empty>
          )}
        </article>
      </div>

      <div className="ov-grid" style={{ marginTop: 16 }}>
        <article className="ov-card s6">
          <div className="ov-eyebrow">Intereses evitados con tus abonos</div>
          <div className="ov-big">{validatedPrepayments.length ? money(avoided) : '—'}</div>
          <div className="ov-sub">
            {validatedPrepayments.length
              ? `${validatedPrepayments.length} abono(s) validado(s) por ${money(prepaid)}.`
              : 'Aún no tienes abonos validados. Solo cuentan los abonos que operación verificó con soporte.'}
          </div>
          {validatedPrepayments.length > 0 && (
            <p style={{ margin: '8px 0 0' }}>
              <Confidence level="ESTIMATED" source="Motor OpenV: intereses restantes con y sin cada abono, con las condiciones actuales" />
            </p>
          )}
          <div className="ov-actions">
            <Link className="ov-btn ov-btn--secondary ov-btn--small" href="/cliente/decidir?sim=PREPAYMENT">Simular un abono</Link>
            <Link className="ov-btn ov-btn--secondary ov-btn--small" href="/cliente/decidir?sim=FREE_EARLY">Ruta Libre Antes</Link>
          </div>
        </article>
        <article className="ov-card s6" id="linea">
          <h2>Línea de tiempo del crédito</h2>
          <ol className="ov-timeline">
            {timeline.slice(0, 12).map((t, i) => (
              <li key={`${t.date}-${i}`}>
                <div>
                  <strong>{isoText(t.date)} · {t.title}</strong>
                  {t.detail && <div className="ov-meta">{t.detail}</div>}
                </div>
              </li>
            ))}
          </ol>
        </article>
      </div>

      <Section title="Tabla de amortización restante" />
      <article className="ov-card" id="tabla">
        {schedule ? (
          <details className="ov-details" open={typeof params.pagina === 'string'}>
            <summary>Ver las {schedule.rows.length} cuotas restantes (página {page} de {pageCount})</summary>
            <div className="ov-tablewrap">
              <table className="ov-table">
                <caption className="cl-sr">Cronograma restante estimado, página {page} de {pageCount}</caption>
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Fecha</th>
                    <th scope="col" className="num">Cuota</th>
                    <th scope="col" className="num">Capital</th>
                    <th scope="col" className="num">Intereses</th>
                    <th scope="col" className="num">Seguros</th>
                    <th scope="col" className="num">Saldo final</th>
                    {loan.system === 'UVR' && <th scope="col" className="num">UVR proyectada</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.n}>
                      <td>{loan.paidInstallments + r.n}</td>
                      <td>{isoText(r.date)}</td>
                      <td className="num">{money(r.payment)}</td>
                      <td className="num">{money(r.principal)}</td>
                      <td className="num">{money(r.interest)}</td>
                      <td className="num">{money(r.insurance)}</td>
                      <td className="num">{money(r.closingBalance)}</td>
                      {loan.system === 'UVR' && <td className="num">{r.uvrValue?.toFixed(4).replace('.', ',')}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav className="ov-actions" aria-label="Páginas de la tabla">
              {page > 1 && <Link className="ov-btn ov-btn--secondary ov-btn--small" href={pageHref(page - 1)}>← Anteriores</Link>}
              <span className="ov-meta">Página {page} de {pageCount}</span>
              {page < pageCount && <Link className="ov-btn ov-btn--secondary ov-btn--small" href={pageHref(page + 1)}>Siguientes →</Link>}
            </nav>
            <details className="ov-details" style={{ marginTop: 12 }}>
              <summary>Supuestos del cálculo (motor {schedule.engineVersion})</summary>
              <ul className="ov-assumptions">{schedule.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
              {schedule.warnings.length > 0 && <ul className="ov-assumptions">{schedule.warnings.map((a) => <li key={a}>{a}</li>)}</ul>}
            </details>
          </details>
        ) : (
          <Empty>No podemos calcular la tabla con los datos actuales. Revisa el formulario de abajo.</Empty>
        )}
      </article>

      <Section title="Pagos reportados" />
      <article className="ov-card">
        {payments.length ? (
          <div className="ov-list">
            {payments.slice(0, 6).map((p) => (
              <div className="ov-row" key={p.id}>
                <div className="grow">
                  <strong>{p.kind === 'PREPAYMENT' ? 'Abono a capital' : 'Cuota'} · {money(p.amount)}</strong>
                  <small>Pagado el {fechaDia(p.paidOn)} · {p.channel}{p.rejectReason ? ` · Motivo: ${p.rejectReason}` : ''}</small>
                </div>
                <Status tone={PAYMENT_STATUS[p.status].tone}>{PAYMENT_STATUS[p.status].label}</Status>
              </div>
            ))}
          </div>
        ) : (
          <Empty>No has reportado pagos de este crédito.</Empty>
        )}
        <div className="ov-actions"><Link href="/cliente/gestiones#pagos">Ver todos y reportar →</Link></div>
      </article>

      <Section title="Condiciones del crédito" />
      <article className="ov-card" id="editar">
        <p className="ov-meta">¿Cambió algo? Actualiza con tu extracto más reciente: cada cambio queda versionado en tu historial.</p>
        <LoanForm loan={loan} entities={entities} properties={properties} />
        <details className="ov-details" style={{ marginTop: 18 }}>
          <summary>Ya no tengo este crédito</summary>
          <KeepForm action={closeLoanAction} className="ov-form ov-inline">
            <input type="hidden" name="id" value={loan.id} />
            <label className="ov-field">
              <span>Motivo</span>
              <select name="reason" required defaultValue="">
                <option value="" disabled>Elige</option>
                <option value="PAID_OFF">Lo terminé de pagar</option>
                <option value="TRANSFERRED">Lo trasladé a otra entidad</option>
                <option value="ERROR">Lo registré por error</option>
              </select>
            </label>
            <Submit className="ov-btn ov-btn--secondary">Cerrar crédito</Submit>
          </KeepForm>
        </details>
      </article>

      <details className="ov-card ov-details" style={{ marginTop: 16 }}>
        <summary>Registrar otro crédito</summary>
        <LoanForm entities={entities} properties={properties} />
      </details>
    </>
  );
}
