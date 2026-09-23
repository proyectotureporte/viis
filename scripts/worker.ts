import 'dotenv/config';
import { Pool } from 'pg';
import type { Job } from '../app/generated/prisma/client';
import { notify } from '../lib/jobs';
import { mailConfigured, sendEmail, type EmailMessage } from '../lib/mail';
import { getPrisma } from '../lib/prisma';
import { audit, verifyAuditChain } from '../lib/security/audit';
import { readDocument, scanWithClamd } from '../lib/storage';

/**
 * Worker de OpenV (PM2 `viis-copia-worker`). Un solo proceso, tareas en bucle:
 *  - cada 10 s: cola de correos (outbox) con reintentos exponenciales;
 *  - cada 5 min: barrido de SLA de casos y solicitudes, re-escaneo antivirus;
 *  - cada hora: vencimiento de documentos y avisos de certificaciones;
 *  - cada día (03:00 Bogotá): limpieza y verificación de la bitácora.
 * Deja un latido en `jobs` (kind=heartbeat) que /api/health consulta.
 */

const prisma = getPrisma();
const MAX_ATTEMPTS = 6;
let stopping = false;

function log(message: string, extra?: Record<string, unknown>) {
  console.log(JSON.stringify({ at: new Date().toISOString(), message, ...extra }));
}

async function claimJobs(limit = 10): Promise<Job[]> {
  // SKIP LOCKED: si algún día hay dos workers, nunca procesan el mismo trabajo.
  return prisma.$queryRaw<Job[]>`
    UPDATE jobs SET status = 'RUNNING', "lockedAt" = now(), attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM jobs
      WHERE status = 'PENDING' AND "runAfter" <= now() AND kind <> 'heartbeat'
      ORDER BY "runAfter" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *`;
}

async function processQueue(): Promise<void> {
  // Trabajos que quedaron RUNNING por un reinicio se liberan tras 10 minutos.
  await prisma.job.updateMany({
    where: { status: 'RUNNING', lockedAt: { lt: new Date(Date.now() - 10 * 60_000) } },
    data: { status: 'PENDING' },
  });
  if (!mailConfigured()) return;
  const jobs = await claimJobs();
  for (const job of jobs) {
    try {
      if (job.kind === 'email') await sendEmail(job.payload as unknown as EmailMessage);
      else throw new Error(`Tipo de trabajo desconocido: ${job.kind}`);
      await prisma.job.update({ where: { id: job.id }, data: { status: 'DONE', doneAt: new Date(), lastError: null } });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 1000) : 'error';
      const failed = job.attempts >= MAX_ATTEMPTS;
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: failed ? 'FAILED' : 'PENDING',
          lastError: message,
          runAfter: new Date(Date.now() + Math.min(2 ** job.attempts * 30_000, 3_600_000)),
        },
      });
      log('job_error', { id: job.id, kind: job.kind, attempts: job.attempts, failed });
    }
  }
}

async function staffWith(roles: Array<'COORDINATOR' | 'POSTSALE' | 'ADMIN'>) {
  return prisma.user.findMany({ where: { role: { in: roles }, active: true }, select: { id: true, email: true } });
}

async function slaSweep(): Promise<void> {
  const now = new Date();
  const overdue = await prisma.opportunity.findMany({
    where: { slaDueAt: { lt: now }, escalatedAt: null, stage: { notIn: ['WITHDRAWN', 'DISBURSED', 'POSTSALE'] } },
    include: { person: { select: { firstName: true, lastName: true } } },
    take: 200,
  });
  if (overdue.length) {
    const coordinators = await staffWith(['COORDINATOR']);
    for (const opportunity of overdue) {
      await prisma.$transaction(async (tx) => {
        await tx.opportunity.update({
          where: { id: opportunity.id },
          data: { escalatedAt: now, priority: opportunity.priority === 'LOW' || opportunity.priority === 'NORMAL' ? 'HIGH' : opportunity.priority },
        });
        await audit({ action: 'case.sla_escalated', entity: 'Opportunity', entityId: opportunity.id, before: { priority: opportunity.priority }, channel: 'worker' }, tx);
        const recipients = new Set([...(opportunity.assigneeId ? [opportunity.assigneeId] : []), ...coordinators.map((c) => c.id)]);
        for (const userId of recipients) {
          await notify({ userId, title: `SLA vencido · ${opportunity.code}`, body: `${opportunity.person.firstName} ${opportunity.person.lastName}: el caso superó el tiempo objetivo de su etapa y fue escalado.`, href: `/empresa/casos/${opportunity.id}` }, tx);
        }
      });
    }
    log('sla_escalated', { cases: overdue.length });
  }

  const requests = await prisma.serviceRequest.findMany({
    where: { slaDueAt: { lt: now }, status: { in: ['OPEN', 'IN_PROGRESS'] } },
    select: { id: true, code: true, assigneeId: true, updatedAt: true },
    take: 200,
  });
  // Recordatorio como máximo una vez cada 24 h por solicitud.
  const pending = requests.filter((r) => now.getTime() - r.updatedAt.getTime() > 24 * 3_600_000);
  if (pending.length) {
    const team = await staffWith(['COORDINATOR', 'POSTSALE']);
    for (const request of pending) {
      await prisma.$transaction(async (tx) => {
        const recipients = request.assigneeId ? [request.assigneeId] : team.map((t) => t.id);
        for (const userId of recipients) {
          await notify({ userId, title: `Solicitud ${request.code} fuera de SLA`, body: 'La solicitud superó su tiempo de respuesta comprometido.', href: `/empresa/solicitudes/${request.id}` }, tx);
        }
        await tx.serviceRequest.update({ where: { id: request.id }, data: { updatedAt: now } });
      });
    }
  }
}

async function rescanQuarantine(): Promise<void> {
  const documents = await prisma.document.findMany({ where: { status: 'QUARANTINED' }, take: 20 });
  for (const document of documents) {
    const { result, detail } = await scanWithClamd(await readDocument(document.storageKey));
    if (result === 'UNAVAILABLE') {
      log('clamd_unavailable', { detail });
      return;
    }
    await prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: document.id },
        data: result === 'CLEAN' ? { status: 'UPLOADED', scanResult: 'CLEAN' } : { status: 'REJECTED', scanResult: 'INFECTED', rejectReason: 'Bloqueado por el antivirus.' },
      });
      await audit({ action: 'document.rescanned', entity: 'Document', entityId: document.id, after: { result }, channel: 'worker' }, tx);
    });
  }
}

async function hourly(): Promise<void> {
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  const expired = await prisma.document.findMany({
    where: { status: 'APPROVED', expiresAt: { lt: today } },
    include: { type: true, person: { include: { user: true } } },
    take: 500,
  });
  for (const document of expired) {
    await prisma.$transaction(async (tx) => {
      await tx.document.update({ where: { id: document.id }, data: { status: 'EXPIRED' } });
      await audit({ action: 'document.expired', entity: 'Document', entityId: document.id, channel: 'worker' }, tx);
      if (document.person.user) {
        await notify({ userId: document.person.user.id, title: `Tu documento venció: ${document.type.name}`, body: 'Carga una versión actualizada para que tu trámite no se detenga.', href: '/cliente/documentos', email: { to: document.person.user.email } }, tx);
      }
    });
  }

  // Certificaciones: aviso a 30 y 7 días del vencimiento (una vez al día, a las 9 a. m. Bogotá).
  const bogotaHour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Bogota' }).format(new Date()));
  if (bogotaHour !== 9) return;
  for (const days of [30, 7]) {
    const from = new Date(Date.now() + days * 86_400_000);
    const to = new Date(from.getTime() + 86_400_000);
    const certifications = await prisma.certification.findMany({
      where: { expiresAt: { gte: from, lt: to } },
      include: { course: true, user: true },
    });
    for (const certification of certifications) {
      await notify({
        userId: certification.userId,
        title: `Tu certificación vence en ${days} días`,
        body: `${certification.course.title}${certification.course.critical ? ': es crítica, si vence no podrás radicar casos.' : '.'}`,
        href: `/aliado/academia/${certification.course.slug}`,
        email: { to: certification.user.email, ctaLabel: 'Renovar certificación' },
      });
    }
  }
}

async function daily(): Promise<void> {
  const monthAgo = new Date(Date.now() - 30 * 86_400_000);
  await prisma.session.deleteMany({ where: { OR: [{ expiresAt: { lt: monthAgo } }, { revokedAt: { lt: monthAgo } }] } });
  await prisma.authToken.deleteMany({ where: { expiresAt: { lt: monthAgo } } });
  await prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: monthAgo } } });
  await prisma.job.deleteMany({ where: { status: 'DONE', doneAt: { lt: new Date(Date.now() - 90 * 86_400_000) } } });

  const chain = await verifyAuditChain();
  log('audit_chain', chain);
  if (!chain.ok) {
    const to = process.env.EMAIL_TO?.trim();
    if (to) {
      await prisma.job.create({
        data: {
          kind: 'email',
          payload: {
            to,
            subject: 'ALERTA: la bitácora de auditoría de OpenV no es íntegra',
            title: 'Se detectó una ruptura en la cadena de auditoría',
            paragraphs: [`El evento ${chain.brokenAt} no coincide con su hash encadenado. Revisa accesos directos a la base de datos y activa el protocolo de incidentes.`],
          },
        },
      });
    }
  }
}

/**
 * Leads del landing público (viis.app, BD viis_db) → consola OpenV. Rol de solo
 * lectura sobre contact_requests; se copian con el mismo id, así que es idempotente.
 */
let landingPool: Pool | null = null;
async function syncLandingLeads(): Promise<void> {
  const url = process.env.LANDING_DATABASE_URL?.trim();
  if (!url) return;
  landingPool ??= new Pool({ connectionString: url, max: 1 });
  const { rows } = await landingPool.query<{
    id: string; name: string; email: string | null; phone: string | null; city: string | null; message: string; source: string; createdAt: Date;
  }>('SELECT id, name, email, phone, city, message, source, "createdAt" FROM contact_requests WHERE "createdAt" > now() - interval \'60 days\' ORDER BY "createdAt" ASC');
  if (!rows.length) return;
  const known = new Set((await prisma.contactRequest.findMany({ where: { id: { in: rows.map((r) => r.id) } }, select: { id: true } })).map((r) => r.id));
  const fresh = rows.filter((r) => !known.has(r.id));
  if (!fresh.length) return;
  await prisma.$transaction(async (tx) => {
    await tx.contactRequest.createMany({
      data: fresh.map((r) => ({ id: r.id, name: r.name, email: r.email, phone: r.phone, city: r.city, message: r.message, source: `viis.app · ${r.source}`.slice(0, 120), status: 'NEW', notificationStatus: 'SKIPPED', createdAt: r.createdAt })),
      skipDuplicates: true,
    });
    const team = await tx.user.findMany({ where: { role: { in: ['ADVISOR', 'COORDINATOR'] }, active: true }, select: { id: true } });
    for (const member of team) {
      await notify({ userId: member.id, title: fresh.length === 1 ? `Nuevo lead: ${fresh[0].name}` : `${fresh.length} leads nuevos desde viis.app`, body: 'Revísalos y conviértelos en caso desde Leads web.', href: '/empresa/leads' }, tx);
    }
    await audit({ action: 'lead.synced', entity: 'ContactRequest', after: { count: fresh.length }, channel: 'worker' }, tx);
  });
  log('leads_synced', { count: fresh.length });
}

async function heartbeat(): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO jobs (id, kind, payload, status, "runAfter", "createdAt", "doneAt")
    VALUES ('00000000-0000-0000-0000-00000000beef', 'heartbeat', '{}'::jsonb, 'DONE', now(), now(), now())
    ON CONFLICT (id) DO UPDATE SET "doneAt" = now()`;
}

function every(ms: number, name: string, task: () => Promise<void>): void {
  let running = false;
  const run = async () => {
    if (running || stopping) return;
    running = true;
    try {
      await task();
    } catch (error) {
      log('task_error', { task: name, error: error instanceof Error ? error.message : String(error) });
    } finally {
      running = false;
    }
  };
  void run();
  setInterval(run, ms);
}

let lastDaily = '';
every(10_000, 'queue', processQueue);
every(30_000, 'heartbeat', heartbeat);
every(5 * 60_000, 'sla', slaSweep);
every(5 * 60_000, 'rescan', rescanQuarantine);
every(2 * 60_000, 'leads', syncLandingLeads);
every(60 * 60_000, 'hourly', hourly);
every(10 * 60_000, 'daily', async () => {
  const bogota = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(new Date());
  const day = `${bogota.find((p) => p.type === 'year')?.value}-${bogota.find((p) => p.type === 'month')?.value}-${bogota.find((p) => p.type === 'day')?.value}`;
  const hour = Number(bogota.find((p) => p.type === 'hour')?.value);
  if (hour === 3 && lastDaily !== day) {
    lastDaily = day;
    await daily();
  }
});

log('worker_started', { mail: mailConfigured() });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    stopping = true;
    log('worker_stopping', { signal });
    setTimeout(() => process.exit(0), 1_500);
  });
}
