import Image from 'next/image';
import Link from 'next/link';

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header style={{ background: '#fff', borderBottom: '1px solid var(--ov-line)' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/" className="ov-brand" style={{ color: 'var(--ov-ink)', margin: 0 }}><Image src="/logo-openv.png" alt="OpenV" width={640} height={228} priority style={{ width: 132, height: 'auto' }} /></Link>
          <nav style={{ display: 'flex', gap: 16, fontSize: 14 }}>
            <Link href="/legal/privacidad">Privacidad</Link>
            <Link href="/legal/terminos">Términos</Link>
            <Link href="/ingresar">Ingresar</Link>
          </nav>
        </div>
      </header>
      <main className="ov-legal">{children}</main>
    </>
  );
}
