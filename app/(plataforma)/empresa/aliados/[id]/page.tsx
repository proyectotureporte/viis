import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm, SubmitButton } from '@/components/ov/forms';
import { Empty, Kpi, Notice, PageHeader, Status } from '@/components/ov/ui';
import { fullName } from '@/lib/empresa/params';
import { fecha, fechaHora, money, pct, PRODUCTS, STAGE_LABELS, toNumber } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { ROLE_LABELS } from '@/lib/security/rbac';
import { requireUser } from '@/lib/security/session';
import { inviteAllyUserAction, resendAllyInviteAction, toggleAllyUserAction, updateAllyAction } from '../actions';
import { OrgForm } from '../OrgForm';
import { allyStats } from '../stats';

export const metadata: Metadata = { title: 'Ficha del aliado' };

const rate = (v: number | null) => (v === null ? 'Sin datos' : pct(v));

export default async function AliadoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser({ portal: 'empresa', permission: 'ally.manage' });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const prisma = getPrisma();
  const org = await prisma.organization.findFirst({
    where: { id, kind: { in: ['ALLY_PERSON', 'ALLY_COMPANY'] } },
    include: {
      users: {
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
        select: {
          id: true, name: true, email: true, role: true, active: true, passwordHash: true, totpEnabledAt: true, lastLoginAt: true, createdAt: true,
          certifications: { select: { courseId: true, expiresAt: true, issuedAt: true, score: true } },
          tokens: { where: { purpose: 'INVITE', usedAt: null }, select: { expiresAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
        },
      },
    },
  });
  if (!org) notFound();
  const [stats, courses, recentCases] = await Promise.all([
    allyStats(org.id),
    prisma.course.findMany({ where: { active: true, OR: [{ critical: true }, { mandatory: true }] }, orderBy: { sortOrder: 'asc' }, select: { id: true, title: true, critical: true, mandatory: true } }),
    prisma.opportunity.findMany({
      where: { allyOrgId: org.id },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: { id: true, code: true, product: true, stage: true, updatedAt: true, person: { select: { firstName: true, lastName: true } }, allyUser: { select: { name: true } } },
    }),
  ]);
  const s = stats.get(org.id);
  const now = new Date();
  const goal = toNumber(org.monthlyGoal);

  const certState = (user: (typeof org.users)[number], courseId: string) => {
    const certs = user.certifications.filter((c) => c.courseId === courseId);
    const valid = certs.find((c) => c.expiresAt > now);
    if (valid) return { tone: 'ok', text: `Vigente hasta ${fecha(valid.expiresAt)}`, ok: true };
    if (certs.length) return { tone: 'bad', text: `Vencida el ${fecha(certs.sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime())[0].expiresAt)}`, ok: false };
    return { tone: 'wait', text: 'Pendiente', ok: false };
  };

  return (
    <>
      <PageHeader
        title={org.name}
        subtitle={`${org.kind === 'ALLY_COMPANY' ? 'Aliado empresa' : 'Aliado persona natural'} · nivel ${org.tier}${org.territory ? ` · ${org.territory}` : ''}${org.taxId ? ` · NIT ${org.taxId}` : ''}`}
        actions={<Link className="ov-btn ov-btn--secondary" href="/empresa/aliados">← Aliados</Link>}
      />
      {!org.active && <Notice tone="danger">Este aliado está inactivo: no se le pueden invitar usuarios y sus sesiones se cerraron al inactivarlo. Para impedir el ingreso de un usuario, desactívalo abajo.</Notice>}

      <div className="ov-grid" style={{ marginTop: 16 }}>
        <Kpi label="Casos" value={String(s?.cases ?? 0)} sub={`${s?.disbursed ?? 0} desembolsados`} />
        <Kpi label="Conversión" value={rate(s?.conversion ?? null)} sub="desembolsados ÷ casos creados" />
        <Kpi label="Calidad documental" value={rate(s?.docQuality ?? null)} sub={`${s?.docsFirstApproved ?? 0} de ${s?.docsReviewed ?? 0} aprobados a la primera`} />
        <Kpi label="Desistimiento" value={rate(s?.withdrawalRate ?? null)} sub={`${s?.withdrawn ?? 0} casos desistidos`} />
        <Kpi label="Desembolsado total" value={money(s?.disbursedSum ?? 0, true)} span="s4" />
        <Kpi label="Desembolsos del mes" value={money(s?.monthSum ?? 0, true)} span="s4" sub={goal ? `${pct((s?.monthSum ?? 0) / goal, 0)} de la meta de ${money(goal, true)}` : 'Sin meta mensual'}>
          {goal > 0 && <div className="ov-bar" aria-hidden><i style={{ width: `${Math.min(100, ((s?.monthSum ?? 0) / goal) * 100)}%` }} /></div>}
        </Kpi>
        <Kpi label="Puntaje responsable" value={s?.score !== null && s?.score !== undefined ? String(s.score) : '—'} span="s4" sub="40 % conversión + 40 % calidad + 20 % (1 − desistimiento)" />
      </div>

      <div className="ov-grid">
        <article className="ov-card s12">
          <header><h2>Usuarios y certificaciones</h2><span className="ov-meta">{org.users.length} usuarios</span></header>
          {org.users.length === 0 ? (
            <Empty>Esta organización aún no tiene usuarios. Invita al primero con el formulario de abajo.</Empty>
          ) : (
            <div className="ov-tablewrap">
              <table className="ov-table" style={{ minWidth: 900 }}>
                <thead>
                  <tr>
                    <th>Usuario</th><th>Estado</th>
                    {courses.map((c) => <th key={c.id}>{c.title}{c.critical ? ' · crítico' : ''}</th>)}
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {org.users.map((u) => {
                    const states = courses.map((c) => ({ course: c, st: certState(u, c.id) }));
                    const blocked = states.some((x) => x.course.critical && !x.st.ok);
                    const invited = !u.passwordHash;
                    return (
                      <tr key={u.id} className={u.active && blocked ? 'ove-row-warn' : undefined}>
                        <td>{u.name}<small>{u.email}</small><small>{ROLE_LABELS[u.role]}</small></td>
                        <td>
                          {!u.active ? <Status tone="gray">Inactivo</Status> : invited ? <Status tone="info">Invitado</Status> : !u.totpEnabledAt ? <Status tone="wait">Sin 2FA</Status> : <Status>Activo</Status>}
                          {invited && u.tokens[0] && <small>Invitación {u.tokens[0].expiresAt > now ? `vence ${fechaHora(u.tokens[0].expiresAt)}` : 'vencida'}</small>}
                          {u.lastLoginAt && <small>Último ingreso {fechaHora(u.lastLoginAt)}</small>}
                          {u.active && blocked && <small className="ov-negative">Radicación bloqueada por certificación crítica</small>}
                        </td>
                        {states.map(({ course, st }) => <td key={course.id}><Status tone={st.tone}>{st.text}</Status></td>)}
                        <td style={{ minWidth: 220 }}>
                          <div style={{ display: 'grid', gap: 8 }}>
                            {invited && u.active && (
                              <ActionForm action={resendAllyInviteAction} className="ove-inline-form">
                                <input type="hidden" name="userId" value={u.id} />
                                <SubmitButton className="ov-btn ov-btn--secondary ov-btn--small">Reenviar invitación</SubmitButton>
                              </ActionForm>
                            )}
                            {u.active ? (
                              <details className="ove-details">
                                <summary>Desactivar</summary>
                                <ActionForm action={toggleAllyUserAction}>
                                  <input type="hidden" name="userId" value={u.id} />
                                  <input type="hidden" name="active" value="0" />
                                  <label className="ov-field"><span>Motivo</span><input name="reason" required minLength={5} maxLength={300} /></label>
                                  <SubmitButton className="ov-btn ov-btn--danger ov-btn--small">Desactivar y cerrar sesiones</SubmitButton>
                                </ActionForm>
                              </details>
                            ) : (
                              <ActionForm action={toggleAllyUserAction} className="ove-inline-form">
                                <input type="hidden" name="userId" value={u.id} />
                                <input type="hidden" name="active" value="1" />
                                <SubmitButton className="ov-btn ov-btn--secondary ov-btn--small">Reactivar</SubmitButton>
                              </ActionForm>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {courses.length === 0 && <p className="ov-meta">No hay cursos obligatorios o críticos activos en la academia.</p>}
          <p className="ov-meta" style={{ marginTop: 10 }}>Un curso crítico vencido o pendiente bloquea que los casos del aliado se radiquen ante la entidad.</p>
        </article>

        <article className="ov-card s6">
          <h2>Invitar usuario</h2>
          {org.active ? (
            <ActionForm action={inviteAllyUserAction} resetOnSuccess>
              <input type="hidden" name="organizationId" value={org.id} />
              <label className="ov-field"><span>Nombre completo</span><input name="name" required minLength={3} maxLength={160} /></label>
              <label className="ov-field"><span>Correo</span><input name="email" type="email" required maxLength={320} /></label>
              <label className="ov-field"><span>Rol</span>
                <select name="role" defaultValue="ALLY">
                  <option value="ALLY">{ROLE_LABELS.ALLY}</option>
                  <option value="ALLY_ADMIN">{ROLE_LABELS.ALLY_ADMIN}</option>
                </select>
              </label>
              <SubmitButton>Enviar invitación</SubmitButton>
            </ActionForm>
          ) : (
            <Empty>Activa el aliado para invitar usuarios.</Empty>
          )}
        </article>

        <article className="ov-card s6">
          <h2>Casos recientes</h2>
          {recentCases.length === 0 ? (
            <Empty>Este aliado todavía no ha registrado casos.</Empty>
          ) : (
            <div className="ov-list">
              {recentCases.map((c) => (
                <Link key={c.id} href={`/empresa/casos/${c.id}`} className="ov-row" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="grow">
                    <strong>{c.code} · {fullName(c.person)}</strong>
                    <small>{PRODUCTS[c.product] ?? c.product} · {c.allyUser?.name ?? 'Sin usuario'} · actualizado {fecha(c.updatedAt)}</small>
                  </div>
                  <Status tone={c.stage === 'WITHDRAWN' ? 'gray' : c.stage === 'DISBURSED' || c.stage === 'POSTSALE' ? 'ok' : 'info'}>{STAGE_LABELS[c.stage]}</Status>
                </Link>
              ))}
            </div>
          )}
        </article>

        <article className="ov-card s12">
          <h2>Datos del aliado</h2>
          <OrgForm action={updateAllyAction} submit="Guardar cambios" values={{ id: org.id, kind: org.kind, name: org.name, taxId: org.taxId, territory: org.territory, tier: org.tier, monthlyGoal: org.monthlyGoal, active: org.active }} />
          <p className="ov-meta" style={{ marginTop: 10 }}>Creado el {fecha(org.createdAt)}. Inactivar el aliado cierra las sesiones de todos sus usuarios.</p>
        </article>
      </div>
    </>
  );
}
