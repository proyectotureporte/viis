import type { Metadata } from 'next';
import Link from 'next/link';
import type { Prisma } from '@/app/generated/prisma/client';
import type { Role } from '@/app/generated/prisma/enums';
import { ActionForm, SubmitButton } from '@/components/ov/forms';
import { Empty, PageHeader, Status } from '@/components/ov/ui';
import { Pager } from '@/components/empresa/ui';
import { qs, sp, spEnum, spPage, type SearchParams } from '@/lib/empresa/params';
import { fechaHora } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { ROLE_LABELS, STAFF_ROLES } from '@/lib/security/rbac';
import { requireUser } from '@/lib/security/session';
import { changeRoleAction, inviteStaffAction, resendInviteAction, resetMfaAction, revokeUserSessionAction, setActiveAction } from './actions';

export const metadata: Metadata = { title: 'Usuarios' };

const PAGE = 25;
const STATES = ['activos', 'inactivos', 'pendientes', 'sin-mfa'] as const;

function device(ua: string | null): string {
  if (!ua) return 'Dispositivo desconocido';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Otro';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  return `${browser} en ${os}`;
}

export default async function UsuariosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireUser({ portal: 'empresa', permission: 'user.manage' });
  const params = await searchParams;
  const rol = spEnum(params, 'rol', STAFF_ROLES);
  const estado = spEnum(params, 'estado', STATES);
  const q = sp(params, 'q');
  const page = spPage(params);

  const where: Prisma.UserWhereInput = { role: rol ? rol : { in: STAFF_ROLES } };
  if (estado === 'activos') where.active = true;
  if (estado === 'inactivos') where.active = false;
  if (estado === 'pendientes') where.passwordHash = null;
  if (estado === 'sin-mfa') where.totpEnabledAt = null;
  if (q) where.OR = [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }];

  const prisma = getPrisma();
  const now = new Date();
  const [total, users, admins] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: { sessions: { where: { revokedAt: null, expiresAt: { gt: now } }, orderBy: { lastSeenAt: 'desc' } } },
    }),
    prisma.user.count({ where: { role: 'ADMIN', active: true } }),
  ]);
  const base = { rol, estado, q };

  return (
    <>
      <PageHeader title="Usuarios internos" subtitle={`Equipo OpenV con acceso a la consola. Administradores activos: ${admins}.`} />
      <div className="ov-grid">
        <article className="ov-card s12">
          <h2>Invitar a una persona del equipo</h2>
          <ActionForm action={inviteStaffAction} className="ov-form ov-form--3" resetOnSuccess>
            <label className="ov-field"><span>Nombre completo</span><input name="name" required maxLength={160} /></label>
            <label className="ov-field"><span>Correo corporativo</span><input type="email" name="email" required maxLength={320} /></label>
            <label className="ov-field"><span>Rol</span>
              <select name="role" required defaultValue="">
                <option value="" disabled>Elige…</option>
                {STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </label>
            <p className="ov-meta full">Recibirá un enlace de 72 horas para crear su contraseña y configurar la verificación en dos pasos (obligatoria).</p>
            <div className="full"><SubmitButton pendingText="Enviando…">Enviar invitación</SubmitButton></div>
          </ActionForm>
        </article>

        <article className="ov-card s12">
          <form className="ov-filters" method="get">
            <label className="ov-field"><span>Buscar</span><input name="q" defaultValue={q} placeholder="Nombre o correo" /></label>
            <label className="ov-field"><span>Rol</span>
              <select name="rol" defaultValue={rol}>
                <option value="">Todos</option>
                {STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </label>
            <label className="ov-field"><span>Estado</span>
              <select name="estado" defaultValue={estado}>
                <option value="">Todos</option>
                <option value="activos">Activos</option>
                <option value="inactivos">Desactivados</option>
                <option value="pendientes">Invitación pendiente</option>
                <option value="sin-mfa">Sin segundo factor</option>
              </select>
            </label>
            <button className="ov-btn ov-btn--secondary" type="submit">Filtrar</button>
            <Link className="ov-linkbtn" href="/empresa/usuarios">Limpiar</Link>
          </form>

          {users.length === 0 ? (
            <Empty>No hay usuarios con estos filtros. Invita al equipo con el formulario de arriba.</Empty>
          ) : (
            <div className="ove-stack-list">
              {users.map((u) => {
                const self = u.id === session.user.id;
                const pending = !u.passwordHash;
                return (
                  <details key={u.id} className="ove-details">
                    <summary>
                      {u.name} <span className="ov-meta">· {u.email} · {ROLE_LABELS[u.role]}</span>{' '}
                      {!u.active ? <Status tone="bad">Desactivado</Status> : pending ? <Status tone="wait">Invitación pendiente</Status> : <Status>Activo</Status>}{' '}
                      {u.totpEnabledAt ? <Status tone="info">MFA activo</Status> : <Status tone="gray">Sin MFA</Status>}
                      {self && <> <Status tone="gray">Tú</Status></>}
                    </summary>
                    <div className="ove-kv">
                      <div><small>Último ingreso</small><strong>{fechaHora(u.lastLoginAt)}</strong></div>
                      <div><small>Creado</small><strong>{fechaHora(u.createdAt)}</strong></div>
                      <div><small>Segundo factor desde</small><strong>{fechaHora(u.totpEnabledAt)}</strong></div>
                      <div><small>Sesiones activas</small><strong>{u.sessions.length}</strong></div>
                    </div>

                    <div className="ov-grid" style={{ marginTop: 14 }}>
                      <div className="s6">
                        <h3 style={{ fontSize: 15, margin: '0 0 8px' }}>Rol</h3>
                        {self && u.role === 'ADMIN' ? (
                          <p className="ov-meta">No puedes cambiar tu propio rol de administrador.</p>
                        ) : (
                          <ActionForm action={changeRoleAction} className="ove-inline-form">
                            <input type="hidden" name="id" value={u.id} />
                            <label className="ove-sr" htmlFor={`role-${u.id}`}>Nuevo rol</label>
                            <select id={`role-${u.id}`} name="role" defaultValue={u.role}>
                              {STAFF_ROLES.map((r: Role) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                            </select>
                            <SubmitButton className="ov-btn ov-btn--secondary ov-btn--small" confirm="Cambiar el rol cierra las sesiones del usuario. ¿Continuar?">Cambiar rol</SubmitButton>
                          </ActionForm>
                        )}
                      </div>
                      <div className="s6">
                        <h3 style={{ fontSize: 15, margin: '0 0 8px' }}>Acceso</h3>
                        {u.active ? (
                          self ? <p className="ov-meta">No puedes desactivar tu propia cuenta.</p> : (
                            <ActionForm action={setActiveAction} className="ove-inline-form">
                              <input type="hidden" name="id" value={u.id} />
                              <input type="hidden" name="active" value="0" />
                              <input name="reason" required minLength={5} maxLength={300} placeholder="Motivo de la desactivación" aria-label="Motivo de la desactivación" />
                              <SubmitButton className="ov-btn ov-btn--danger ov-btn--small" confirm="¿Desactivar este usuario y cerrar sus sesiones?">Desactivar</SubmitButton>
                            </ActionForm>
                          )
                        ) : (
                          <ActionForm action={setActiveAction} className="ove-inline-form">
                            <input type="hidden" name="id" value={u.id} />
                            <input type="hidden" name="active" value="1" />
                            <SubmitButton className="ov-btn ov-btn--secondary ov-btn--small">Reactivar</SubmitButton>
                          </ActionForm>
                        )}
                        {pending && u.active && (
                          <ActionForm action={resendInviteAction} className="ove-inline-form">
                            <input type="hidden" name="id" value={u.id} />
                            <SubmitButton className="ov-btn ov-btn--secondary ov-btn--small">Reenviar invitación</SubmitButton>
                          </ActionForm>
                        )}
                      </div>
                      {u.totpEnabledAt && !self && (
                        <div className="s12">
                          <h3 style={{ fontSize: 15, margin: '0 0 8px' }}>Restablecer verificación en dos pasos</h3>
                          <p className="ov-meta">Úsalo solo si la persona perdió su teléfono y validaste su identidad por otro canal. Se borran su secreto y sus códigos de recuperación, se cierran sus sesiones y se le avisa por correo.</p>
                          <ActionForm action={resetMfaAction} className="ove-inline-form">
                            <input type="hidden" name="id" value={u.id} />
                            <input name="reason" required minLength={10} maxLength={300} placeholder="Motivo y cómo validaste su identidad" aria-label="Motivo del restablecimiento" style={{ minWidth: 280 }} />
                            <SubmitButton className="ov-btn ov-btn--danger ov-btn--small" confirm="¿Restablecer el segundo factor de este usuario?">Restablecer MFA</SubmitButton>
                          </ActionForm>
                        </div>
                      )}
                      <div className="s12">
                        <h3 style={{ fontSize: 15, margin: '0 0 8px' }}>Sesiones activas</h3>
                        {u.sessions.length === 0 ? <p className="ov-meta">Sin sesiones abiertas.</p> : (
                          <div className="ov-list">
                            {u.sessions.map((s) => (
                              <div className="ov-row" key={s.id}>
                                <span className={s.mfaPassed ? 'ov-dot' : 'ov-dot ov-dot--amber'} />
                                <div className="grow">
                                  <strong>{device(s.userAgent)}{s.id === session.id ? ' · tu sesión actual' : ''}</strong>
                                  <small>Inició {fechaHora(s.createdAt)} · última actividad {fechaHora(s.lastSeenAt)} · vence {fechaHora(s.expiresAt)} · {s.mfaPassed ? 'verificada' : 'sin segundo factor'}</small>
                                </div>
                                {s.id !== session.id && (
                                  <ActionForm action={revokeUserSessionAction} className="ove-inline-form">
                                    <input type="hidden" name="sessionId" value={s.id} />
                                    <SubmitButton className="ov-btn ov-btn--secondary ov-btn--small">Cerrar</SubmitButton>
                                  </ActionForm>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          )}
          <Pager page={page} pageSize={PAGE} total={total} href={(p) => `/empresa/usuarios${qs(base, { p })}`} />
        </article>
      </div>
    </>
  );
}
