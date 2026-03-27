import {
  scoutJobDetailSchema,
  scoutQueueJobSchema,
  scoutRunSummarySchema,
  type JobListItem,
  type PostingCheckSummary,
  type ScoutDecisionSummary,
  type ScoutJobDetail,
  type ScoutQueueJob,
  type ScoutRunSummary,
} from '@job-ops/contracts';
import { prisma } from '@job-ops/db';

type ScoutQueueStatus = 'discovered' | 'shortlisted';

type LegacyScoutRunRow = {
  id: string;
  sourceKey: string;
  searchTerm: string | null;
  searchLocation: string | null;
  status: string;
  resultCount: number;
  createdJobCount: number;
  dedupedCount: number;
  notes: string | null;
  startedAt: Date;
  completedAt: Date | null;
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function appendCompatNote(notes: string | null, compatNote: string) {
  return notes ? `${notes} · ${compatNote}` : compatNote;
}

function isMissingScoutRunTelemetryError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code ?? '') : '';

  return (
    code === 'P2022' ||
    /column .* does not exist/i.test(message) ||
    /triggerType/i.test(message) ||
    /fetchedCount/i.test(message) ||
    /capturedCount/i.test(message) ||
    /normalizedCount/i.test(message) ||
    /rejectedCount/i.test(message) ||
    /erroredCount/i.test(message) ||
    /idempotencyKey/i.test(message) ||
    /errorSummaryJson/i.test(message)
  );
}

function isMissingScoutDecisionTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code ?? '') : '';

  return (
    code === 'P2021' &&
    (/ScoutDecision/i.test(message) || /public\.ScoutDecision/i.test(message) || /"ScoutDecision"/i.test(message))
  );
}

function isMissingPostingCheckTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code ?? '') : '';

  return (
    code === 'P2021' &&
    (/PostingCheck/i.test(message) || /public\.PostingCheck/i.test(message) || /"PostingCheck"/i.test(message))
  );
}

function provenanceFromJobUrl(jobUrl: string) {
  try {
    const url = new URL(jobUrl);
    return {
      sourceKey: url.hostname.replace(/^www\./, '') || url.protocol.replace(':', ''),
      sourceUrl: jobUrl,
    };
  } catch {
    return {
      sourceKey: 'unknown',
      sourceUrl: jobUrl,
    };
  }
}

function mapLatestPostingCheck(postingCheck: {
  id: string;
  status: string;
  checkerType: string;
  checkerLabel: string;
  originalUrl: string | null;
  finalUrl: string | null;
  replacementUrl: string | null;
  sourceBoard: string | null;
  evidenceJson: unknown;
  notes: string | null;
  createdAt: Date;
} | null): PostingCheckSummary | null {
  if (!postingCheck) {
    return null;
  }

  return {
    id: postingCheck.id,
    status: postingCheck.status as PostingCheckSummary['status'],
    checkerType: postingCheck.checkerType,
    checkerLabel: postingCheck.checkerLabel,
    checkedAt: postingCheck.createdAt.toISOString(),
    originalUrl: postingCheck.originalUrl,
    finalUrl: postingCheck.finalUrl,
    replacementUrl: postingCheck.replacementUrl,
    sourceBoard: postingCheck.sourceBoard,
    evidence: asStringArray(postingCheck.evidenceJson),
    notes: postingCheck.notes,
  };
}

function mapLatestDecision(decision: {
  id: string;
  verdict: string;
  confidence: number;
  actedAutomatically: boolean;
  policyVersion: string;
  reasonsJson: unknown;
  ambiguityFlagsJson: unknown;
} | null): ScoutDecisionSummary | null {
  if (!decision) {
    return null;
  }

  return {
    id: decision.id,
    verdict: decision.verdict as ScoutDecisionSummary['verdict'],
    confidence: Number(decision.confidence ?? 0),
    actedAutomatically: Boolean(decision.actedAutomatically),
    policyVersion: decision.policyVersion,
    reasons: asStringArray(decision.reasonsJson),
    ambiguityFlags: asStringArray(decision.ambiguityFlagsJson),
  };
}

function mapScoutQueueJob(job: any): ScoutQueueJob {
  const scorecard = job.scorecards?.[0] ?? null;
  const activeApplication = job.applications?.[0] ?? null;
  const latestDecision = job.scoutDecisions?.[0] ?? null;
  const latestPostingCheck = job.postingChecks?.[0] ?? null;

  return scoutQueueJobSchema.parse({
    id: job.id,
    title: job.title,
    companyName: job.company.name,
    locationText: job.locationText,
    status: String(job.status),
    priorityScore: scorecard?.priorityScore ?? null,
    workMode: job.workMode,
    lastSeenAt: job.lastSeenAt?.toISOString?.() ?? null,
    provenance: provenanceFromJobUrl(job.jobUrl),
    rationale:
      scorecard?.topReasonsJson && Array.isArray(scorecard.topReasonsJson)
        ? String(scorecard.topReasonsJson[0] ?? '') || null
        : null,
    topReasons: asStringArray(scorecard?.topReasonsJson),
    risks: asStringArray(scorecard?.risksJson),
    latestPostingCheck: mapLatestPostingCheck(
      latestPostingCheck
        ? {
            id: latestPostingCheck.id,
            status: String(latestPostingCheck.status),
            checkerType: String(latestPostingCheck.checkerType),
            checkerLabel: String(latestPostingCheck.checkerLabel),
            originalUrl: latestPostingCheck.originalUrl ?? null,
            finalUrl: latestPostingCheck.finalUrl ?? null,
            replacementUrl: latestPostingCheck.replacementUrl ?? null,
            sourceBoard: latestPostingCheck.sourceBoard ?? null,
            evidenceJson: latestPostingCheck.evidenceJson,
            notes: latestPostingCheck.notes ?? null,
            createdAt: latestPostingCheck.createdAt,
          }
        : null,
    ),
    activeApplication: activeApplication
      ? {
          id: activeApplication.id,
          status: String(activeApplication.status),
        }
      : null,
    latestDecision: mapLatestDecision(
      latestDecision
        ? {
            id: latestDecision.id,
            verdict: String(latestDecision.verdict),
            confidence: Number(latestDecision.confidence ?? 0),
            actedAutomatically: Boolean(latestDecision.actedAutomatically),
            policyVersion: String(latestDecision.policyVersion ?? 'unknown'),
            reasonsJson: latestDecision.reasonsJson,
            ambiguityFlagsJson: latestDecision.ambiguityFlagsJson,
          }
        : null,
    ),
  });
}

async function getScoutQueue(status: ScoutQueueStatus): Promise<ScoutQueueJob[]> {
  try {
    const jobs = await prisma.job.findMany({
      where: { status },
      include: {
        company: true,
        scorecards: {
          orderBy: { scoredAt: 'desc' },
          take: 1,
        },
        applications: {
          where: {
            status: {
              not: 'archived',
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        scoutDecisions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        postingChecks: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { lastSeenAt: 'desc' }],
      take: 50,
    });

    return jobs.map(mapScoutQueueJob);
  } catch (error) {
    const missingDecisionTable = isMissingScoutDecisionTableError(error);
    const missingPostingCheckTable = isMissingPostingCheckTableError(error);

    if (!missingDecisionTable && !missingPostingCheckTable) {
      throw error;
    }

    const jobs = await prisma.job.findMany({
      where: { status },
      include: {
        company: true,
        scorecards: {
          orderBy: { scoredAt: 'desc' },
          take: 1,
        },
        applications: {
          where: {
            status: {
              not: 'archived',
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        ...(missingDecisionTable
          ? {}
          : {
              scoutDecisions: {
                orderBy: { createdAt: 'desc' as const },
                take: 1,
              },
            }),
        ...(missingPostingCheckTable
          ? {}
          : {
              postingChecks: {
                orderBy: { createdAt: 'desc' as const },
                take: 1,
              },
            }),
      },
      orderBy: [{ updatedAt: 'desc' }, { lastSeenAt: 'desc' }],
      take: 50,
    });

    return jobs.map((job) =>
      mapScoutQueueJob({
        ...job,
        scoutDecisions: missingDecisionTable ? [] : (job as any).scoutDecisions,
        postingChecks: missingPostingCheckTable ? [] : (job as any).postingChecks,
      }),
    );
  }
}

export async function getInboxScoutJobs(): Promise<ScoutQueueJob[]> {
  return getScoutQueue('discovered');
}

export async function getShortlistedScoutJobs(): Promise<ScoutQueueJob[]> {
  return getScoutQueue('shortlisted');
}

export async function getInboxJobs(): Promise<JobListItem[]> {
  return getInboxScoutJobs();
}

export async function getShortlistedJobs(): Promise<JobListItem[]> {
  return getShortlistedScoutJobs();
}

export async function getSeededJobs(): Promise<JobListItem[]> {
  return getShortlistedJobs();
}

export async function getScoutJobDetail(jobId: string): Promise<ScoutJobDetail | null> {
  let job: any;

  try {
    job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        company: true,
        scorecards: {
          orderBy: { scoredAt: 'desc' },
          take: 1,
        },
        applications: {
          where: {
            status: {
              not: 'archived',
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        scoutDecisions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        postingChecks: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        sourceLinks: {
          include: {
            sourceRecord: true,
          },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
          take: 10,
        },
      },
    });
  } catch (error) {
    const missingDecisionTable = isMissingScoutDecisionTableError(error);
    const missingPostingCheckTable = isMissingPostingCheckTableError(error);

    if (!missingDecisionTable && !missingPostingCheckTable) {
      throw error;
    }

    job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        company: true,
        scorecards: {
          orderBy: { scoredAt: 'desc' },
          take: 1,
        },
        applications: {
          where: {
            status: {
              not: 'archived',
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        ...(missingDecisionTable
          ? {}
          : {
              scoutDecisions: {
                orderBy: { createdAt: 'desc' as const },
                take: 1,
              },
            }),
        ...(missingPostingCheckTable
          ? {}
          : {
              postingChecks: {
                orderBy: { createdAt: 'desc' as const },
                take: 1,
              },
            }),
        sourceLinks: {
          include: {
            sourceRecord: true,
          },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
          take: 10,
        },
      },
    });

    if (job) {
      job = {
        ...job,
        scoutDecisions: missingDecisionTable ? [] : (job as any).scoutDecisions,
        postingChecks: missingPostingCheckTable ? [] : (job as any).postingChecks,
      };
    }
  }

  if (!job) {
    return null;
  }

  const auditEvents = await prisma.auditEvent.findMany({
    where: {
      entityType: 'job',
      entityId: job.id,
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const queueJob = mapScoutQueueJob(job);

  return scoutJobDetailSchema.parse({
    ...queueJob,
    description: job.jobDescriptionClean ?? job.jobDescriptionRaw,
    salaryText: job.salaryText ?? null,
    auditEvents: auditEvents.map((event) => ({
      id: event.id,
      entityType: event.entityType,
      entityId: event.entityId,
      eventType: event.eventType,
      actorType: String(event.actorType),
      actorLabel: event.actorLabel,
      createdAt: event.createdAt.toISOString(),
      payloadJson: event.payloadJson,
    })),
    sourceRecords: job.sourceLinks.map((link: any) => ({
      sourceKey: link.sourceRecord.sourceKey,
      sourceRecordId: link.sourceRecord.sourceRecordId ?? null,
      sourceUrl: link.sourceRecord.sourceUrl ?? null,
      sourceCompanyName: link.sourceRecord.sourceCompanyName ?? null,
      sourceTitle: link.sourceRecord.sourceTitle ?? null,
      sourceLocationText: link.sourceRecord.sourceLocationText ?? null,
      capturedAt: link.sourceRecord.capturedAt.toISOString(),
      matchType: link.matchType,
      isPrimary: link.isPrimary,
    })),
  });
}

async function getRecentScoutRunsLegacy(limit: number): Promise<ScoutRunSummary[]> {
  const runs = await prisma.$queryRaw<LegacyScoutRunRow[]>`
    SELECT
      id,
      "sourceKey",
      "searchTerm",
      "searchLocation",
      status::text AS status,
      "resultCount",
      "createdJobCount",
      "dedupedCount",
      notes,
      "startedAt",
      "completedAt"
    FROM "ScrapeRun"
    ORDER BY "startedAt" DESC, id DESC
    LIMIT ${limit}
  `;

  return runs.map((run) =>
    scoutRunSummarySchema.parse({
      id: run.id,
      sourceKey: run.sourceKey,
      searchTerm: run.searchTerm,
      searchLocation: run.searchLocation,
      triggerType: 'manual',
      status: run.status,
      idempotencyKey: null,
      resultCount: run.resultCount ?? 0,
      fetchedCount: run.resultCount ?? 0,
      capturedCount: run.resultCount ?? 0,
      normalizedCount: run.resultCount ?? 0,
      rejectedCount: 0,
      erroredCount: 0,
      createdJobCount: run.createdJobCount ?? 0,
      dedupedCount: run.dedupedCount ?? 0,
      errorSummaryJson: null,
      notes: appendCompatNote(run.notes ?? null, 'compat_mode=legacy_scraperun_schema'),
      startedAt: run.startedAt.toISOString(),
      completedAt: run.completedAt ? run.completedAt.toISOString() : null,
    }),
  );
}

export async function getRecentScoutRuns(limit = 25): Promise<ScoutRunSummary[]> {
  try {
    const runs = await prisma.scrapeRun.findMany({
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });

    return runs.map((run) =>
      scoutRunSummarySchema.parse({
        id: run.id,
        sourceKey: run.sourceKey,
        searchTerm: run.searchTerm,
        searchLocation: run.searchLocation,
        triggerType: run.triggerType,
        status: run.status,
        idempotencyKey: run.idempotencyKey,
        resultCount: run.resultCount,
        fetchedCount: run.fetchedCount,
        capturedCount: run.capturedCount,
        normalizedCount: run.normalizedCount,
        rejectedCount: run.rejectedCount,
        erroredCount: run.erroredCount,
        createdJobCount: run.createdJobCount,
        dedupedCount: run.dedupedCount,
        errorSummaryJson: run.errorSummaryJson,
        notes: run.notes,
        startedAt: run.startedAt.toISOString(),
        completedAt: run.completedAt ? run.completedAt.toISOString() : null,
      }),
    );
  } catch (error) {
    if (!isMissingScoutRunTelemetryError(error)) {
      throw error;
    }

    return getRecentScoutRunsLegacy(limit);
  }
}
