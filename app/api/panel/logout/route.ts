import { NextResponse } from 'next/server';
import { PANEL_COOKIE_NAME } from '@/lib/panel-auth';

export async function POST(request: Request): Promise<NextResponse> {
  const response = NextResponse.redirect(new URL('/panel', request.url), 303);
  response.cookies.set(PANEL_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
