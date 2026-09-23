import { Prisma } from '@/app/generated/prisma/client';
import { bogotaMonthStart } from '@/lib/empresa/params';
import { getPrisma } from '@/lib/prisma';

export interface AllyStats {
  orgId: string;
  cases: number;
  disbursed: number;
  withdrawn: number;
  disbursedSum: number;
  monthSum: number;
  docsFirstApproved: number;
  docsReviewed: number;
  conversion: number | null;
  withdrawalRate: number | null;
  docQuality: number | null;
  score: number | null;
}

/** Muestra mínima de casos para entrar al ranking con puntaje comparable. */
export const MIN_CASES_FOR_RANKING = 5;

/**
 * Puntaje responsable (0–100): 40 % conversión + 40 % calidad documental +
 * 20 % (1 − desistimiento). No incluye volumen para no premiar la presión comercial.
 */
export function responsibleScore(s: Pick<AllyStats, 'conversion' | 'docQuality' | 'withdrawalRate'>): number | null {
  if (s.conversion === null) return null;
  const quality = s.docQuality ?? 0;
  return Math.round((0.4 * s.conversion + 0.4 * quality + 0.2 * (1 - (s.withdrawalRate ?? 0))) * 100);
}

/** Indicadores agregados por organización aliada (consultas parametrizadas). */
export async function allyStats(orgId?: string): Promise<Map<string, AllyStats>> {
  const prisma = getPrisma();
  const monthStart = bogotaMonthStart();
  const orgFilter = orgId ? Prisma.sql`AND o."allyOrgId" = ${orgId}::uuid` : Prisma.empty;
  const [cases, docs] = await Promise.all([
    prisma.$queryRaw<Array<{ org: string; cases: number; disbursed: number; withdrawn: number; disbursed_sum: bigint; month_sum: bigint }>>`
      SELECT o."allyOrgId"::text AS org,
             COUNT(*)::int AS cases,
             COUNT(*) FILTER (WHERE o.stage IN ('DISBURSED', 'POSTSALE'))::int AS disbursed,
             COUNT(*) FILTER (WHERE o.stage = 'WITHDRAWN')::int AS withdrawn,
             COALESCE(SUM(o."disbursedAmount") FILTER (WHERE o.stage IN ('DISBURSED', 'POSTSALE')), 0)::bigint AS disbursed_sum,
             COALESCE(SUM(o."disbursedAmount") FILTER (WHERE EXISTS (
               SELECT 1 FROM stage_changes sc WHERE sc."opportunityId" = o.id AND sc."to" = 'DISBURSED' AND sc."createdAt" >= ${monthStart}
             )), 0)::bigint AS month_sum
        FROM opportunities o
       WHERE o."allyOrgId" IS NOT NULL ${orgFilter}
       GROUP BY o."allyOrgId"`,
    prisma.$queryRaw<Array<{ org: string; approved: number; reviewed: number }>>`
      SELECT o."allyOrgId"::text AS org,
             COUNT(*) FILTER (WHERE d.status IN ('APPROVED', 'EXPIRED'))::int AS approved,
             COUNT(*) FILTER (WHERE d.status IN ('APPROVED', 'EXPIRED', 'REJECTED'))::int AS reviewed
        FROM documents d
        JOIN opportunities o ON o.id = d."opportunityId"
       WHERE d.version = 1 AND o."allyOrgId" IS NOT NULL ${orgFilter}
       GROUP BY o."allyOrgId"`,
  ]);
  const out = new Map<string, AllyStats>();
  for (const c of cases) {
    const d = docs.find((x) => x.org === c.org);
    const s: AllyStats = {
      orgId: c.org,
      cases: c.cases,
      disbursed: c.disbursed,
      withdrawn: c.withdrawn,
      disbursedSum: Number(c.disbursed_sum),
      monthSum: Number(c.month_sum),
      docsFirstApproved: d?.approved ?? 0,
      docsReviewed: d?.reviewed ?? 0,
      conversion: c.cases ? c.disbursed / c.cases : null,
      withdrawalRate: c.cases ? c.withdrawn / c.cases : null,
      docQuality: d && d.reviewed ? d.approved / d.reviewed : null,
      score: null,
    };
    s.score = responsibleScore(s);
    out.set(c.org, s);
  }
  return out;
}
