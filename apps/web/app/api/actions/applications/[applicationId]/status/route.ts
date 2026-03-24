import { revalidatePath } from 'next/cache';
import { ApplicationStatus, prisma } from '@job-ops/db';
import {
  assertApplicationTransition,
  makeAuditEvent,
  type ApplicationStatus as DomainApplicationStatus,
  type JsonLike,
} from '@job-ops/domain';
import { evaluateApplicationReadiness } from '@job-ops/readiness';
import { NextRequest, NextResponse } from 'next/server';

import { requireRouteSession } from '../../../../../../lib/route-auth';

export const dynamic = 'force-dynamic';

async function syncReadiness(applicationId: string) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      answers: true,
      attachments: true,
      portalSessions: {
        orderBy: [{ lastSyncedAt: 'desc' }, { id: 'desc' }],
      },
    },
  });

  if (!application) {
    throw new Error('Application not found');
  }

  const readiness = evaluateApplicationReadiness({
    status: application.status,
    tailoredResumeVersionId: application.tailoredResumeVersionId,
    answers: application.answers,
    attachments: application.attachments,
    portalSessions: application.portalSessions,
  });

  await prisma.application.update({
    where: { id: application.id },
    data: {
      completionPercent: readiness.completionPercent,
      missingRequiredCount: readiness.missingRequiredCount,
      lowConfidenceCount: readiness.lowConfidenceCount,
    },
  });

  return readiness;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  const auth = await requireRouteSession(request);
  if (!auth.ok) return auth.response;

  const { session } = auth;

  const { applicationId } = await params;
  const target = request.nextUrl.searchParams.get('to');

  if (!target) {
    return NextResponse.redirect(new URL(`/applications/${applicationId}`, request.url));
  }

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      portalSessions: {
        orderBy: [{ lastSyncedAt: 'desc' }, { id: 'desc' }],
        take: 1,
      },
    },
  });

  if (!application) {
    return NextResponse.redirect(new URL('/applying', request.url));
  }

  const readiness = await syncReadiness(applicationId);

  let nextStatus: ApplicationStatus;
  let eventType: string;
  let submittedAt: Date | null | undefined;
  let portalSessionStatus: 'ready_for_review' | 'submitted' | undefined;
  let payloadJson: JsonLike = null;

  switch (target) {
    case 'submit_review':
      if (!readiness.ready) {
        return NextResponse.redirect(new URL(`/applications/${applicationId}`, request.url));
      }
      nextStatus = ApplicationStatus.submit_review;
      eventType = 'application.moved_to_submit_review';
      portalSessionStatus = 'ready_for_review';
      payloadJson = { recommendedNextAction: readiness.recommendedNextAction };
      break;
    case 'applying':
      nextStatus = ApplicationStatus.applying;
      eventType = 'application.returned_to_applying';
      payloadJson = { source: 'submit_review' };
      break;
    case 'submitted':
      nextStatus = ApplicationStatus.submitted;
      eventType = 'application.submitted';
      submittedAt = new Date();
      portalSessionStatus = 'submitted';
      payloadJson = { source: 'manual_confirmation' };
      break;
    default:
      return NextResponse.redirect(new URL(`/applications/${applicationId}`, request.url));
  }

  assertApplicationTransition(application.status as DomainApplicationStatus, nextStatus as DomainApplicationStatus);

  await prisma.$transaction(async (tx) => {
    await tx.application.update({
      where: { id: applicationId },
      data: {
        status: nextStatus,
        submittedAt: submittedAt === undefined ? application.submittedAt : submittedAt,
        pausedReason: nextStatus === ApplicationStatus.submitted ? application.pausedReason : null,
      },
    });

    const latestPortalSession = application.portalSessions[0] ?? null;
    if (latestPortalSession && portalSessionStatus) {
      await tx.portalSession.update({
        where: { id: latestPortalSession.id },
        data: {
          status: portalSessionStatus,
          lastSyncedAt: new Date(),
        },
      });
    }

    await tx.auditEvent.create({
      data: makeAuditEvent({
        entityType: 'application',
        entityId: applicationId,
        eventType,
        actorType: 'user',
        actorLabel: session.email,
        beforeState: { status: application.status, submittedAt: application.submittedAt?.toISOString() ?? null },
        afterState: { status: nextStatus, submittedAt: submittedAt?.toISOString() ?? null },
        payloadJson,
      }),
    });
  });

  await syncReadiness(applicationId);
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath('/applying');
  revalidatePath('/submit-review');
  revalidatePath('/activity');

  return NextResponse.redirect(new URL(`/applications/${applicationId}`, request.url));
}
