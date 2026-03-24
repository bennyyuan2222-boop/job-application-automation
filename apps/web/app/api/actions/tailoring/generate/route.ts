import { revalidatePath } from 'next/cache';
import { generateTailoringDraftForApplication } from '@job-ops/needle-worker';
import { NextRequest, NextResponse } from 'next/server';

import { requireRouteSession } from '../../../../../lib/route-auth';
import { sameOriginUrl } from '../../../../../lib/redirects';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireRouteSession(request);
  if (!auth.ok) return auth.response;

  const { session } = auth;

  const applicationId = request.nextUrl.searchParams.get('applicationId')?.trim();
  const instructions = request.nextUrl.searchParams.get('instructions')?.trim() || undefined;

  if (!applicationId) {
    return NextResponse.redirect(sameOriginUrl(request, '/tailoring'));
  }

  await generateTailoringDraftForApplication(applicationId, {
    actorLabel: session.email,
    instructions,
  });

  revalidatePath('/tailoring');
  revalidatePath(`/tailoring/${applicationId}`);
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath('/activity');

  return NextResponse.redirect(sameOriginUrl(request, `/tailoring/${applicationId}`));
}
