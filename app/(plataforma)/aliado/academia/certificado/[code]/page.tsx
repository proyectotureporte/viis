import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ov/ui';
import { certState } from '@/lib/aliado/scope';
import { fecha } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { requireUser } from '@/lib/security/session';

export const metadata: Metadata = { title: 'Certificado' };

/**
 * Verificación de un certificado por su código. Muestra solo lo necesario para
 * comprobarlo: titular, curso, fechas y estado (sin correo ni otros datos).
 */
export default async function CertificadoPage({ params }: { params: Promise<{ code: string }> }) {
  const session = await requireUser({ portal: 'aliado' });
  const { code } = await params;
  const normalized = decodeURIComponent(code).trim().toUpperCase();
  if (!/^CERT-[A-Z2-7]{8}$/.test(normalized)) notFound();
  const cert = await getPrisma().certification.findUnique({
    where: { code: normalized },
    include: { user: { select: { id: true, name: true, organization: { select: { name: true } } } }, course: { select: { title: true, slug: true, version: true } } },
  });
  if (!cert) notFound();
  const state = certState(cert.expiresAt);
  const own = cert.user.id === session.user.id;

  return (
    <>
      <PageHeader
        title="Certificado"
        subtitle="Verificación de certificación de la Academia OpenV."
        actions={<Link className="ov-btn ov-btn--secondary" href="/aliado/academia">Volver a la academia</Link>}
      />
      <article className="al-cert" aria-labelledby="cert-title">
        <div className="ov-eyebrow">Academia OpenV certifica que</div>
        <h2 id="cert-title">{cert.user.name}</h2>
        {cert.user.organization && <p className="ov-sub" style={{ margin: 0 }}>{cert.user.organization.name}</p>}
        <p style={{ margin: '14px 0 0' }}>aprobó el curso</p>
        <h3 style={{ fontSize: 20, margin: '6px 0 0' }}>{cert.course.title}</h3>
        <p style={{ margin: '14px 0 0' }}>
          <span className={`ov-status${state.tone === 'ok' ? '' : ` ov-status--${state.tone}`}`}>{state.valid ? `Vigente${state.tone === 'wait' ? ` · ${state.label.toLowerCase()}` : ''}` : 'Vencida'}</span>
        </p>
        <dl className="ov-dl">
          <dt>Código</dt><dd className="ov-mono">{cert.code}</dd>
          <dt>Fecha de emisión</dt><dd>{fecha(cert.issuedAt)}</dd>
          <dt>Válido hasta</dt><dd>{fecha(cert.expiresAt)}</dd>
          <dt>Puntaje</dt><dd>{cert.score}/100</dd>
          <dt>Versión del curso</dt><dd>{cert.courseVersion}{cert.courseVersion !== cert.course.version ? ` (versión actual: ${cert.course.version})` : ''}</dd>
        </dl>
      </article>
      {own && !state.valid && (
        <p style={{ textAlign: 'center', marginTop: 16 }}>
          <Link className="ov-btn" href={`/aliado/academia/${cert.course.slug}?leccion=evaluacion`}>Renovar certificación</Link>
        </p>
      )}
    </>
  );
}
