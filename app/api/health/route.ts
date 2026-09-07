import { getPrisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return Response.json(
      { status: 'ok' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      { status: 'error' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
