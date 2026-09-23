import { z } from 'zod';
import { zCheckbox, zOptMoney, zOptText, zText } from '@/lib/actions';
import { CONSENT_PURPOSES } from '@/lib/consent';
import { PRODUCTS } from '@/lib/labels';

/** Esquema común del alta de persona + caso por un asesor (casos/nuevo y conversión de leads). */

export const DOC_TYPES = ['CC', 'CE', 'PA', 'PPT', 'NIT'] as const;
export const CAPTURE_CHANNELS = { PRESENCIAL: 'Presencial', TELEFONICO: 'Telefónico (verbal)', VIRTUAL: 'Virtual (videollamada o chat)' } as const;

const consentCodes = CONSENT_PURPOSES.map((p) => p.code) as [string, ...string[]];
const optUuid = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined))
  .pipe(z.string().uuid('Selección inválida.').optional());

export const personCaseSchema = z.object({
  documentType: z.enum(DOC_TYPES, { error: 'Elige el tipo de documento.' }),
  documentNumber: z.string().trim().regex(/^[0-9A-Za-z.\- ]{4,20}$/, 'Número de documento inválido.'),
  firstName: zText(120, 2, 'Escribe los nombres.'),
  lastName: zText(120, 2, 'Escribe los apellidos.'),
  email: z
    .string()
    .trim()
    .max(320)
    .optional()
    .transform((v) => (v ? v.toLowerCase() : undefined))
    .pipe(z.email('Correo inválido.').optional()),
  phone: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined)
    .pipe(z.string().regex(/^[+()\d\s.-]{7,20}$/, 'Teléfono inválido.').optional()),
  city: zOptText(120),
  monthlyIncome: zOptMoney,
  product: z.enum(Object.keys(PRODUCTS) as [string, ...string[]], { error: 'Elige el producto.' }),
  amount: zOptMoney,
  entityId: optUuid,
  assigneeId: optUuid,
  nextAction: zOptText(240),
  consents: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]))
    .pipe(z.array(z.enum(consentCodes)))
    .refine((list) => list.includes('TRATAMIENTO'), 'La autorización de tratamiento de datos es obligatoria para crear el expediente.'),
  captureChannel: z.enum(Object.keys(CAPTURE_CHANNELS) as [keyof typeof CAPTURE_CHANNELS, ...Array<keyof typeof CAPTURE_CHANNELS>], { error: 'Indica cómo se capturó la autorización.' }),
  declaration: zCheckbox.refine((v) => v, 'Debes declarar que el cliente otorgó las autorizaciones.'),
});

export type PersonCaseInput = z.infer<typeof personCaseSchema>;
