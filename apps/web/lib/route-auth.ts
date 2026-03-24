import { NextRequest, NextResponse } from 'next/server';

import { decodeSessionToken, SESSION_COOKIE, type Session } from './auth';
import { sameOriginUrl } from './redirects';

type RouteSessionResult =
  | {
      ok: true;
      session: Session;
    }
  | {
      ok: false;
      response: NextResponse;
    };

export async function requireRouteSession(request: NextRequest): Promise<RouteSessionResult> {
  const session = decodeSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return {
      ok: false,
      response: NextResponse.redirect(sameOriginUrl(request, '/login')),
    };
  }

  return {
    ok: true,
    session,
  };
}
