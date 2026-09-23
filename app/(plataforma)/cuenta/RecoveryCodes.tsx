'use client';

import { useActionState } from 'react';
import { SubmitButton } from '@/components/ov/forms';
import { regenerateCodesAction } from './actions';

export function RecoveryCodes() {
  const [state, action] = useActionState(regenerateCodesAction, null);
  return (
    <form action={action} className="ov-form">
      {state?.codes ? (
        <>
          <p className="ov-result ov-result--ok" role="status">{state.message}</p>
          <div className="ov-codes">{state.codes.map((c) => <span key={c}>{c}</span>)}</div>
        </>
      ) : (
        <>
          <label className="ov-field"><span>Confirma con tu contraseña</span><input type="password" name="current" autoComplete="current-password" required /></label>
          {state && !state.ok && <p className="ov-result ov-result--error" role="alert">{state.message}</p>}
          <SubmitButton className="ov-btn ov-btn--secondary">Generar nuevos códigos</SubmitButton>
        </>
      )}
    </form>
  );
}
