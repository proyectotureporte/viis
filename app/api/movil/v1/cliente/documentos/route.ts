import { uploadDocumentAction } from '@/app/(plataforma)/cliente/documentos/actions';
import { clientContext, clienteDocumentos } from '@/lib/movil/cliente';
import { apiSession, bodyAsForm, handler, json, runAction } from '@/lib/movil/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Checklist por caso (estado, versión, motivo de rechazo), tipos para cargar y todo el expediente. */
export const GET = handler(async () => {
  const { person } = await clientContext();
  return json(await clienteDocumentos(person));
});

/** Carga un documento. MULTIPART: typeId, opportunityId?, file (PDF/JPG/PNG ≤ 10 MB). */
export const POST = handler(async (request: Request) => {
  await apiSession({ portal: 'cliente', permission: 'doc.upload' });
  return runAction(uploadDocumentAction, await bodyAsForm(request));
});
