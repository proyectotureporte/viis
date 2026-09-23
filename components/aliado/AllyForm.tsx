'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef } from 'react';
import type { ActionState, FormAction } from '@/components/ov/forms';

type WithLink = NonNullable<ActionState> & { href?: string; linkLabel?: string };

/**
 * Variante de ActionForm para el portal aliado: si la acción devuelve `href`,
 * muestra un enlace de continuación o —con `navigate`— lleva al usuario allí.
 */
export function AllyForm({
  action,
  children,
  className = 'ov-form',
  resetOnSuccess = false,
  navigate = false,
  compact = false,
}: {
  action: FormAction;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  navigate?: boolean;
  compact?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const result = state as WithLink | null;

  useEffect(() => {
    if (!result?.ok) return;
    if (resetOnSuccess) ref.current?.reset();
    if (navigate && result.href) router.push(result.href);
  }, [result, resetOnSuccess, navigate, router]);

  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {result && (
        <p
          className={`ov-result full ${result.ok ? 'ov-result--ok' : 'ov-result--error'}${compact ? ' al-result--compact' : ''}`}
          role={result.ok ? 'status' : 'alert'}
        >
          {result.message}
          {result.ok && result.href && !navigate && (
            <>
              {' '}
              <Link href={result.href}>{result.linkLabel ?? 'Ver'}</Link>
            </>
          )}
        </p>
      )}
    </form>
  );
}
