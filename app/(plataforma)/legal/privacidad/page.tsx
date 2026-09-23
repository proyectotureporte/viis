import type { Metadata } from 'next';
import { privacyPolicy } from '@/lib/legal';
import { LegalView } from '../LegalView';

export const metadata: Metadata = { title: 'Política de tratamiento de datos personales', robots: { index: true, follow: true } };

export default function PrivacidadPage() {
  return <LegalView doc={privacyPolicy()} />;
}
