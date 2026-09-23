'use client';

import { createContext, startTransition, useActionState, useContext, useEffect, useRef } from 'react';
import type { ActionState, FormAction } from '@/components/ov/forms';

const Pending = createContext(false);

/**
 * Como `ActionForm`, pero conserva lo escrito si la acción responde con un
 * error (React 19 limpia el formulario tras cada `action`, y perder un
 * formulario largo por un dato mal escrito es frustrante). Solo limpia si
 * `resetOnSuccess` y la acción fue exitosa.
 */
export function KeepForm({
  action,
  children,
  className = 'ov-form',
  resetOnSuccess = false,
  onSuccess,
  ariaLabel,
}: {
  action: FormAction;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: () => void;
  ariaLabel?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.();
    }
  }, [state, resetOnSuccess, onSuccess]);
  return (
    <form
      ref={ref}
      className={className}
      aria-label={ariaLabel}
      aria-busy={pending}
      method="post"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <Pending.Provider value={pending}>{children}</Pending.Provider>
      {state && (
        <p className={`ov-result full ${state.ok ? 'ov-result--ok' : 'ov-result--error'}`} role={state.ok ? 'status' : 'alert'}>
          {state.message}
        </p>
      )}
    </form>
  );
}

export function Submit({
  children,
  className = 'ov-btn',
  pendingText = 'Procesando…',
  disabled,
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
  disabled?: boolean;
}) {
  const pending = useContext(Pending);
  return (
    <button type="submit" className={className} disabled={pending || disabled}>
      {pending ? pendingText : children}
    </button>
  );
}
