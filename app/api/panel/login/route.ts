import { NextResponse } from 'next/server';
import {
  createPanelSession,
  PANEL_COOKIE_NAME,
  PANEL_SESSION_SECONDS,
  validPanelPassword,
} from '@/lib/panel-auth';

export const runtime = 'nodejs';

const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1_000;

function redirect(request: Request, invalid = false): NextResponse {
  const url = new URL('/panel', request.url);
  if (invalid) url.searchParams.set('error', '1');
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request): Promise<NextResponse> {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const now = Date.now();
  const current = attempts.get(ip);
  const state = !current || current.resetAt <= now ? { count: 0, resetAt: now + WINDOW_MS } : current;

  if (state.count >= MAX_ATTEMPTS) return redirect(request, true);

  const formData = await request.formData();
  const password = String(formData.get('password') || '');
  if (!validPanelPassword(password)) {
    attempts.set(ip, { ...state, count: state.count + 1 });
    return redirect(request, true);
  }

  attempts.delete(ip);
  const response = redirect(request);
  response.cookies.set(PANEL_COOKIE_NAME, createPanelSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: PANEL_SESSION_SECONDS,
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
