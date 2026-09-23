import { Prisma } from '@/app/generated/prisma/client';
import { STAGE_SLA_HOURS } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';

/**
 * Consultas agregadas de la analítica. Todo SQL va en plantillas etiquetadas
 * ($queryRaw`…`): los valores viajan como parámetros, nunca concatenados.
 * Los conteos se castean a ::int y los promedios a ::float8 para no recibir BigInt.
 */

/** Índice en el embudo: POSTSALE cuenta como desembolsado; WITHDRAWN no avanza. */
const STAGE_INDEX = Prisma.sql`CASE sc."to"::text
  WHEN 'LEAD' THEN 1 WHEN 'CONTACTED' THEN 2 WHEN 'PROFILED' THEN 3 WHEN 'DOCUMENTING' THEN 4
  WHEN 'FILED' THEN 5 WHEN 'APPROVED' THEN 6 WHEN 'SIGNED' THEN 7 WHEN 'DISBURSED' THEN 8 WHEN 'POSTSALE' THEN 8 ELSE NULL END`;

/** Casos creados en el rango con la etapa más avanzada alcanzada (según StageChange). */
function casesCte(start: Date, end: Date) {
  return Prisma.sql`WITH c AS (
    SELECT o.id, o.channel, o."allyOrgId", o."entityId", o."disbursedAmount",
           COALESCE(MAX(${STAGE_INDEX}), 1) AS idx,
           BOOL_OR(sc."to"::text = 'WITHDRAWN') AS withdrawn
    FROM opportunities o
    LEFT JOIN stage_changes sc ON sc."opportunityId" = o.id
    WHERE o."createdAt" >= ${start} AND o."createdAt" < ${end}
    GROUP BY o.id
  )`;
}

export async function funnel(start: Date, end: Date) {
  const rows = await getPrisma().$queryRaw<Array<{ idx: number; n: number; withdrawn: number }>>`
    ${casesCte(start, end)}
    SELECT idx::int AS idx, COUNT(*)::int AS n, COUNT(*) FILTER (WHERE withdrawn)::int AS withdrawn FROM c GROUP BY idx`;
  return rows;
}

export interface ConversionRow {
  dim: 'channel' | 'ally' | 'entity';
  key: string | null;
  total: number;
  filed: number;
  disbursed: number;
  disbursedAmount: number;
}

export async function conversion(start: Date, end: Date): Promise<ConversionRow[]> {
  const rows = await getPrisma().$queryRaw<Array<{ gc: number; ga: number; channel: string | null; ally: string | null; entity: string | null; total: number; filed: number; disbursed: number; amount: number | null }>>`
    ${casesCte(start, end)}
    SELECT GROUPING(c.channel)::int AS gc, GROUPING(c."allyOrgId")::int AS ga,
           c.channel, c."allyOrgId"::text AS ally, c."entityId"::text AS entity,
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE idx >= 5)::int AS filed,
           COUNT(*) FILTER (WHERE idx >= 8)::int AS disbursed,
           COALESCE(SUM(c."disbursedAmount") FILTER (WHERE idx >= 8), 0)::float8 AS amount
    FROM c
    GROUP BY GROUPING SETS ((c.channel), (c."allyOrgId"), (c."entityId"))`;
  return rows.map((r) => ({
    dim: r.gc === 0 ? 'channel' : r.ga === 0 ? 'ally' : 'entity',
    key: r.gc === 0 ? r.channel : r.ga === 0 ? r.ally : r.entity,
    total: r.total,
    filed: r.filed,
    disbursed: r.disbursed,
    disbursedAmount: r.amount ?? 0,
  }));
}

export interface StageTimeRow {
  stage: string;
  n: number;
  avgH: number;
  medH: number;
  withSla: number;
  withinSla: number;
}

/** Tiempo en cada etapa = diferencia entre un cambio de etapa y el siguiente del mismo caso; se cuentan las etapas que se cerraron en el rango. */
export async function stageTimes(start: Date, end: Date): Promise<StageTimeRow[]> {
  const sla = Object.entries(STAGE_SLA_HOURS).map(([stage, hours]) => Prisma.sql`(${stage}::text, ${hours}::int)`);
  return getPrisma().$queryRaw<StageTimeRow[]>`
    WITH s AS (
      SELECT sc."to"::text AS stage, sc."createdAt" AS started,
             LEAD(sc."createdAt") OVER (PARTITION BY sc."opportunityId" ORDER BY sc."createdAt", sc.id) AS ended
      FROM stage_changes sc
    ), d AS (
      SELECT s.stage, EXTRACT(EPOCH FROM (s.ended - s.started)) / 3600.0 AS hours, sla.h
      FROM s LEFT JOIN (VALUES ${Prisma.join(sla)}) AS sla(stage, h) ON sla.stage = s.stage
      WHERE s.ended >= ${start} AND s.ended < ${end}
    )
    SELECT stage, COUNT(*)::int AS n, AVG(hours)::float8 AS "avgH",
           (percentile_cont(0.5) WITHIN GROUP (ORDER BY hours))::float8 AS "medH",
           COUNT(*) FILTER (WHERE h IS NOT NULL)::int AS "withSla",
           COUNT(*) FILTER (WHERE h IS NOT NULL AND hours <= h)::int AS "withinSla"
    FROM d GROUP BY stage`;
}

export async function paymentTimes(start: Date, end: Date) {
  const [row] = await getPrisma().$queryRaw<Array<{ n: number; avgH: number | null }>>`
    SELECT COUNT(*)::int AS n, AVG(EXTRACT(EPOCH FROM ("reviewedAt" - "createdAt")) / 3600.0)::float8 AS "avgH"
    FROM payment_reports
    WHERE "reviewedAt" >= ${start} AND "reviewedAt" < ${end} AND status::text IN ('VALIDATED', 'RECONCILED', 'REJECTED')`;
  return row ?? { n: 0, avgH: null };
}

export const NORTH_KINDS: Record<string, string> = {
  PREPAGO: 'Abono validado',
  OFERTA: 'Oferta aceptada',
  CARTERA: 'Compra de cartera desembolsada',
  DIFICULTAD: 'Dificultad de pago atendida',
  DOCUMENTOS: 'Documentos del inmueble al día',
  DECISION: 'Decisión informada (escenario + solicitud)',
};

/**
 * Métrica norte (spec §14): % de hogares activos con al menos una acción
 * financiera beneficiosa y verificable en la ventana [windowStart, windowEnd).
 */
export async function northMetric(windowStart: Date, windowEnd: Date) {
  const prisma = getPrisma();
  const activeCte = Prisma.sql`active AS (
    SELECT p.id FROM persons p
    LEFT JOIN users u ON u.id = p."userId"
    WHERE u.active IS TRUE
       OR EXISTS (SELECT 1 FROM loans l WHERE l."personId" = p.id AND l.active)
       OR EXISTS (SELECT 1 FROM opportunities o WHERE o."personId" = p.id AND o.stage::text <> 'WITHDRAWN')
  )`;
  const [den] = await prisma.$queryRaw<Array<{ n: number }>>`WITH ${activeCte} SELECT COUNT(*)::int AS n FROM active`;
  const rows = await prisma.$queryRaw<Array<{ kind: string | null; n: number }>>`
    WITH ${activeCte}, acts AS (
      SELECT l."personId" AS pid, 'PREPAGO' AS kind
        FROM payment_reports pr JOIN loans l ON l.id = pr."loanId"
       WHERE pr.kind = 'PREPAYMENT' AND pr.status::text IN ('VALIDATED', 'RECONCILED')
         AND pr."reviewedAt" >= ${windowStart} AND pr."reviewedAt" < ${windowEnd}
      UNION ALL
      SELECT o."personId", 'OFERTA'
        FROM offers f JOIN opportunities o ON o.id = f."opportunityId"
       WHERE f."acceptedAt" >= ${windowStart} AND f."acceptedAt" < ${windowEnd}
      UNION ALL
      SELECT o."personId", 'CARTERA'
        FROM stage_changes sc JOIN opportunities o ON o.id = sc."opportunityId"
       WHERE o.product = 'PORTFOLIO_PURCHASE' AND sc."to"::text = 'DISBURSED'
         AND sc."createdAt" >= ${windowStart} AND sc."createdAt" < ${windowEnd}
      UNION ALL
      SELECT sr."personId", 'DIFICULTAD'
        FROM service_requests sr
       WHERE sr.kind = 'HARDSHIP' AND sr.status::text = 'RESOLVED'
         AND sr."updatedAt" >= ${windowStart} AND sr."updatedAt" < ${windowEnd}
      UNION ALL
      SELECT d."personId", 'DOCUMENTOS'
        FROM documents d JOIN document_types t ON t.id = d."typeId"
       WHERE t.code IN ('CTL', 'AVALUO', 'POLIZA') AND d.status::text = 'APPROVED'
         AND d."reviewedAt" >= ${windowStart} AND d."reviewedAt" < ${windowEnd}
      UNION ALL
      SELECT p.id, 'DECISION'
        FROM scenarios s JOIN persons p ON p."userId" = s."userId"
       WHERE s."createdAt" >= ${windowStart} AND s."createdAt" < ${windowEnd}
         AND EXISTS (SELECT 1 FROM service_requests sr WHERE sr."scenarioId" = s.id AND sr."personId" = p.id)
    )
    SELECT a.kind, COUNT(DISTINCT a.pid)::int AS n
      FROM acts a JOIN active ON active.id = a.pid
     GROUP BY ROLLUP (a.kind)`;
  const total = rows.find((r) => r.kind === null)?.n ?? 0;
  const byKind = Object.keys(NORTH_KINDS).map((kind) => ({ kind, label: NORTH_KINDS[kind], n: rows.find((r) => r.kind === kind)?.n ?? 0 }));
  return { denominator: den?.n ?? 0, numerator: total, byKind };
}
