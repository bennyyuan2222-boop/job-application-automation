import { prisma } from '@job-ops/db';

export type ScoutLearningSignal = {
  bucket: 'exact_data_analyst' | 'adjacent_analyst' | 'non_target';
  shortlistOverrideCount: number;
  archiveOverrideCount: number;
  shortlistAgreeCount: number;
  archiveAgreeCount: number;
  shortlistConfidenceDelta: number;
  archiveConfidenceDelta: number;
  suppressAdjacentAmbiguity: boolean;
  notes: string[];
};

type FeedbackPayload = {
  actionTaken?: unknown;
  feedbackType?: unknown;
};

export async function loadScoutLearningSignal(normalizedTitle: string): Promise<ScoutLearningSignal> {
  const bucket = classifyTitleBucket(normalizedTitle);
  const jobs = await prisma.job.findMany({
    where: buildBucketJobWhere(bucket) as any,
    select: { id: true },
    take: 250,
  });

  const jobIds = jobs.map((job) => job.id);

  const events = jobIds.length
    ? await prisma.auditEvent.findMany({
        where: {
          entityType: 'job',
          entityId: { in: jobIds },
          eventType: 'scout.feedback_recorded',
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      })
    : [];

  let shortlistOverrideCount = 0;
  let archiveOverrideCount = 0;
  let shortlistAgreeCount = 0;
  let archiveAgreeCount = 0;

  for (const event of events) {
    const payload = (event.payloadJson ?? {}) as FeedbackPayload;
    const actionTaken = typeof payload.actionTaken === 'string' ? payload.actionTaken : null;
    const feedbackType = typeof payload.feedbackType === 'string' ? payload.feedbackType : null;

    if (actionTaken === 'shortlist' && feedbackType === 'override') shortlistOverrideCount += 1;
    if (actionTaken === 'archive' && feedbackType === 'override') archiveOverrideCount += 1;
    if (actionTaken === 'shortlist' && feedbackType === 'agree') shortlistAgreeCount += 1;
    if (actionTaken === 'archive' && feedbackType === 'agree') archiveAgreeCount += 1;
  }

  const notes: string[] = [];
  let shortlistConfidenceDelta = 0;
  let archiveConfidenceDelta = 0;
  let suppressAdjacentAmbiguity = false;

  if (shortlistOverrideCount >= 2 && shortlistOverrideCount > archiveOverrideCount) {
    shortlistConfidenceDelta += 0.08;
    notes.push('Humans have overridden Scout toward shortlist for similar jobs.');
  }

  if (archiveOverrideCount >= 2 && archiveOverrideCount > shortlistOverrideCount) {
    archiveConfidenceDelta += 0.08;
    notes.push('Humans have overridden Scout toward archive for similar jobs.');
  }

  if (shortlistAgreeCount >= 3 && shortlistAgreeCount > archiveAgreeCount) {
    shortlistConfidenceDelta += 0.04;
    notes.push('Humans often agree with shortlist decisions for similar jobs.');
  }

  if (archiveAgreeCount >= 3 && archiveAgreeCount > shortlistAgreeCount) {
    archiveConfidenceDelta += 0.04;
    notes.push('Humans often agree with archive decisions for similar jobs.');
  }

  if (bucket === 'adjacent_analyst' && shortlistOverrideCount >= 2 && shortlistOverrideCount >= archiveOverrideCount) {
    suppressAdjacentAmbiguity = true;
    notes.push('Adjacent analyst titles have positive manual-override history.');
  }

  return {
    bucket,
    shortlistOverrideCount,
    archiveOverrideCount,
    shortlistAgreeCount,
    archiveAgreeCount,
    shortlistConfidenceDelta,
    archiveConfidenceDelta,
    suppressAdjacentAmbiguity,
    notes,
  };
}

function classifyTitleBucket(normalizedTitle: string): ScoutLearningSignal['bucket'] {
  if (normalizedTitle.includes('data analyst')) {
    return 'exact_data_analyst';
  }

  if (
    normalizedTitle.includes('business analyst') ||
    normalizedTitle.includes('product analyst') ||
    normalizedTitle.includes('analytics analyst') ||
    normalizedTitle.includes('bi analyst') ||
    normalizedTitle.includes('business intelligence')
  ) {
    return 'adjacent_analyst';
  }

  return 'non_target';
}

function buildBucketJobWhere(bucket: ScoutLearningSignal['bucket']) {
  if (bucket === 'exact_data_analyst') {
    return {
      normalizedTitle: {
        contains: 'data analyst',
      },
    };
  }

  if (bucket === 'adjacent_analyst') {
    return {
      OR: [
        { normalizedTitle: { contains: 'business analyst' } },
        { normalizedTitle: { contains: 'product analyst' } },
        { normalizedTitle: { contains: 'analytics analyst' } },
        { normalizedTitle: { contains: 'bi analyst' } },
        { normalizedTitle: { contains: 'business intelligence' } },
      ],
    };
  }

  return {
    NOT: {
      OR: [
        { normalizedTitle: { contains: 'data analyst' } },
        { normalizedTitle: { contains: 'business analyst' } },
        { normalizedTitle: { contains: 'product analyst' } },
        { normalizedTitle: { contains: 'analytics analyst' } },
        { normalizedTitle: { contains: 'bi analyst' } },
        { normalizedTitle: { contains: 'business intelligence' } },
      ],
    },
  };
}
