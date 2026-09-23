import type { Metadata } from 'next';
import Link from 'next/link';
import type { Property } from '@/app/generated/prisma/client';
import { KeepForm, Submit } from '@/components/cliente/Form';
import { NoPerson } from '@/components/cliente/ui';
import { Confidence, Empty, Kpi, Notice, PageHeader, Section, Status } from '@/components/ov/ui';
import { isoDay, isoText, todayBogota } from '@/lib/cliente/format';
import { clientPage } from '@/lib/cliente/page';
import { lastValuations } from '@/lib/cliente/twin';
import { DOC_STATUS, fechaDia, money, pct, toNumber } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { declareValueAction, requestAppraisalAction, savePropertyAction } from './actions';
import { PROPERTY_KINDS } from './kinds';

export const metadata: Metadata = { title: 'Mi vivienda' };

const HOME_DOCS = ['CTL', 'AVALUO', 'POLIZA'];

function PropertyForm({ property }: { property?: Property }) {
  return (
    <KeepForm action={savePropertyAction} className="ov-form ov-form--3" resetOnSuccess={!property}>
      {property && <input type="hidden" name="id" value={property.id} />}
      <label className="ov-field">
        <span>Nombre</span>
        <input name="alias" required maxLength={80} defaultValue={property?.alias ?? ''} placeholder="Apartamento Chapinero" />
      </label>
      <label className="ov-field">
        <span>Tipo</span>
        <select name="kind" defaultValue={property?.kind ?? 'APARTAMENTO'}>
          {Object.entries(PROPERTY_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className="ov-field">
        <span>Ciudad</span>
        <input name="city" maxLength={120} defaultValue={property?.city ?? ''} />
      </label>
      <label className="ov-field">
        <span>Dirección (opcional)</span>
        <input name="address" maxLength={240} defaultValue={property?.address ?? ''} autoComplete="street-address" />
      </label>
      <label className="ov-field">
        <span>Estrato</span>
        <input name="stratum" type="number" min={1} max={6} defaultValue={property?.stratum ?? ''} />
      </label>
      <label className="ov-field">
        <span>Área (m²)</span>
        <input name="areaM2" inputMode="decimal" defaultValue={property?.areaM2?.toString().replace('.', ',') ?? ''} placeholder="68" />
      </label>
      <label className="ov-check full">
        <input type="checkbox" name="isVis" defaultChecked={property?.isVis ?? false} />
        <span>Es vivienda de interés social (VIS)</span>
      </label>
      <div className="full"><Submit pendingText="Guardando…">{property ? 'Guardar cambios' : 'Registrar inmueble'}</Submit></div>
    </KeepForm>
  );
}

export default async function ViviendaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { person } = await clientPage();
  if (!person) {
    return (
      <>
        <PageHeader title="Mi vivienda" />
        <NoPerson />
      </>
    );
  }
  const params = await searchParams;
  const prisma = getPrisma();
  const today = todayBogota();
  const [properties, loans, homeDocs, appraisals] = await Promise.all([
    prisma.property.findMany({ where: { personId: person.id }, include: { valuations: { orderBy: { asOf: 'asc' } } }, orderBy: { createdAt: 'asc' } }),
    prisma.loan.findMany({ where: { personId: person.id, active: true }, include: { history: { orderBy: { createdAt: 'asc' } } } }),
    prisma.document.findMany({ where: { personId: person.id, type: { code: { in: HOME_DOCS } } }, include: { type: true }, orderBy: [{ createdAt: 'desc' }] }),
    prisma.serviceRequest.findMany({ where: { personId: person.id, subject: { startsWith: 'Avalúo comercial formal' } }, orderBy: { createdAt: 'desc' }, take: 3 }),
  ]);

  if (!properties.length) {
    return (
      <>
        <PageHeader title="Mi vivienda" subtitle="¿Cuánto vale, qué patrimonio tengo y cómo la protejo?" />
        <article className="ov-card">
          <h2>Registra tu inmueble</h2>
          <p className="ov-meta">Con la ficha y un valor estimado calculamos tu patrimonio y la relación entre lo que debes y lo que vale tu vivienda.</p>
          <PropertyForm />
        </article>
      </>
    );
  }

  const selectedId = typeof params.id === 'string' ? params.id : undefined;
  const property = properties.find((p) => p.id === selectedId) ?? properties[0];
  const { latest } = lastValuations(property.valuations);
  const linkedLoans = loans.filter((l) => l.propertyId === property.id);
  const debtLoans = linkedLoans.length ? linkedLoans : properties.length === 1 ? loans.filter((l) => !l.propertyId) : [];
  const debt = debtLoans.reduce((a, l) => a + toNumber(l.balance), 0);
  const value = latest ? toNumber(latest.value) : null;
  const ltv = value && value > 0 ? debt / value : null;

  // Patrimonio en el tiempo: en cada valoración, valor − saldo vigente a esa fecha (según el historial del crédito).
  const balanceAt = (loan: (typeof loans)[number], date: string): number => {
    const snaps = loan.history
      .map((s) => s.data as Record<string, unknown>)
      .filter((d) => typeof d.balanceAsOf === 'string' && (d.balanceAsOf as string) <= date && typeof d.balance === 'string');
    if (snaps.length) return Number(snaps[snaps.length - 1].balance);
    return toNumber(loan.balance);
  };
  const series = property.valuations.map((v) => {
    const date = isoDay(v.asOf);
    const debtAt = debtLoans.reduce((a, l) => a + balanceAt(l, date), 0);
    return { date, value: toNumber(v.value), net: toNumber(v.value) - debtAt, confidence: v.confidence };
  });
  const maxSeries = Math.max(1, ...series.map((s) => Math.abs(s.net)));

  return (
    <>
      <PageHeader title="Mi vivienda" subtitle="¿Cuánto vale, qué patrimonio tengo y cómo la protejo?" />
      {properties.length > 1 && (
        <nav className="ov-tabs" aria-label="Mis inmuebles">
          {properties.map((p) => (
            <Link key={p.id} href={`/cliente/vivienda?id=${p.id}`} aria-current={p.id === property.id ? 'page' : undefined}>{p.alias}</Link>
          ))}
        </nav>
      )}

      <div className="ov-grid">
        <Kpi
          label="Valor estimado"
          value={value !== null ? money(value, true) : '—'}
          sub={latest ? <Confidence level={latest.confidence} source={latest.source} asOf={fechaDia(latest.asOf)} /> : 'Registra un valor'}
        />
        <Kpi label="Deuda asociada" value={money(debt, true)} sub={debtLoans.length ? debtLoans.map((l) => l.alias).join(', ') : 'Sin crédito asociado'} />
        <Kpi label="Patrimonio en este inmueble" value={value !== null ? money(value - debt, true) : '—'} sub="Valor − deuda" tone={value !== null && value - debt < 0 ? 'negative' : undefined} />
        <Kpi label="Deuda / valor" value={ltv !== null ? pct(ltv) : '—'} sub={ltv === null ? 'Falta el valor' : ltv <= 0.7 ? 'Holgada: más opciones de traslado o refinanciación' : ltv <= 0.8 ? 'Moderada' : 'Alta: pocas entidades financian por encima del 80 %'} />
      </div>
      <p className="ov-meta" style={{ marginTop: 8 }}>
        El valor de tu vivienda aquí es una <strong>estimación</strong> ({latest ? 'con la fuente y fecha indicadas' : 'aún sin registrar'}): no es un avalúo comercial ni un valor oficial. Para trámites con bancos se requiere un avalúo de un perito inscrito en el RAA.
      </p>

      <div className="ov-grid" style={{ marginTop: 16 }}>
        <article className="ov-card s7">
          <h2>Patrimonio en el tiempo</h2>
          {series.length ? (
            <>
              <div className="cl-bars" role="img" aria-label={series.map((s) => `${isoText(s.date)}: ${money(s.net)}`).join('; ')}>
                {series.slice(-10).map((s) => (
                  <div key={s.date}>
                    <i className={s.net < 0 ? 'neg' : undefined} style={{ height: `${Math.max(3, (Math.abs(s.net) / maxSeries) * 100)}%` }} />
                    <small>{isoText(s.date).split(' ').slice(1).join(' ')}</small>
                  </div>
                ))}
              </div>
              <p className="ov-meta">Cada barra: valor registrado en esa fecha menos el saldo del crédito según su historial (si no hay historial a esa fecha, se usa el saldo actual).</p>
            </>
          ) : (
            <Empty>Registra valores con su fecha para ver cómo evoluciona tu patrimonio.</Empty>
          )}
        </article>
        <article className="ov-card s5" id="valor">
          <h2>Registrar valor estimado</h2>
          <KeepForm action={declareValueAction} className="ov-form ov-form--2" resetOnSuccess>
            <input type="hidden" name="propertyId" value={property.id} />
            <label className="ov-field full">
              <span>Valor que estimas ($)</span>
              <input name="value" required inputMode="numeric" placeholder="350.000.000" />
            </label>
            <label className="ov-field">
              <span>Mínimo del rango (opcional)</span>
              <input name="low" inputMode="numeric" />
            </label>
            <label className="ov-field">
              <span>Máximo del rango (opcional)</span>
              <input name="high" inputMode="numeric" />
            </label>
            <label className="ov-field">
              <span>¿En qué te basas?</span>
              <select name="basis" required defaultValue="">
                <option value="" disabled>Elige</option>
                <option value="OFERTAS_ZONA">Ofertas similares en la zona</option>
                <option value="AVALUO_PREVIO">Un avalúo anterior</option>
                <option value="CATASTRAL">Avalúo catastral (predial)</option>
                <option value="PERCEPCION">Mi percepción</option>
                <option value="OTRO">Otra referencia</option>
              </select>
            </label>
            <label className="ov-field">
              <span>Fecha del valor</span>
              <input name="asOf" type="date" required max={today} defaultValue={today} />
            </label>
            <label className="ov-field full">
              <span>Nota (opcional)</span>
              <input name="note" maxLength={400} />
            </label>
            <p className="ov-meta full">Quedará como <strong>declarado por ti</strong>. No reemplaza un avalúo.</p>
            <div className="full"><Submit pendingText="Guardando…">Registrar valor</Submit></div>
          </KeepForm>
        </article>
      </div>

      <Section title="Historial de valoraciones" />
      <article className="ov-card">
        {property.valuations.length ? (
          <div className="ov-tablewrap">
            <table className="ov-table">
              <thead>
                <tr><th scope="col">Fecha</th><th scope="col" className="num">Valor</th><th scope="col" className="num">Rango</th><th scope="col">Confianza y fuente</th><th scope="col">Metodología</th></tr>
              </thead>
              <tbody>
                {[...property.valuations].reverse().map((v) => (
                  <tr key={v.id}>
                    <td>{fechaDia(v.asOf)}</td>
                    <td className="num">{money(v.value)}</td>
                    <td className="num">{v.low !== null && v.high !== null ? `${money(v.low, true)} – ${money(v.high, true)}` : '—'}</td>
                    <td><Confidence level={v.confidence} source={v.source} /></td>
                    <td>{v.methodology ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Sin valoraciones registradas.</Empty>
        )}
      </article>

      <div className="ov-grid" style={{ marginTop: 16 }}>
        <article className="ov-card s6" id="avaluo">
          <h2>Avalúo comercial formal</h2>
          <p>Un avalúo lo hace un perito inscrito en el Registro Abierto de Avaluadores (RAA). Lo piden los bancos para créditos, compras de cartera y algunos cambios de condiciones. Tiene costo: un asesor te explica cuánto y cómo antes de agendarlo.</p>
          {appraisals.length > 0 && (
            <div className="ov-list" style={{ margin: '10px 0' }}>
              {appraisals.map((a) => (
                <div className="ov-row" key={a.id}>
                  <div className="grow"><strong>{a.code}</strong><small>Solicitado {fechaDia(a.createdAt)}</small></div>
                  <Link href={`/cliente/gestiones?solicitud=${a.id}#solicitudes`}>Ver</Link>
                </div>
              ))}
            </div>
          )}
          <KeepForm action={requestAppraisalAction} resetOnSuccess>
            <input type="hidden" name="propertyId" value={property.id} />
            <label className="ov-field">
              <span>Comentario (opcional)</span>
              <textarea name="detail" maxLength={1000} placeholder="Por ejemplo: lo necesito para una compra de cartera." />
            </label>
            <Submit pendingText="Enviando…">Solicitar avalúo formal</Submit>
          </KeepForm>
        </article>
        <article className="ov-card s6">
          <header><h2>Bitácora de vivienda</h2><Link href="/cliente/documentos#subir">Subir documento</Link></header>
          <p className="ov-meta">Certificado de tradición y libertad, avalúos y pólizas: la memoria patrimonial de tu hogar.</p>
          {homeDocs.length ? (
            <div className="ov-list" style={{ marginTop: 10 }}>
              {homeDocs.map((d) => (
                <div className="ov-row" key={d.id}>
                  <div className="grow">
                    <strong>{d.type.name} · v{d.version}</strong>
                    <small>{d.fileName} · cargado {fechaDia(d.createdAt)}{d.expiresAt ? ` · vence ${fechaDia(d.expiresAt)}` : ''}</small>
                  </div>
                  <Status tone={DOC_STATUS[d.status].tone}>{DOC_STATUS[d.status].label}</Status>
                  {d.status !== 'QUARANTINED' && d.scanResult === 'CLEAN' && (
                    <a className="ov-btn ov-btn--secondary ov-btn--small" href={`/cliente/documentos/ver/${d.id}`} target="_blank" rel="noopener">Ver</a>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <Empty>Aún no has cargado documentos de tu vivienda.</Empty>
          )}
        </article>
      </div>

      <Section title="Ficha del inmueble" />
      <article className="ov-card">
        <PropertyForm property={property} />
      </article>
      <details className="ov-card ov-details" style={{ marginTop: 16 }}>
        <summary>Registrar otro inmueble</summary>
        <PropertyForm />
      </details>
      {!linkedLoans.length && loans.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Notice tone="info">Ningún crédito está asociado a este inmueble. Asócialo en <Link href="/cliente/credito#editar">Mi crédito</Link> para calcular bien tu patrimonio.</Notice>
        </div>
      )}
    </>
  );
}
