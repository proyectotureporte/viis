import { legalDocument } from '@/lib/legal';
import { apiError, json } from '@/lib/movil/http';

export const dynamic = 'force-dynamic';

/** Público: la app muestra la política y los términos en pantallas nativas, con el mismo texto de la web. */
export async function GET(_request: Request, { params }: { params: Promise<{ doc: string }> }): Promise<Response> {
  const doc = legalDocument((await params).doc);
  return doc ? json({ ok: true, document: doc }) : apiError('Documento no encontrado.', 404);
}
