import { NextRequest, NextResponse } from 'next/server';

import { getSession } from './auth';

export async function requireRouteSession(request: NextRequest) {
  const session = await getSession();
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
