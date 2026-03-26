import { NextRequest, NextResponse } from 'next/server';
import { ActorType, JobStatus, prisma } from '@job-ops/db';
import { makeAuditEvent } from '@job-ops/domain';

import { sameOriginUrl } from '../../../../../../lib/redirects';
import { requireRouteSession } from '../../../../../../lib/route-auth';

function isMissingScoutDecisionTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code ?? '') : '';

  return code === 'P2021' && (/ScoutDecision/i.test(message) || /public\.ScoutDecision/i.test(message));
}

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
    let job: any;

    try {
      job = await tx.job.findUnique({
        where: { id: jobId },
        include: {
          scoutDecisions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });
    } catch (error) {
      if (!isMissingScoutDecisionTableError(error)) {
        throw error;
      }

      job = await tx.job.findUnique({ where: { id: jobId } });
      if (job) {
        job = { ...job, scoutDecisions: [] };
      }
    }

    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    const latestDecision = job.scoutDecisions?.[0] ?? null;
    const previousStatus = job.status;

    await tx.job.update({
      where: { id: jobId },
      data: { status: JobStatus.archived },
    });

    const feedbackType = !latestDecision
      ? 'manual_only'
      : String(latestDecision.verdict) === 'archive'
        ? 'agree'
        : 'override';

    await tx.auditEvent.createMany({
      data: [
        makeAuditEvent({
          entityType: 'job',
          entityId: job.id,
          eventType: 'job.archived',
          actorType: ActorType.user,
          actorLabel: session.email,
          beforeState: { status: previousStatus },
          afterState: { status: JobStatus.archived },
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
            actionTaken: 'archive',
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
