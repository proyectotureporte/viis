import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/ov/AuthCard';
import { ActionForm, SubmitButton } from '@/components/ov/forms';
import { CONSENT_PURPOSES } from '@/lib/consent';
import { PASSWORD_MIN_LENGTH } from '@/lib/security/password';
import { registerAction } from '../ingresar/actions';

export const metadata: Metadata = { title: 'Crear cuenta' };

export default function RegistroPage() {
  return (
    <AuthCard wide title="Crea tu cuenta de cliente" intro="Entiende, controla y optimiza tu crédito de vivienda. Solo pedimos lo necesario y tú decides qué autorizas.">
      <ActionForm action={registerAction} className="ov-form ov-form--2">
        <label className="ov-field"><span>Nombres</span><input name="firstName" autoComplete="given-name" required /></label>
        <label className="ov-field"><span>Apellidos</span><input name="lastName" autoComplete="family-name" required /></label>
        <label className="ov-field">
          <span>Tipo de documento</span>
          <select name="documentType" required defaultValue="CC">
            <option value="CC">Cédula de ciudadanía</option>
            <option value="CE">Cédula de extranjería</option>
            <option value="PPT">Permiso por protección temporal</option>
            <option value="PA">Pasaporte</option>
          </select>
        </label>
        <label className="ov-field"><span>Número de documento</span><input name="documentNumber" inputMode="numeric" required /></label>
        <label className="ov-field"><span>Correo electrónico</span><input name="email" type="email" autoComplete="email" required /></label>
        <label className="ov-field"><span>Celular</span><input name="phone" type="tel" autoComplete="tel" required /></label>
        <label className="ov-field full"><span>Ciudad</span><input name="city" autoComplete="address-level2" /></label>
        <label className="ov-field"><span>Contraseña</span><input name="password" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} /><small>{PASSWORD_MIN_LENGTH}+ caracteres, mezcla mayúsculas, números o símbolos.</small></label>
        <label className="ov-field"><span>Repite la contraseña</span><input name="confirm" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} /></label>
        <input type="text" name="website" tabIndex={-1} autoComplete="off" hidden aria-hidden />
        <fieldset className="full ov-form" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="ov-eyebrow" style={{ marginBottom: 8 }}>Autorizaciones</legend>
          {CONSENT_PURPOSES.map((purpose) => (
            <label key={purpose.code} className="ov-check">
              <input type="checkbox" name={purpose.code} required={purpose.required} />
              <span>
                <strong>{purpose.title}{purpose.required ? ' (obligatoria)' : ' (opcional)'}.</strong> {purpose.text}
              </span>
            </label>
          ))}
        </fieldset>
        <div className="full"><SubmitButton pendingText="Creando cuenta…">Crear cuenta</SubmitButton></div>
      </ActionForm>
      <div className="ov-auth__links">
        <Link href="/ingresar">Ya tengo cuenta</Link>
        <Link href="/legal/privacidad">Política de tratamiento de datos</Link>
      </div>
    </AuthCard>
  );
}
