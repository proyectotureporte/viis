import { getPrisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WORKER_ID = '00000000-0000-0000-0000-00000000beef';

/** Salud de la app y la BD (usada por deploy.sh). El worker se informa sin tumbar el chequeo. */
export async function GET(): Promise<Response> {
  try {
    const prisma = getPrisma();
    await prisma.$queryRaw`SELECT 1`;
    const beat = await prisma.job.findUnique({ where: { id: WORKER_ID }, select: { doneAt: true } });
    const worker = beat?.doneAt && Date.now() - beat.doneAt.getTime() < 120_000 ? 'ok' : 'stale';
    return Response.json({ status: 'ok', worker }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ status: 'error' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
