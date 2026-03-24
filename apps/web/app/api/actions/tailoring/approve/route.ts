import { revalidatePath } from 'next/cache';
import { approveTailoringRunForApplication } from '@job-ops/needle-worker';
import { NextRequest, NextResponse } from 'next/server';

import { requireRouteSession } from '../../../../../lib/route-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { session, response } = await requireRouteSession(request);
  if (response || !session) return response;

  const applicationId = request.nextUrl.searchParams.get('applicationId')?.trim();
  const tailoringRunId = request.nextUrl.searchParams.get('tailoringRunId')?.trim();

  if (!applicationId || !tailoringRunId) {
    return NextResponse.redirect(new URL('/tailoring', request.url));
  }

  await approveTailoringRunForApplication(applicationId, tailoringRunId, {
    actorLabel: session.email,
  });

  revalidatePath('/tailoring');
  revalidatePath(`/tailoring/${applicationId}`);
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath('/applying');
  revalidatePath('/activity');

  return NextResponse.redirect(new URL(`/applications/${applicationId}`, request.url));
}
