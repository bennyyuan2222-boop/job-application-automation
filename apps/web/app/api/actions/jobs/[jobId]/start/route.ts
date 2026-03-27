import { revalidatePath } from 'next/cache';
import { ApplicationStatus, prisma } from '@job-ops/db';
import { NextRequest, NextResponse } from 'next/server';

import { requireRouteSession } from '../../../../../../lib/route-auth';
import { sameOriginUrl } from '../../../../../../lib/redirects';
import { startApplicationForJob } from '../../../../../../lib/application-start';

export const dynamic = 'force-dynamic';

function isMissingPostingCheckTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code ?? '') : '';

  return code === 'P2021' && (/PostingCheck/i.test(message) || /public\.PostingCheck/i.test(message));
}

function applicationRouteForStatus(applicationId: string, status: string) {
  if (status === ApplicationStatus.applying || status === ApplicationStatus.submit_review || status === ApplicationStatus.submitted) {
    return `/applications/${applicationId}`;
  }

  return `/tailoring/${applicationId}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const auth = await requireRouteSession(request);
  if (!auth.ok) return auth.response;

  const { session } = auth;

  const { jobId } = await params;
  let job: any;

  try {
    job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        applications: {
          where: { status: { not: 'archived' } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        postingChecks: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
  } catch (error) {
    if (!isMissingPostingCheckTableError(error)) {
      throw error;
    }

    job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        applications: {
          where: { status: { not: 'archived' } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (job) {
      job = { ...job, postingChecks: [] };
    }
  }

  if (!job) {
    return NextResponse.redirect(sameOriginUrl(request, '/shortlist'));
  }

  const existingApplication = job.applications[0] ?? null;
  if (existingApplication) {
    return NextResponse.redirect(sameOriginUrl(request, applicationRouteForStatus(existingApplication.id, existingApplication.status)));
  }

  const latestPostingCheck = job.postingChecks?.[0] ?? null;
  if (latestPostingCheck && (latestPostingCheck.status === 'dead' || latestPostingCheck.status === 'uncertain')) {
    return NextResponse.redirect(sameOriginUrl(request, `/jobs/${jobId}`));
  }

  let applicationId: string;

  try {
    const result = await startApplicationForJob({
      jobId,
      jobStatus: job.status,
      actorLabel: session.email,
      initialTailoringInstructions: 'Auto-generated after starting application from shortlist.',
    });
    applicationId = result.applicationId;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/No base resume versions are available/i.test(message)) {
      return NextResponse.redirect(sameOriginUrl(request, '/shortlist'));
    }
    throw error;
  }

  revalidatePath('/');
  revalidatePath('/inbox');
  revalidatePath('/shortlist');
  revalidatePath('/tailoring');
  revalidatePath(`/tailoring/${applicationId}`);
  revalidatePath('/activity');

  return NextResponse.redirect(sameOriginUrl(request, `/tailoring/${applicationId}`));
}
