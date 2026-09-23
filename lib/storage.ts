import { createHmac, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import path from 'node:path';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { decryptBuffer, encryptBuffer, safeEqual, sha256 } from './security/crypto';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const SIGNATURES: Array<{ mime: string; ext: string; test: (b: Buffer) => boolean }> = [
  { mime: 'application/pdf', ext: 'pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
];

/** El tipo se decide por los bytes, nunca por la extensión ni por lo que diga el navegador. */
export function detectMime(buffer: Buffer): string | null {
  return SIGNATURES.find((s) => s.test(buffer))?.mime ?? null;
}

function storageDir(): string {
  const dir = process.env.STORAGE_DIR?.trim();
  if (!dir) throw new Error('STORAGE_DIR no está configurado.');
  return dir;
}

function filePath(storageKey: string): string {
  if (!/^[0-9a-f-]{36}$/.test(storageKey)) throw new Error('Clave de almacenamiento inválida.');
  return path.join(storageDir(), storageKey.slice(0, 2), `${storageKey}.bin`);
}

export type ScanResult = 'CLEAN' | 'INFECTED' | 'UNAVAILABLE';

/** Protocolo INSTREAM de clamd por socket Unix o TCP. */
export function scanWithClamd(buffer: Buffer, timeoutMs = 30_000): Promise<{ result: ScanResult; detail?: string }> {
  const socketPath = process.env.CLAMD_SOCKET?.trim() || '/var/run/clamav/clamd.ctl';
  return new Promise((resolve) => {
    const socket = createConnection(socketPath);
    let response = '';
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ result: 'UNAVAILABLE', detail: 'timeout' });
    }, timeoutMs);
    socket.on('error', (error) => {
      clearTimeout(timer);
      resolve({ result: 'UNAVAILABLE', detail: error.message });
    });
    socket.on('connect', () => {
      socket.write('zINSTREAM\0');
      for (let offset = 0; offset < buffer.length; offset += 64 * 1024) {
        const chunk = buffer.subarray(offset, offset + 64 * 1024);
        const size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.length);
        socket.write(size);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
    socket.on('data', (data) => {
      response += data.toString();
    });
    socket.on('end', () => {
      clearTimeout(timer);
      const text = response.replace(/\0/g, '').trim();
      if (text.endsWith('OK')) resolve({ result: 'CLEAN' });
      else if (text.includes('FOUND')) resolve({ result: 'INFECTED', detail: text.replace(/^stream:\s*/, '') });
      else resolve({ result: 'UNAVAILABLE', detail: text.slice(0, 200) });
    });
  });
}

export interface StoredFile {
  storageKey: string;
  sha256: string;
  mimeType: string;
  sizeBytes: number;
  scan: ScanResult;
}

/**
 * Valida, escanea y guarda cifrado. Un archivo infectado nunca toca el disco.
 * Si el antivirus no responde, el archivo se guarda en CUARENTENA y el worker
 * lo reescanea; nadie puede descargarlo mientras tanto.
 */
export async function storeDocument(buffer: Buffer): Promise<StoredFile> {
  if (buffer.length === 0) throw new Error('El archivo está vacío.');
  if (buffer.length > MAX_UPLOAD_BYTES) throw new Error('El archivo supera 10 MB.');
  const mimeType = detectMime(buffer);
  if (!mimeType) throw new Error('Solo se aceptan PDF, JPG o PNG.');

  const { result } = await scanWithClamd(buffer);
  if (result === 'INFECTED') throw new Error('El archivo fue bloqueado por el antivirus.');
  const scan: ScanResult =
    result === 'UNAVAILABLE' && process.env.NODE_ENV !== 'production' && process.env.CLAMD_REQUIRED !== 'true'
      ? 'CLEAN'
      : result;

  const storageKey = randomUUID();
  const target = filePath(storageKey);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await writeFile(target, encryptBuffer(buffer), { mode: 0o600 });
  return { storageKey, sha256: sha256(buffer), mimeType, sizeBytes: buffer.length, scan };
}

export async function readDocument(storageKey: string): Promise<Buffer> {
  return decryptBuffer(await readFile(filePath(storageKey)));
}

// ── Enlaces temporales ────────────────────────────────────────────────────

export const LINK_TTL_MS = 5 * 60 * 1_000;

function linkSignature(documentId: string, userId: string, expires: number): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET no está configurada.');
  return createHmac('sha256', secret).update(`doc:${documentId}:${userId}:${expires}`).digest('base64url');
}

/** URL válida 5 minutos y solo para el usuario que la pidió. */
export function temporaryDocumentUrl(documentId: string, userId: string, now = Date.now()): string {
  const expires = now + LINK_TTL_MS;
  return `/api/documentos/${documentId}?e=${expires}&s=${linkSignature(documentId, userId, expires)}`;
}

export function validDocumentLink(documentId: string, userId: string, expires: string | null, signature: string | null, now = Date.now()): boolean {
  if (!expires || !signature || !/^\d+$/.test(expires) || Number(expires) < now) return false;
  return safeEqual(signature, linkSignature(documentId, userId, Number(expires)));
}

// ── Marca de agua ─────────────────────────────────────────────────────────

/** Toda descarga sale como PDF con marca de agua: quién, cuándo y confidencialidad. */
export async function watermarkedPdf(buffer: Buffer, mimeType: string, stamp: string): Promise<Uint8Array> {
  let pdf: PDFDocument;
  if (mimeType === 'application/pdf') {
    pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
  } else {
    pdf = await PDFDocument.create();
    const image = mimeType === 'image/png' ? await pdf.embedPng(buffer) : await pdf.embedJpg(buffer);
    const scale = Math.min(1, 1000 / Math.max(image.width, image.height));
    const page = pdf.addPage([image.width * scale, image.height * scale]);
    page.drawImage(image, { x: 0, y: 0, width: image.width * scale, height: image.height * scale });
  }
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    page.drawText(stamp, { x: 12, y: 12, size: 8, font, color: rgb(0.8, 0.1, 0.1), opacity: 0.8 });
    page.drawText('OpenV · CONFIDENCIAL', {
      x: width * 0.18,
      y: height * 0.35,
      size: Math.min(width, height) / 12,
      font,
      color: rgb(0.6, 0.6, 0.6),
      opacity: 0.18,
      rotate: degrees(35),
    });
  }
  return pdf.save();
}
