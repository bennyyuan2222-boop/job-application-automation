import { NextRequest, NextResponse } from 'next/server';

import { clearSession } from '../../lib/auth';
import { sameOriginUrl } from '../../lib/redirects';

export async function GET(request: NextRequest) {
  await clearSession();
  return NextResponse.redirect(sameOriginUrl(request, '/login'));
}
