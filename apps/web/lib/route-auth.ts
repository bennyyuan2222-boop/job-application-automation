import { NextRequest, NextResponse } from 'next/server';

import { decodeSessionToken, SESSION_COOKIE } from './auth';

export async function requireRouteSession(request: NextRequest) {
  const session = decodeSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return {
      session: null,
      response: NextResponse.redirect(new URL('/login', request.url)),
    } as const;
  }

  return {
    session,
    response: null,
  } as const;
}
