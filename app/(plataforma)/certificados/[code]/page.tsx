import type { Metadata } from 'next';
import { AuthCard } from '@/components/ov/AuthCard';
import { Status } from '@/components/ov/ui';
import { fecha } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';

export const metadata: Metadata = { title: 'Verificación de certificado' };
export const dynamic = 'force-dynamic';

/** Verificación pública: cualquiera (p. ej. una entidad financiera) confirma que el certificado existe y está vigente. */
export default async function CertificadoPublicoPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const certification = /^CERT-[A-Z2-7]{8}$/.test(code)
    ? await getPrisma().certification.findUnique({ where: { code }, include: { course: true, user: { select: { name: true } } } })
    : null;
  if (!certification) {
    return <AuthCard title="Certificado no encontrado" intro="El código no corresponde a ningún certificado emitido por la Academia OpenV." ><p className="ov-meta">Código consultado: {code.slice(0, 20)}</p></AuthCard>;
  }
  const valid = certification.expiresAt > new Date();
  return (
    <AuthCard title="Certificado Academia OpenV" intro="Resultado de la verificación en el registro oficial de la Academia OpenV.">
      <p>{valid ? <Status>Vigente</Status> : <Status tone="bad">Vencido</Status>}</p>
      <dl className="ov-dl" style={{ marginTop: 14 }}>
        <dt>Titular</dt><dd>{certification.user.name}</dd>
        <dt>Curso</dt><dd>{certification.course.title} (versión {certification.courseVersion})</dd>
        <dt>Puntaje</dt><dd>{certification.score}%</dd>
        <dt>Emitido</dt><dd>{fecha(certification.issuedAt)}</dd>
        <dt>Vigente hasta</dt><dd>{fecha(certification.expiresAt)}</dd>
        <dt>Código</dt><dd className="ov-mono">{certification.code}</dd>
      </dl>
    </AuthCard>
  );
}
