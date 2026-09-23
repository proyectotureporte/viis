import type { Metadata } from 'next';
import Link from 'next/link';
import { Shell } from '@/components/ov/Shell';
import { ActionForm, SubmitButton } from '@/components/ov/forms';
import { PageHeader, Status } from '@/components/ov/ui';
import { CONSENT_PURPOSES } from '@/lib/consent';
import { fechaHora } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { PASSWORD_MIN_LENGTH } from '@/lib/security/password';
import { portalFor, ROLE_LABELS } from '@/lib/security/rbac';
import { requireUser } from '@/lib/security/session';
import { changePasswordAction, consentAction, revokeAllSessionsAction, revokeDeviceAction, revokeSessionAction } from './actions';
import { RecoveryCodes } from './RecoveryCodes';

export const metadata: Metadata = { title: 'Mi cuenta' };

function device(ua: string | null): string {
  if (!ua) return 'Dispositivo desconocido';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Otro';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  return `${browser} en ${os}`;
}

export default async function CuentaPage() {
  const session = await requireUser();
  const prisma = getPrisma();
  const [user, sessions, person, devices] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, include: { organization: true } }),
    prisma.session.findMany({ where: { userId: session.user.id, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: 'desc' } }),
    prisma.person.findUnique({ where: { userId: session.user.id }, include: { consents: { orderBy: { grantedAt: 'desc' } } } }),
    prisma.trustedDevice.findMany({ where: { userId: session.user.id, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastUsedAt: 'desc' } }),
  ]);

  return (
    <Shell portal={portalFor(session.user.role)} session={session}>
      <PageHeader title="Mi cuenta y seguridad" subtitle={`${user.name} · ${user.email} · ${ROLE_LABELS[user.role]}${user.organization ? ` · ${user.organization.name}` : ''}`} />
      <div className="ov-grid">
        <article className="ov-card s6">
          <h2>Contraseña</h2>
          <p className="ov-meta">Último cambio: {fechaHora(user.passwordChangedAt)}</p>
          <ActionForm action={changePasswordAction} resetOnSuccess>
            <label className="ov-field"><span>Contraseña actual</span><input type="password" name="current" autoComplete="current-password" required /></label>
            <label className="ov-field"><span>Nueva contraseña</span><input type="password" name="password" autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} /></label>
            <label className="ov-field"><span>Repite la nueva contraseña</span><input type="password" name="confirm" autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} /></label>
            <SubmitButton>Cambiar contraseña</SubmitButton>
          </ActionForm>
        </article>
        <article className="ov-card s6">
          <h2>Verificación en dos pasos</h2>
          <p><Status>Activa</Status> <span className="ov-meta">desde {fechaHora(user.totpEnabledAt)} · {user.recoveryCodes.length} códigos de recuperación disponibles</span></p>
          <div className="ov-actions" style={{ marginBottom: 16 }}>
            <Link className="ov-btn ov-btn--secondary" href="/ingresar/configurar-mfa">Cambiar de teléfono o aplicación</Link>
          </div>
          <RecoveryCodes />
        </article>
        <article className="ov-card s12">
          <header>
            <h2>Sesiones y dispositivos</h2>
            {sessions.length > 1 && (
              <form action={revokeAllSessionsAction}><SubmitButton className="ov-btn ov-btn--secondary ov-btn--small">Cerrar las demás sesiones</SubmitButton></form>
            )}
          </header>
          <div className="ov-list">
            {sessions.map((s) => (
              <div className="ov-row" key={s.id}>
                <span className={s.id === session.id ? 'ov-dot' : 'ov-dot ov-dot--gray'} />
                <div className="grow">
                  <strong>{device(s.userAgent)}{s.id === session.id ? ' · esta sesión' : ''}</strong>
                  <small>Inició {fechaHora(s.createdAt)} · última actividad {fechaHora(s.lastSeenAt)} · {s.mfaPassed ? 'verificada' : 'sin segundo factor'}</small>
                </div>
                {s.id !== session.id && (
                  <form action={revokeSessionAction}><input type="hidden" name="id" value={s.id} /><SubmitButton className="ov-btn ov-btn--secondary ov-btn--small">Cerrar</SubmitButton></form>
                )}
              </div>
            ))}
          </div>
        </article>
        <article className="ov-card s12">
          <h2>Teléfonos de confianza</h2>
          <p className="ov-meta">Teléfonos donde activaste el desbloqueo con Face ID o huella en la app OpenV. Si pierdes uno, revócalo aquí.</p>
          <div className="ov-list" style={{ marginTop: 12 }}>
            {devices.length === 0 && <div className="ov-empty">Ningún teléfono de confianza.</div>}
            {devices.map((d) => (
              <div className="ov-row" key={d.id}>
                <span className="ov-dot" />
                <div className="grow">
                  <strong>{d.name} · {d.platform === 'ios' ? 'iPhone' : d.platform === 'android' ? 'Android' : 'Otro'}</strong>
                  <small>Autorizado {fechaHora(d.createdAt)} · último uso {fechaHora(d.lastUsedAt)} · vence {fechaHora(d.expiresAt)}</small>
                </div>
                <form action={revokeDeviceAction}><input type="hidden" name="id" value={d.id} /><SubmitButton className="ov-btn ov-btn--secondary ov-btn--small">Revocar</SubmitButton></form>
              </div>
            ))}
          </div>
        </article>
        {person && (
          <article className="ov-card s12">
            <h2>Mis autorizaciones</h2>
            <p className="ov-meta">Cada autorización guarda la versión exacta del texto que aceptaste y la fecha. Puedes retirar las opcionales cuando quieras.</p>
            <div className="ov-list" style={{ marginTop: 12 }}>
              {CONSENT_PURPOSES.map((purpose) => {
                const active = person.consents.find((c) => c.purpose === purpose.code && !c.revokedAt);
                return (
                  <div className="ov-row" key={purpose.code}>
                    <span className={active ? 'ov-dot' : 'ov-dot ov-dot--gray'} />
                    <div className="grow">
                      <strong>{purpose.title}</strong>
                      <small>{active ? `Otorgada el ${fechaHora(active.grantedAt)} · versión ${active.textVersion}` : 'No otorgada'}</small>
                    </div>
                    {!purpose.required && (
                      <form action={consentAction}>
                        <input type="hidden" name="purpose" value={purpose.code} />
                        <input type="hidden" name="grant" value={active ? '0' : '1'} />
                        <SubmitButton className="ov-btn ov-btn--secondary ov-btn--small">{active ? 'Retirar' : 'Otorgar'}</SubmitButton>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="ov-meta" style={{ marginTop: 12 }}>Para conocer, rectificar o suprimir tus datos crea una solicitud &quot;Mis datos personales (habeas data)&quot; en <Link href="/cliente/gestiones">Gestiones</Link>.</p>
          </article>
        )}
      </div>
    </Shell>
  );
}
