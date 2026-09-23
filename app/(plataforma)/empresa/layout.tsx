import type { Metadata } from 'next';
import { Shell } from '@/components/ov/Shell';
import { requireUser } from '@/lib/security/session';
import './empresa.css';

export const metadata: Metadata = { title: { template: '%s · Consola OpenV', default: 'Consola OpenV' } };

/** Consola empresa: solo personal interno (cada página exige además su permiso). */
export default async function EmpresaLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser({ portal: 'empresa' });
  return (
    <Shell portal="empresa" session={session}>
      {children}
    </Shell>
  );
}
