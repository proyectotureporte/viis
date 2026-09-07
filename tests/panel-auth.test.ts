import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPanelSession, validPanelPassword, validPanelSession } from '@/lib/panel-auth';

describe('autenticación del panel', () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = 'test-secret-with-more-than-thirty-two-characters';
    process.env.PANEL_PASSWORD = 'private-password';
  });

  afterEach(() => {
    delete process.env.AUTH_SECRET;
    delete process.env.PANEL_PASSWORD;
  });

  it('acepta únicamente la contraseña configurada', () => {
    expect(validPanelPassword('private-password')).toBe(true);
    expect(validPanelPassword('wrong-password')).toBe(false);
  });

  it('firma una sesión válida y rechaza una alterada o vencida', () => {
    const now = 1_800_000_000_000;
    const token = createPanelSession(now);
    expect(validPanelSession(token, now + 1_000)).toBe(true);
    expect(validPanelSession(`${token}x`, now + 1_000)).toBe(false);
    expect(validPanelSession(token, now + 13 * 60 * 60 * 1_000)).toBe(false);
  });
});
