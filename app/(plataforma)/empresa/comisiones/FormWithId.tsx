'use client';

import { useActionState } from 'react';
import type { FormAction } from '@/components/ov/forms';

/**
 * Formulario con id propio: permite que casillas dentro de la tabla (atributo
 * `form`) pertenezcan a este formulario sin anidar formularios.
 */
export function FormWithId({ id, action, className = 'ove-bulk', children }: { id: string; action: FormAction; className?: string; children: React.ReactNode }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form id={id} action={formAction} className={className}>
      {children}
      {state && (
        <p className={`ov-result ${state.ok ? 'ov-result--ok' : 'ov-result--error'}`} role={state.ok ? 'status' : 'alert'} style={{ flexBasis: '100%', margin: 0 }}>
          {state.message}
        </p>
      )}
    </form>
  );
}
