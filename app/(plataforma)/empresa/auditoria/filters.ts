import type { Prisma } from '@/app/generated/prisma/client';
import { bogotaDayEnd, bogotaDayStart, sp, spDate, type SearchParams } from '@/lib/empresa/params';
import { getPrisma } from '@/lib/prisma';

export interface AuditFilters {
  accion: string;
  entidad: string;
  id: string;
  actor: string;
  desde: string;
  hasta: string;
}

export function readAuditFilters(params: SearchParams): AuditFilters {
  return {
    accion: sp(params, 'accion').slice(0, 60),
    entidad: sp(params, 'entidad').slice(0, 40),
    id: sp(params, 'id').slice(0, 64),
    actor: sp(params, 'actor').slice(0, 320),
    desde: spDate(params, 'desde'),
    hasta: spDate(params, 'hasta'),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Traduce los filtros a un `where` de Prisma. El actor se acepta por correo o por id. */
export async function auditWhere(f: AuditFilters): Promise<Prisma.AuditEventWhereInput> {
  const where: Prisma.AuditEventWhereInput = {};
  if (f.accion) where.action = { contains: f.accion, mode: 'insensitive' };
  if (f.entidad) where.entity = f.entidad;
  if (f.id) where.entityId = f.id;
  if (f.actor) {
    if (UUID.test(f.actor)) where.actorId = f.actor;
    else {
      const user = await getPrisma().user.findUnique({ where: { email: f.actor.toLowerCase() }, select: { id: true } });
      where.actorId = user?.id ?? '00000000-0000-0000-0000-000000000000';
    }
  }
  if (f.desde || f.hasta) {
    where.at = {};
    if (f.desde) where.at.gte = bogotaDayStart(f.desde);
    if (f.hasta) where.at.lt = bogotaDayEnd(f.hasta);
  }
  return where;
}
