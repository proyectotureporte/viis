import { randomBytes } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { blindIndex, decryptBuffer, decryptText, encryptBuffer, encryptText } from '@/lib/security/crypto';
import { hashPassword, passwordProblem, verifyPassword } from '@/lib/security/password';

beforeAll(() => {
  process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  process.env.AUTH_SECRET = 'secreto-de-prueba';
});

describe('cifrado en reposo', () => {
  it('texto: ida y vuelta, IV distinto cada vez', () => {
    const a = encryptText('1.020.304.050');
    const b = encryptText('1.020.304.050');
    expect(a).not.toBe(b);
    expect(decryptText(a)).toBe('1.020.304.050');
  });

  it('detecta manipulación (GCM)', () => {
    const sealed = encryptText('dato');
    const parts = sealed.split('.');
    parts[3] = Buffer.from('otro').toString('base64url');
    expect(() => decryptText(parts.join('.'))).toThrow();
  });

  it('archivos binarios', () => {
    const data = randomBytes(5000);
    expect(decryptBuffer(encryptBuffer(data)).equals(data)).toBe(true);
  });

  it('índice ciego determinista y por espacio de nombres', () => {
    expect(blindIndex('doc', 'CC:123')).toBe(blindIndex('doc', 'CC:123'));
    expect(blindIndex('doc', 'CC:123')).not.toBe(blindIndex('otro', 'CC:123'));
  });
});

describe('contraseñas', () => {
  it('scrypt verifica solo la correcta', async () => {
    const hash = await hashPassword('Clave-Segura-2026');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('Clave-Segura-2026', hash)).toBe(true);
    expect(await verifyPassword('clave-segura-2026', hash)).toBe(false);
    expect(await verifyPassword('x', null)).toBe(false);
  });

  it('política mínima', () => {
    expect(passwordProblem('corta')).toMatch(/12/);
    expect(passwordProblem('solominusculasss')).toMatch(/Combina/);
    expect(passwordProblem('Ana.Perez-2026x', 'ana.perez@viis.app')).toMatch(/correo/);
    expect(passwordProblem('Vivienda-Propia-2026')).toBeNull();
  });
});
