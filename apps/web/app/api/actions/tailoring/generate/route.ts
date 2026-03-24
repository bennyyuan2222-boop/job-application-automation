import { revalidatePath } from 'next/cache';
import { generateTailoringDraftForApplication } from '@job-ops/needle-worker';
import { NextRequest, NextResponse } from 'next/server';

import { requireRouteSession } from '../../../../../lib/route-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { session, response } = await requireRouteSession(request);
  if (response || !session) return response;

  const applicationId = request.nextUrl.searchParams.get('applicationId')?.trim();
  const instructions = request.nextUrl.searchParams.get('instructions')?.trim() || undefined;

  if (!applicationId) {
    return NextResponse.redirect(new URL('/tailoring', request.url));
  }

  await generateTailoringDraftForApplication(applicationId, {
    actorLabel: session.email,
    instructions,
  });

  revalidatePath('/tailoring');
  revalidatePath(`/tailoring/${applicationId}`);
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath('/activity');

  return NextResponse.redirect(new URL(`/tailoring/${applicationId}`, request.url));
}
