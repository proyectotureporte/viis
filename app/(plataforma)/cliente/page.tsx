import type { Metadata } from 'next';
import Link from 'next/link';
import type { Prisma } from '@/app/generated/prisma/client';
import type { Confidence as ConfidenceLevel } from '@/app/generated/prisma/enums';
import { Confidence, Empty, Notice, PageHeader, Status } from '@/components/ov/ui';
import { Dot, NoPerson, PesoMap, PESO_COLORS, StageSteps, Step, type Tone } from '@/components/cliente/ui';
import { nextBestActions, PORTFOLIO_RATE_GAP } from '@/lib/finance';
import { missingDocuments } from '@/lib/domain/documents';
import { ACTION_LINKS } from '@/lib/cliente/nba';
import { clientPage } from '@/lib/cliente/page';
import { isoDay, isoText, monthsText, rateText, todayBogota } from '@/lib/cliente/format';
import { latestReferenceRate } from '@/lib/cliente/server';
import { lastValuations, loadLoanViews } from '@/lib/cliente/twin';
import { fechaDia, fechaHora, money, PAYMENT_STATUS, PRODUCTS, slaText, STAGE_CLIENT_TEXT, STAGE_LABELS, toNumber } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';

export const metadata: Metadata = { title: 'Inicio' };

const CONF_ORDER: ConfidenceLevel[] = ['DECLARED', 'ESTIMATED', 'CONFIRMED'];

export default async function ClienteInicio() {
  const { person } = await clientPage();
  if (!person) {
    return (
      <>
        <PageHeader title="Hola" subtitle="Bienvenido a OpenV." />
        <NoPerson />
      </>
    );
  }
  const prisma = getPrisma();
  const today = todayBogota();
  const [properties, { views }, opportunities, documents] = await Promise.all([
    prisma.property.findMany({ where: { personId: person.id }, include: { valuations: { orderBy: { asOf: 'desc' }, take: 2 } }, orderBy: { createdAt: 'asc' } }),
    loadLoanViews(person.id, today),
    prisma.opportunity.findMany({
      where: { personId: person.id, stage: { notIn: ['WITHDRAWN'] } },
      include: { assignee: { select: { name: true } }, allyUser: { select: { name: true } }, entity: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.document.findMany({ where: { personId: person.id }, include: { type: true }, orderBy: [{ version: 'desc' }] }),
  ]);

  const activeCases = opportunities.filter((o) => !['DISBURSED', 'POSTSALE'].includes(o.stage));
  const missingByCase = new Map<string, Awaited<ReturnType<typeof missingDocuments>>>();
  for (const c of activeCases) missingByCase.set(c.id, await missingDocuments(prisma, person.id, c.product));
  const missingNames = [...new Set([...missingByCase.values()].flat().map((t) => t.name))];

  const primary = views[0] ?? null;
  const hasLoan = views.length > 0;
  const hasProperty = properties.length > 0;
  const hasValuation = properties.some((p) => p.valuations.length > 0);
  const hasHousehold = person.monthlyIncome !== null && person.monthlyExpenses !== null;

  // ── Onboarding: el usuario nuevo llega aquí ──────────────────────────
  const onboarding = (
    <ol className="cl-onboarding">
      <Step done={Boolean(person.goals)} title="1. Tus objetivos" detail="Cuéntanos qué quieres lograr con tu vivienda: terminar antes, bajar la cuota, comprar…" href="/cliente/hogar" cta="Definir objetivos" />
      <Step done={hasHousehold} title="2. Tu hogar e ingresos" detail="Ingresos, gastos y ahorro del hogar: sin ellos no recomendamos abonos ni cambios." href="/cliente/hogar#finanzas" cta="Completar" />
      <Step done={hasProperty} title="3. Tu inmueble" detail="Registra tu vivienda: ciudad, tipo y área." href="/cliente/vivienda" cta="Registrar inmueble" />
      <Step done={hasValuation} title="4. Valor de tu vivienda" detail="Un valor declarado o un avalúo, con fecha y fuente, para calcular tu patrimonio." href="/cliente/vivienda#valor" cta="Registrar valor" />
      <Step done={hasLoan} title="5. Tu crédito" detail="Entidad, tasa, plazo, saldo y día de pago, tal como aparecen en tu extracto." href="/cliente/credito" cta="Registrar crédito" />
    </ol>
  );
  const onboardingDone = Boolean(person.goals) && hasHousehold && hasProperty && hasValuation && hasLoan;

  // ── Patrimonio ───────────────────────────────────────────────────────
  const latestVals = properties.map((p) => ({ property: p, ...lastValuations(p.valuations) }));
  const valued = latestVals.filter((v) => v.latest);
  const totalValue = valued.reduce((a, v) => a + toNumber(v.latest!.value), 0);
  const totalDebt = views.reduce((a, v) => a + toNumber(v.loan.balance), 0);
  const unvaluedWithLoan = views.some((v) => v.loan.propertyId && !valued.some((x) => x.property.id === v.loan.propertyId));
  const lowAll = valued.every((v) => v.latest!.low !== null) ? valued.reduce((a, v) => a + toNumber(v.latest!.low), 0) : null;
  const highAll = valued.every((v) => v.latest!.high !== null) ? valued.reduce((a, v) => a + toNumber(v.latest!.high), 0) : null;
  const withPrev = valued.filter((v) => v.previous);
  const variation = withPrev.reduce((a, v) => a + toNumber(v.latest!.value) - toNumber(v.previous!.value), 0);
  const minConf = valued.length ? CONF_ORDER.find((c) => valued.some((v) => v.latest!.confidence === c))! : null;
  const valSource = valued.length === 1 ? valued[0].latest!.source : valued.length > 1 ? 'varias fuentes' : null;
  const valAsOf = valued.length ? valued.map((v) => v.latest!.asOf).sort((a, b) => a.getTime() - b.getTime())[0] : null;
  const netWorth = totalValue - totalDebt;

  // ── Avance del crédito principal ────────────────────────────────────
  const pLoan = primary?.loan;
  const pBalance = pLoan ? toNumber(pLoan.balance) : 0;
  const pOriginal = pLoan ? toNumber(pLoan.originalAmount) : 0;
  const capitalPaid = pOriginal - pBalance;
  const linkedVal = pLoan?.propertyId ? valued.find((v) => v.property.id === pLoan.propertyId)?.latest : valued[0]?.latest;
  const ownership = linkedVal && toNumber(linkedVal.value) > 0 ? Math.max(0, Math.min(1, (toNumber(linkedVal.value) - pBalance) / toNumber(linkedVal.value))) : null;

  // ── Datos para el motor ─────────────────────────────────────────────
  const refRate = primary ? await latestReferenceRate(primary.loan.system, today) : null;
  const household = {
    income: person.monthlyIncome !== null ? toNumber(person.monthlyIncome) : undefined,
    expenses: person.monthlyExpenses !== null ? toNumber(person.monthlyExpenses) : undefined,
    savings: person.savings !== null ? toNumber(person.savings) : undefined,
  };
  const actions = hasLoan
    ? nextBestActions({
        loanState: primary?.state ?? null,
        referenceRate: refRate ? { rateEa: refRate.rateEa, source: refRate.source, asOf: refRate.asOf } : undefined,
        household,
        // Un ítem por caso (no por documento): el motor interpreta textos con "ingreso" o "saldo" como datos críticos.
        missing: activeCases
          .filter((c) => (missingByCase.get(c.id) ?? []).length > 0)
          .map((c) => `${(missingByCase.get(c.id) ?? []).length} documento(s) del caso ${c.code}`),
        // No hay conexión con el banco: sin evidencia no se asume mora.
        paymentsOverdue: false,
      })
    : [];
  const best = actions[0];

  // ── Próximo pago ────────────────────────────────────────────────────
  const periodReports = primary
    ? await prisma.paymentReport.findMany({
        where: { loanId: primary.loan.id, kind: 'INSTALLMENT', paidOn: { gt: new Date(`${primary.prevDue}T00:00:00Z`) } },
        orderBy: { createdAt: 'desc' },
      })
    : [];
  const periodReport = periodReports.find((r) => r.status !== 'REJECTED') ?? periodReports[0] ?? null;

  // ── Radar ──────────────────────────────────────────────────────────
  const payment = primary?.nextRow?.payment ?? primary?.schedule?.basePayment;
  const ratio = payment && household.income ? payment / household.income : null;
  const latestByType = new Map<string, (typeof documents)[number]>();
  for (const d of documents) if (!latestByType.has(d.typeId)) latestByType.set(d.typeId, d);
  const soon = new Date(`${today}T00:00:00Z`).getTime() + 30 * 86_400_000;
  const docProblems = [...latestByType.values()].filter(
    (d) => d.status === 'REJECTED' || d.status === 'EXPIRED' || (d.expiresAt && d.expiresAt.getTime() <= soon),
  );

  const radar: Array<{ tone: Tone; title: string; detail: React.ReactNode; href?: string; cta?: string }> = [];
  if (pLoan) {
    const rate = Number(pLoan.rateEa);
    if (!refRate) {
      radar.push({ tone: 'gray', title: 'Tasa sin punto de comparación', detail: 'Aún no hay una tasa de referencia vigente cargada para tu tipo de crédito. No emitimos juicio sin fuente.' });
    } else if (rate - refRate.rateEa >= PORTFOLIO_RATE_GAP) {
      radar.push({
        tone: 'amber',
        title: 'Tu tasa merece revisión',
        detail: `Pagas ${rateText(rate)} EA; la referencia es ${rateText(refRate.rateEa)} EA (${refRate.source}, ${isoText(refRate.asOf)}). Revisa si un traslado compensa sus costos.`,
        href: '/cliente/decidir?sim=PORTFOLIO',
        cta: 'Simular compra de cartera',
      });
    } else {
      radar.push({ tone: 'ok', title: 'Tasa en rango', detail: `Pagas ${rateText(rate)} EA; la referencia es ${rateText(refRate.rateEa)} EA (${refRate.source}, ${isoText(refRate.asOf)}).` });
    }
  }
  if (ratio === null) {
    radar.push({ tone: 'gray', title: 'Capacidad de pago sin calcular', detail: 'Registra los ingresos del hogar para saber qué parte se va en la cuota.', href: '/cliente/hogar#finanzas', cta: 'Completar ingresos' });
  } else {
    const tone: Tone = ratio > 0.5 ? 'red' : ratio > 0.3 ? 'amber' : 'ok';
    radar.push({
      tone,
      title: `La cuota es el ${Math.round(ratio * 100)} % de tu ingreso`,
      detail:
        tone === 'ok'
          ? 'Está dentro del 30 % que se usa como referencia en Colombia para vivienda.'
          : 'Supera el 30 % de referencia: tu margen es estrecho. Revisa cómo resistiría tu hogar un imprevisto.',
      href: tone === 'ok' ? undefined : '/cliente/decidir?sim=STRESS',
      cta: tone === 'ok' ? undefined : 'Simular un choque',
    });
  }
  if (pLoan) {
    const ins = toNumber(pLoan.monthlyInsurance);
    radar.push(
      ins > 0
        ? { tone: 'ok', title: `Seguros: ${money(ins)} al mes`, detail: 'Puedes presentar una póliza propia con coberturas equivalentes si la entidad la acepta.', href: '/cliente/ayuda#asesor', cta: 'Revisar seguros' }
        : { tone: 'amber', title: 'Seguros sin registrar', detail: 'Los créditos de vivienda suelen incluir seguro de vida e incendio y terremoto. Regístralo para ver la cuota completa.', href: '/cliente/credito', cta: 'Completar' },
    );
  }
  if (docProblems.length || missingNames.length) {
    radar.push({
      tone: docProblems.some((d) => d.status === 'REJECTED' || d.status === 'EXPIRED') ? 'red' : 'amber',
      title: `Documentos: ${missingNames.length} pendientes${docProblems.length ? `, ${docProblems.length} por atender` : ''}`,
      detail: [...docProblems.map((d) => `${d.type.name} (${d.status === 'REJECTED' ? 'rechazado' : d.status === 'EXPIRED' || (d.expiresAt && isoDay(d.expiresAt) < today) ? 'vencido' : `vence ${fechaDia(d.expiresAt)}`})`), ...missingNames].slice(0, 4).join(' · '),
      href: '/cliente/documentos',
      cta: 'Ver documentos',
    });
  } else if (documents.length) {
    radar.push({ tone: 'ok', title: 'Documentos al día', detail: 'No tienes documentos rechazados, vencidos ni pendientes.' });
  }

  const greeting = `Hola, ${person.firstName}`;

  if (!hasLoan && !hasProperty) {
    return (
      <>
        <PageHeader title={greeting} subtitle="Empecemos por lo esencial: en cinco pasos verás tu patrimonio, tu cuota y tu próxima mejor acción." />
        <div className="ov-grid">
          <article className="ov-card s7">
            <h2>Arma tu expediente</h2>
            <p className="ov-meta">Todo lo que registres queda marcado como “declarado por ti”, con fecha. Puedes actualizarlo cuando quieras.</p>
            {onboarding}
          </article>
          <article className="ov-card s5 ov-action">
            <div className="ov-eyebrow">Por qué lo pedimos</div>
            <h2>Sin datos no hay recomendaciones</h2>
            <p>OpenV no te dirá que abones, cambies de plazo o de banco sin conocer tu saldo, tus ingresos y el valor de tu vivienda. Primero lo básico; luego, decisiones con números.</p>
            <div className="ov-actions">
              <Link className="ov-btn" href="/cliente/hogar">Empezar</Link>
              <Link className="ov-btn ov-btn--ghost" href="/cliente/ayuda#asesor">Prefiero que me ayude un asesor</Link>
            </div>
          </article>
        </div>
        <CasesBlock cases={activeCases} missingByCase={missingByCase} />
      </>
    );
  }

  return (
    <>
      <PageHeader title={greeting} subtitle="Así está hoy tu vivienda y esto es lo que más te conviene revisar." />

      {!onboardingDone && (
        <details className="ov-card ov-details" style={{ marginBottom: 16 }}>
          <summary>Completa tu expediente para recomendaciones más precisas</summary>
          {onboarding}
        </details>
      )}

      <div className="ov-grid">
        {/* 1. Mi patrimonio */}
        <article className="ov-card s4" aria-labelledby="b-patrimonio">
          <div className="ov-eyebrow" id="b-patrimonio">Mi patrimonio</div>
          {valued.length ? (
            <>
              <div className="ov-big">{money(netWorth, true)}</div>
              <div className="ov-sub">
                Vivienda {money(totalValue, true)} − deuda {money(totalDebt, true)}
                {unvaluedWithLoan ? ' · falta el valor de un inmueble con crédito' : ''}
              </div>
              {lowAll !== null && highAll !== null && <div className="ov-sub">Rango del valor: {money(lowAll, true)} a {money(highAll, true)}</div>}
              {withPrev.length > 0 && (
                <div className={variation >= 0 ? 'ov-positive' : 'ov-negative'}>
                  {variation >= 0 ? '+' : '−'}{money(Math.abs(variation), true)} frente a la valoración anterior ({fechaDia(withPrev[0].previous!.asOf)})
                </div>
              )}
              <p style={{ margin: '8px 0 0' }}><Confidence level={minConf!} source={valSource} asOf={valAsOf ? fechaDia(valAsOf) : undefined} /></p>
              <p className="ov-meta">Estimación, no avalúo oficial.</p>
              <div className="ov-actions">
                <Link className="ov-btn ov-btn--secondary ov-btn--small" href="/cliente/vivienda#valor">Actualizar valor</Link>
                <Link className="ov-btn ov-btn--secondary ov-btn--small" href="/cliente/vivienda#avaluo">Solicitar avalúo</Link>
              </div>
            </>
          ) : (
            <>
              <div className="ov-big">—</div>
              <div className="ov-sub">Deuda registrada: {money(totalDebt)}</div>
              <p className="ov-meta">Registra el valor estimado de tu vivienda para calcular tu patrimonio neto.</p>
              <div className="ov-actions"><Link className="ov-btn ov-btn--small" href="/cliente/vivienda#valor">Registrar valor</Link></div>
            </>
          )}
        </article>

        {/* 2. Mi avance */}
        <article className="ov-card s4" aria-labelledby="b-avance">
          <div className="ov-eyebrow" id="b-avance">Mi avance</div>
          {pLoan ? (
            <>
              <div className="ov-big">{ownership !== null ? `${Math.round(ownership * 1000) / 10} %`.replace('.', ',') : `${pLoan.paidInstallments} de ${pLoan.termMonths}`}</div>
              <div className="ov-sub">{ownership !== null ? 'de tu vivienda ya es tuyo en términos económicos' : 'cuotas pagadas'}</div>
              {ownership !== null && <div className="ov-bar" role="img" aria-label={`Propiedad económica ${Math.round(ownership * 100)} %`}><i style={{ width: `${ownership * 100}%` }} /></div>}
              <dl className="cl-kv">
                <div><dt>Capital pagado</dt><dd>{capitalPaid >= 0 ? money(capitalPaid) : '—'}</dd></div>
                <div><dt>Cuotas</dt><dd>{pLoan.paidInstallments} de {pLoan.termMonths}</dd></div>
                <div><dt>Tiempo restante</dt><dd>{monthsText(pLoan.termMonths - pLoan.paidInstallments)}</dd></div>
                {primary?.schedule && <div><dt>Terminarías</dt><dd>{isoText(primary.schedule.payoffDate)}</dd></div>}
              </dl>
              {capitalPaid < 0 && pLoan.system === 'UVR' && <p className="ov-meta">En UVR el saldo en pesos puede superar el monto prestado por la inflación.</p>}
              <p style={{ margin: '8px 0 0' }}><Confidence level={pLoan.confidence} source={pLoan.source} asOf={`saldo al ${fechaDia(pLoan.balanceAsOf)}`} /></p>
              <div className="ov-actions"><Link className="ov-btn ov-btn--secondary ov-btn--small" href="/cliente/credito#linea">Ver línea de tiempo</Link></div>
            </>
          ) : (
            <>
              <p>Registra tu crédito para ver cuánto has pagado y cuánto falta.</p>
              <Link className="ov-btn ov-btn--small" href="/cliente/credito">Registrar crédito</Link>
            </>
          )}
        </article>

        {/* 4. Próximo pago */}
        <article className="ov-card s4" aria-labelledby="b-pago">
          <div className="ov-eyebrow" id="b-pago">Próximo pago</div>
          {primary ? (
            <>
              <div className="ov-big">{primary.nextRow ? money(primary.nextRow.payment) : '—'}</div>
              <div className="ov-sub">Vence el {isoText(primary.due)} · {pLoan!.alias}{pLoan!.entity ? ` · ${pLoan!.entity.name}` : ''}</div>
              <p style={{ margin: '8px 0' }}>
                {periodReport ? (
                  <Status tone={PAYMENT_STATUS[periodReport.status].tone}>Pago {PAYMENT_STATUS[periodReport.status].label.toLowerCase()} el {fechaDia(periodReport.paidOn)}</Status>
                ) : (
                  <Status tone="gray">Sin pago reportado en este periodo</Status>
                )}
              </p>
              {primary.nextRow ? (
                <PesoMap
                  parts={[
                    { label: 'Capital', value: primary.nextRow.principal, color: PESO_COLORS.capital },
                    { label: 'Intereses', value: primary.nextRow.interest, color: PESO_COLORS.interest },
                    { label: 'Seguros', value: primary.nextRow.insurance, color: PESO_COLORS.insurance },
                  ]}
                  caption="Cuota estimada por el motor OpenV; tu extracto puede variar unos pesos."
                />
              ) : (
                <p className="ov-meta">{primary.notices[0] ?? 'Completa los datos del crédito para estimar la cuota.'}</p>
              )}
              <div className="ov-actions">
                <Link className="ov-btn ov-btn--small" href={`/cliente/gestiones?credito=${primary.loan.id}#pago`}>Reportar pago</Link>
              </div>
            </>
          ) : (
            <p className="ov-meta">Sin crédito registrado.</p>
          )}
        </article>

        {/* 3. Próxima mejor acción */}
        <article className="ov-card ov-action s8" aria-labelledby="b-accion">
          <div className="ov-eyebrow" id="b-accion">Tu próxima mejor acción</div>
          {best ? (
            <>
              <h2>{best.title}</h2>
              <p><strong>Por qué:</strong> {best.reason}</p>
              <p><strong>Impacto:</strong> {best.impact}</p>
              {best.requires.length > 0 && <p className="ov-meta" style={{ color: '#c4d8dd' }}>Necesitas: {best.requires.join(', ')}.</p>}
              <div className="ov-actions">
                <Link className="ov-btn" href={ACTION_LINKS[best.code].href}>{ACTION_LINKS[best.code].label ?? best.cta}</Link>
                <Link className="ov-btn ov-btn--ghost" href="/cliente/ayuda#asesor">Hablar con un asesor</Link>
              </div>
              {actions.length > 1 && (
                <details className="ov-details" style={{ marginTop: 14 }}>
                  <summary>Otras acciones posibles ({actions.length - 1})</summary>
                  <ul className="cl-plan">
                    {actions.slice(1, 5).map((a) => (
                      <li key={a.code}><Link href={ACTION_LINKS[a.code].href}>{a.title}</Link> — {a.reason}</li>
                    ))}
                  </ul>
                </details>
              )}
              <p className="ov-meta" style={{ color: '#a9d4d3', marginTop: 12 }}>Priorizamos por urgencia, beneficio y factibilidad con tus datos declarados. Es orientación, no asesoría obligatoria: puedes pedir revisión humana.</p>
            </>
          ) : (
            <>
              <h2>Completa tu crédito para recibir una recomendación</h2>
              <p>Con el saldo, la tasa y tus ingresos calculamos qué te conviene: conservar liquidez, revisar seguros, comparar tasas o abonar.</p>
              <div className="ov-actions"><Link className="ov-btn" href="/cliente/credito">Registrar crédito</Link></div>
            </>
          )}
        </article>

        {/* 5. Radar financiero */}
        <article className="ov-card s4" aria-labelledby="b-radar">
          <div className="ov-eyebrow" id="b-radar">Radar financiero</div>
          <div className="ov-list" style={{ marginTop: 10 }}>
            {radar.map((item) => (
              <div className="ov-row" key={item.title}>
                <Dot tone={item.tone} label={item.tone === 'ok' ? 'Bien' : item.tone === 'gray' ? 'Sin datos' : item.tone === 'amber' ? 'Revisar' : 'Atender'} />
                <div className="grow">
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                  {item.href && <small><Link href={item.href}>{item.cta ?? 'Resolver'} →</Link></small>}
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>

      {primary && primary.notices.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {primary.notices.map((n) => <Notice key={n} tone="info">{n}</Notice>)}
        </div>
      )}

      <CasesBlock cases={activeCases} missingByCase={missingByCase} />
    </>
  );
}

type CaseRow = Prisma.OpportunityGetPayload<{
  include: { assignee: { select: { name: true } }; allyUser: { select: { name: true } }; entity: { select: { name: true } } };
}>;

function CasesBlock({ cases, missingByCase }: { cases: CaseRow[]; missingByCase: Map<string, Array<{ id: string; name: string }>> }) {
  return (
    <>
      <div className="ov-section"><h2>Estado de tus casos</h2><Link href="/cliente/gestiones#casos">Ver detalle</Link></div>
      {cases.length === 0 ? (
        <Empty>No tienes casos en trámite. Si quieres un crédito nuevo, una compra de cartera o revisar tu tasa, <Link href="/cliente/ayuda#asesor">habla con un asesor</Link>.</Empty>
      ) : (
        <div className="ov-grid">
          {cases.map((c) => {
            const missing = missingByCase.get(c.id) ?? [];
            const sla = slaText(c.slaDueAt);
            return (
              <article className="ov-card s6" key={c.id}>
                <header>
                  <h2>{c.code} · {PRODUCTS[c.product] ?? c.product}</h2>
                  <Status tone={c.stage === 'APPROVED' ? 'ok' : 'info'}>{STAGE_LABELS[c.stage]}</Status>
                </header>
                <StageSteps stage={c.stage} />
                <p>{STAGE_CLIENT_TEXT[c.stage]}</p>
                <dl className="ov-dl">
                  <dt>Responsable</dt><dd>{c.assignee?.name ?? c.allyUser?.name ?? 'Por asignar'}</dd>
                  {c.entity && (<><dt>Entidad</dt><dd>{c.entity.name}</dd></>)}
                  <dt>Siguiente paso</dt><dd>{c.nextAction ?? 'Te avisaremos del siguiente paso.'}</dd>
                  <dt>Tiempo de respuesta</dt><dd>{c.slaDueAt ? (sla.tone === 'bad' ? `Nuestro plazo venció el ${fechaHora(c.slaDueAt)}; tu caso está priorizado.` : `Respuesta esperada antes del ${fechaHora(c.slaDueAt)}`) : '—'}</dd>
                  <dt>Qué falta de ti</dt>
                  <dd>{missing.length ? missing.map((m) => m.name).join(', ') : 'Nada por ahora'}</dd>
                </dl>
                {missing.length > 0 && <div className="ov-actions"><Link className="ov-btn ov-btn--small" href="/cliente/documentos">Subir documentos</Link></div>}
                <p className="ov-meta" style={{ marginTop: 8 }}>Actualizado {fechaDia(c.stageAt)} · desde {isoText(isoDay(c.createdAt))}</p>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
