import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { getSession } from '@/lib/security/session';
import { temporaryDocumentUrl } from '@/lib/storage';

/**
 * "Ver documento" del portal cliente: verifica sesión y propiedad y redirige
 * a un enlace firmado de 5 minutos, generado en el momento del clic.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  // Redirecciones relativas: detrás del proxy `request.url` puede ser el host interno.
  if (!session || !session.mfaPassed) return new NextResponse(null, { status: 303, headers: { Location: '/ingresar', 'Cache-Control': 'no-store' } });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse('Documento no encontrado.', { status: 404 });
  const doc = await getPrisma().document.findFirst({
    where: { id, person: { userId: session.user.id } },
    select: { id: true, status: true, scanResult: true },
  });
  if (!doc) return new NextResponse('Documento no encontrado.', { status: 404 });
  if (doc.status === 'QUARANTINED' || doc.scanResult !== 'CLEAN') {
    return new NextResponse('El documento está en verificación antivirus. Inténtalo más tarde.', { status: 423 });
  }
  return new NextResponse(null, { status: 303, headers: { Location: temporaryDocumentUrl(doc.id, session.user.id), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
