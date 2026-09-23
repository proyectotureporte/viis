import type { Metadata } from 'next';
import Link from 'next/link';
import { AllyForm } from '@/components/aliado/AllyForm';
import { SubmitButton } from '@/components/ov/forms';
import { Notice, PageHeader } from '@/components/ov/ui';
import { CONSENT_PURPOSES, CONSENT_VERSION } from '@/lib/consent';
import { PRODUCTS } from '@/lib/labels';
import { requireUser } from '@/lib/security/session';
import { createClientAction } from '../actions';

export const metadata: Metadata = { title: 'Nuevo cliente' };

export default async function NuevoClientePage() {
  const session = await requireUser({ portal: 'aliado', permission: 'case.create' });
  return (
    <>
      <PageHeader title="Nuevo cliente" subtitle="Registra al cliente con su autorización. Si ya existe en OpenV lo vinculamos sin duplicarlo." actions={<Link className="ov-btn ov-btn--secondary" href="/aliado/clientes">Volver</Link>} />
      {!session.user.organizationId && <Notice tone="danger">Tu usuario no está vinculado a una organización aliada, así que no puedes registrar clientes. Escribe a contacto@viis.app.</Notice>}
      <article className="ov-card">
        <AllyForm action={createClientAction} className="ov-form ov-form--2" navigate>
          <fieldset className="full ov-form ov-form--2" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="ov-eyebrow" style={{ marginBottom: 8 }}>Identificación</legend>
            <label className="ov-field">
              <span>Tipo de documento</span>
              <select name="documentType" required defaultValue="CC">
                <option value="CC">Cédula de ciudadanía</option>
                <option value="CE">Cédula de extranjería</option>
                <option value="PPT">Permiso por protección temporal</option>
                <option value="PA">Pasaporte</option>
              </select>
            </label>
            <label className="ov-field">
              <span>Número de documento</span>
              <input name="documentNumber" inputMode="numeric" autoComplete="off" required minLength={5} maxLength={20} />
              <small>Se guarda cifrado. En la plataforma solo verás los últimos 4 dígitos.</small>
            </label>
            <label className="ov-field"><span>Nombres</span><input name="firstName" autoComplete="off" required maxLength={120} /></label>
            <label className="ov-field"><span>Apellidos</span><input name="lastName" autoComplete="off" required maxLength={120} /></label>
          </fieldset>

          <fieldset className="full ov-form ov-form--2" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="ov-eyebrow" style={{ marginBottom: 8 }}>Contacto</legend>
            <label className="ov-field"><span>Correo electrónico (opcional)</span><input name="email" type="email" autoComplete="off" maxLength={320} /></label>
            <label className="ov-field"><span>Celular (opcional)</span><input name="phone" type="tel" autoComplete="off" maxLength={30} placeholder="300 123 4567" /></label>
            <label className="ov-field"><span>Ciudad</span><input name="city" autoComplete="off" maxLength={120} /></label>
            <label className="ov-field"><span>Ingreso mensual (opcional)</span><input name="monthlyIncome" inputMode="numeric" placeholder="4.500.000" /><small>Declarado por el cliente, en pesos.</small></label>
          </fieldset>

          <fieldset className="full ov-form ov-form--2" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="ov-eyebrow" style={{ marginBottom: 8 }}>Necesidad</legend>
            <label className="ov-field">
              <span>Producto</span>
              <select name="product" required defaultValue="">
                <option value="" disabled>Elige una opción</option>
                {Object.entries(PRODUCTS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </select>
            </label>
            <label className="ov-field"><span>Monto estimado (opcional)</span><input name="amount" inputMode="numeric" placeholder="180.000.000" /><small>Una estimación: la entidad define el monto aprobado.</small></label>
          </fieldset>

          <fieldset className="full ov-form" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="ov-eyebrow" style={{ marginBottom: 8 }}>Autorizaciones del cliente · versión {CONSENT_VERSION}</legend>
            <p className="ov-meta" style={{ margin: 0 }}>Lee cada texto al cliente o compártelo con él. Marca solo lo que autorizó.</p>
            {CONSENT_PURPOSES.map((purpose) => (
              <label key={purpose.code} className="ov-check">
                <input type="checkbox" name="consents" value={purpose.code} required={purpose.required} />
                <span>
                  <strong>{purpose.title}{purpose.required ? ' (obligatoria)' : ' (opcional)'}.</strong> {purpose.text}
                  {purpose.code === 'ENTIDADES' && <em className="ov-meta"> Sin esta autorización el caso no se podrá radicar.</em>}
                </span>
              </label>
            ))}
            <label className="ov-check">
              <input type="checkbox" name="declaration" required />
              <span><strong>El cliente me autorizó expresamente y conservo la evidencia.</strong> Entiendo que esta declaración queda registrada a mi nombre en la bitácora.</span>
            </label>
            <label className="ov-check">
              <input type="checkbox" name="invite" defaultChecked />
              <span>Si el cliente tiene correo y aún no tiene cuenta, enviarle una invitación para crearla y seguir su caso.</span>
            </label>
          </fieldset>
          <div className="full"><SubmitButton pendingText="Registrando…">Registrar cliente y abrir caso</SubmitButton></div>
        </AllyForm>
      </article>
    </>
  );
}
