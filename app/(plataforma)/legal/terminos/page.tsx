import type { Metadata } from 'next';
import { termsOfUse } from '@/lib/legal';
import { LegalView } from '../LegalView';

export const metadata: Metadata = { title: 'Términos de uso', robots: { index: true, follow: true } };

export default function TerminosPage() {
  return <LegalView doc={termsOfUse()} />;
}
