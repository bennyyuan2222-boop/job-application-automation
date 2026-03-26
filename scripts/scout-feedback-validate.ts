import { ActorType, JobStatus, WorkMode, prisma } from '@job-ops/db';
import { makeAuditEvent } from '@job-ops/domain';

type DecisionVerdict = 'shortlist' | 'archive' | 'defer' | 'needs_human_review';
type ManualAction = 'shortlist' | 'archive';
type ExpectedFeedback = 'agree' | 'override' | 'manual_only';

async function main() {
  const overrideCase = await seedDiscoveredJobWithDecision('needs_human_review');
  await applyManualAction(overrideCase.jobId, 'shortlist');
  await assertFeedback(overrideCase.jobId, 'shortlisted', 'override');

  const agreeCase = await seedDiscoveredJobWithDecision('archive');
  await applyManualAction(agreeCase.jobId, 'archive');
  await assertFeedback(agreeCase.jobId, 'archived', 'agree');

  console.log(
    JSON.stringify(
      {
        ok: true,
        cases: [
          { jobId: overrideCase.jobId, expected: 'override', action: 'shortlist' },
          { jobId: agreeCase.jobId, expected: 'agree', action: 'archive' },
        ],
      },
      null,
      2,
    ),
  );
}

async function seedDiscoveredJobWithDecision(verdict: DecisionVerdict) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const company = await prisma.company.create({
    data: {
      name: `Scout Feedback Test ${suffix}`,
      normalizedName: `scout-feedback-test-${suffix}`,
    },
  });

  const scrapeRun = await prisma.scrapeRun.create({
    data: {
      sourceKey: 'feedback-test',
      searchTerm: 'Data Analyst',
      searchLocation: 'New York City',
      triggerType: 'test',
      status: 'completed',
      resultCount: 1,
      fetchedCount: 1,
      capturedCount: 1,
      normalizedCount: 1,
      rejectedCount: 0,
      erroredCount: 0,
      dedupedCount: 0,
      createdJobCount: 1,
      notes: `feedback-validation-${verdict}`,
      completedAt: new Date(),
    },
  });

  const job = await prisma.job.create({
    data: {
      companyId: company.id,
      title: `Data Analyst Feedback Case ${suffix}`,
      normalizedTitle: 'data analyst feedback case',
      locationText: 'New York City',
      workMode: WorkMode.hybrid,
      jobUrl: `https://example.com/scout-feedback/${suffix}`,
      jobDescriptionRaw: 'Deterministic feedback validation job',
      jobDescriptionClean: 'Deterministic feedback validation job',
      status: JobStatus.discovered,
    },
  });

  await prisma.scoutDecision.create({
    data: {
      jobId: job.id,
      scrapeRunId: scrapeRun.id,
      verdict,
      confidence: 0.77,
      reasonsJson: ['Deterministic validation decision.'],
      ambiguityFlagsJson: verdict === 'needs_human_review' ? ['validation_ambiguity'] : [],
      actedAutomatically: false,
      policyVersion: 'scout-decision-v1',
    },
  });

  return { jobId: job.id };
}

async function applyManualAction(jobId: string, actionTaken: ManualAction) {
  const nextStatus = actionTaken === 'shortlist' ? JobStatus.shortlisted : JobStatus.archived;

  await prisma.$transaction(async (tx: any) => {
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
      data: { status: nextStatus },
    });

    const feedbackType = !latestDecision
      ? 'manual_only'
      : String(latestDecision.verdict) === actionTaken
        ? 'agree'
        : 'override';

    await tx.auditEvent.createMany({
      data: [
        makeAuditEvent({
          entityType: 'job',
          entityId: job.id,
          eventType: nextStatus === JobStatus.shortlisted ? 'job.shortlisted' : 'job.archived',
          actorType: ActorType.user,
          actorLabel: 'benny-manual',
          beforeState: { status: previousStatus },
          afterState: { status: nextStatus },
          payloadJson: {
            source: 'manual_inbox_action',
            scoutDecisionId: latestDecision?.id ?? null,
          },
        }),
        makeAuditEvent({
          entityType: 'job',
          entityId: job.id,
          eventType: 'scout.feedback_recorded',
          actorType: ActorType.user,
          actorLabel: 'benny-manual',
          payloadJson: {
            actionTaken,
            feedbackType,
            scoutDecisionId: latestDecision?.id ?? null,
            scoutVerdict: latestDecision?.verdict ?? null,
            scoutConfidence: latestDecision?.confidence ?? null,
          },
        }),
      ],
    });
  });
}

async function assertFeedback(jobId: string, expectedStatus: 'shortlisted' | 'archived', expectedFeedback: ExpectedFeedback) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  const feedbackEvent = await prisma.auditEvent.findFirst({
    where: {
      entityType: 'job',
      entityId: jobId,
      eventType: 'scout.feedback_recorded',
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!job || job.status !== expectedStatus) {
    throw new Error(`Job ${jobId} status assertion failed. Expected ${expectedStatus}, got ${job?.status ?? 'missing'}`);
  }

  if (!feedbackEvent) {
    throw new Error(`No scout.feedback_recorded audit event found for job ${jobId}`);
  }

  const payload = (feedbackEvent.payloadJson ?? {}) as Record<string, unknown>;

  if (payload.feedbackType !== expectedFeedback) {
    throw new Error(`Feedback type assertion failed for job ${jobId}. Expected ${expectedFeedback}, got ${String(payload.feedbackType)}`);
  }

  if (!payload.scoutDecisionId) {
    throw new Error(`Feedback audit event for job ${jobId} was not linked to a ScoutDecision`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
