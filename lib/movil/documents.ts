import { appUrl } from '@/lib/mail';
import { LINK_TTL_MS, temporaryDocumentUrl } from '@/lib/storage';
import type { DocumentLinkResponse } from './contract';
import { ApiError } from './http';

/**
 * Enlace firmado a un documento YA autorizado por el llamador (null = sin
 * acceso o inexistente: ambos responden 404, sin revelar cuál). La descarga
 * en `/api/documentos/{id}` vuelve a verificar sesión, firma y acceso.
 */
export function documentLink(doc: { id: string; status: string; scanResult: string } | null, userId: string): DocumentLinkResponse {
  if (!doc) throw new ApiError('Documento no encontrado.', 404);
  if (doc.status === 'QUARANTINED' || doc.scanResult !== 'CLEAN') {
    throw new ApiError('El documento está en verificación antivirus. Inténtalo más tarde.', 423);
  }
  const now = Date.now();
  const url = temporaryDocumentUrl(doc.id, userId, now);
  return { ok: true, url, absoluteUrl: appUrl(url), expiresAt: new Date(now + LINK_TTL_MS).toISOString(), mimeType: 'application/pdf' };
}
