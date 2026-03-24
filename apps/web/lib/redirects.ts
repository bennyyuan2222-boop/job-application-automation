import { headers } from 'next/headers';
import type { NextRequest } from 'next/server';

function normalizeProto(value: string | null | undefined) {
  return value?.replace(/:$/, '') || undefined;
}

function buildOrigin(proto: string | undefined, host: string | undefined, fallbackOrigin: string) {
  if (!host) return fallbackOrigin;
  return `${proto ?? 'https'}://${host}`;
}

export function originFromRequest(request: NextRequest) {
  const forwardedProto = normalizeProto(request.headers.get('x-forwarded-proto'));
  const forwardedHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? undefined;
  return buildOrigin(forwardedProto, forwardedHost, request.nextUrl.origin);
}

export function sameOriginUrl(request: NextRequest, path: string) {
  return new URL(path, originFromRequest(request));
}

export async function originFromHeaders() {
  const headerStore = await headers();
  const forwardedProto = normalizeProto(headerStore.get('x-forwarded-proto'));
  const forwardedHost = headerStore.get('x-forwarded-host') ?? headerStore.get('host') ?? undefined;
  const fallbackOrigin = `${process.env.NODE_ENV === 'production' ? 'https' : 'http'}://localhost:3000`;
  return buildOrigin(forwardedProto, forwardedHost, fallbackOrigin);
}

export async function sameOriginUrlFromHeaders(path: string) {
  return new URL(path, await originFromHeaders()).toString();
}
