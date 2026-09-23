import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Role } from '@/app/generated/prisma/enums';
import { getPrisma } from '@/lib/prisma';
import { randomToken, sha256 } from './crypto';
import { can, portalFor, type Permission, type Portal } from './rbac';
import type { RequestMeta } from './request';

const PROD = process.env.NODE_ENV === 'production';
/** `__Host-` obliga a Secure, Path=/ y sin Domain: la cookie no se comparte con otros subdominios. */
export const SESSION_COOKIE = PROD ? '__Host-ov_session' : 'ov_session';
export const SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1_000;
export const SESSION_IDLE_MS = 30 * 60 * 1_000;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  organizationId: string | null;
  totpEnabled: boolean;
  emailVerified: boolean;
}

export interface CurrentSession {
  id: string;
  mfaPassed: boolean;
  user: SessionUser;
}

async function setCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: PROD,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_ABSOLUTE_MS / 1_000,
  });
}

/** Crea la sesión y devuelve el token (la app móvil lo usa como Bearer). */
export async function issueSessionToken(userId: string, meta: RequestMeta, mfaPassed = false): Promise<string> {
  const token = randomToken();
  await getPrisma().session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      mfaPassed,
      userAgent: meta.userAgent,
      ipHash: meta.ipHash,
      expiresAt: new Date(Date.now() + SESSION_ABSOLUTE_MS),
    },
  });
  return token;
}

export async function createSession(userId: string, meta: RequestMeta, mfaPassed = false): Promise<void> {
  await setCookie(await issueSessionToken(userId, meta, mfaPassed));
}

/** Tras superar el segundo factor se rota el token (evita fijación de sesión). */
export async function elevateSessionToken(sessionId: string): Promise<string> {
  const token = randomToken();
  await getPrisma().session.update({
    where: { id: sessionId },
    data: { tokenHash: sha256(token), mfaPassed: true, lastSeenAt: new Date() },
  });
  return token;
}

export async function elevateSession(sessionId: string): Promise<void> {
  await setCookie(await elevateSessionToken(sessionId));
}

/**
 * Token de la petición: cookie (web) o `Authorization: Bearer` (app móvil).
 * El Bearer no lo envía el navegador por su cuenta, así que no abre CSRF.
 */
async function requestToken(): Promise<string | undefined> {
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (cookie) return cookie;
  const auth = (await headers()).get('authorization');
  const match = auth?.match(/^Bearer\s+([A-Za-z0-9_-]{20,100})$/);
  return match?.[1];
}

export const getSession = cache(async (): Promise<CurrentSession | null> => {
  const token = await requestToken();
  if (!token || token.length > 100) return null;
  const prisma = getPrisma();
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { organization: { select: { active: true } } } } },
  });
  const now = Date.now();
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt.getTime() <= now ||
    now - session.lastSeenAt.getTime() > SESSION_IDLE_MS ||
    !session.user.active ||
    // Una organización aliada desactivada deja sin acceso a todos sus usuarios.
    session.user.organization?.active === false
  ) {
    return null;
  }
  if (now - session.lastSeenAt.getTime() > 60_000) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date(now) } });
  }
  return {
    id: session.id,
    mfaPassed: session.mfaPassed,
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
      organizationId: session.user.organizationId,
      totpEnabled: Boolean(session.user.totpEnabledAt),
      emailVerified: Boolean(session.user.emailVerifiedAt),
    },
  };
});

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = await requestToken();
  if (token) {
    await getPrisma().session.updateMany({
      where: { tokenHash: sha256(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  store.delete(SESSION_COOKIE);
}

export function homeFor(role: Role): string {
  return `/${portalFor(role)}`;
}

interface RequireOptions {
  portal?: Portal;
  permission?: Permission;
}

/**
 * Puerta de entrada de toda página y acción privada. Exige sesión vigente,
 * segundo factor superado y, si se pide, portal y permiso concretos.
 */
export async function requireUser(options: RequireOptions = {}): Promise<CurrentSession> {
  const session = await getSession();
  if (!session) redirect('/ingresar');
  if (!session.user.totpEnabled) redirect('/ingresar/configurar-mfa');
  if (!session.mfaPassed) redirect('/ingresar/verificar');
  if (options.portal && portalFor(session.user.role) !== options.portal) redirect(homeFor(session.user.role));
  if (options.permission && !can(session.user.role, options.permission)) redirect(homeFor(session.user.role));
  return session;
}

/** Variante para acciones: en vez de redirigir lanza, para no filtrar estado. */
export async function assertPermission(permission: Permission): Promise<CurrentSession> {
  const session = await getSession();
  if (!session || !session.mfaPassed || !session.user.totpEnabled) throw new Error('Sesión no válida.');
  if (!can(session.user.role, permission)) throw new Error('No tienes permiso para esta acción.');
  return session;
}
