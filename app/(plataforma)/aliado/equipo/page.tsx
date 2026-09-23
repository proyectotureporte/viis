import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AllyForm } from '@/components/aliado/AllyForm';
import { SubmitButton } from '@/components/ov/forms';
import { Empty, PageHeader, Status } from '@/components/ov/ui';
import { ACTIVE_STAGES, CLOSED_OK, isAllyAdmin, latestCertByCourse, NIL_UUID, personName } from '@/lib/aliado/scope';
import { bogotaMonthStart } from '@/lib/aliado/time';
import { milesTexto } from '@/lib/formato';
import { fecha, money, pct, toNumber } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { ALLY_ROLES, ROLE_LABELS } from '@/lib/security/rbac';
import { requireUser } from '@/lib/security/session';
import { inviteAllyAction, reassignCaseAction, setGoalAction } from './actions';

export const metadata: Metadata = { title: 'Equipo' };

export default async function EquipoPage() {
  const session = await requireUser({ portal: 'aliado', permission: 'case.assign' });
  if (!isAllyAdmin(session.user)) redirect('/aliado');
  const orgId = session.user.organizationId ?? NIL_UUID;
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

  return (
    <>
      <PageHeader title="Equipo" subtitle={`${org?.name ?? 'Tu organización'}: usuarios, metas, reparto de casos y consolidado.`} />

      <div className="ov-grid">
        <article className="ov-card s6">
          <h2>Meta mensual de la organización</h2>
          <p className="ov-big">{money(monthTotal, true)}</p>
          <p className="ov-sub">desembolsado este mes{goal ? ` · ${pct(monthTotal / goal, 0)} de ${money(goal, true)}` : ' · sin meta definida'}</p>
          {goal > 0 && <div className="al-kpi-bar" aria-hidden><i style={{ width: `${Math.min(100, (monthTotal / goal) * 100)}%` }} /></div>}
          <AllyForm action={setGoalAction} className="ov-inline" compact>
            <label className="ov-field"><span>Meta de desembolsos del mes (pesos)</span><input name="monthlyGoal" inputMode="numeric" defaultValue={milesTexto(goal)} placeholder="500.000.000" /></label>
            <SubmitButton className="ov-btn ov-btn--small">Guardar meta</SubmitButton>
          </AllyForm>
        </article>
        <article className="ov-card s6">
          <h2>Invitar a un aliado</h2>
          <p className="ov-meta" style={{ marginTop: -6 }}>Recibirá un enlace de activación válido por 72 horas. Podrá registrar clientes de inmediato; para radicar debe aprobar los cursos críticos.</p>
          <AllyForm action={inviteAllyAction} className="ov-form ov-form--2" resetOnSuccess>
            <label className="ov-field"><span>Nombre completo</span><input name="name" required maxLength={160} autoComplete="off" /></label>
            <label className="ov-field"><span>Correo</span><input name="email" type="email" required maxLength={320} autoComplete="off" /></label>
            <div className="full"><SubmitButton pendingText="Invitando…">Enviar invitación</SubmitButton></div>
          </AllyForm>
        </article>
      </div>

      <div className="ov-section">
        <h2>Consolidado por aliado</h2>
        <span className="ov-pill">Calidad y desistimiento pesan tanto como el volumen</span>
      </div>
      <article className="ov-card ov-tablewrap">
        <table className="ov-table">
          <thead>
            <tr>
              <th>Aliado</th>
              <th className="num">Casos activos</th>
              <th className="num">Desembolsado mes</th>
              <th className="num">Conversión</th>
              <th className="num">Calidad documental</th>
              <th className="num">Desistimiento</th>
              <th className="num">Comisión pendiente / pagada</th>
              <th>Certificación</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.name}</strong>
                  <small>{r.email} · {ROLE_LABELS[r.role]}</small>
                  <small>{!r.active ? 'Inactivo' : !r.passwordHash ? 'Invitación pendiente' : r.lastLoginAt ? `Último ingreso ${fecha(r.lastLoginAt)}` : 'Sin ingresos'}</small>
                </td>
                <td className="num">{r.openCases}<small>{r.total} en total</small></td>
                <td className="num ov-money">{money(r.month, true)}</td>
                <td className="num">{r.conversion === null ? '—' : pct(r.conversion, 0)}<small>{r.won} desembolsados</small></td>
                <td className="num">{r.docQuality === null ? '—' : pct(r.docQuality, 0)}<small>{r.reviewed ? `${r.reviewed} revisados` : 'sin revisiones'}</small></td>
                <td className="num">{r.withdrawal === null ? '—' : pct(r.withdrawal, 0)}</td>
                <td className="num">{money(r.pending, true)}<small>{money(r.paid, true)} pagada</small></td>
                <td>{r.blocking.length ? <Status tone="bad">Bloqueado: {r.blocking.map((c) => c.title).join(', ')}</Status> : critical.length ? <Status>Al día</Status> : <Status tone="gray">Sin cursos críticos</Status>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="ov-meta" style={{ marginBottom: 0 }}>Calidad documental: documentos aprobados sobre los revisados que cargó cada aliado. Un volumen alto con muchos rechazos o desistimientos es una señal para acompañar, no para premiar.</p>
      </article>

      <div className="ov-section"><h2>Reparto de casos activos</h2></div>
      {activeCases.length === 0 ? (
        <Empty>No hay casos activos para repartir.</Empty>
      ) : (
        <article className="ov-card ov-tablewrap">
          <table className="ov-table">
            <thead><tr><th>Caso</th><th>Responsable actual</th><th>Reasignar a</th></tr></thead>
            <tbody>
              {activeCases.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/aliado/clientes/${c.id}`}><strong>{personName(c.person)}</strong></Link><small>{c.code}</small></td>
                  <td>{members.find((m) => m.id === c.allyUserId)?.name ?? 'Sin asignar'}</td>
                  <td>
                    <AllyForm action={reassignCaseAction} className="al-reassign" compact>
                      <input type="hidden" name="opportunityId" value={c.id} />
                      <select name="allyUserId" defaultValue="" required aria-label={`Nuevo responsable de ${c.code}`}>
                        <option value="" disabled>Elige</option>
                        {assignable.filter((m) => m.id !== c.allyUserId).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                      <SubmitButton className="ov-btn ov-btn--secondary ov-btn--small" pendingText="…">Reasignar</SubmitButton>
                    </AllyForm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      )}
    </>
  );
}
