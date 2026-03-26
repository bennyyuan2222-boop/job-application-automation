import { NextRequest, NextResponse } from 'next/server';
import { ActorType, JobStatus, prisma } from '@job-ops/db';
import { makeAuditEvent } from '@job-ops/domain';

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

  await prisma.$transaction(async (tx) => {
    const job = await tx.job.findUnique({
      where: { id: jobId },
      include: {
        scoutDecisions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    const latestDecision = job.scoutDecisions?.[0] ?? null;
    const previousStatus = job.status;

    await tx.job.update({
      where: { id: jobId },
      data: { status: JobStatus.shortlisted },
    });

    const feedbackType = !latestDecision
      ? 'manual_only'
      : String(latestDecision.verdict) === 'shortlist'
        ? 'agree'
        : 'override';

    await tx.auditEvent.createMany({
      data: [
        makeAuditEvent({
          entityType: 'job',
          entityId: job.id,
          eventType: 'job.shortlisted',
          actorType: ActorType.user,
          actorLabel: session.email,
          beforeState: { status: previousStatus },
          afterState: { status: JobStatus.shortlisted },
          payloadJson: {
            source: 'manual_web_action',
            scoutDecisionId: latestDecision?.id ?? null,
            feedbackType,
          },
        }),
        makeAuditEvent({
          entityType: 'job',
          entityId: job.id,
          eventType: 'scout.feedback_recorded',
          actorType: ActorType.user,
          actorLabel: session.email,
          payloadJson: {
            actionTaken: 'shortlist',
            feedbackType,
            scoutDecisionId: latestDecision?.id ?? null,
            scoutVerdict: latestDecision?.verdict ?? null,
            scoutConfidence: latestDecision?.confidence ?? null,
          },
        }),
      ],
    });
  });

  return NextResponse.redirect(sameOriginUrl(request, resolveNextPath(request, '/inbox')));
}
