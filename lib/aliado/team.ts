import { ACTIVE_STAGES, CLOSED_OK, latestCertByCourse, NIL_UUID } from '@/lib/aliado/scope';
import { bogotaMonthStart } from '@/lib/aliado/time';
import { toNumber } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { ALLY_ROLES } from '@/lib/security/rbac';
import type { SessionUser } from '@/lib/security/session';

/** Consolidado del equipo de una organización aliada (web y app móvil usan lo mismo). */
export async function loadTeam(user: Pick<SessionUser, 'organizationId'>) {
  const orgId = user.organizationId ?? NIL_UUID;
  const prisma = getPrisma();
  const monthStart = bogotaMonthStart();

  const [org, members, stageCounts, monthDisbursed, commissionSums, docStats, critical, activeCases] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId } }),
    prisma.user.findMany({
      where: { organizationId: orgId, role: { in: ALLY_ROLES } },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, email: true, role: true, active: true, lastLoginAt: true, passwordHash: true, certifications: { select: { courseId: true, expiresAt: true } } },
    }),
    prisma.opportunity.groupBy({ by: ['allyUserId', 'stage'], where: { allyOrgId: orgId }, _count: true }),
    prisma.stageChange.findMany({
      where: { to: 'DISBURSED', createdAt: { gte: monthStart }, opportunity: { allyOrgId: orgId } },
      select: { opportunity: { select: { id: true, allyUserId: true, disbursedAmount: true } } },
    }),
    prisma.commission.groupBy({ by: ['allyUserId', 'status'], where: { allyOrgId: orgId }, _sum: { net: true } }),
    prisma.document.groupBy({ by: ['uploadedById', 'status'], where: { opportunity: { allyOrgId: orgId }, status: { in: ['APPROVED', 'REJECTED'] } }, _count: true }),
    prisma.course.findMany({ where: { active: true, critical: true }, select: { id: true, title: true } }),
    prisma.opportunity.findMany({
      where: { allyOrgId: orgId, stage: { in: ACTIVE_STAGES } },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      select: { id: true, code: true, allyUserId: true, person: { select: { firstName: true, lastName: true } } },
    }),
  ]);

  const disbursedByUser = new Map<string, number>();
  const seen = new Set<string>();
  for (const change of monthDisbursed) {
    const o = change.opportunity;
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    const key = o.allyUserId ?? '';
    disbursedByUser.set(key, (disbursedByUser.get(key) ?? 0) + toNumber(o.disbursedAmount));
  }
  const now = new Date();
  const rows = members.map((m) => {
    const counts = stageCounts.filter((s) => s.allyUserId === m.id);
    const total = counts.reduce((s, c) => s + c._count, 0);
    const openCases = counts.filter((c) => ACTIVE_STAGES.includes(c.stage)).reduce((s, c) => s + c._count, 0);
    const won = counts.filter((c) => CLOSED_OK.includes(c.stage)).reduce((s, c) => s + c._count, 0);
    const lost = counts.find((c) => c.stage === 'WITHDRAWN')?._count ?? 0;
    const approvedDocs = docStats.find((d) => d.uploadedById === m.id && d.status === 'APPROVED')?._count ?? 0;
    const rejectedDocs = docStats.find((d) => d.uploadedById === m.id && d.status === 'REJECTED')?._count ?? 0;
    const reviewed = approvedDocs + rejectedDocs;
    const commissions = commissionSums.filter((c) => c.allyUserId === m.id);
    const paid = commissions.filter((c) => c.status === 'PAID').reduce((s, c) => s + toNumber(c._sum.net), 0);
    const pending = commissions.filter((c) => ['CAUSED', 'APPROVED', 'SCHEDULED'].includes(c.status)).reduce((s, c) => s + toNumber(c._sum.net), 0);
    const certs = latestCertByCourse(m.certifications);
    const blocking = critical.filter((c) => !(certs.get(c.id)?.expiresAt && certs.get(c.id)!.expiresAt > now));
    return {
      ...m,
      total,
      openCases,
      won,
      conversion: total ? won / total : null,
      withdrawal: total ? lost / total : null,
      docQuality: reviewed ? approvedDocs / reviewed : null,
      reviewed,
      month: disbursedByUser.get(m.id) ?? 0,
      paid,
      pending,
      blocking,
    };
  });
  const goal = toNumber(org?.monthlyGoal);
  const monthTotal = [...disbursedByUser.values()].reduce((a, b) => a + b, 0);
  const assignable = members.filter((m) => m.active && m.passwordHash);

  return { org, members, rows, critical, activeCases, goal, monthTotal, assignable };
}
