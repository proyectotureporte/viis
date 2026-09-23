import type { Metadata } from 'next';
import Link from 'next/link';
import { KeepForm, Submit } from '@/components/cliente/Form';
import { NoPerson } from '@/components/cliente/ui';
import { Empty, PageHeader, Section, Status } from '@/components/ov/ui';
import { isoDay, todayBogota } from '@/lib/cliente/format';
import { clientPage } from '@/lib/cliente/page';
import { latestReferenceRate } from '@/lib/cliente/server';
import { describeParams, NOT_BINDING, SIM_KINDS, SIM_META, summarizeResults, type SimKind } from '@/lib/cliente/simulate';
import { loadLoanViews } from '@/lib/cliente/twin';
import { fechaHora, toNumber } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { duplicateScenarioAction, renameScenarioAction, saveScenarioAction, shareScenarioAction } from './actions';
import { Simulador, type SimContext } from './Simulador';

export const metadata: Metadata = { title: 'Decidir' };

type Row = { label: string; value: string };

export default async function DecidirPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { session, person } = await clientPage();
  if (!person) {
    return (
      <>
        <PageHeader title="Decidir" />
        <NoPerson />
      </>
    );
  }
  const params = await searchParams;
  const str = (k: string) => (typeof params[k] === 'string' ? (params[k] as string) : undefined);
  const prisma = getPrisma();
  const today = todayBogota();
  const [{ views, params: uvrParams }, scenarios, home] = await Promise.all([
    loadLoanViews(person.id, today),
    prisma.scenario.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: 'desc' }, take: 60 }),
    prisma.propertyValuation.findFirst({ where: { property: { personId: person.id } }, orderBy: [{ asOf: 'desc' }, { createdAt: 'desc' }] }),
  ]);
  const refRate = await latestReferenceRate(views[0]?.loan.system ?? 'FIXED_PESOS', today);

  const ctx: SimContext = {
    loans: views.map((v) => ({
      id: v.loan.id,
      alias: v.loan.alias,
      state: v.state,
      notices: v.notices,
      payment: v.nextRow?.payment ?? v.schedule?.basePayment ?? null,
    })),
    household: {
      income: person.monthlyIncome !== null ? toNumber(person.monthlyIncome) : null,
      expenses: person.monthlyExpenses !== null ? toNumber(person.monthlyExpenses) : null,
      savings: person.savings !== null ? toNumber(person.savings) : null,
    },
    refRate: refRate ? { rateEa: refRate.rateEa, source: refRate.source, asOf: refRate.asOf } : null,
    inflation: uvrParams.inflation,
    home: home ? { value: toNumber(home.value), source: home.source, asOf: isoDay(home.asOf), confidence: home.confidence } : null,
    today,
  };
  const sim = str('sim');
  const initialKind: SimKind = sim && (SIM_KINDS as readonly string[]).includes(sim) ? (sim as SimKind) : 'PREPAYMENT';

  // Comparación lado a lado.
  const a = scenarios.find((s) => s.id === str('a'));
  const b = scenarios.find((s) => s.id === str('b'));
  const linesOf = (s: (typeof scenarios)[number]): { results: Row[]; inputs: Row[] } => {
    const inputs = (s.inputs ?? {}) as { params?: Record<string, unknown> };
    return {
      results: summarizeResults(s.kind, (s.results ?? {}) as Record<string, unknown>),
      inputs: describeParams(s.kind, inputs.params ?? {}),
    };
  };
  const compare = a && b ? { a: linesOf(a), b: linesOf(b) } : null;
  const labels = (key: 'results' | 'inputs') => (compare ? [...new Set([...compare.a[key], ...compare.b[key]].map((l) => l.label))] : []);
  const valueOf = (rows: Row[], label: string) => rows.find((r) => r.label === label)?.value ?? '—';

  return (
    <>
      <PageHeader title="Decidir" subtitle="¿Qué pasa si abono, cambio el plazo, compro cartera o refinancio? Números antes de decidir." />
      <p className="ov-notice" role="note" style={{ marginBottom: 16 }}>{NOT_BINDING}</p>
      <Simulador ctx={ctx} initialKind={initialKind} saveAction={saveScenarioAction} />

      <Section title="Mis escenarios guardados">
        <span className="ov-meta">Se conservan para trazabilidad: cada uno guarda sus datos, supuestos y la versión del motor.</span>
      </Section>
      {scenarios.length === 0 ? (
        <Empty>Aún no guardas escenarios. Simula arriba y usa “Guardar escenario”.</Empty>
      ) : (
        <>
          <article className="ov-card" id="comparar">
            <form method="get" action="/cliente/decidir#comparar" className="ov-inline" aria-label="Comparar escenarios">
              <label className="ov-field">
                <span>Escenario A</span>
                <select name="a" defaultValue={a?.id ?? ''} required>
                  <option value="" disabled>Elige</option>
                  {scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="ov-field">
                <span>Escenario B</span>
                <select name="b" defaultValue={b?.id ?? ''} required>
                  <option value="" disabled>Elige</option>
                  {scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <button type="submit" className="ov-btn ov-btn--secondary">Comparar</button>
            </form>
            {compare && a && b && (
              <div className="ov-tablewrap" style={{ marginTop: 14 }}>
                <table className="ov-table cl-compare">
                  <caption className="cl-sr">Comparación de escenarios</caption>
                  <thead>
                    <tr><th scope="col">Concepto</th><th scope="col">{a.name}</th><th scope="col">{b.name}</th></tr>
                  </thead>
                  <tbody>
                    <tr><th scope="row">Tipo</th><td>{SIM_META[a.kind as SimKind]?.label ?? a.kind}</td><td>{SIM_META[b.kind as SimKind]?.label ?? b.kind}</td></tr>
                    {labels('results').map((l) => <tr key={`r-${l}`}><th scope="row">{l}</th><td>{valueOf(compare.a.results, l)}</td><td>{valueOf(compare.b.results, l)}</td></tr>)}
                    {labels('inputs').map((l) => <tr key={`i-${l}`}><th scope="row">{l} (dato)</th><td>{valueOf(compare.a.inputs, l)}</td><td>{valueOf(compare.b.inputs, l)}</td></tr>)}
                    <tr><th scope="row">Guardado</th><td>{fechaHora(a.createdAt)}</td><td>{fechaHora(b.createdAt)}</td></tr>
                    <tr><th scope="row">Motor</th><td>{a.engineVersion}</td><td>{b.engineVersion}</td></tr>
                  </tbody>
                </table>
              </div>
            )}
          </article>

          <div className="ov-list" style={{ marginTop: 12 }}>
            {scenarios.map((s) => {
              const results = summarizeResults(s.kind, (s.results ?? {}) as Record<string, unknown>).slice(0, 3);
              return (
                <article className="ov-card" key={s.id}>
                  <header>
                    <h2 style={{ fontSize: 16 }}>{s.name}</h2>
                    <span>
                      <span className="ov-pill">{SIM_META[s.kind as SimKind]?.label ?? s.kind}</span>{' '}
                      {s.sharedWithAdvisor && <Status tone="info">Compartido con asesor</Status>}
                    </span>
                  </header>
                  <dl className="cl-kv">
                    {results.map((l) => <div key={l.label}><dt>{l.label}</dt><dd>{l.value}</dd></div>)}
                  </dl>
                  <p className="ov-meta" style={{ marginTop: 8 }}>
                    Guardado {fechaHora(s.createdAt)} · motor {s.engineVersion} · huella <span className="ov-mono">{s.inputsHash.slice(0, 12)}…</span>
                  </p>
                  <div className="ov-actions">
                    <a className="ov-btn ov-btn--small" href={`/api/escenarios/${s.id}/pdf`} target="_blank" rel="noopener">Descargar PDF</a>
                    <Link className="ov-btn ov-btn--secondary ov-btn--small" href={`/cliente/decidir?a=${s.id}${a && a.id !== s.id ? `&b=${a.id}` : ''}#comparar`}>Comparar</Link>
                    <KeepForm action={duplicateScenarioAction} className="ov-inline">
                      <input type="hidden" name="id" value={s.id} />
                      <Submit className="ov-btn ov-btn--secondary ov-btn--small" pendingText="Duplicando…">Duplicar</Submit>
                    </KeepForm>
                  </div>
                  <details className="ov-details" style={{ marginTop: 10 }}>
                    <summary>Renombrar o compartir con un asesor</summary>
                    <div className="ov-grid">
                      <div className="s6">
                        <KeepForm action={renameScenarioAction} className="ov-form ov-inline">
                          <input type="hidden" name="id" value={s.id} />
                          <label className="ov-field"><span>Nuevo nombre</span><input name="name" required maxLength={120} defaultValue={s.name} /></label>
                          <Submit className="ov-btn ov-btn--secondary ov-btn--small">Guardar</Submit>
                        </KeepForm>
                      </div>
                      <div className="s6">
                        <KeepForm action={shareScenarioAction} className="ov-form" resetOnSuccess>
                          <input type="hidden" name="id" value={s.id} />
                          <label className="ov-field"><span>Comentario para el asesor (opcional)</span><input name="note" maxLength={1000} /></label>
                          <Submit className="ov-btn ov-btn--small" pendingText="Enviando…">Compartir con asesor</Submit>
                        </KeepForm>
                      </div>
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
