import type { Metadata } from 'next';
import { Shell } from '@/components/ov/Shell';
import { requireUser } from '@/lib/security/session';
import './aliado.css';

export const metadata: Metadata = { title: { template: '%s · Aliado OpenV', default: 'Portal aliado · OpenV' } };

export default async function AliadoLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser({ portal: 'aliado' });
  return (
    <Shell portal="aliado" session={session}>
      {children}
    </Shell>
  );
}
