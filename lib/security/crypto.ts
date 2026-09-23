import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Cifrado en reposo a nivel de aplicación (AES-256-GCM).
 *
 * Formato de texto cifrado: `v1.<iv>.<tag>.<datos>` en base64url. El prefijo
 * de versión permite rotar la clave sin romper lo que ya está guardado.
 * La clave vive solo en `DATA_ENCRYPTION_KEY` (32 bytes en base64).
 */

function key(): Buffer {
  const raw = process.env.DATA_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error('DATA_ENCRYPTION_KEY no está configurada.');
  const buffer = Buffer.from(raw, 'base64');
  if (buffer.length !== 32) throw new Error('DATA_ENCRYPTION_KEY debe tener 32 bytes en base64.');
  return buffer;
}

function secret(): string {
  const value = process.env.AUTH_SECRET?.trim();
  if (!value) throw new Error('AUTH_SECRET no está configurada.');
  return value;
}

export function encryptBuffer(plain: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([Buffer.from('OV1'), iv, cipher.getAuthTag(), data]);
}

export function decryptBuffer(sealed: Buffer): Buffer {
  if (sealed.subarray(0, 3).toString() !== 'OV1') throw new Error('Formato de archivo cifrado desconocido.');
  const iv = sealed.subarray(3, 15);
  const tag = sealed.subarray(15, 31);
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(sealed.subarray(31)), decipher.final()]);
}

export function encryptText(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

export function decryptText(sealed: string): string {
  const [version, iv, tag, data] = sealed.split('.');
  if (version !== 'v1' || !iv || !tag || data === undefined) throw new Error('Texto cifrado inválido.');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}

/** Índice ciego: permite buscar/deduplicar un dato cifrado sin descifrarlo. */
export function blindIndex(namespace: string, value: string): string {
  return createHmac('sha256', secret()).update(`${namespace}:${value}`).digest('hex');
}

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hashIp(ip: string | undefined | null): string | undefined {
  if (!ip) return undefined;
  return createHmac('sha256', secret()).update(`ip:${ip}`).digest('hex');
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
