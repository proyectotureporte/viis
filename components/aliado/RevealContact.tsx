'use client';

import { useActionState } from 'react';
import type { FormAction } from '@/components/ov/forms';

/**
 * El teléfono cifrado solo se descifra cuando el aliado lo pide expresamente;
 * cada lectura queda en la bitácora ('person.contact_viewed').
 */
export function RevealContact({ action, opportunityId }: { action: FormAction; opportunityId: string }) {
  const [state, formAction, pending] = useActionState(action, null);
  if (state?.ok) {
    return (
      <span className="al-phone">
        <a href={`tel:${state.message.replace(/[^\d+]/g, '')}`}>{state.message}</a>
        <small className="ov-meta"> · lectura registrada</small>
      </span>
    );
  }
  return (
    <form action={formAction} className="al-inline-form">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <button type="submit" className="ov-linkbtn" disabled={pending}>
        {pending ? 'Consultando…' : 'Ver teléfono'}
      </button>
      {state && !state.ok && <span className="ov-negative" role="alert"> {state.message}</span>}
    </form>
  );
}
