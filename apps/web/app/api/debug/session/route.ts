import { NextRequest, NextResponse } from 'next/server';

import { decodeSessionToken, SESSION_COOKIE } from '../../../../lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const rawCookie = request.cookies.get(SESSION_COOKIE)?.value;
  const session = decodeSessionToken(rawCookie);

  return NextResponse.json({
    ok: true,
    hasCookie: Boolean(rawCookie),
    cookieName: SESSION_COOKIE,
    cookieLength: rawCookie?.length ?? 0,
    decoded: session,
    requestUrl: request.url,
  });
}
