import { CONSENT_PURPOSES } from '@/lib/consent';
import { DOCUMENT_TYPES_ID, PRODUCTS } from '@/lib/labels';
import { ROLE_LABELS } from '@/lib/security/rbac';
import type { Role } from '@/app/generated/prisma/enums';
import { ADVISOR_DECLARATION } from './create';
import { CAPTURE_CHANNELS, DOC_TYPES } from './schema';

export interface PersonCaseDefaults {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  city?: string;
  captureChannel?: keyof typeof CAPTURE_CHANNELS;
}

/** Campos del alta de persona + caso + consentimientos (se usan en casos/nuevo y en leads). */
export function PersonCaseFields({
  idPrefix,
  defaults = {},
  entities,
  staff,
  lockAssigneeToSelf,
}: {
  idPrefix: string;
  defaults?: PersonCaseDefaults;
  entities: Array<{ id: string; name: string }>;
  staff: Array<{ id: string; name: string; role: Role }>;
  lockAssigneeToSelf: boolean;
}) {
  return (
    <>
      <fieldset className="full ov-form ov-form--3" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="ov-eyebrow" style={{ marginBottom: 8 }}>Cliente</legend>
        <label className="ov-field"><span>Tipo de documento</span>
          <select name="documentType" required defaultValue="CC">
            {DOC_TYPES.map((t) => <option key={t} value={t}>{DOCUMENT_TYPES_ID[t] ?? t}</option>)}
          </select>
        </label>
        <label className="ov-field"><span>Número de documento</span><input name="documentNumber" required inputMode="text" autoComplete="off" maxLength={20} /></label>
        <label className="ov-field"><span>Ciudad</span><input name="city" defaultValue={defaults.city} maxLength={120} /></label>
        <label className="ov-field"><span>Nombres</span><input name="firstName" required defaultValue={defaults.firstName} maxLength={120} /></label>
        <label className="ov-field"><span>Apellidos</span><input name="lastName" required defaultValue={defaults.lastName} maxLength={120} /></label>
        <label className="ov-field"><span>Correo</span><input name="email" type="email" defaultValue={defaults.email} maxLength={320} /></label>
        <label className="ov-field"><span>Teléfono</span><input name="phone" type="tel" defaultValue={defaults.phone} maxLength={20} /></label>
        <label className="ov-field"><span>Ingreso mensual del hogar (opcional)</span><input name="monthlyIncome" inputMode="numeric" placeholder="$" /></label>
      </fieldset>

      <fieldset className="full ov-form ov-form--3" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="ov-eyebrow" style={{ marginBottom: 8 }}>Caso</legend>
        <label className="ov-field"><span>Producto</span>
          <select name="product" required defaultValue="">
            <option value="" disabled>Elige…</option>
            {Object.entries(PRODUCTS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
        </label>
        <label className="ov-field"><span>Monto estimado (opcional)</span><input name="amount" inputMode="numeric" placeholder="$" /></label>
        <label className="ov-field"><span>Entidad financiera (opcional)</span>
          <select name="entityId" defaultValue="">
            <option value="">Sin definir</option>
            {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
        {lockAssigneeToSelf ? (
          <p className="ov-meta" style={{ alignSelf: 'end' }}>Quedarás como responsable del caso.</p>
        ) : (
          <label className="ov-field"><span>Responsable</span>
            <select name="assigneeId" defaultValue="">
              <option value="">Sin asignar</option>
              {staff.map((u) => <option key={u.id} value={u.id}>{u.name} · {ROLE_LABELS[u.role]}</option>)}
            </select>
          </label>
        )}
        <label className="ov-field" style={{ gridColumn: 'span 2' }}><span>Siguiente acción</span><input name="nextAction" maxLength={240} placeholder="Contactar al cliente" /></label>
      </fieldset>

      <fieldset className="full" style={{ border: '1px solid var(--ov-line)', borderRadius: 12, padding: 14, margin: 0 }}>
        <legend className="ov-eyebrow" style={{ padding: '0 6px' }}>Autorizaciones del cliente</legend>
        <p className="ov-meta" style={{ marginTop: 0 }}>Lee al cliente cada texto antes de marcarlo. Se guarda la versión exacta del texto, el canal y quién la registró.</p>
        <div className="ov-list">
          {CONSENT_PURPOSES.map((p) => (
            <label key={p.code} className="ov-check" htmlFor={`${idPrefix}-c-${p.code}`}>
              <input id={`${idPrefix}-c-${p.code}`} type="checkbox" name="consents" value={p.code} required={p.required} defaultChecked={p.required} />
              <span>
                <strong>{p.title}{p.required ? ' (obligatoria)' : ' (opcional)'}</strong>
                <br />
                <small className="ov-meta">{p.text}</small>
              </span>
            </label>
          ))}
        </div>
        <div className="ov-form ov-form--2" style={{ marginTop: 12 }}>
          <label className="ov-field"><span>Canal de captura</span>
            <select name="captureChannel" required defaultValue={defaults.captureChannel ?? ''}>
              <option value="" disabled>Elige…</option>
              {Object.entries(CAPTURE_CHANNELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
          </label>
          <label className="ov-check full" htmlFor={`${idPrefix}-decl`}>
            <input id={`${idPrefix}-decl`} type="checkbox" name="declaration" required />
            <span>{ADVISOR_DECLARATION}</span>
          </label>
        </div>
      </fieldset>
    </>
  );
}
