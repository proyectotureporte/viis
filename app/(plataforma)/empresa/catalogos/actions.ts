'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { Prisma } from '@/app/generated/prisma/client';
import { ok, secureAction, UserError, zCheckbox, zDate, zId, zOptText, zPercent, zText } from '@/lib/actions';
import { dbDate } from '@/lib/empresa/params';
import { PRODUCTS } from '@/lib/labels';
import { DOC_PRODUCT_CODES } from './constants';
import { getPrisma } from '@/lib/prisma';
import { audit } from '@/lib/security/audit';

function done(message: string) {
  revalidatePath('/empresa/catalogos');
  return ok(message);
}

const zInt = (min: number, max: number, message: string) =>
  z.union([z.string(), z.number()]).transform((v) => Number(String(v).trim())).pipe(z.number({ error: message }).int(message).min(min, message).max(max, message));
const zOptInt = (min: number, max: number, message: string) =>
  z.union([z.string(), z.number()]).optional()
    .transform((v) => (v === undefined || String(v).trim() === '' ? undefined : Number(String(v).trim())))
    .pipe(z.number({ error: message }).int(message).min(min, message).max(max, message).optional());

// ── Entidades ─────────────────────────────────────────────────────────

export const createEntityAction = secureAction(
  'catalog.manage',
  z.object({ name: zText(120, 2, 'Escribe el nombre de la entidad.'), agreement: zCheckbox, slaHours: zInt(1, 2000, 'SLA en horas entre 1 y 2000.'), notes: zOptText(2000) }),
  async (input, { session, meta }) => {
    await getPrisma().$transaction(async (tx) => {
      if (await tx.entity.findUnique({ where: { name: input.name } })) throw new UserError('Ya existe una entidad con ese nombre.');
      const entity = await tx.entity.create({ data: { name: input.name, agreement: input.agreement, slaHours: input.slaHours, notes: input.notes ?? null } });
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'catalog.entity_created', entity: 'Entity', entityId: entity.id, after: entity, ipHash: meta.ipHash }, tx);
    });
    return done('Entidad creada.');
  },
);

export const updateEntityAction = secureAction(
  'catalog.manage',
  z.object({ id: zId, active: zCheckbox, agreement: zCheckbox, slaHours: zInt(1, 2000, 'SLA en horas entre 1 y 2000.'), notes: zOptText(2000) }),
  async (input, { session, meta }) => {
    await getPrisma().$transaction(async (tx) => {
      const before = await tx.entity.findUnique({ where: { id: input.id } });
      if (!before) throw new UserError('La entidad no existe.');
      const after = await tx.entity.update({ where: { id: input.id }, data: { active: input.active, agreement: input.agreement, slaHours: input.slaHours, notes: input.notes ?? null } });
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'catalog.entity_updated', entity: 'Entity', entityId: input.id, before: { active: before.active, agreement: before.agreement, slaHours: before.slaHours, notes: before.notes }, after: { active: after.active, agreement: after.agreement, slaHours: after.slaHours, notes: after.notes }, ipHash: meta.ipHash }, tx);
    });
    return done('Entidad actualizada.');
  },
);

// ── Tasas de referencia ──────────────────────────────────────────────

const PRODUCT_CODES = Object.keys(PRODUCTS) as [string, ...string[]];

export const createRateAction = secureAction(
  'catalog.manage',
  z.object({
    entityId: z.union([zId, z.literal('')]).optional().transform((v) => v || null),
    product: z.enum(PRODUCT_CODES, { error: 'Elige el producto.' }),
    system: z.enum(['FIXED_PESOS', 'UVR'], { error: 'Elige el sistema.' }),
    rateEa: zPercent.refine((v) => v > 0 && v < 0.6, 'La tasa EA debe estar entre 0 % y 60 %.'),
    source: zText(200, 5, 'La fuente es obligatoria (p. ej. "Tasa publicada en web de la entidad, 23-sep-2026").'),
    asOf: zDate,
    validUntil: z.union([zDate, z.literal('')]).optional().transform((v) => v || null),
  }),
  async (input, { session, meta }) => {
    if (input.validUntil && input.validUntil < input.asOf) throw new UserError('La vigencia debe ser igual o posterior a la fecha de la tasa.');
    await getPrisma().$transaction(async (tx) => {
      if (input.entityId && !(await tx.entity.findUnique({ where: { id: input.entityId }, select: { id: true } }))) throw new UserError('La entidad no existe.');
      const rate = await tx.referenceRate.create({
        data: { entityId: input.entityId, product: input.product, system: input.system, rateEa: input.rateEa.toFixed(6), source: input.source, asOf: dbDate(input.asOf), validUntil: input.validUntil ? dbDate(input.validUntil) : null, createdById: session.user.id },
      });
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'catalog.rate_created', entity: 'ReferenceRate', entityId: rate.id, after: { entityId: input.entityId, product: input.product, system: input.system, rateEa: input.rateEa, source: input.source, asOf: input.asOf, validUntil: input.validUntil }, ipHash: meta.ipHash }, tx);
    });
    return done('Tasa de referencia registrada.');
  },
);

// ── Parámetros financieros ────────────────────────────────────────────

export const createParameterAction = secureAction(
  'catalog.manage',
  z.object({
    key: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,39}$/, 'La clave va en MAYÚSCULAS con guion bajo (p. ej. UVR).'),
    value: z.string().trim().transform((v) => Number(v.replace(/\s/g, '').replace(',', '.'))).pipe(z.number({ error: 'Valor numérico inválido.' }).finite('Valor numérico inválido.')),
    source: zText(200, 5, 'La fuente es obligatoria (p. ej. "Banco de la República, serie UVR").'),
    asOf: zDate,
  }),
  async (input, { session, meta }) => {
    // Inflación se escribe en porcentaje y se guarda como fracción; la UVR va en pesos.
    let value = input.value;
    if (input.key === 'INFLACION_PROYECTADA') {
      if (value <= -100 || value > 100) throw new UserError('La inflación proyectada debe escribirse en porcentaje (p. ej. 5,2).');
      value = value / 100;
    }
    if (input.key === 'UVR' && (value < 50 || value > 5000)) throw new UserError('El valor de la UVR parece fuera de rango (se escribe en pesos, p. ej. 389,5123).');
    if (Math.abs(value) >= 1e12) throw new UserError('Valor demasiado grande.');
    await getPrisma().$transaction(async (tx) => {
      const previous = await tx.financialParameter.findFirst({ where: { key: input.key }, orderBy: [{ asOf: 'desc' }, { createdAt: 'desc' }] });
      const param = await tx.financialParameter.create({ data: { key: input.key, value: value.toFixed(8), source: input.source, asOf: dbDate(input.asOf), createdById: session.user.id } });
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'catalog.parameter_created', entity: 'FinancialParameter', entityId: param.id, before: previous ? { value: previous.value.toString(), asOf: previous.asOf.toISOString().slice(0, 10) } : undefined, after: { key: input.key, value: value.toFixed(8), source: input.source, asOf: input.asOf }, ipHash: meta.ipHash }, tx);
    });
    return done(`Parámetro ${input.key} registrado.`);
  },
);

// ── Tipos documentales ────────────────────────────────────────────────


const zProducts = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]))
  .pipe(z.array(z.enum(DOC_PRODUCT_CODES as [string, ...string[]], { error: 'Producto inválido.' })));

const docTypeFields = {
  name: zText(160, 3, 'Escribe el nombre del tipo documental.'),
  description: zOptText(2000),
  validityDays: zOptInt(1, 3650, 'La vigencia va en días (1 a 3650) o vacía si no vence.'),
  products: zProducts,
  required: zCheckbox,
  active: zCheckbox,
  sortOrder: zInt(0, 10000, 'Orden entre 0 y 10000.'),
};

export const createDocTypeAction = secureAction(
  'catalog.manage',
  z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,39}$/, 'El código va en MAYÚSCULAS con guion bajo (p. ej. CERT_LABORAL).'), ...docTypeFields }),
  async (input, { session, meta }) => {
    await getPrisma().$transaction(async (tx) => {
      if (await tx.documentType.findUnique({ where: { code: input.code } })) throw new UserError('Ya existe un tipo documental con ese código.');
      const type = await tx.documentType.create({ data: { code: input.code, name: input.name, description: input.description ?? null, validityDays: input.validityDays ?? null, products: input.products, required: input.required, active: input.active, sortOrder: input.sortOrder } });
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'catalog.doctype_created', entity: 'DocumentType', entityId: type.id, after: type, ipHash: meta.ipHash }, tx);
    });
    return done('Tipo documental creado.');
  },
);

export const updateDocTypeAction = secureAction('catalog.manage', z.object({ id: zId, ...docTypeFields }), async (input, { session, meta }) => {
  await getPrisma().$transaction(async (tx) => {
    const before = await tx.documentType.findUnique({ where: { id: input.id } });
    if (!before) throw new UserError('El tipo documental no existe.');
    const after = await tx.documentType.update({ where: { id: input.id }, data: { name: input.name, description: input.description ?? null, validityDays: input.validityDays ?? null, products: input.products, required: input.required, active: input.active, sortOrder: input.sortOrder } });
    await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'catalog.doctype_updated', entity: 'DocumentType', entityId: input.id, before, after, ipHash: meta.ipHash }, tx);
  });
  return done('Tipo documental actualizado. Los cambios aplican a los checklists desde ahora.');
});

// ── Cursos de la academia ─────────────────────────────────────────────

export const updateCourseAction = secureAction(
  'catalog.manage',
  z.object({
    id: zId,
    active: zCheckbox,
    critical: zCheckbox,
    mandatory: zCheckbox,
    validityDays: zInt(1, 3650, 'La vigencia va en días (1 a 3650).'),
    passScore: zInt(1, 100, 'El puntaje mínimo va de 1 a 100.'),
  }),
  async (input, { session, meta }) => {
    await getPrisma().$transaction(async (tx) => {
      const before = await tx.course.findUnique({ where: { id: input.id }, select: { active: true, critical: true, mandatory: true, validityDays: true, passScore: true } });
      if (!before) throw new UserError('El curso no existe.');
      await tx.course.update({ where: { id: input.id }, data: { active: input.active, critical: input.critical, mandatory: input.mandatory, validityDays: input.validityDays, passScore: input.passScore } });
      const { id: _id, ...after } = input;
      void _id;
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'catalog.course_updated', entity: 'Course', entityId: input.id, before, after, ipHash: meta.ipHash }, tx);
    });
    return done('Curso actualizado.');
  },
);

const lessonSchema = z.object({
  title: z.string().trim().min(3, 'Cada lección necesita título.').max(160),
  body: z.array(z.string().trim().min(1, 'Hay un párrafo vacío en una lección.').max(4000)).min(1, 'Cada lección necesita al menos un párrafo.'),
}).strict();
const questionSchema = z.object({
  q: z.string().trim().min(5, 'Cada pregunta necesita enunciado.').max(500),
  options: z.array(z.string().trim().min(1, 'Hay una opción vacía.').max(300)).min(2, 'Cada pregunta necesita al menos dos opciones.').max(8),
  answer: z.number().int('La respuesta es el índice (0, 1, 2…) de la opción correcta.').min(0),
}).strict().refine((q) => q.answer < q.options.length, 'La respuesta debe ser el índice de una opción existente (empieza en 0).');
const contentSchema = z.object({
  lessons: z.array(lessonSchema).min(1, 'El curso necesita al menos una lección.').max(50),
  quiz: z.array(questionSchema).min(1, 'La evaluación necesita al menos una pregunta.').max(50),
});

export const updateCourseContentAction = secureAction(
  'catalog.manage',
  z.object({ id: zId, title: zText(160, 3), summary: zText(2000, 10, 'El resumen debe tener al menos 10 caracteres.'), content: z.string().max(200_000, 'El contenido es demasiado grande.') }),
  async (input, { session, meta }) => {
    let raw: unknown;
    try {
      raw = JSON.parse(input.content);
    } catch {
      throw new UserError('El contenido no es JSON válido. Revisa comas, comillas y corchetes.');
    }
    const parsed = contentSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new UserError(`Contenido inválido en ${issue?.path.join('.') || 'la raíz'}: ${issue?.message ?? 'revisa la estructura'}.`);
    }
    const version = await getPrisma().$transaction(async (tx) => {
      const before = await tx.course.findUnique({ where: { id: input.id }, select: { version: true, title: true, lessons: true, quiz: true } });
      if (!before) throw new UserError('El curso no existe.');
      const updated = await tx.course.update({
        where: { id: input.id },
        data: { title: input.title, summary: input.summary, lessons: parsed.data.lessons as Prisma.InputJsonValue, quiz: parsed.data.quiz as Prisma.InputJsonValue, version: before.version + 1 },
      });
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'catalog.course_content_updated', entity: 'Course', entityId: input.id, before: { version: before.version, title: before.title, lessons: before.lessons, quiz: before.quiz }, after: { version: updated.version, title: updated.title, lessons: parsed.data.lessons, quiz: parsed.data.quiz }, ipHash: meta.ipHash }, tx);
      return updated.version;
    });
    return done(`Contenido guardado como versión ${version}. Las certificaciones nuevas quedarán ligadas a esta versión.`);
  },
);
