import type { Metadata } from 'next';
import './plataforma.css';

export const metadata: Metadata = {
  title: { template: '%s · OpenV', default: 'OpenV · Gestión hipotecaria' },
  robots: { index: false, follow: false },
};

export default function PlataformaLayout({ children }: { children: React.ReactNode }) {
  return <div className="ov">{children}</div>;
}
