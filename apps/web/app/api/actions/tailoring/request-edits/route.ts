import { revalidatePath } from 'next/cache';
import { requestTailoringEditsForApplication } from '@job-ops/needle-worker';
import { NextRequest, NextResponse } from 'next/server';

import { requireRouteSession } from '../../../../../lib/route-auth';
import { sameOriginUrl } from '../../../../../lib/redirects';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireRouteSession(request);
  if (!auth.ok) return auth.response;

  const { session } = auth;

  const applicationId = request.nextUrl.searchParams.get('applicationId')?.trim();
  const tailoringRunId = request.nextUrl.searchParams.get('tailoringRunId')?.trim();
  const revisionNote = request.nextUrl.searchParams.get('revisionNote')?.trim();

  if (!applicationId || !tailoringRunId || !revisionNote) {
    return NextResponse.redirect(sameOriginUrl(request, '/tailoring'));
  }

  await requestTailoringEditsForApplication(applicationId, tailoringRunId, revisionNote, {
    actorLabel: session.email,
  });

  revalidatePath('/tailoring');
  revalidatePath(`/tailoring/${applicationId}`);
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath('/activity');

  return NextResponse.redirect(sameOriginUrl(request, `/tailoring/${applicationId}`));
}
