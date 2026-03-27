import { ActorType, JobStatus, Prisma, prisma } from '@job-ops/db';
import { makeAuditEvent } from '@job-ops/domain';

import { checkJobPostingWithJobSearcherAgent } from './job-searcher';

type PostingCheckRecord = Awaited<ReturnType<typeof prisma.postingCheck.findFirstOrThrow>>;

export type RunPostingViabilityCheckInput = {
  jobId: string;
  actorLabel?: string;
  actorType?: ActorType;
  force?: boolean;
  freshnessWindowHours?: number;
};

export type RunPostingViabilityCheckResult = {
  postingCheck: PostingCheckRecord;
  reusedExistingCheck: boolean;
};

export type BackfillPostingViabilityChecksInput = {
  limit?: number;
  force?: boolean;
  freshnessWindowHours?: number;
  actorLabel?: string;
  actorType?: ActorType;
  jobIds?: string[];
};

export type BackfillPostingViabilityChecksResult = {
  scannedJobs: number;
  createdChecks: number;
  reusedChecks: number;
  errors: Array<{ jobId: string; message: string }>;
  statusCounts: Record<'live' | 'probably_live' | 'uncertain' | 'dead', number>;
};

export async function runPostingViabilityCheckForJob(
  input: RunPostingViabilityCheckInput,
): Promise<RunPostingViabilityCheckResult> {
  const actorLabel = input.actorLabel?.trim() || 'scout-posting-check';
  const actorType = input.actorType ?? ActorType.agent;
  const freshnessWindowHours = input.freshnessWindowHours ?? parseFreshnessWindowHours(process.env.POSTING_CHECK_FRESHNESS_HOURS);

  const job = await prisma.job.findUnique({
    where: { id: input.jobId },
    include: {
      company: true,
      postingChecks: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      sourceLinks: {
        include: {
          sourceRecord: true,
        },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
        take: 5,
      },
    },
  });

  if (!job) {
    throw new Error(`Job not found: ${input.jobId}`);
  }

  const latestPostingCheck = job.postingChecks[0] ?? null;
  if (!input.force && latestPostingCheck && isFreshEnough(latestPostingCheck.createdAt, freshnessWindowHours)) {
    return { postingCheck: latestPostingCheck, reusedExistingCheck: true };
  }

  const originalUrl = resolveOriginalUrl(job.jobUrl, job.sourceLinks);
  const sourceBoard = resolveSourceBoard(originalUrl, job.sourceLinks);

  await prisma.auditEvent.create({
    data: makeAuditEvent({
      entityType: 'job',
      entityId: job.id,
      eventType: 'job.posting_check_requested',
      actorType,
      actorLabel,
      payloadJson: {
        originalUrl,
        sourceBoard,
      },
    }),
  });

  if (!originalUrl) {
    const postingCheck = await persistPostingCheck({
      jobId: job.id,
      actorType,
      actorLabel,
      status: 'uncertain',
      originalUrl: null,
      finalUrl: null,
      replacementUrl: null,
      sourceBoard,
      evidence: ['No usable HTTP source URL was available for verification.'],
      notes: 'Missing canonical HTTP job URL.',
    });

    return { postingCheck, reusedExistingCheck: false };
  }

  try {
    const result = await checkJobPostingWithJobSearcherAgent({
      jobId: job.id,
      title: job.title,
      companyName: job.company.name,
      locationText: job.locationText,
      originalUrl,
      sourceBoard,
    });

    const postingCheck = await persistPostingCheck({
      jobId: job.id,
      actorType,
      actorLabel,
      status: result.postingStatus,
      originalUrl,
      finalUrl: result.finalUrl,
      replacementUrl: result.replacementUrl,
      sourceBoard: result.sourceBoard ?? sourceBoard,
      evidence: result.evidence,
      notes: result.notes,
    });

    return { postingCheck, reusedExistingCheck: false };
  } catch (error) {
    await prisma.auditEvent.create({
      data: makeAuditEvent({
        entityType: 'job',
        entityId: job.id,
        eventType: 'job.posting_check_failed',
        actorType,
        actorLabel,
        payloadJson: {
          originalUrl,
          sourceBoard,
          message: getErrorMessage(error),
        },
      }),
    });

    throw error;
  }
}

export async function backfillPostingViabilityChecksForShortlistedJobs(
  input: BackfillPostingViabilityChecksInput = {},
): Promise<BackfillPostingViabilityChecksResult> {
  const actorLabel = input.actorLabel?.trim() || 'scout-posting-backfill';
  const actorType = input.actorType ?? ActorType.system;
  const jobs = await prisma.job.findMany({
    where: {
      status: JobStatus.shortlisted,
      ...(input.jobIds && input.jobIds.length > 0 ? { id: { in: input.jobIds } } : {}),
    },
    orderBy: [{ updatedAt: 'desc' }, { lastSeenAt: 'desc' }],
    take: input.limit,
    select: { id: true },
  });

  const result: BackfillPostingViabilityChecksResult = {
    scannedJobs: jobs.length,
    createdChecks: 0,
    reusedChecks: 0,
    errors: [],
    statusCounts: {
      live: 0,
      probably_live: 0,
      uncertain: 0,
      dead: 0,
    },
  };

  for (const job of jobs) {
    try {
      const postingResult = await runPostingViabilityCheckForJob({
        jobId: job.id,
        actorLabel,
        actorType,
        force: input.force,
        freshnessWindowHours: input.freshnessWindowHours,
      });

      if (postingResult.reusedExistingCheck) {
        result.reusedChecks += 1;
      } else {
        result.createdChecks += 1;
      }

      result.statusCounts[postingResult.postingCheck.status] += 1;
    } catch (error) {
      result.errors.push({
        jobId: job.id,
        message: getErrorMessage(error),
      });
    }
  }

  return result;
}

async function persistPostingCheck(args: {
  jobId: string;
  actorType: ActorType;
  actorLabel: string;
  status: 'live' | 'probably_live' | 'uncertain' | 'dead';
  originalUrl: string | null;
  finalUrl: string | null;
  replacementUrl: string | null;
  sourceBoard: string | null;
  evidence: string[];
  notes: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const postingCheck = await tx.postingCheck.create({
      data: {
        jobId: args.jobId,
        status: args.status,
        checkerType: args.actorType,
        checkerLabel: args.actorLabel,
        originalUrl: args.originalUrl,
        finalUrl: args.finalUrl,
        replacementUrl: args.replacementUrl,
        sourceBoard: args.sourceBoard,
        evidenceJson: args.evidence as unknown as Prisma.InputJsonValue,
        notes: args.notes,
      },
    });

    const auditEvents = [
      makeAuditEvent({
        entityType: 'job',
        entityId: args.jobId,
        eventType: 'job.posting_checked',
        actorType: args.actorType,
        actorLabel: args.actorLabel,
        payloadJson: {
          postingCheckId: postingCheck.id,
          status: args.status,
          originalUrl: args.originalUrl,
          finalUrl: args.finalUrl,
          replacementUrl: args.replacementUrl,
          sourceBoard: args.sourceBoard,
          evidence: args.evidence,
          notes: args.notes,
        },
      }),
    ];

    if (args.status === 'dead') {
      auditEvents.push(
        makeAuditEvent({
          entityType: 'job',
          entityId: args.jobId,
          eventType: 'job.posting_marked_dead',
          actorType: args.actorType,
          actorLabel: args.actorLabel,
          payloadJson: {
            postingCheckId: postingCheck.id,
            originalUrl: args.originalUrl,
            finalUrl: args.finalUrl,
            replacementUrl: args.replacementUrl,
          },
        }),
      );
    }

    if (args.replacementUrl) {
      auditEvents.push(
        makeAuditEvent({
          entityType: 'job',
          entityId: args.jobId,
          eventType: 'job.posting_recovered',
          actorType: args.actorType,
          actorLabel: args.actorLabel,
          payloadJson: {
            postingCheckId: postingCheck.id,
            originalUrl: args.originalUrl,
            replacementUrl: args.replacementUrl,
          },
        }),
      );
    }

    await tx.auditEvent.createMany({
      data: auditEvents,
    });

    return postingCheck;
  });
}

function resolveOriginalUrl(
  jobUrl: string,
  sourceLinks: Array<{
    sourceRecord: {
      sourceUrl: string | null;
    };
  }>,
) {
  const linkedSourceUrl = sourceLinks.find((link) => isHttpUrl(link.sourceRecord.sourceUrl))?.sourceRecord.sourceUrl ?? null;
  if (linkedSourceUrl) {
    return linkedSourceUrl;
  }

  return isHttpUrl(jobUrl) ? jobUrl : null;
}

function resolveSourceBoard(
  originalUrl: string | null,
  sourceLinks: Array<{
    sourceRecord: {
      sourceKey: string;
    };
  }>,
) {
  const linkedSourceKey = sourceLinks[0]?.sourceRecord.sourceKey ?? null;
  if (linkedSourceKey) {
    return linkedSourceKey;
  }

  if (!originalUrl) {
    return null;
  }

  try {
    return new URL(originalUrl).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function isHttpUrl(value: string | null | undefined) {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function isFreshEnough(createdAt: Date, freshnessWindowHours: number) {
  return Date.now() - createdAt.getTime() <= freshnessWindowHours * 60 * 60 * 1000;
}

function parseFreshnessWindowHours(value: string | undefined) {
  const parsed = Number.parseFloat(value ?? '');
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 24;
  }

  return parsed;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
