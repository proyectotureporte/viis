'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ok, secureAction, UserError, zDate, zId, zMoney, zText } from '@/lib/actions';
import { zCheck, zMaybeText, zOptDecimal, zOptId, zOptInt, zOptPesos } from '@/lib/cliente/zod';
import { dbDate, todayBogota } from '@/lib/cliente/format';
import { clientAction, createServiceRequest, ownPerson } from '@/lib/cliente/server';
import { getPrisma } from '@/lib/prisma';
import { audit } from '@/lib/security/audit';
import { PROPERTY_KINDS } from './kinds';

const propertySchema = z.object({
  id: zOptId,
  alias: zText(80, 1, 'Ponle un nombre al inmueble (por ejemplo, "Apartamento Chapinero").'),
  address: zMaybeText(240),
  city: zMaybeText(120),
  kind: z.enum(Object.keys(PROPERTY_KINDS) as [string, ...string[]], { error: 'Elige el tipo de inmueble.' }),
  stratum: zOptInt(1, 6, 'El estrato va de 1 a 6.'),
  areaM2: zOptDecimal(100_000, 'Área inválida.'),
  isVis: zCheck,
});

export const savePropertyAction = clientAction(propertySchema, async (input, { session, meta, person }) => {
  const data = {
    alias: input.alias,
    address: input.address ?? null,
    city: input.city ?? null,
    kind: input.kind,
    stratum: input.stratum ?? null,
    areaM2: input.areaM2 !== undefined ? input.areaM2.toFixed(2) : null,
    isVis: input.isVis,
  };
  const saved = await getPrisma().$transaction(async (tx) => {
    if (input.id) {
      const before = await tx.property.findFirst({ where: { id: input.id, personId: person.id } });
      if (!before) throw new UserError('Inmueble no encontrado.');
      const property = await tx.property.update({ where: { id: before.id }, data });
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'property.updated', entity: 'Property', entityId: property.id, before: { ...before, areaM2: before.areaM2?.toString() ?? null }, after: data, ipHash: meta.ipHash }, tx);
      return property;
    }
    const property = await tx.property.create({ data: { ...data, personId: person.id } });
    await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'property.created', entity: 'Property', entityId: property.id, after: data, ipHash: meta.ipHash }, tx);
    return property;
  });
  revalidatePath('/cliente', 'layout');
  return ok(input.id ? 'Guardamos los cambios del inmueble.' : `Registramos "${saved.alias}". Ahora registra su valor estimado.`);
});

const valuationSchema = z.object({
  propertyId: zId,
  value: zMoney.pipe(z.number().min(10_000_000, 'Revisa el valor: parece muy bajo para una vivienda.')),
  low: zOptPesos,
  high: zOptPesos,
  asOf: zDate,
  basis: z.enum(['PERCEPCION', 'OFERTAS_ZONA', 'AVALUO_PREVIO', 'CATASTRAL', 'OTRO'], { error: 'Cuéntanos en qué te basas.' }),
  note: zMaybeText(400),
});

const BASIS: Record<string, string> = {
  PERCEPCION: 'Mi percepción del valor',
  OFERTAS_ZONA: 'Ofertas de inmuebles similares en la zona',
  AVALUO_PREVIO: 'Un avalúo anterior',
  CATASTRAL: 'Avalúo catastral (predial)',
  OTRO: 'Otra referencia',
};

/** Valor declarado: SIEMPRE con confianza DECLARED; nunca se presenta como avalúo oficial. */
export const declareValueAction = clientAction(valuationSchema, async (input, { session, meta, person }) => {
  if (input.asOf > todayBogota()) throw new UserError('La fecha del valor no puede ser futura.');
  if (input.low !== undefined && input.low > input.value) throw new UserError('El valor mínimo del rango no puede superar el valor declarado.');
  if (input.high !== undefined && input.high < input.value) throw new UserError('El valor máximo del rango no puede ser menor que el valor declarado.');
  await getPrisma().$transaction(async (tx) => {
    const property = await tx.property.findFirst({ where: { id: input.propertyId, personId: person.id }, select: { id: true } });
    if (!property) throw new UserError('Inmueble no encontrado.');
    const valuation = await tx.propertyValuation.create({
      data: {
        propertyId: property.id,
        value: BigInt(input.value),
        low: input.low !== undefined ? BigInt(input.low) : null,
        high: input.high !== undefined ? BigInt(input.high) : null,
        confidence: 'DECLARED',
        source: 'Declarado por el cliente',
        methodology: [BASIS[input.basis], input.note].filter(Boolean).join('. '),
        asOf: dbDate(input.asOf),
        createdById: session.user.id,
      },
    });
    await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'valuation.declared', entity: 'PropertyValuation', entityId: valuation.id, after: { propertyId: property.id, value: input.value, low: input.low, high: input.high, asOf: input.asOf, basis: input.basis }, ipHash: meta.ipHash }, tx);
  });
  revalidatePath('/cliente', 'layout');
  return ok('Registramos el valor declarado. Lo verás marcado como “declarado por ti”.');
});

export const requestAppraisalAction = secureAction(
  'request.create',
  z.object({ propertyId: zId, detail: zMaybeText(1000) }),
  async (input, { session, meta }) => {
    const code = await getPrisma().$transaction(async (tx) => {
      const person = await ownPerson(session, tx);
      const property = await tx.property.findFirst({ where: { id: input.propertyId, personId: person.id } });
      if (!property) throw new UserError('Inmueble no encontrado.');
      const open = await tx.serviceRequest.findFirst({
        where: { personId: person.id, subject: { startsWith: 'Avalúo comercial formal' }, status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_CLIENT'] } },
        select: { code: true },
      });
      if (open) throw new UserError(`Ya tienes una solicitud de avalúo en curso (${open.code}).`);
      const request = await createServiceRequest(
        tx,
        {
          personId: person.id,
          kind: 'ADVISOR',
          subject: `Avalúo comercial formal: ${property.alias}`.slice(0, 200),
          detail: [
            `El cliente solicita un avalúo comercial formal (avaluador inscrito en el RAA) del inmueble "${property.alias}"${property.city ? ` en ${property.city}` : ''}.`,
            input.detail ? `Comentario del cliente: ${input.detail}` : '',
          ].filter(Boolean).join('\n'),
        },
        { session, meta },
      );
      return request.code;
    });
    revalidatePath('/cliente', 'layout');
    return ok(`Solicitud ${code} creada. Un asesor te contactará para explicarte costo, tiempos y requisitos antes de agendar.`);
  },
);
