import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/ov/forms';
import { Empty, PageHeader, Status } from '@/components/ov/ui';
import { spEnum, todayBogota, type SearchParams } from '@/lib/empresa/params';
import { fechaDia, fechaHora, PRODUCTS } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { requireUser } from '@/lib/security/session';
import {
  createDocTypeAction,
  createEntityAction,
  createParameterAction,
  createRateAction,
  updateCourseAction,
  updateCourseContentAction,
  updateDocTypeAction,
  updateEntityAction,
} from './actions';
import { CATALOG_TABS, DOC_PRODUCTS } from './constants';

export const metadata: Metadata = { title: 'Entidades y reglas' };

const TAB_KEYS = CATALOG_TABS.map((t) => t.key);
const SYSTEM_LABELS: Record<string, string> = { FIXED_PESOS: 'Pesos (cuota fija)', UVR: 'UVR' };

function pctRate(value: { toString(): string }): string {
  return `${(Number(value.toString()) * 100).toLocaleString('es-CO', { maximumFractionDigits: 4 })} %`;
}

export default async function CatalogosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireUser({ portal: 'empresa', permission: 'catalog.manage' });
  const params = await searchParams;
  const tab = spEnum(params, 'tab', TAB_KEYS) || 'entidades';

  return (
    <>
      <PageHeader title="Entidades y reglas" subtitle="Catálogos que alimentan el motor financiero, el checklist documental, el semáforo del cliente y la academia." />
      <nav className="ov-tabs" aria-label="Catálogos">
        {CATALOG_TABS.map((t) => (
          <Link key={t.key} href={`/empresa/catalogos?tab=${t.key}`} aria-current={t.key === tab ? 'page' : undefined}>{t.label}</Link>
        ))}
      </nav>
      {tab === 'entidades' && <Entidades />}
      {tab === 'tasas' && <Tasas />}
      {tab === 'parametros' && <Parametros />}
      {tab === 'documentos' && <TiposDocumentales />}
      {tab === 'cursos' && <Cursos />}
    </>
  );
}

async function Entidades() {
  const entities = await getPrisma().entity.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }], include: { _count: { select: { opportunities: true, loans: true } } } });
  return (
    <div className="ov-grid">
      <article className="ov-card s12">
        <h2>Nueva entidad financiera</h2>
        <ActionForm action={createEntityAction} className="ov-form ov-form--3" resetOnSuccess>
          <label className="ov-field"><span>Nombre</span><input name="name" required maxLength={120} /></label>
          <label className="ov-field"><span>SLA de respuesta (horas)</span><input name="slaHours" type="number" min={1} max={2000} defaultValue={72} required /></label>
          <label className="ov-check" style={{ alignSelf: 'end' }}><input type="checkbox" name="agreement" /><span>Tenemos convenio vigente</span></label>
          <label className="ov-field full"><span>Notas (políticas, contactos, requisitos)</span><textarea name="notes" maxLength={2000} /></label>
          <div className="full"><SubmitButton>Crear entidad</SubmitButton></div>
        </ActionForm>
      </article>
      <article className="ov-card s12">
        <h2>Entidades ({entities.length})</h2>
        {entities.length === 0 ? <Empty>Aún no hay entidades. Crea la primera arriba.</Empty> : (
          <div className="ove-stack-list">
            {entities.map((e) => (
              <details key={e.id} className="ove-details">
                <summary>
                  {e.name} {e.active ? <Status>Activa</Status> : <Status tone="gray">Inactiva</Status>} {e.agreement && <Status tone="info">Convenio</Status>}{' '}
                  <span className="ov-meta">· SLA {e.slaHours} h · {e._count.opportunities} casos · {e._count.loans} créditos</span>
                </summary>
                <ActionForm action={updateEntityAction} className="ov-form ov-form--3">
                  <input type="hidden" name="id" value={e.id} />
                  <label className="ov-field"><span>SLA de respuesta (horas)</span><input name="slaHours" type="number" min={1} max={2000} defaultValue={e.slaHours} required /></label>
                  <label className="ov-check" style={{ alignSelf: 'end' }}><input type="checkbox" name="active" defaultChecked={e.active} /><span>Activa (se puede asignar a casos)</span></label>
                  <label className="ov-check" style={{ alignSelf: 'end' }}><input type="checkbox" name="agreement" defaultChecked={e.agreement} /><span>Convenio vigente</span></label>
                  <label className="ov-field full"><span>Notas</span><textarea name="notes" maxLength={2000} defaultValue={e.notes ?? ''} /></label>
                  <div className="full"><SubmitButton className="ov-btn ov-btn--secondary">Guardar cambios</SubmitButton> <span className="ov-meta">Actualizada {fechaHora(e.updatedAt)}</span></div>
                </ActionForm>
              </details>
            ))}
          </div>
        )}
      </article>
    </div>
  );
}

async function Tasas() {
  const prisma = getPrisma();
  const today = new Date(`${todayBogota()}T00:00:00Z`);
  const [entities, rates] = await Promise.all([
    prisma.entity.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.referenceRate.findMany({ orderBy: [{ asOf: 'desc' }, { createdAt: 'desc' }], take: 100, include: { entity: { select: { name: true } } } }),
  ]);
  return (
    <div className="ov-grid">
      <article className="ov-card s12">
        <h2>Registrar tasa de referencia</h2>
        <p className="ov-meta">Estas tasas alimentan el semáforo de oportunidad del cliente y la próxima mejor acción. No se editan: si cambia una tasa, registra una nueva con su fecha y fuente; el historial queda intacto.</p>
        <ActionForm action={createRateAction} className="ov-form ov-form--3" resetOnSuccess>
          <label className="ov-field"><span>Entidad (opcional)</span>
            <select name="entityId" defaultValue="">
              <option value="">Mercado / promedio general</option>
              {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </label>
          <label className="ov-field"><span>Producto</span>
            <select name="product" required defaultValue="">
              <option value="" disabled>Elige…</option>
              {Object.entries(PRODUCTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="ov-field"><span>Sistema</span>
            <select name="system" required defaultValue="FIXED_PESOS">
              <option value="FIXED_PESOS">Pesos (cuota fija)</option>
              <option value="UVR">UVR (tasa real sobre UVR)</option>
            </select>
          </label>
          <label className="ov-field"><span>Tasa efectiva anual (%)</span><input name="rateEa" inputMode="decimal" required placeholder="12,5" /></label>
          <label className="ov-field"><span>Fecha de la tasa</span><input type="date" name="asOf" required defaultValue={todayBogota()} /></label>
          <label className="ov-field"><span>Vigente hasta (opcional)</span><input type="date" name="validUntil" /></label>
          <label className="ov-field full"><span>Fuente (obligatoria)</span><input name="source" required minLength={5} maxLength={200} placeholder="Ej.: Superfinanciera, tasas de vivienda semana 38 de 2026" /></label>
          <div className="full"><SubmitButton>Registrar tasa</SubmitButton></div>
        </ActionForm>
      </article>
      <article className="ov-card s12">
        <h2>Historial reciente</h2>
        {rates.length === 0 ? <Empty>Sin tasas registradas: el semáforo del cliente no podrá comparar su crédito hasta que registres al menos una.</Empty> : (
          <div className="ov-tablewrap">
            <table className="ov-table">
              <thead><tr><th>Entidad</th><th>Producto</th><th>Sistema</th><th className="num">Tasa EA</th><th>Fecha</th><th>Vigencia</th><th>Fuente</th></tr></thead>
              <tbody>
                {rates.map((r) => {
                  const expired = r.validUntil && r.validUntil < today;
                  return (
                    <tr key={r.id}>
                      <td>{r.entity?.name ?? 'Mercado'}</td>
                      <td>{PRODUCTS[r.product] ?? r.product}</td>
                      <td>{SYSTEM_LABELS[r.system] ?? r.system}</td>
                      <td className="num">{pctRate(r.rateEa)}</td>
                      <td>{fechaDia(r.asOf)}</td>
                      <td>{r.validUntil ? <>{fechaDia(r.validUntil)} {expired ? <Status tone="bad">Vencida</Status> : <Status>Vigente</Status>}</> : <span className="ov-meta">Sin fecha de fin</span>}</td>
                      <td><small>{r.source}</small></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </div>
  );
}

async function Parametros() {
  const params = await getPrisma().financialParameter.findMany({ orderBy: [{ key: 'asc' }, { asOf: 'desc' }, { createdAt: 'desc' }], take: 300 });
  const byKey = new Map<string, typeof params>();
  for (const p of params) byKey.set(p.key, [...(byKey.get(p.key) ?? []), p]);
  const show = (key: string, value: { toString(): string }) => {
    const n = Number(value.toString());
    if (key === 'INFLACION_PROYECTADA') return `${(n * 100).toLocaleString('es-CO', { maximumFractionDigits: 4 })} %`;
    return n.toLocaleString('es-CO', { maximumFractionDigits: 8 });
  };
  return (
    <div className="ov-grid">
      <article className="ov-card s12">
        <h2>Registrar parámetro</h2>
        <p className="ov-meta">El motor usa el valor más reciente de UVR (en pesos) e INFLACION_PROYECTADA (escríbela en %, p. ej. 5,2) para créditos y ofertas en UVR. Cada registro conserva su fuente y fecha.</p>
        <ActionForm action={createParameterAction} className="ov-form ov-form--3" resetOnSuccess>
          <label className="ov-field"><span>Clave</span>
            <input name="key" list="param-keys" required maxLength={40} placeholder="UVR" />
            <datalist id="param-keys"><option value="UVR" /><option value="INFLACION_PROYECTADA" /></datalist>
          </label>
          <label className="ov-field"><span>Valor</span><input name="value" inputMode="decimal" required placeholder="389,5123" /></label>
          <label className="ov-field"><span>Fecha</span><input type="date" name="asOf" required defaultValue={todayBogota()} /></label>
          <label className="ov-field full"><span>Fuente (obligatoria)</span><input name="source" required minLength={5} maxLength={200} placeholder="Ej.: Banco de la República, serie diaria UVR" /></label>
          <div className="full"><SubmitButton>Registrar valor</SubmitButton></div>
        </ActionForm>
      </article>
      {byKey.size === 0 ? (
        <article className="ov-card s12"><Empty>Sin parámetros. Registra UVR e INFLACION_PROYECTADA para habilitar cálculos en UVR.</Empty></article>
      ) : (
        [...byKey.entries()].map(([key, rows]) => (
          <article className="ov-card s6" key={key}>
            <header><h2>{key}</h2><span className="ov-big" style={{ fontSize: 22 }}>{show(key, rows[0].value)}</span></header>
            <div className="ov-tablewrap">
              <table className="ov-table" style={{ minWidth: 0 }}>
                <thead><tr><th>Fecha</th><th className="num">Valor</th><th>Fuente</th></tr></thead>
                <tbody>
                  {rows.slice(0, 20).map((r) => (
                    <tr key={r.id}><td>{fechaDia(r.asOf)}</td><td className="num">{show(key, r.value)}</td><td><small>{r.source}</small><small>Registrado {fechaHora(r.createdAt)}</small></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        ))
      )}
    </div>
  );
}

function DocTypeFields({ t }: { t?: { name: string; description: string | null; validityDays: number | null; products: string[]; required: boolean; active: boolean; sortOrder: number } }) {
  return (
    <>
      <label className="ov-field"><span>Nombre</span><input name="name" required maxLength={160} defaultValue={t?.name} /></label>
      <label className="ov-field"><span>Vigencia (días, vacío = no vence)</span><input name="validityDays" type="number" min={1} max={3650} defaultValue={t?.validityDays ?? ''} /></label>
      <label className="ov-field"><span>Orden</span><input name="sortOrder" type="number" min={0} max={10000} defaultValue={t?.sortOrder ?? 100} required /></label>
      <label className="ov-field full"><span>Descripción / instrucciones para el cliente</span><textarea name="description" maxLength={2000} defaultValue={t?.description ?? ''} /></label>
      <fieldset className="full" style={{ border: '1px solid var(--ov-line)', borderRadius: 10, padding: '10px 12px' }}>
        <legend className="ov-meta">Productos (sin marcar = aplica a todos)</legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px' }}>
          {Object.entries(DOC_PRODUCTS).map(([k, v]) => (
            <label key={k} className="ov-check"><input type="checkbox" name="products" value={k} defaultChecked={t?.products.includes(k)} /><span>{v}</span></label>
          ))}
        </div>
      </fieldset>
      <label className="ov-check"><input type="checkbox" name="required" defaultChecked={t ? t.required : true} /><span>Requerido para radicar</span></label>
      <label className="ov-check"><input type="checkbox" name="active" defaultChecked={t ? t.active : true} /><span>Activo</span></label>
    </>
  );
}

async function TiposDocumentales() {
  const types = await getPrisma().documentType.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: { _count: { select: { documents: true } } } });
  return (
    <div className="ov-grid">
      <article className="ov-card s12">
        <h2>Nuevo tipo documental</h2>
        <p className="ov-meta">El checklist de cada caso se arma con los tipos activos del producto. Los requeridos bloquean la radicación hasta tener versión aprobada y vigente; al aprobar, el vencimiento es hoy + vigencia.</p>
        <ActionForm action={createDocTypeAction} className="ov-form ov-form--3" resetOnSuccess>
          <label className="ov-field"><span>Código (no se puede cambiar)</span><input name="code" required maxLength={40} placeholder="CERT_LABORAL" /></label>
          <DocTypeFields />
          <div className="full"><SubmitButton>Crear tipo documental</SubmitButton></div>
        </ActionForm>
      </article>
      <article className="ov-card s12">
        <h2>Tipos documentales ({types.length})</h2>
        {types.length === 0 ? <Empty>No hay tipos documentales.</Empty> : (
          <div className="ove-stack-list">
            {types.map((t) => (
              <details key={t.id} className="ove-details">
                <summary>
                  {t.name} <span className="ov-meta ov-mono">{t.code}</span> {t.active ? <Status>Activo</Status> : <Status tone="gray">Inactivo</Status>} {t.required ? <Status tone="info">Requerido</Status> : <Status tone="gray">Opcional</Status>}{' '}
                  <span className="ov-meta">· {t.validityDays ? `vigencia ${t.validityDays} días` : 'no vence'} · {t.products.length ? t.products.map((p) => DOC_PRODUCTS[p] ?? p).join(', ') : 'todos los productos'} · {t._count.documents} documentos</span>
                </summary>
                <ActionForm action={updateDocTypeAction} className="ov-form ov-form--3">
                  <input type="hidden" name="id" value={t.id} />
                  <DocTypeFields t={t} />
                  <div className="full"><SubmitButton className="ov-btn ov-btn--secondary">Guardar cambios</SubmitButton></div>
                </ActionForm>
              </details>
            ))}
          </div>
        )}
      </article>
    </div>
  );
}

async function Cursos() {
  const courses = await getPrisma().course.findMany({ orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }], include: { _count: { select: { certifications: true, enrollments: true } } } });
  return (
    <div className="ov-grid">
      <article className="ov-card s12">
        <p className="ov-meta" style={{ margin: 0 }}>Un curso <strong>crítico</strong> vencido o pendiente bloquea que el aliado radique casos. Al guardar contenido nuevo, la versión sube en 1 y las certificaciones nuevas quedan ligadas a esa versión.</p>
      </article>
      {courses.length === 0 ? <article className="ov-card s12"><Empty>No hay cursos. Se cargan con el script de catálogos del despliegue.</Empty></article> : courses.map((c) => (
        <article className="ov-card s12" key={c.id}>
          <header>
            <h2>{c.title}</h2>
            <div>
              {c.active ? <Status>Activo</Status> : <Status tone="gray">Inactivo</Status>} {c.critical && <Status tone="bad">Crítico</Status>} {c.mandatory && <Status tone="info">Obligatorio</Status>} <Status tone="gray">Versión {c.version}</Status>
            </div>
          </header>
          <p className="ov-meta">{c.summary} · {c._count.enrollments} inscritos · {c._count.certifications} certificaciones emitidas</p>
          <ActionForm action={updateCourseAction} className="ov-form ov-form--3">
            <input type="hidden" name="id" value={c.id} />
            <label className="ov-field"><span>Vigencia de la certificación (días)</span><input name="validityDays" type="number" min={1} max={3650} defaultValue={c.validityDays} required /></label>
            <label className="ov-field"><span>Puntaje mínimo (%)</span><input name="passScore" type="number" min={1} max={100} defaultValue={c.passScore} required /></label>
            <div className="ov-field" style={{ alignSelf: 'end', gap: 8 }}>
              <label className="ov-check"><input type="checkbox" name="active" defaultChecked={c.active} /><span>Activo</span></label>
              <label className="ov-check"><input type="checkbox" name="critical" defaultChecked={c.critical} /><span>Crítico (bloquea radicar)</span></label>
              <label className="ov-check"><input type="checkbox" name="mandatory" defaultChecked={c.mandatory} /><span>Obligatorio</span></label>
            </div>
            <div className="full"><SubmitButton className="ov-btn ov-btn--secondary">Guardar configuración</SubmitButton></div>
          </ActionForm>
          <details className="ove-details" style={{ marginTop: 14 }}>
            <summary>Editar contenido (avanzado)</summary>
            <ActionForm action={updateCourseContentAction} className="ov-form">
              <input type="hidden" name="id" value={c.id} />
              <label className="ov-field"><span>Título</span><input name="title" required maxLength={160} defaultValue={c.title} /></label>
              <label className="ov-field"><span>Resumen</span><textarea name="summary" required maxLength={2000} defaultValue={c.summary} /></label>
              <label className="ov-field">
                <span>Contenido JSON</span>
                <textarea name="content" required spellCheck={false} className="ov-mono" style={{ minHeight: 360 }} defaultValue={JSON.stringify({ lessons: c.lessons, quiz: c.quiz }, null, 2)} />
                <small>Estructura: {'{ "lessons": [{ "title": "…", "body": ["párrafo", …] }], "quiz": [{ "q": "…", "options": ["a", "b"], "answer": 0 }] }'}. &quot;answer&quot; es el índice de la opción correcta, empezando en 0.</small>
              </label>
              <div><SubmitButton confirm="Se guardará una nueva versión del curso. ¿Continuar?">Guardar nueva versión</SubmitButton></div>
            </ActionForm>
          </details>
        </article>
      ))}
    </div>
  );
}
