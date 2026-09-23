import Link from 'next/link';

export function AuthCard({ title, intro, wide, children }: { title: string; intro?: React.ReactNode; wide?: boolean; children: React.ReactNode }) {
  return (
    <main className="ov-auth">
      <section className={wide ? 'ov-auth__card ov-auth__card--wide' : 'ov-auth__card'}>
        <Link href="/" className="ov-brand" style={{ color: 'var(--ov-ink)', margin: 0 }}>
          <span className="ov-mark" aria-hidden>V</span>
          <span>OpenV</span>
        </Link>
        <h1>{title}</h1>
        {intro && <p>{intro}</p>}
        {children}
      </section>
    </main>
  );
}
