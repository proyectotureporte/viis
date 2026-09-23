'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';

export type ActionState = { ok: boolean; message: string; at?: number } | null;
export type FormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

export function SubmitButton({ children, className = 'ov-btn', pendingText = 'Procesando…', confirm }: { children: React.ReactNode; className?: string; pendingText?: string; confirm?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      onClick={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      {pending ? pendingText : children}
    </button>
  );
}

/**
 * Formulario ligado a una server action que devuelve {ok, message}.
 * Muestra el resultado accesible y, si `resetOnSuccess`, limpia los campos.
 */
export function ActionForm({
  action,
  children,
  className = 'ov-form',
  resetOnSuccess = false,
  encType,
}: {
  action: FormAction;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  encType?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className} encType={encType}>
      {children}
      {state && (
        <p className={`ov-result full ${state.ok ? 'ov-result--ok' : 'ov-result--error'}`} role={state.ok ? 'status' : 'alert'}>
          {state.message}
        </p>
      )}
    </form>
  );
}
