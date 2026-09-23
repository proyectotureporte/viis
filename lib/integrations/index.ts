/**
 * Capa de integración (spec §12). Cada proveedor externo se conecta detrás de
 * una interfaz estable; el núcleo nunca habla directo con un banco o proveedor.
 *
 * Estado en producción:
 *  - Mensajería por correo: ACTIVA (SMTP del buzón de viis.app, vía cola `jobs`).
 *  - Bancos, firma digital, centrales, Open Finance, pagos y avalúos: modo MANUAL.
 *    La especificación prohíbe integraciones bancarias profundas no confirmadas
 *    contractualmente (§15 "No incluir en la primera salida"). Cada caso se
 *    gestiona por la consola con evidencia; al firmar un convenio se implementa
 *    el adaptador correspondiente sin tocar el núcleo.
 */

export type IntegrationMode = 'ACTIVE' | 'MANUAL';

export interface BankAdapter {
  entity: string;
  mode: IntegrationMode;
  /** Radica el expediente; devuelve la referencia de la entidad. */
  file(caseCode: string, payload: Record<string, unknown>): Promise<{ reference: string }>;
  /** Consulta el estado de una radicación. */
  status(reference: string): Promise<{ stage: string; detail?: string }>;
}

export interface SignatureAdapter {
  mode: IntegrationMode;
  requestSignature(documentId: string, signerEmail: string): Promise<{ envelopeId: string }>;
}

export interface CreditBureauAdapter {
  mode: IntegrationMode;
  /** Requiere consentimiento CENTRALES vigente; el llamador debe verificarlo. */
  consult(personId: string): Promise<{ score?: number; reportRef: string }>;
}

export interface OpenFinanceAdapter {
  mode: IntegrationMode;
  confirmPayment(loanId: string, paidOn: string, amount: number): Promise<{ matched: boolean; reference?: string }>;
}

export const INTEGRATIONS: Array<{ name: string; purpose: string; priority: string; mode: IntegrationMode; how: string }> = [
  { name: 'Correo transaccional', purpose: 'Notificaciones, verificación y alertas', priority: 'Alta', mode: 'ACTIVE', how: 'SMTP (contacto@viis.app) con cola y reintentos' },
  { name: 'Entidades financieras', purpose: 'Radicación, estados, tasas y desembolso', priority: 'Alta', mode: 'MANUAL', how: 'Etapas y ofertas registradas por el equipo con soporte' },
  { name: 'Identidad y firma', purpose: 'Evidencia de aceptación', priority: 'Alta', mode: 'MANUAL', how: 'Aceptación registrada con evidencia (fecha, datos vistos, hash de conexión)' },
  { name: 'Centrales de información', purpose: 'Perfilamiento con consentimiento', priority: 'Alta', mode: 'MANUAL', how: 'Consulta por la entidad con autorización CENTRALES registrada' },
  { name: 'Open Finance', purpose: 'Confirmación automática de pagos', priority: 'Evolutiva', mode: 'MANUAL', how: 'Validación humana de soportes y conciliación' },
  { name: 'Avalúos y datos inmobiliarios', purpose: 'Valor estimado y avalúo formal', priority: 'Media', mode: 'MANUAL', how: 'Valoraciones con fuente, rango y nivel de confianza' },
  { name: 'Calendario', purpose: 'Citas y asesoría', priority: 'Media', mode: 'ACTIVE', how: 'Exportación .ics desde la agenda' },
];
