import { revalidatePath } from 'next/cache';
import { ActorType, ApplicationStatus, ResumeVersionKind, prisma } from '@job-ops/db';
import { makeAuditEvent } from '@job-ops/domain';
import { generateTailoringDraftForApplication } from '@job-ops/needle-worker';
import { NextRequest, NextResponse } from 'next/server';

import { requireRouteSession } from '../../../../../../lib/route-auth';
import { sameOriginUrl } from '../../../../../../lib/redirects';

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

  const fallbackBaseResume = await prisma.resumeVersion.findFirst({
    where: { kind: ResumeVersionKind.base },
    orderBy: { createdAt: 'asc' },
  });

  if (!fallbackBaseResume) {
    return NextResponse.redirect(sameOriginUrl(request, '/shortlist'));
  }

  const application = await prisma.$transaction(async (tx) => {
    const createdApplication = await tx.application.create({
      data: {
        jobId,
        status: ApplicationStatus.tailoring,
        baseResumeVersionId: fallbackBaseResume.id,
      },
    });

    await tx.auditEvent.createMany({
      data: [
        makeAuditEvent({
          entityType: 'application',
          entityId: createdApplication.id,
          eventType: 'application.created',
          actorType: ActorType.user,
          actorLabel: session.email,
          afterState: { status: ApplicationStatus.tailoring, jobId },
          payloadJson: { jobId, baseResumeVersionId: fallbackBaseResume.id },
        }),
        makeAuditEvent({
          entityType: 'job',
          entityId: jobId,
          eventType: 'job.application_started',
          actorType: ActorType.user,
          actorLabel: session.email,
          beforeState: { status: job.status },
          afterState: { status: job.status },
          payloadJson: { applicationId: createdApplication.id },
        }),
      ],
    });

    return createdApplication;
  });

  await generateTailoringDraftForApplication(application.id, {
    actorLabel: session.email,
    instructions: 'Auto-generated after starting application from shortlist.',
  });

  revalidatePath('/');
  revalidatePath('/inbox');
  revalidatePath('/shortlist');
  revalidatePath('/tailoring');
  revalidatePath(`/tailoring/${application.id}`);
  revalidatePath('/activity');

  return NextResponse.redirect(sameOriginUrl(request, `/tailoring/${application.id}`));
}
