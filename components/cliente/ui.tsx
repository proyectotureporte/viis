import Link from 'next/link';
import type { Stage } from '@/app/generated/prisma/enums';
import { Empty, Notice } from '@/components/ov/ui';
import { PIPELINE_STAGES, STAGE_LABELS } from '@/lib/labels';
import { pesos } from '@/lib/formato';

export type Tone = 'ok' | 'amber' | 'red' | 'gray';

/** Punto de semáforo con texto accesible (el color nunca es la única señal). */
export function Dot({ tone, label }: { tone: Tone; label: string }) {
  const cls = tone === 'ok' ? 'ov-dot' : `ov-dot ov-dot--${tone}`;
  return (
    <>
      <span className={cls} aria-hidden />
      <span className="cl-sr">{label}: </span>
    </>
  );
}

export function NoPerson() {
  return (
    <Notice tone="danger">
      Tu cuenta aún no tiene un expediente asociado, por eso no podemos mostrar tu información. Escríbenos a{' '}
      <strong>contacto@viis.app</strong> desde tu correo registrado y lo activamos.
    </Notice>
  );
}

/** Etapas del caso: hechas, actual y pendientes. */
export function StageSteps({ stage }: { stage: Stage }) {
  if (stage === 'WITHDRAWN') return <div className="ov-steps"><span className="now">{STAGE_LABELS.WITHDRAWN}</span></div>;
  const current = stage === 'POSTSALE' ? PIPELINE_STAGES.length : PIPELINE_STAGES.indexOf(stage);
  return (
    <ol className="ov-steps cl-steps" aria-label="Etapas del caso">
      {PIPELINE_STAGES.map((s, i) => (
        <li key={s}>
          <span className={i < current ? 'done' : i === current ? 'now' : undefined} aria-current={i === current ? 'step' : undefined}>
            {STAGE_LABELS[s]}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** "Mapa de cada peso": barra apilada accesible con leyenda. */
export function PesoMap({ parts, caption }: { parts: Array<{ label: string; value: number; color: string }>; caption?: string }) {
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0);
  if (total <= 0) return <Empty>Sin datos para desglosar.</Empty>;
  return (
    <figure className="cl-pesomap">
      <div className="ov-stack" role="img" aria-label={parts.map((p) => `${p.label} ${pesos(p.value)}`).join(', ')}>
        {parts.map((p) => (
          <span key={p.label} style={{ width: `${(Math.max(0, p.value) / total) * 100}%`, background: p.color }} />
        ))}
      </div>
      <ul className="cl-legend">
        {parts.map((p) => (
          <li key={p.label}>
            <i style={{ background: p.color }} aria-hidden />
            <span>{p.label}</span>
            <strong>{pesos(p.value)}</strong>
            <small>{((Math.max(0, p.value) / total) * 100).toFixed(0)} %</small>
          </li>
        ))}
      </ul>
      {caption && <figcaption className="ov-meta">{caption}</figcaption>}
    </figure>
  );
}

export const PESO_COLORS = { capital: '#18c6a3', interest: '#195f78', insurance: '#e5a43e', extra: '#7c5cc4' };

export function Step({ done, title, detail, href, cta }: { done: boolean; title: string; detail: string; href: string; cta: string }) {
  return (
    <li className={done ? 'cl-step cl-step--done' : 'cl-step'}>
      <span className="cl-step__mark" aria-hidden>{done ? '✓' : ''}</span>
      <div className="grow">
        <strong>{title}</strong>
        <small>{done ? 'Listo' : detail}</small>
      </div>
      <Link className={done ? 'ov-btn ov-btn--secondary ov-btn--small' : 'ov-btn ov-btn--small'} href={href}>
        {done ? 'Revisar' : cta}
      </Link>
    </li>
  );
}
