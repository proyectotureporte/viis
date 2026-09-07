import { NextResponse } from 'next/server';
import { PANEL_COOKIE_NAME } from '@/lib/panel-auth';

export async function POST(): Promise<NextResponse> {
  const response = new NextResponse(null, { status: 303, headers: { Location: '/panel' } });
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
