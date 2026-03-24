import { NextRequest, NextResponse } from 'next/server';

import {
  SESSION_COOKIE,
  encodeSessionToken,
  getSessionCookieOptions,
  normalizeAndValidateAllowedEmail,
} from '../../../lib/auth';
import { sameOriginUrl } from '../../../lib/redirects';

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = String(formData.get('email') ?? '').trim();

  if (!email) {
    return NextResponse.redirect(sameOriginUrl(request, '/login?error=missing-email'), { status: 303 });
  }

  try {
    const normalizedEmail = normalizeAndValidateAllowedEmail(email);
    const response = NextResponse.redirect(sameOriginUrl(request, '/'), { status: 303 });
    response.cookies.set(SESSION_COOKIE, encodeSessionToken(normalizedEmail), getSessionCookieOptions());
    return response;
  } catch {
    return NextResponse.redirect(sameOriginUrl(request, '/login?error=not-allowed'), { status: 303 });
  }
}
