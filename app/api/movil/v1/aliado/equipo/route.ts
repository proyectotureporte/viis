import { isAllyAdmin, personName } from '@/lib/aliado/scope';
import { loadTeam } from '@/lib/aliado/team';
import { ApiError, apiSession, handler, json } from '@/lib/movil/http';
import { ROLE_LABELS } from '@/lib/security/rbac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Consolidado del equipo (solo ALLY_ADMIN): meta, desempeño por aliado y casos para reasignar. */
export const GET = handler(async () => {
  const session = await apiSession({ portal: 'aliado', permission: 'case.assign' });
  if (!isAllyAdmin(session.user)) throw new ApiError('Solo el administrador de la organización ve el equipo.', 403);
  const team = await loadTeam(session.user);
  const nameOf = (id: string | null) => team.members.find((m) => m.id === id)?.name ?? null;
  return json({
    ok: true,
    organization: team.org ? { id: team.org.id, name: team.org.name } : null,
    goal: team.goal,
    monthTotal: team.monthTotal,
    hasCriticalCourses: team.critical.length > 0,
    members: team.rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      roleLabel: ROLE_LABELS[r.role],
      active: r.active,
      invitePending: !r.passwordHash,
      lastLoginAt: r.lastLoginAt?.toISOString() ?? null,
      openCases: r.openCases,
      totalCases: r.total,
      won: r.won,
      conversion: r.conversion,
      withdrawal: r.withdrawal,
      docQuality: r.docQuality,
      reviewedDocs: r.reviewed,
      disbursedMonth: r.month,
      commissionPending: r.pending,
      commissionPaid: r.paid,
      blockingCourses: r.blocking.map((c) => c.title),
    })),
    assignable: team.assignable.map((m) => ({ id: m.id, name: m.name })),
    activeCases: team.activeCases.map((c) => ({ id: c.id, code: c.code, client: personName(c.person), allyUserId: c.allyUserId, allyName: nameOf(c.allyUserId) })),
  });
});
