'use client';

import { useActionState } from 'react';
import { SubmitButton } from '@/components/ov/forms';
import { confirmTotpAction } from '../actions';

export function TotpSetup({ qr, secret, pending, home }: { qr: string; secret: string; pending: string; home: string }) {
  const [state, action] = useActionState(confirmTotpAction, null);

  if (state?.ok && state.codes) {
    return (
      <div className="ov-form">
        <p className="ov-result ov-result--ok" role="status">{state.message}</p>
        <p><strong>Guarda estos códigos de recuperación.</strong> Cada uno sirve una sola vez si pierdes tu teléfono. No volveremos a mostrarlos.</p>
        <div className="ov-codes" aria-label="Códigos de recuperación">
          {state.codes.map((code) => <span key={code}>{code}</span>)}
        </div>
        <div className="ov-actions">
          <button type="button" className="ov-btn ov-btn--secondary" onClick={() => navigator.clipboard?.writeText(state.codes!.join('\n'))}>Copiar códigos</button>
          <a className="ov-btn" href={home}>Ya los guardé, continuar</a>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="ov-form">
      <div className="ov-qr">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="Código QR para la aplicación autenticadora" />
      </div>
      <details className="ov-details">
        <summary>¿No puedes escanear? Escribe la clave manualmente</summary>
        <p className="ov-code">{secret.match(/.{1,4}/g)?.join(' ')}</p>
      </details>
      <input type="hidden" name="pending" value={pending} />
      <label className="ov-field">
        <span>Escribe el código de 6 dígitos que aparece en la aplicación</span>
        <input name="code" inputMode="numeric" pattern="[0-9 ]{6,7}" autoComplete="one-time-code" required maxLength={7} />
      </label>
      {state && !state.ok && <p className="ov-result ov-result--error" role="alert">{state.message}</p>}
      <SubmitButton pendingText="Activando…">Activar verificación</SubmitButton>
    </form>
  );
}
