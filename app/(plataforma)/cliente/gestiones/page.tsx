import type { Metadata } from 'next';
import Link from 'next/link';
import { KeepForm, Submit } from '@/components/cliente/Form';
import { NoPerson, StageSteps } from '@/components/cliente/ui';
import { Empty, Notice, PageHeader, Section, Status } from '@/components/ov/ui';
import { simulateStress } from '@/lib/finance';
import { isoText, rateText, todayBogota } from '@/lib/cliente/format';
import { clientPage } from '@/lib/cliente/page';
import { summarizeResults } from '@/lib/cliente/simulate';
import { loadLoanViews } from '@/lib/cliente/twin';
import {
  fechaDia,
  fechaHora,
  money,
  PAYMENT_STATUS,
  PRODUCTS,
  REQUEST_KINDS,
  REQUEST_STATUS,
  slaText,
  STAGE_CLIENT_TEXT,
  STAGE_LABELS,
  toNumber,
} from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { acceptOfferAction, createRequestAction, reportPaymentAction, replyRequestAction } from './actions';
import { PAYMENT_CHANNELS, PAYMENT_WARNING } from './channels';
import { PaymentForm } from './PaymentForm';

export const metadata: Metadata = { title: 'Gestiones' };

const CLOSED = ['RESOLVED', 'REJECTED'];

export default async function GestionesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { session, person } = await clientPage();
  if (!person) {
    return (
      <>
        <PageHeader title="Gestiones" />
        <NoPerson />
      </>
    );
  }
  const params = await searchParams;
  const str = (k: string) => (typeof params[k] === 'string' ? (params[k] as string) : undefined);
  const prisma = getPrisma();
  const today = todayBogota();
  const [{ views }, payments, requests, cases] = await Promise.all([
    loadLoanViews(person.id, today),
    prisma.paymentReport.findMany({ where: { loan: { personId: person.id } }, include: { loan: { select: { alias: true } } }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.serviceRequest.findMany({ where: { personId: person.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.opportunity.findMany({
      where: { personId: person.id },
      include: {
        stages: { orderBy: { createdAt: 'asc' } },
        interactions: { where: { visibleToClient: true }, orderBy: { createdAt: 'desc' }, take: 20 },
        offers: { orderBy: { createdAt: 'desc' } },
        assignee: { select: { name: true } },
        entity: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  // Detalle de solicitud (hilo sin mensajes internos).
  const requestId = str('solicitud');
  const selected = requestId ? requests.find((r) => r.id === requestId) : undefined;
  const thread = selected
    ? await prisma.requestMessage.findMany({ where: { requestId: selected.id, internal: false }, orderBy: { createdAt: 'asc' } })
    : [];
  const authorIds = [...new Set(thread.map((m) => m.byUserId))];
  const authors = authorIds.length ? await prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } }) : [];

  // Nueva solicitud y Modo Tranquilidad.
  const newKind = str('nueva') && REQUEST_KINDS[str('nueva')!] ? str('nueva')! : undefined;
  const dropPct = Math.min(100, Math.max(0, Number((str('caida') ?? '0').replace(',', '.')) || 0));
  const newExpense = Math.max(0, Number((str('gasto') ?? '0').replace(/[^\d]/g, '')) || 0);
  const payment = views.reduce((a, v) => a + (v.nextRow?.payment ?? v.schedule?.basePayment ?? 0), 0);
  const hasHousehold = person.monthlyIncome !== null && person.monthlyExpenses !== null;
  const stress =
    newKind === 'HARDSHIP' && hasHousehold
      ? simulateStress({
          monthlyIncome: toNumber(person.monthlyIncome),
          monthlyExpenses: toNumber(person.monthlyExpenses),
          payment,
          savings: toNumber(person.savings),
          incomeDropPct: dropPct / 100,
          newExpense,
        })
      : null;

  const loanOptions = views.map((v) => ({ id: v.loan.id, label: `${v.loan.alias}${v.loan.entity ? ` · ${v.loan.entity.name}` : ''}` }));

  return (
    <>
      <PageHeader title="Gestiones" subtitle="Pagos, solicitudes y casos en curso: qué pasa, quién responde y cuándo." />
      <nav className="ov-tabs" aria-label="Secciones de gestiones">
        <a href="#pago">Reportar pago</a>
        <a href="#solicitudes">Solicitudes</a>
        <a href="#nueva">Nueva solicitud</a>
        <a href="#casos">Mis casos</a>
      </nav>

      {/* (a) Registro temporal de pagos */}
      <div className="ov-grid">
        <article className="ov-card s7" id="pago">
          <h2>Reportar un pago</h2>
          {views.length ? (
            <PaymentForm action={reportPaymentAction} loans={loanOptions} defaultLoanId={str('credito')} channels={PAYMENT_CHANNELS} today={today} />
          ) : (
            <Empty>Para reportar pagos primero <Link href="/cliente/credito">registra tu crédito</Link>.</Empty>
          )}
        </article>
        <article className="ov-card s5" id="pagos">
          <h2>Mis pagos reportados</h2>
          <p className="ov-meta">Estados: reportado → en revisión → validado o rechazado (siempre con motivo) → conciliado. Tu crédito solo se actualiza con pagos validados.</p>
          {payments.length ? (
            <div className="ov-list" style={{ marginTop: 10 }}>
              {payments.map((p) => (
                <div className="ov-row" key={p.id}>
                  <div className="grow">
                    <strong>{p.kind === 'PREPAYMENT' ? `Abono (${p.applyMode === 'PAYMENT' ? 'reduce cuota' : 'reduce plazo'})` : 'Cuota'} · {money(p.amount)}</strong>
                    <small>{p.loan.alias} · pagado {fechaDia(p.paidOn)} · {p.channel}{p.reference ? ` · ref. ${p.reference}` : ''}</small>
                    {p.status === 'REJECTED' && <small className="ov-negative">Motivo: {p.rejectReason ?? 'sin motivo registrado'}</small>}
                    <small>Reportado {fechaHora(p.createdAt)}{p.reviewedAt ? ` · revisado ${fechaHora(p.reviewedAt)}` : ''}</small>
                  </div>
                  <Status tone={PAYMENT_STATUS[p.status].tone}>{PAYMENT_STATUS[p.status].label}</Status>
                </div>
              ))}
            </div>
          ) : (
            <Empty>Aún no has reportado pagos.</Empty>
          )}
          <p className="ov-meta" style={{ marginTop: 10 }}>{PAYMENT_WARNING}</p>
        </article>
      </div>

      {/* (b) Solicitudes */}
      <Section title="Mis solicitudes" />
      <div className="ov-grid" id="solicitudes">
        <article className="ov-card s5">
          {requests.length ? (
            <div className="ov-list">
              {requests.map((r) => {
                const sla = slaText(r.slaDueAt);
                const closed = CLOSED.includes(r.status);
                return (
                  <Link key={r.id} href={`/cliente/gestiones?solicitud=${r.id}#solicitudes`} className="ov-row" style={{ textDecoration: 'none', color: 'inherit' }} aria-current={r.id === selected?.id ? 'true' : undefined}>
                    <span className={closed ? 'ov-dot ov-dot--gray' : sla.tone === 'bad' ? 'ov-dot ov-dot--red' : 'ov-dot'} aria-hidden />
                    <div className="grow">
                      <strong>{r.code} · {r.subject}</strong>
                      <small>{REQUEST_KINDS[r.kind]?.label ?? r.kind} · creada {fechaDia(r.createdAt)}{closed ? '' : ` · respuesta antes de ${fechaHora(r.slaDueAt)}`}</small>
                    </div>
                    <Status tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</Status>
                  </Link>
                );
              })}
            </div>
          ) : (
            <Empty>No tienes solicitudes. Crea una abajo cuando la necesites.</Empty>
          )}
        </article>
        <article className="ov-card s7">
          {selected ? (
            <>
              <header>
                <h2>{selected.code} · {selected.subject}</h2>
                <Status tone={REQUEST_STATUS[selected.status].tone}>{REQUEST_STATUS[selected.status].label}</Status>
              </header>
              <dl className="ov-dl">
                <dt>Tipo</dt><dd>{REQUEST_KINDS[selected.kind]?.label ?? selected.kind}</dd>
                <dt>Creada</dt><dd>{fechaHora(selected.createdAt)}</dd>
                <dt>Compromiso de respuesta</dt>
                <dd>
                  {CLOSED.includes(selected.status)
                    ? 'Cerrada'
                    : `${fechaHora(selected.slaDueAt)} (${slaText(selected.slaDueAt).tone === 'bad' ? 'vencido: tu solicitud está priorizada' : `faltan ${slaText(selected.slaDueAt).text}`})`}
                </dd>
                {selected.resolution && (<><dt>Respuesta final</dt><dd>{selected.resolution}</dd></>)}
              </dl>
              <h3 style={{ fontSize: 16, margin: '16px 0 8px' }}>Conversación</h3>
              <ol className="cl-thread">
                <li className="mine"><small>Tú · {fechaHora(selected.createdAt)}</small><p>{selected.detail}</p></li>
                {thread.map((m) => (
                  <li key={m.id} className={m.byUserId === session.user.id ? 'mine' : undefined}>
                    <small>{m.byUserId === session.user.id ? 'Tú' : `${authors.find((a) => a.id === m.byUserId)?.name ?? 'Equipo OpenV'} · OpenV`} · {fechaHora(m.createdAt)}</small>
                    <p>{m.body}</p>
                  </li>
                ))}
              </ol>
              {!CLOSED.includes(selected.status) ? (
                <KeepForm action={replyRequestAction} resetOnSuccess className="ov-form" ariaLabel="Responder solicitud">
                  <input type="hidden" name="requestId" value={selected.id} />
                  <label className="ov-field">
                    <span>Tu mensaje</span>
                    <textarea name="body" required maxLength={4000} />
                  </label>
                  <Submit pendingText="Enviando…">Enviar</Submit>
                </KeepForm>
              ) : (
                <p className="ov-meta">Esta solicitud está cerrada. Si necesitas algo más, crea una nueva.</p>
              )}
            </>
          ) : (
            <Empty>Elige una solicitud para ver su detalle y conversar con el equipo.</Empty>
          )}
        </article>
      </div>

      <Section title="Nueva solicitud" />
      <article className="ov-card" id="nueva">
        <nav className="cl-simtabs" aria-label="Tipo de solicitud">
          {Object.entries(REQUEST_KINDS).map(([code, k]) => (
            <Link key={code} href={`/cliente/gestiones?nueva=${code}#nueva`} aria-current={newKind === code ? 'page' : undefined} className={newKind === code ? 'ov-btn ov-btn--small' : 'ov-btn ov-btn--secondary ov-btn--small'}>
              {code === 'HARDSHIP' ? 'Modo Tranquilidad: tengo dificultades para pagar' : k.label}
            </Link>
          ))}
        </nav>
        {!newKind && <p className="ov-meta">Elige qué necesitas. Cada tipo tiene un tiempo máximo de respuesta y queda con código para su seguimiento.</p>}

        {newKind === 'HARDSHIP' && (
          <div className="ov-card cl-warning" style={{ margin: '0 0 16px' }}>
            <h3 style={{ margin: '0 0 6px' }}>Modo Tranquilidad</h3>
            <p>Si tu ingreso bajó o apareció un gasto, lo mejor es actuar <strong>antes</strong> de atrasarte. Mira cómo queda tu presupuesto y envíanos tu caso: una persona del equipo te acompaña.</p>
            {!hasHousehold ? (
              <Notice>Para calcular tu escenario registra tus <Link href="/cliente/hogar#finanzas">ingresos y gastos</Link>. Igual puedes enviar la solicitud ahora.</Notice>
            ) : (
              <>
                <form method="get" action="/cliente/gestiones" className="ov-inline" aria-label="Recalcular escenario">
                  <input type="hidden" name="nueva" value="HARDSHIP" />
                  <label className="ov-field"><span>¿Cuánto bajó tu ingreso? (%)</span><input name="caida" inputMode="decimal" defaultValue={dropPct || ''} placeholder="0" /></label>
                  <label className="ov-field"><span>Gasto nuevo mensual ($)</span><input name="gasto" inputMode="numeric" defaultValue={newExpense || ''} placeholder="0" /></label>
                  <button type="submit" className="ov-btn ov-btn--secondary">Recalcular</button>
                </form>
                {stress && (
                  <div className="ov-sim-result">
                    <div className="ov-sim-grid">
                      {summarizeResults('STRESS', stress.results as unknown as Record<string, unknown>).slice(0, 6).map((l) => (
                        <div key={l.label}><small>{l.label}</small><strong>{l.value}</strong></div>
                      ))}
                    </div>
                    <h4 style={{ margin: '14px 0 4px' }}>Plan preventivo sugerido</h4>
                    <ul className="cl-plan">{stress.results.plan.map((p) => <li key={p}>{p}</li>)}</ul>
                    <p className="ov-meta" style={{ marginTop: 8 }}>
                      Cuota usada: {money(payment)} (estimada con tus créditos registrados) · Datos declarados por ti · Motor {stress.engineVersion}.
                    </p>
                    <ul className="ov-assumptions">{[...stress.assumptions, ...stress.warnings].map((a) => <li key={a}>{a}</li>)}</ul>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {newKind && (
          <KeepForm action={createRequestAction} resetOnSuccess className="ov-form ov-form--2" ariaLabel="Crear solicitud">
            <input type="hidden" name="kind" value={newKind} />
            {newKind === 'HARDSHIP' && (
              <>
                <input type="hidden" name="incomeDrop" value={String(dropPct)} />
                <input type="hidden" name="newExpense" value={String(newExpense)} />
              </>
            )}
            <label className="ov-field full">
              <span>Asunto</span>
              <input name="subject" required maxLength={200} defaultValue={newKind === 'HARDSHIP' ? 'Necesito acompañamiento para pagar mi crédito' : REQUEST_KINDS[newKind].label} />
            </label>
            <label className="ov-field full">
              <span>Cuéntanos qué necesitas</span>
              <textarea name="detail" required minLength={10} maxLength={4000} placeholder={newKind === 'HARDSHIP' ? 'Qué cambió, desde cuándo y qué te preocupa. No necesitas justificarte: queremos ayudarte a tiempo.' : 'Entre más detalle, más rápido te respondemos.'} />
            </label>
            <p className="ov-meta full">Tiempo máximo de respuesta: {REQUEST_KINDS[newKind].slaHours >= 48 ? `${Math.round(REQUEST_KINDS[newKind].slaHours / 24)} días` : `${REQUEST_KINDS[newKind].slaHours} horas`}. Te avisamos por correo y en la campana.</p>
            <div className="full"><Submit pendingText="Enviando…">Enviar solicitud</Submit></div>
          </KeepForm>
        )}
      </article>

      {/* (c) Casos de originación */}
      <Section title="Mis casos" />
      <div id="casos">
        {cases.length === 0 ? (
          <Empty>No tienes casos abiertos. Un caso se crea cuando inicias un crédito, una compra de cartera u otro trámite con un asesor o aliado.</Empty>
        ) : (
          <div className="ov-grid">
            {cases.map((c) => (
              <article className="ov-card s12" key={c.id}>
                <header>
                  <h2>{c.code} · {PRODUCTS[c.product] ?? c.product}</h2>
                  <Status tone={c.stage === 'WITHDRAWN' ? 'gray' : 'info'}>{STAGE_LABELS[c.stage]}</Status>
                </header>
                <StageSteps stage={c.stage} />
                <p>{STAGE_CLIENT_TEXT[c.stage]}</p>
                <dl className="ov-dl">
                  <dt>Responsable</dt><dd>{c.assignee?.name ?? 'Por asignar'}</dd>
                  {c.entity && (<><dt>Entidad</dt><dd>{c.entity.name}</dd></>)}
                  <dt>Siguiente paso</dt><dd>{c.nextAction ?? '—'}</dd>
                  {c.withdrawReason && (<><dt>Motivo de cierre</dt><dd>{c.withdrawReason}</dd></>)}
                </dl>
                <div className="ov-grid" style={{ marginTop: 14 }}>
                  <section className="s6">
                    <h3 style={{ fontSize: 16 }}>Línea de tiempo</h3>
                    <ol className="ov-timeline">
                      {[...c.stages].reverse().map((s) => (
                        <li key={s.id}>
                          <div>
                            <strong>{s.from ? `${STAGE_LABELS[s.from]} → ` : ''}{STAGE_LABELS[s.to]}</strong>
                            <div className="ov-meta">{fechaHora(s.createdAt)}</div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </section>
                  <section className="s6">
                    <h3 style={{ fontSize: 16 }}>Novedades del equipo</h3>
                    {c.interactions.length ? (
                      <ol className="ov-timeline">
                        {c.interactions.map((i) => (
                          <li key={i.id}><div><strong>{i.summary}</strong><div className="ov-meta">{fechaHora(i.createdAt)} · {i.channel}</div></div></li>
                        ))}
                      </ol>
                    ) : (
                      <p className="ov-meta">Sin novedades compartidas todavía.</p>
                    )}
                  </section>
                </div>
                {c.offers.length > 0 && (
                  <>
                    <h3 style={{ fontSize: 16, marginTop: 16 }}>Ofertas</h3>
                    <div className="ov-grid">
                      {c.offers.map((o) => {
                        const expired = o.validUntil ? o.validUntil.toISOString().slice(0, 10) < today : false;
                        const otherAccepted = c.offers.some((x) => x.id !== o.id && x.acceptedAt);
                        const results = (o.results ?? {}) as Record<string, unknown>;
                        const resultLines = typeof results.kind === 'string' ? summarizeResults(results.kind, (results.results ?? results) as Record<string, unknown>) : [];
                        return (
                          <article className="ov-card s6" key={o.id} style={{ background: 'var(--ov-mist)' }}>
                            <header>
                              <h3 style={{ margin: 0, fontSize: 16 }}>{o.entityName}</h3>
                              {o.acceptedAt ? <Status>Aceptada {fechaDia(o.acceptedAt)}</Status> : expired ? <Status tone="bad">Vencida</Status> : <Status tone="wait">Por decidir</Status>}
                            </header>
                            <dl className="cl-kv">
                              <div><dt>Tasa</dt><dd>{rateText(Number(o.rateEa))} EA{o.system === 'UVR' ? ' + UVR' : ''}</dd></div>
                              <div><dt>Monto</dt><dd>{money(o.amount)}</dd></div>
                              <div><dt>Plazo</dt><dd>{o.termMonths} meses</dd></div>
                              <div><dt>Seguros/mes</dt><dd>{money(o.monthlyInsurance)}</dd></div>
                              <div><dt>Costos iniciales</dt><dd>{money(o.upfrontCosts)}</dd></div>
                              <div><dt>Vigencia</dt><dd>{o.validUntil ? isoText(o.validUntil.toISOString().slice(0, 10)) : 'Sin fecha'}</dd></div>
                            </dl>
                            {resultLines.length > 0 && (
                              <dl className="cl-kv">{resultLines.slice(0, 4).map((l) => <div key={l.label}><dt>{l.label}</dt><dd>{l.value}</dd></div>)}</dl>
                            )}
                            {o.conditions && <p style={{ whiteSpace: 'pre-wrap' }}>{o.conditions}</p>}
                            <p className="ov-meta">Fuente: {o.source} · motor {o.engineVersion} · presentada {fechaDia(o.createdAt)}. La aprobación y las condiciones definitivas las fija la entidad.</p>
                            {!o.acceptedAt && !expired && !otherAccepted && c.stage !== 'WITHDRAWN' && (
                              <KeepForm action={acceptOfferAction} className="ov-form" ariaLabel={`Aceptar oferta de ${o.entityName}`}>
                                <input type="hidden" name="offerId" value={o.id} />
                                <label className="ov-check">
                                  <input type="checkbox" name="confirm" required />
                                  <span>Leí las condiciones, supuestos y advertencias, y acepto continuar con esta oferta. Entiendo que no es la firma del crédito.</span>
                                </label>
                                <Submit pendingText="Registrando…">Aceptar oferta</Submit>
                              </KeepForm>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
