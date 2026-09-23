import { NextResponse } from 'next/server';
import { canAccessPerson } from '@/lib/domain/access';
import { winAnsi } from '@/lib/cliente/pdf';
import { fechaHora } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { audit } from '@/lib/security/audit';
import { requestMetaFrom } from '@/lib/security/request';
import { getSession } from '@/lib/security/session';
import { readDocument, validDocumentLink, watermarkedPdf } from '@/lib/storage';

export const dynamic = 'force-dynamic';

function deny(message: string, status: number) {
  return new NextResponse(message, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Type': 'text/plain; charset=utf-8' } });
}

/**
 * Descarga de documentos para TODOS los portales. Requiere sesión con MFA,
 * enlace firmado vigente (5 min, emitido para este usuario), acceso a la
 * persona y archivo limpio. Siempre sale como PDF con marca de agua.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session || !session.mfaPassed) return deny('Inicia sesión para ver este documento.', 401);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return deny('Documento no encontrado.', 404);

  const url = new URL(request.url);
  if (!validDocumentLink(id, session.user.id, url.searchParams.get('e'), url.searchParams.get('s'))) {
    return deny('El enlace venció o no es válido. Vuelve a abrir el documento desde la plataforma.', 403);
  }
  const doc = await getPrisma().document.findUnique({ where: { id }, include: { type: { select: { code: true, name: true } } } });
  if (!doc || !(await canAccessPerson(session, doc.personId))) return deny('Documento no encontrado.', 404);
  if (doc.status === 'QUARANTINED' || doc.scanResult !== 'CLEAN') {
    return deny('El documento está en verificación antivirus y no se puede abrir todavía.', 423);
  }

  let body: Uint8Array;
  try {
    const buffer = await readDocument(doc.storageKey);
    body = await watermarkedPdf(buffer, doc.mimeType, winAnsi(`Descargado por ${session.user.name} · ${fechaHora(new Date())} · OpenV`));
  } catch (error) {
    console.error('Descarga de documento fallida', { documentId: id, error: error instanceof Error ? error.message : 'desconocido' });
    return deny('No pudimos abrir el documento. Inténtalo de nuevo o escribe a contacto@viis.app.', 500);
  }

  const meta = requestMetaFrom(request);
  await audit({
    actorId: session.user.id,
    actorRole: session.user.role,
    action: 'document.viewed',
    entity: 'Document',
    entityId: doc.id,
    after: { type: doc.type.code, version: doc.version },
    ipHash: meta.ipHash,
  });

  const fileName = winAnsi(doc.fileName.replace(/\.[^.]+$/, '')).replace(/[^\w.\- ]/g, '_').slice(0, 120) || 'documento';
  return new NextResponse(Buffer.from(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${fileName}.pdf"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
