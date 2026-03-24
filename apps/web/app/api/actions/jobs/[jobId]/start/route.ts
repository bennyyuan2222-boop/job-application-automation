import { revalidatePath } from 'next/cache';
import { ActorType, ApplicationStatus, ResumeVersionKind, prisma } from '@job-ops/db';
import { makeAuditEvent } from '@job-ops/domain';
import { generateTailoringDraftForApplication } from '@job-ops/needle-worker';
import { NextRequest, NextResponse } from 'next/server';

import { requireRouteSession } from '../../../../../../lib/route-auth';

export const dynamic = 'force-dynamic';

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
  const { session, response } = await requireRouteSession(request);
  if (response || !session) return response;

  const { jobId } = await params;
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      applications: {
        where: { status: { not: 'archived' } },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!job) {
    return NextResponse.redirect(new URL('/shortlist', request.url));
  }

  const existingApplication = job.applications[0] ?? null;
  if (existingApplication) {
    return NextResponse.redirect(new URL(applicationRouteForStatus(existingApplication.id, existingApplication.status), request.url));
  }

  const fallbackBaseResume = await prisma.resumeVersion.findFirst({
    where: { kind: ResumeVersionKind.base },
    orderBy: { createdAt: 'asc' },
  });

  if (!fallbackBaseResume) {
    return NextResponse.redirect(new URL('/shortlist', request.url));
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

  return NextResponse.redirect(new URL(`/tailoring/${application.id}`, request.url));
}
