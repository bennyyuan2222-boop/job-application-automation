import { NextResponse } from 'next/server';
import { ActorType, JobStatus, prisma } from '@job-ops/db';
import { makeAuditEvent } from '@job-ops/domain';

export async function POST(request: Request, context: any) {
  const params = await context.params;

  await prisma.$transaction(async (tx: any) => {
    const job = await tx.job.findUnique({
      where: { id: params.jobId },
      include: {
        scoutDecisions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!job) {
      throw new Error(`Job not found: ${params.jobId}`);
    }

    const latestDecision = job.scoutDecisions?.[0] ?? null;
    const previousStatus = job.status;

    await tx.job.update({
      where: { id: params.jobId },
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
          actorLabel: 'benny-manual',
          beforeState: { status: previousStatus },
          afterState: { status: JobStatus.shortlisted },
          payloadJson: {
            source: 'manual_inbox_action',
            scoutDecisionId: latestDecision?.id ?? null,
            feedbackType,
          },
        }),
        makeAuditEvent({
          entityType: 'job',
          entityId: job.id,
          eventType: 'scout.feedback_recorded',
          actorType: ActorType.user,
          actorLabel: 'benny-manual',
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

  return NextResponse.redirect(new URL('/inbox', request.url));
}
