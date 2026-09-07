import { createHmac, timingSafeEqual } from 'node:crypto';

export const PANEL_COOKIE_NAME = 'viis_panel_session';
export const PANEL_SESSION_SECONDS = 12 * 60 * 60;

function secret(): string {
  const value = process.env.AUTH_SECRET?.trim();
  if (!value) throw new Error('AUTH_SECRET no está configurada.');
  return value;
}

function signature(expiresAt: string): string {
  return createHmac('sha256', secret()).update(`viis-panel:${expiresAt}`).digest('base64url');
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function validPanelPassword(candidate: string): boolean {
  const password = process.env.PANEL_PASSWORD;
  return Boolean(password) && safeEqual(candidate, password ?? '');
}

export function createPanelSession(now = Date.now()): string {
  const expiresAt = String(now + PANEL_SESSION_SECONDS * 1_000);
  return `${expiresAt}.${signature(expiresAt)}`;
}

export function validPanelSession(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const [expiresAt, suppliedSignature, extra] = token.split('.');
  if (extra || !expiresAt || !suppliedSignature || !/^\d+$/.test(expiresAt)) return false;
  if (Number(expiresAt) <= now) return false;
  return safeEqual(suppliedSignature, signature(expiresAt));
}
