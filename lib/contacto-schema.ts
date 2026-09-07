import { z } from 'zod';

const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .optional()
    .transform((value) => value || undefined);

export const contactRequestSchema = z
  .object({
    name: z.string().trim().min(2, 'Escribe tu nombre.').max(120),
    email: optionalText(320).pipe(z.email('Escribe un correo válido.').optional()),
    phone: optionalText(30).pipe(
      z
        .string()
        .regex(/^[+()\d\s.-]{7,30}$/, 'Escribe un teléfono válido.')
        .optional(),
    ),
    city: optionalText(120),
    message: z.string().trim().min(10, 'Cuéntanos un poco más sobre tu caso.').max(4_000),
    source: z.string().trim().max(120).optional().default('web'),
    consent: z.literal(true, { error: 'Debes autorizar el uso de tus datos para responderte.' }),
    website: z.string().max(0).optional().default(''),
    startedAt: z.number().int().positive(),
  })
  .superRefine((value, context) => {
    if (!value.email && !value.phone) {
      context.addIssue({
        code: 'custom',
        path: ['phone'],
        message: 'Deja un teléfono o un correo para poder responderte.',
      });
    }
  });

export type ContactRequestInput = z.infer<typeof contactRequestSchema>;

export function firstValidationMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Revisa los datos del formulario.';
}
