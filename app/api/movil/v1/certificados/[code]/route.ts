import { apiError, json } from '@/lib/movil/http';
import { getPrisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** Público (igual que /certificados/[code] en la web): verifica que un certificado de la Academia existe y está vigente. */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  const { code } = await params;
  if (!/^CERT-[A-Z2-7]{8}$/.test(code)) return apiError('Código de certificado inválido.', 404);
  const c = await getPrisma().certification.findUnique({ where: { code }, include: { course: { select: { title: true } }, user: { select: { name: true } } } });
  if (!c) return apiError('El código no corresponde a ningún certificado emitido por la Academia OpenV.', 404);
  return json({
    ok: true,
    certificate: {
      code: c.code,
      holder: c.user.name,
      course: c.course.title,
      courseVersion: c.courseVersion,
      score: c.score,
      issuedAt: c.issuedAt.toISOString(),
      expiresAt: c.expiresAt.toISOString(),
      valid: c.expiresAt > new Date(),
    },
  });
}
