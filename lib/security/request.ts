import { headers } from 'next/headers';
import { hashIp } from './crypto';

export interface RequestMeta {
  ipHash?: string;
  userAgent?: string;
}

/** IP y agente del visitante. Nginx fija X-Real-IP; la IP nunca se guarda en claro. */
export async function requestMeta(): Promise<RequestMeta> {
  const h = await headers();
  const ip = h.get('x-real-ip')?.trim() || h.get('x-forwarded-for')?.split(',')[0]?.trim();
  return { ipHash: hashIp(ip), userAgent: h.get('user-agent')?.slice(0, 400) || undefined };
}

export function requestMetaFrom(request: Request): RequestMeta {
  const ip =
    request.headers.get('x-real-ip')?.trim() || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return { ipHash: hashIp(ip), userAgent: request.headers.get('user-agent')?.slice(0, 400) || undefined };
}
