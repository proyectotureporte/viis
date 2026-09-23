import type { Prisma } from '@/app/generated/prisma/client';
import { getPrisma } from '@/lib/prisma';
import { sha256 } from './crypto';
import { requestChannel } from './request';

type Tx = Prisma.TransactionClient;

export interface AuditInput {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  channel?: string;
  ipHash?: string | null;
}

export const GENESIS_HASH = '0'.repeat(64);
const AUDIT_LOCK = 7_300_421;

/** Campos que jamás deben entrar a la bitácora, aunque estén en el objeto. */
const REDACT = new Set(['passwordHash', 'totpSecretEnc', 'recoveryCodes', 'documentNumEnc', 'phoneEnc', 'tokenHash', 'password']);

function jsonSafe(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(
    JSON.stringify(value, (key, v) => {
      if (REDACT.has(key)) return '[protegido]';
      return typeof v === 'bigint' ? v.toString() : v;
    }),
  );
}

/** JSON con claves ordenadas: jsonb reordena las claves y el hash debe sobrevivir a eso. */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function auditHash(prevHash: string, event: Omit<AuditInput, 'before' | 'after'> & { at: string; before?: unknown; after?: unknown }): string {
  return sha256(
    canonicalJson([
      prevHash,
      event.at,
      event.actorId ?? null,
      event.actorRole ?? null,
      event.action,
      event.entity,
      event.entityId ?? null,
      event.before ?? null,
      event.after ?? null,
      event.channel ?? 'web',
      event.ipHash ?? null,
    ]),
  );
}

async function appendWith(tx: Tx, input: AuditInput): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_LOCK})`;
  const last = await tx.auditEvent.findFirst({ orderBy: { id: 'desc' }, select: { hash: true } });
  const prevHash = last?.hash ?? GENESIS_HASH;
  const at = new Date();
  const before = jsonSafe(input.before);
  const after = jsonSafe(input.after);
  const hash = auditHash(prevHash, { ...input, at: at.toISOString(), before, after });
  await tx.auditEvent.create({
    data: {
      at,
      actorId: input.actorId ?? null,
      actorRole: input.actorRole ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      before,
      after,
      channel: input.channel ?? 'web',
      ipHash: input.ipHash ?? null,
      prevHash,
      hash,
    },
  });
}

/**
 * Registra un evento en la bitácora encadenada. Si se pasa `tx`, el evento
 * queda en la MISMA transacción del cambio: o se guardan ambos o ninguno.
 */
export async function audit(input: AuditInput, tx?: Tx): Promise<void> {
  const event = input.channel ? input : { ...input, channel: await requestChannel() };
  if (tx) return appendWith(tx, event);
  await getPrisma().$transaction((t) => appendWith(t, event));
}

/** Recorre la cadena y devuelve el primer eslabón roto, si existe. */
export async function verifyAuditChain(): Promise<{ ok: boolean; checked: number; brokenAt?: string }> {
  const prisma = getPrisma();
  let prevHash = GENESIS_HASH;
  let cursor: bigint | undefined;
  let checked = 0;
  for (;;) {
    const batch = await prisma.auditEvent.findMany({
      where: cursor ? { id: { gt: cursor } } : undefined,
      orderBy: { id: 'asc' },
      take: 1000,
    });
    if (!batch.length) break;
    for (const event of batch) {
      const expected = auditHash(prevHash, {
        at: event.at.toISOString(),
        actorId: event.actorId,
        actorRole: event.actorRole,
        action: event.action,
        entity: event.entity,
        entityId: event.entityId,
        before: event.before ?? undefined,
        after: event.after ?? undefined,
        channel: event.channel,
        ipHash: event.ipHash,
      });
      if (event.prevHash !== prevHash || event.hash !== expected) {
        return { ok: false, checked, brokenAt: event.id.toString() };
      }
      prevHash = event.hash;
      checked += 1;
      cursor = event.id;
    }
  }
  return { ok: true, checked };
}
