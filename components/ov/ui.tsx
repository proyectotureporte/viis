import { CONFIDENCE_LABELS } from '@/lib/labels';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <header className="ov-top">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="ov-top__actions">{actions}</div>}
    </header>
  );
}

export function Kpi({ label, value, sub, tone, span = 's3', children }: { label: string; value: string; sub?: React.ReactNode; tone?: 'positive' | 'negative'; span?: string; children?: React.ReactNode }) {
  return (
    <article className={`ov-card ${span}`}>
      <div className="ov-eyebrow">{label}</div>
      <div className="ov-big">{value}</div>
      {sub && <div className={tone ? `ov-${tone}` : 'ov-sub'}>{sub}</div>}
      {children}
    </article>
  );
}

export function Status({ tone = 'ok', children }: { tone?: string; children: React.ReactNode }) {
  const cls = tone === 'ok' ? 'ov-status' : `ov-status ov-status--${tone}`;
  return <span className={cls}>{children}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="ov-empty">{children}</div>;
}

export function Section({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="ov-section">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

/** Etiqueta de nivel de confianza: ningún dato material aparece sin fuente ni certeza. */
export function Confidence({ level, source, asOf }: { level: string; source?: string | null; asOf?: string }) {
  return (
    <span className="ov-meta">
      <span className={`ov-conf ov-conf--${level}`}>{CONFIDENCE_LABELS[level] ?? level}</span>
      {source ? ` · ${source}` : ''}
      {asOf ? ` · ${asOf}` : ''}
    </span>
  );
}

export function Notice({ tone, children }: { tone?: 'info' | 'danger'; children: React.ReactNode }) {
  return <div className={tone ? `ov-notice ov-notice--${tone}` : 'ov-notice'} role={tone === 'danger' ? 'alert' : undefined}>{children}</div>;
}
