import { revalidatePath } from 'next/cache';
import { ActorType } from '@job-ops/db';
import { runPostingViabilityCheckForJob } from '@job-ops/scout-worker';
import { NextRequest, NextResponse } from 'next/server';

import { sameOriginUrl } from '../../../../../../lib/redirects';
import { requireRouteSession } from '../../../../../../lib/route-auth';

function resolveNextPath(request: NextRequest, fallbackPath: string) {
  const nextPath = request.nextUrl.searchParams.get('next');
  if (!nextPath || !nextPath.startsWith('/') || nextPath.startsWith('//')) {
    return fallbackPath;
  }

  return nextPath;
}

export async function POST(request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const auth = await requireRouteSession(request);
  if (!auth.ok) return auth.response;

  const { session } = auth;
  const { jobId } = await context.params;

  await runPostingViabilityCheckForJob({
    jobId,
    actorType: ActorType.user,
    actorLabel: session.email,
    force: true,
  });

  revalidatePath('/');
  revalidatePath('/activity');
  revalidatePath('/inbox');
  revalidatePath('/shortlist');
  revalidatePath(`/jobs/${jobId}`);

  return NextResponse.redirect(sameOriginUrl(request, resolveNextPath(request, `/jobs/${jobId}`)));
}
