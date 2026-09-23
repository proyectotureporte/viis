import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, generateRecoveryCodes, hotp, verifyTotp } from '@/lib/security/totp';

// Vectores del RFC 6238 (apéndice B) con el secreto ASCII "12345678901234567890" (SHA-1, 8 dígitos → aquí 6).
const SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('TOTP RFC 6238', () => {
  it('base32 ida y vuelta', () => {
    expect(SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode(SECRET).toString()).toBe('12345678901234567890');
  });

  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('t=%i → %s', (seconds, code) => {
    expect(hotp(SECRET, Math.floor(seconds / 30))).toBe(code);
    expect(verifyTotp(SECRET, code, seconds * 1000)).toBe(Math.floor(seconds / 30));
  });

  it('tolera ±1 paso y rechaza códigos viejos o mal formados', () => {
    const now = 1_234_567_890_000;
    const step = Math.floor(now / 30_000);
    expect(verifyTotp(SECRET, hotp(SECRET, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(SECRET, hotp(SECRET, step + 1), now)).toBe(step + 1);
    expect(verifyTotp(SECRET, hotp(SECRET, step - 3), now)).toBeNull();
    expect(verifyTotp(SECRET, '12345', now)).toBeNull();
    expect(verifyTotp(SECRET, 'abcdef', now)).toBeNull();
  });

  it('códigos de recuperación únicos con formato xxxxx-xxxxx', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    codes.forEach((c) => expect(c).toMatch(/^[a-z2-7]{5}-[a-z2-7]{5}$/));
  });
});
