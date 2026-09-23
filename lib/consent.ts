import type { Prisma } from '@/app/generated/prisma/client';
import { sha256 } from './security/crypto';

/**
 * Textos de autorización versionados. Cada consentimiento guarda la versión y
 * el hash exacto del texto que la persona vio: esa es la prueba que exige la
 * Ley 1581 de 2012 (art. 9) y el Decreto 1074 de 2015.
 *
 * ⚠️ Estos textos deben ser validados por el abogado de OpenV antes de operar
 * con clientes reales (así lo exige la especificación, §13). Para cambiarlos:
 * subir la versión; los consentimientos previos conservan la suya.
 */

export const CONSENT_VERSION = '2026-09-23';

export interface ConsentPurpose {
  code: string;
  title: string;
  text: string;
  required: boolean;
}

export const CONSENT_PURPOSES: ConsentPurpose[] = [
  {
    code: 'TRATAMIENTO',
    title: 'Tratamiento de datos personales',
    required: true,
    text:
      'Autorizo a OpenV, como responsable, a recolectar, almacenar, usar y actualizar mis datos personales, incluidos datos financieros, para: crear y administrar mi cuenta y mi expediente; analizar mi crédito de vivienda y mi inmueble; elaborar simulaciones y comparaciones; gestionar las solicitudes que yo inicie; y cumplir obligaciones legales. Conozco que tengo derecho a conocer, actualizar, rectificar y suprimir mis datos y a revocar esta autorización, en los términos de la Ley 1581 de 2012 y la Política de Tratamiento publicada en /legal/privacidad. Los datos sensibles y los de menores son de respuesta facultativa.',
  },
  {
    code: 'ENTIDADES',
    title: 'Compartir mi expediente con entidades financieras',
    required: false,
    text:
      'Autorizo a OpenV a transmitir mi expediente (identificación, datos del crédito, del inmueble, ingresos y documentos) a las entidades financieras que yo elija o acepte, únicamente para estudiar, radicar y gestionar mi solicitud de crédito, compra de cartera o modificación de condiciones.',
  },
  {
    code: 'CENTRALES',
    title: 'Consulta en centrales de información financiera',
    required: false,
    text:
      'Autorizo de manera previa, expresa e informada a OpenV y a las entidades financieras a las que se radique mi solicitud a consultar mi información financiera, crediticia y comercial en centrales de información (Ley 1266 de 2008 y Ley 2157 de 2021), exclusivamente para evaluar la viabilidad de mi solicitud.',
  },
  {
    code: 'COMUNICACIONES',
    title: 'Comunicaciones sobre mi crédito y beneficios',
    required: false,
    text:
      'Autorizo a OpenV a enviarme por correo electrónico, mensajes de texto o WhatsApp alertas sobre mi crédito, recordatorios, contenidos educativos y ofertas relacionadas con mi vivienda. Puedo retirar esta autorización en cualquier momento desde Mi cuenta.',
  },
];

export function consentText(code: string): ConsentPurpose {
  const purpose = CONSENT_PURPOSES.find((p) => p.code === code);
  if (!purpose) throw new Error(`Finalidad de consentimiento desconocida: ${code}`);
  return purpose;
}

export function consentRecords(
  personId: string,
  codes: string[],
  evidence: { channel: string; capturedBy?: string; ipHash?: string; userAgent?: string },
): Prisma.ConsentCreateManyInput[] {
  return codes.map((code) => {
    const purpose = consentText(code);
    return {
      personId,
      purpose: code,
      textVersion: CONSENT_VERSION,
      textHash: sha256(`${CONSENT_VERSION}:${purpose.text}`),
      channel: evidence.channel,
      capturedBy: evidence.capturedBy,
      ipHash: evidence.ipHash,
      userAgent: evidence.userAgent,
    };
  });
}

/** Número de documento normalizado para el índice ciego (sin puntos ni espacios). */
export function normalizeDocument(type: string, number: string): string {
  return `${type.toUpperCase()}:${number.replace(/[^0-9A-Za-z]/g, '').toUpperCase()}`;
}
