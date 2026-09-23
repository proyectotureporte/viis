import { apiSession, handler, json } from '@/lib/movil/http';
import { profile } from './profile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const session = await apiSession();
  return json({ ok: true, user: await profile(session.user.id) });
});
