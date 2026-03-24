import { revalidatePath } from 'next/cache';
import { pauseTailoringForApplication } from '@job-ops/needle-worker';
import { NextRequest, NextResponse } from 'next/server';

import { requireRouteSession } from '../../../../../lib/route-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireRouteSession(request);
  if (!auth.ok) return auth.response;

  const { session } = auth;

  const applicationId = request.nextUrl.searchParams.get('applicationId')?.trim();
  const reason = request.nextUrl.searchParams.get('reason')?.trim();

  if (!applicationId || !reason) {
    return NextResponse.redirect(new URL('/tailoring', request.url));
  }

  await pauseTailoringForApplication(applicationId, reason, {
    actorLabel: session.email,
  });

  revalidatePath('/tailoring');
  revalidatePath(`/tailoring/${applicationId}`);
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath('/activity');

  return NextResponse.redirect(new URL(`/tailoring/${applicationId}`, request.url));
}
