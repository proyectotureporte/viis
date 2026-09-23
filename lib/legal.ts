import { CONSENT_PURPOSES, CONSENT_VERSION } from './consent';

/**
 * Documentos legales como datos: la web (/legal/*) y la app nativa
 * (GET /api/movil/v1/legal/[doc]) muestran EXACTAMENTE el mismo texto.
 */

export interface LegalSection {
  heading: string;
  paragraphs?: string[];
  bullets?: { title?: string; text: string }[];
}

export interface LegalDocument {
  slug: 'privacidad' | 'terminos';
  title: string;
  meta?: string;
  sections: LegalSection[];
}

/** Identificación del responsable. Se configura por entorno para no publicar datos sin validar. */
export function responsable() {
  return {
    nombre: process.env.LEGAL_NAME?.trim() || 'OpenV',
    nit: process.env.LEGAL_NIT?.trim(),
    domicilio: process.env.LEGAL_ADDRESS?.trim(),
    correo: process.env.LEGAL_EMAIL?.trim() || 'contacto@viis.app',
  };
}

export function privacyPolicy(): LegalDocument {
  const r = responsable();
  return {
    slug: 'privacidad',
    title: 'Política de tratamiento de datos personales',
    meta: `Versión ${CONSENT_VERSION} · Ley 1581 de 2012, Decreto 1074 de 2015 y Ley 1266 de 2008.`,
    sections: [
      {
        heading: '1. Responsable del tratamiento',
        paragraphs: [`${r.nombre}${r.nit ? `, NIT ${r.nit}` : ''}${r.domicilio ? `, con domicilio en ${r.domicilio}` : ''}. Correo para asuntos de datos personales: ${r.correo}.`],
      },
      {
        heading: '2. Datos que tratamos',
        paragraphs: ['Identificación y contacto; información de tu hogar, ingresos y gastos que declares; datos de tu crédito de vivienda y de tu inmueble; documentos que cargues; registros de uso y seguridad (fecha, dispositivo y un identificador irreversible de tu conexión, nunca tu IP en claro). Los datos de identificación y teléfono se guardan cifrados.'],
      },
      {
        heading: '3. Finalidades',
        bullets: CONSENT_PURPOSES.map((p) => ({ title: `${p.title}${p.required ? '' : ' (solo si la autorizas)'}`, text: p.text })),
      },
      {
        heading: '4. Tus derechos',
        paragraphs: ['Como titular puedes: conocer, actualizar y rectificar tus datos; solicitar prueba de la autorización; ser informado del uso que se les ha dado; presentar quejas ante la Superintendencia de Industria y Comercio; revocar la autorización y solicitar la supresión cuando no exista un deber legal o contractual de conservarlos; y acceder gratuitamente a tus datos.'],
      },
      {
        heading: '5. Cómo ejercerlos',
        paragraphs: [`Desde tu cuenta: Gestiones → Mis datos personales (habeas data), o escribiendo a ${r.correo}. Las consultas se responden en máximo diez (10) días hábiles y los reclamos en máximo quince (15) días hábiles, prorrogables en los términos del artículo 15 de la Ley 1581 de 2012. Las autorizaciones opcionales se pueden retirar en cualquier momento desde Mi cuenta.`],
      },
      {
        heading: '6. Transmisión y transferencia',
        paragraphs: ['Solo compartimos tu expediente con entidades financieras cuando lo autorizas expresamente y para gestionar tu solicitud. Nuestros proveedores de infraestructura y correo actúan como encargados bajo obligaciones de confidencialidad y seguridad. No vendemos datos personales.'],
      },
      {
        heading: '7. Seguridad',
        paragraphs: ['Aplicamos verificación en dos pasos obligatoria, cifrado en tránsito y en reposo, control de acceso por rol con mínimo privilegio, análisis antivirus de documentos, enlaces de descarga temporales con marca de agua y una bitácora de auditoría inalterable de consultas y cambios.'],
      },
      {
        heading: '8. Conservación',
        paragraphs: ['Conservamos la información mientras exista la relación contigo y durante los términos legales aplicables a la documentación comercial y financiera. Cumplido el término, se suprime o anonimiza de forma controlada. Los registros de auditoría se conservan íntegros como prueba.'],
      },
      {
        heading: '9. Simulaciones',
        paragraphs: ['Las simulaciones y recomendaciones de OpenV son ilustrativas y no constituyen una oferta vinculante ni una aprobación de crédito. Cada una indica sus supuestos, fuente, fecha y versión del motor de cálculo.'],
      },
      {
        heading: '10. Vigencia',
        paragraphs: ['Esta política rige desde su publicación. Los cambios sustanciales se informarán por los canales registrados; cada autorización conserva la versión del texto que aceptaste.'],
      },
    ],
  };
}

export function termsOfUse(): LegalDocument {
  const r = responsable();
  return {
    slug: 'terminos',
    title: 'Términos de uso de la plataforma OpenV',
    sections: [
      { heading: '1. Qué es OpenV', paragraphs: ['OpenV es una plataforma para entender, controlar y optimizar créditos de vivienda, y para gestionar solicitudes con entidades financieras con la participación de asesores y aliados comerciales. OpenV no es un establecimiento de crédito: la aprobación, tasa y condiciones de cualquier crédito las define la entidad financiera.'] },
      { heading: '2. Cuentas y seguridad', paragraphs: ['Cada cuenta es personal e intransferible y exige verificación en dos pasos. Eres responsable de custodiar tu contraseña, tu aplicación autenticadora y tus códigos de recuperación. Nunca te pediremos esos datos por teléfono, correo o mensajería.'] },
      { heading: '3. Información que registras', paragraphs: ['Te comprometes a registrar información veraz. Los datos que declaras se marcan como "declarados" y los cálculos que dependen de ellos lo indican. Reportar un pago en la plataforma no sustituye pagarle al acreedor ni garantiza su imputación.'] },
      { heading: '4. Simulaciones y recomendaciones', paragraphs: ['Las simulaciones son estimaciones no vinculantes basadas en los supuestos mostrados. Las recomendaciones indican los datos usados, la razón principal y la forma de solicitar revisión humana.'] },
      { heading: '5. Aliados comerciales', paragraphs: ['Los aliados solo pueden registrar clientes con su autorización expresa, deben mantener vigentes sus certificaciones y usar la información únicamente para la finalidad autorizada. Sus comisiones se liquidan según las reglas versionadas publicadas en su portal.'] },
      { heading: '6. Uso aceptable', paragraphs: ['No está permitido acceder a información de terceros sin autorización, intentar vulnerar la seguridad de la plataforma, cargar archivos maliciosos o usarla para fines distintos a la gestión de vivienda. Toda actividad queda registrada.'] },
      { heading: '7. Contacto', paragraphs: [`${r.nombre} · ${r.correo}`] },
    ],
  };
}

export function legalDocument(slug: string): LegalDocument | null {
  return slug === 'privacidad' ? privacyPolicy() : slug === 'terminos' ? termsOfUse() : null;
}
