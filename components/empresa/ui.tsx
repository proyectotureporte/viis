import Link from 'next/link';
import { pct } from '@/lib/labels';

/** Paginación por número de página conservando los filtros actuales. */
export function Pager({ page, pageSize, total, href }: { page: number; pageSize: number; total: number; href: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className="ove-pager" aria-label="Paginación">
      <span className="ov-meta">{from}–{to} de {total.toLocaleString('es-CO')}</span>
      <div>
        {page > 1 ? <Link className="ov-btn ov-btn--secondary ov-btn--small" href={href(page - 1)}>← Anterior</Link> : <span className="ov-btn ov-btn--secondary ov-btn--small" aria-disabled="true">← Anterior</span>}
        <span className="ov-meta">Página {page} de {pages}</span>
        {page < pages ? <Link className="ov-btn ov-btn--secondary ov-btn--small" href={href(page + 1)}>Siguiente →</Link> : <span className="ov-btn ov-btn--secondary ov-btn--small" aria-disabled="true">Siguiente →</span>}
      </div>
    </nav>
  );
}

/** Embudo horizontal (clase ov-funnel). `value` relativo al máximo. */
export function Funnel({ rows, format = (n) => n.toLocaleString('es-CO') }: { rows: Array<{ label: string; value: number; hint?: string }>; format?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="ov-funnel" role="list">
      {rows.map((r) => (
        <div key={r.label} role="listitem" title={r.hint}>
          <span>{r.label}</span>
          <b style={{ width: `${Math.max(1, (r.value / max) * 100)}%` }} aria-hidden />
          <strong className="num">{format(r.value)}</strong>
        </div>
      ))}
    </div>
  );
}

/** Barras verticales (clase ov-chart) con etiquetas y tabla accesible oculta. */
export function Bars({ rows, format = (n) => n.toLocaleString('es-CO'), caption }: { rows: Array<{ label: string; value: number }>; format?: (n: number) => string; caption: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <figure className="ove-bars">
      <div className="ov-chart" aria-hidden>
        {rows.map((r) => (
          <i key={r.label} style={{ height: `${Math.max(2, (r.value / max) * 100)}%` }} title={`${r.label}: ${format(r.value)}`} />
        ))}
      </div>
      <div className="ove-bars__labels" aria-hidden>
        {rows.map((r) => <span key={r.label}>{r.label}</span>)}
      </div>
      <table className="ove-sr">
        <caption>{caption}</caption>
        <tbody>{rows.map((r) => <tr key={r.label}><th>{r.label}</th><td>{format(r.value)}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

const STACK_COLORS = ['#18c6a3', '#195f78', '#e5a43e', '#9aacb3', '#b73c3c', '#6c8ef5', '#47d2bd'];

/** Barra apilada (ov-stack) con leyenda. */
export function Stack({ rows }: { rows: Array<{ label: string; value: number }> }) {
  const total = rows.reduce((a, r) => a + r.value, 0);
  if (!total) return <p className="ov-meta">Sin datos en el periodo.</p>;
  return (
    <div>
      <div className="ov-stack" role="img" aria-label={rows.map((r) => `${r.label} ${pct(r.value / total)}`).join(', ')}>
        {rows.map((r, i) => <span key={r.label} style={{ width: `${(r.value / total) * 100}%`, background: STACK_COLORS[i % STACK_COLORS.length] }} />)}
      </div>
      <div className="ov-legend">
        {rows.map((r, i) => <span key={r.label}><i style={{ background: STACK_COLORS[i % STACK_COLORS.length] }} />{r.label} · {r.value.toLocaleString('es-CO')} ({pct(r.value / total)})</span>)}
      </div>
    </div>
  );
}

/** JSON legible (bitácora, resultados del motor). */
export function JsonBlock({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="ov-meta">—</span>;
  return <pre className="ove-json">{JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)}</pre>;
}

/** Filtro de rango de fechas por GET (conserva otros parámetros como ocultos). */
export function DateRangeForm({ from, to, keep = {}, children }: { from: string; to: string; keep?: Record<string, string>; children?: React.ReactNode }) {
  return (
    <form className="ov-filters" method="get">
      {Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <label className="ov-field"><span>Desde</span><input type="date" name="desde" defaultValue={from} /></label>
      <label className="ov-field"><span>Hasta</span><input type="date" name="hasta" defaultValue={to} /></label>
      {children}
      <button className="ov-btn ov-btn--secondary" type="submit">Aplicar</button>
    </form>
  );
}

/** Rótulo de tono para porcentajes contra una meta. */
export function ratioTone(value: number, goal: number): 'positive' | 'negative' {
  return value >= goal ? 'positive' : 'negative';
}
