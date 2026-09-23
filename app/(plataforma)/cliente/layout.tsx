import type { Metadata } from 'next';
import { Shell } from '@/components/ov/Shell';
import { requireUser } from '@/lib/security/session';
import './cliente.css';

export const metadata: Metadata = { title: { template: '%s · OpenV', default: 'Mi vivienda · OpenV' } };

/** Portal cliente: exige sesión con MFA y rol CLIENT. Cada página vuelve a verificarlo. */
export default async function ClienteLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser({ portal: 'cliente' });
  return (
    <Shell portal="cliente" session={session}>
      {children}
    </Shell>
  );
}
