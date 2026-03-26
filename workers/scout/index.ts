import { ActorType, JobStatus, Prisma } from '@job-ops/db';
import { prisma } from '@job-ops/db';
import {
  makeAuditEvent,
  normalizeScoutJob,
  scoreScoutJob,
  type RawScoutJobInput,
} from '@job-ops/domain';
import { HEURISTIC_SCOUT_POLICY_VERSION, type ScoutDecisionDraft } from './decision';
import { reviewJobsWithJobSearcherAgent, type JobSearcherReviewCandidate } from './job-searcher';
import { loadScoutLearningSignal, type ScoutLearningSignal } from './learning';

export const scoutRunTriggerTypes = ['scheduled', 'manual', 'backfill', 'test'] as const;
export type ScoutRunTriggerType = (typeof scoutRunTriggerTypes)[number];

type ScoutRunRecord = Awaited<ReturnType<typeof prisma.scrapeRun.findFirstOrThrow>>;

export type RunScoutIngestionInput = {
  sourceKey: string;
  searchTerm?: string;
  searchLocation?: string;
  actorLabel?: string;
  notes?: string;
  triggerType?: ScoutRunTriggerType;
  idempotencyKey?: string | null;
  fetchedCount?: number;
  rejectedCount?: number;
  queryJson?: Prisma.InputJsonValue;
  records: RawScoutJobInput[];
};

export type RunScoutIngestionResult = {
  run: ScoutRunRecord;
  reusedExistingRun: boolean;
};

type PendingScoutReview = JobSearcherReviewCandidate & {
  actorLabel: string;
};

export async function runScoutIngestion(input: RunScoutIngestionInput): Promise<RunScoutIngestionResult> {
  const triggerType = input.triggerType ?? 'manual';

  if (input.idempotencyKey) {
    const existingRun = await prisma.scrapeRun.findFirst({
      where: {
        idempotencyKey: input.idempotencyKey,
        status: {
          in: ['fetching', 'processing', 'completed', 'partial'],
        },
      },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
    });

    if (existingRun) {
      return {
        run: existingRun,
        reusedExistingRun: true,
      };
    }
  }

  const fetchedCount = input.fetchedCount ?? input.records.length;
  const initialRejectedCount = input.rejectedCount ?? 0;

  const scrapeRun = await prisma.scrapeRun.create({
    data: {
      sourceKey: input.sourceKey,
      searchTerm: input.searchTerm,
      searchLocation: input.searchLocation,
      triggerType,
      status: 'processing',
      idempotencyKey: input.idempotencyKey ?? null,
      queryJson: buildScoutRunQueryJson(input, triggerType) as Prisma.InputJsonValue,
      resultCount: fetchedCount,
      fetchedCount,
      rejectedCount: initialRejectedCount,
      notes: input.notes ?? null,
    },
  });

  let dedupedCount = 0;
  let createdJobCount = 0;
  let capturedCount = 0;
  let normalizedCount = 0;
  let erroredCount = 0;
  const errorSummaries: Array<Record<string, unknown>> = [];
  const pendingReviews: PendingScoutReview[] = [];

  try {
    for (const [index, record] of input.records.entries()) {
      let sourceRecordId: string | null = null;

      try {
        const normalized = normalizeScoutJob(record);
        const score = scoreScoutJob(normalized);

        const sourceRecord = await prisma.jobSourceRecord.create({
          data: {
            scrapeRunId: scrapeRun.id,
            sourceKey: input.sourceKey,
            sourceRecordId: normalized.sourceRecordId,
            sourceUrl: normalized.sourceUrl,
            sourceCompanyName: normalized.companyName,
            sourceTitle: normalized.title,
            sourceLocationText: normalized.locationText,
            rawPayload: record as Prisma.InputJsonValue,
            normalizedPayload: normalized as unknown as Prisma.InputJsonValue,
            status: 'captured',
          },
        });

        sourceRecordId = sourceRecord.id;
        capturedCount += 1;
        normalizedCount += 1;

        const learningSignal = await loadScoutLearningSignal(normalized.normalizedTitle);
        const actorLabel = input.actorLabel ?? 'scout';

        const existingJob = await prisma.job.findFirst({
          where: {
            OR: [
              normalized.sourceUrl ? { jobUrl: normalized.sourceUrl } : undefined,
              {
                company: { normalizedName: normalized.normalizedCompanyName },
                normalizedTitle: normalized.normalizedTitle,
                locationText: normalized.locationText,
              },
            ].filter(Boolean) as Prisma.JobWhereInput[],
          },
          include: { company: true },
        });

        if (existingJob) {
          dedupedCount += 1;

          await prisma.job.update({
            where: { id: existingJob.id },
            data: {
              lastSeenAt: new Date(),
              jobDescriptionClean: normalized.descriptionClean || existingJob.jobDescriptionClean,
              salaryText: normalized.salaryText ?? existingJob.salaryText,
            },
          });

          await prisma.jobSourceLink.upsert({
            where: {
              jobId_sourceRecordId: {
                jobId: existingJob.id,
                sourceRecordId: sourceRecord.id,
              },
            },
            update: { matchType: 'dedupe' },
            create: {
              jobId: existingJob.id,
              sourceRecordId: sourceRecord.id,
              matchType: 'dedupe',
              isPrimary: false,
            },
          });

          await prisma.jobSourceRecord.update({
            where: { id: sourceRecord.id },
            data: { status: 'deduped', errorMessage: null },
          });

          await prisma.auditEvent.create({
            data: makeAuditEvent({
              entityType: 'job',
              entityId: existingJob.id,
              eventType: 'job.source_record_linked',
              actorType: ActorType.agent,
              actorLabel,
              payloadJson: {
                scrapeRunId: scrapeRun.id,
                sourceRecordId: sourceRecord.id,
                matchType: 'dedupe',
              },
            }),
          });

          pendingReviews.push({
            jobId: existingJob.id,
            previousStatus: existingJob.status,
            normalized,
            score,
            learningSignal,
            actorLabel,
          });

          continue;
        }

        const company = await prisma.company.upsert({
          where: { normalizedName: normalized.normalizedCompanyName },
          update: { name: normalized.companyName },
          create: {
            name: normalized.companyName,
            normalizedName: normalized.normalizedCompanyName,
          },
        });

        const job = await prisma.job.create({
          data: {
            companyId: company.id,
            title: normalized.title,
            normalizedTitle: normalized.normalizedTitle,
            locationText: normalized.locationText,
            workMode: normalized.workMode,
            salaryText: normalized.salaryText,
            jobUrl: normalized.sourceUrl ?? `source://${input.sourceKey}/${sourceRecord.id}`,
            jobDescriptionRaw: normalized.descriptionRaw,
            jobDescriptionClean: normalized.descriptionClean,
            status: JobStatus.discovered,
          },
        });

        createdJobCount += 1;

        await prisma.jobSourceLink.create({
          data: {
            jobId: job.id,
            sourceRecordId: sourceRecord.id,
            matchType: 'primary',
            isPrimary: true,
          },
        });

        await prisma.jobSourceRecord.update({
          where: { id: sourceRecord.id },
          data: { status: 'normalized', errorMessage: null },
        });

        await prisma.jobScorecard.create({
          data: {
            jobId: job.id,
            fitScore: score.fitScore,
            companyQualityScore: score.companyQualityScore,
            aiRelevanceScore: score.aiRelevanceScore,
            freshnessScore: score.freshnessScore,
            priorityScore: score.priorityScore,
            topReasonsJson: score.topReasons as unknown as Prisma.InputJsonValue,
            risksJson: score.risks as unknown as Prisma.InputJsonValue,
            rationale: score.rationale,
            scorerType: 'scout',
          },
        });

        await prisma.auditEvent.createMany({
          data: [
            makeAuditEvent({
              entityType: 'scrape_run',
              entityId: scrapeRun.id,
              eventType: 'scout.job_captured',
              actorType: ActorType.agent,
              actorLabel,
              payloadJson: { jobId: job.id, sourceRecordId: sourceRecord.id },
            }),
            makeAuditEvent({
              entityType: 'job',
              entityId: job.id,
              eventType: 'job.discovered',
              actorType: ActorType.agent,
              actorLabel,
              afterState: { status: JobStatus.discovered },
              payloadJson: {
                scrapeRunId: scrapeRun.id,
                sourceRecordId: sourceRecord.id,
                priorityScore: score.priorityScore,
              },
            }),
          ],
        });

        pendingReviews.push({
          jobId: job.id,
          previousStatus: JobStatus.discovered,
          normalized,
          score,
          learningSignal,
          actorLabel,
        });
      } catch (error) {
        erroredCount += 1;
        const errorMessage = getErrorMessage(error);

        if (sourceRecordId) {
          await prisma.jobSourceRecord.update({
            where: { id: sourceRecordId },
            data: {
              status: 'errored',
              errorMessage,
            },
          });
        }

        errorSummaries.push({
          stage: 'record',
          index,
          sourceRecordId: record.sourceRecordId ?? null,
          sourceUrl: record.sourceUrl ?? null,
          message: errorMessage,
        });
      }
    }

    const reviewedDecisions = await resolveScoutDecisions({
      runId: scrapeRun.id,
      sourceKey: input.sourceKey,
      searchTerm: input.searchTerm,
      searchLocation: input.searchLocation,
      triggerType,
      candidates: pendingReviews,
    });

    for (const candidate of pendingReviews) {
      const decision = reviewedDecisions.get(candidate.jobId);
      if (!decision) {
        throw new Error(`Missing Scout decision for job ${candidate.jobId}`);
      }

      const shouldAutoApplyDecision = candidate.previousStatus === JobStatus.discovered && decision.actedAutomatically;
      const resultingStatus = shouldAutoApplyDecision ? decision.resultingStatus : candidate.previousStatus;

      await prisma.job.update({
        where: { id: candidate.jobId },
        data: { status: resultingStatus },
      });

      await persistScoutDecision({
        jobId: candidate.jobId,
        scrapeRunId: scrapeRun.id,
        actorLabel: candidate.actorLabel,
        decision: {
          ...decision,
          actedAutomatically: shouldAutoApplyDecision ? decision.actedAutomatically : false,
          resultingStatus,
        },
        previousStatus: candidate.previousStatus,
      });
    }

    const finalStatus = erroredCount > 0 ? 'partial' : 'completed';

    const run = await prisma.scrapeRun.update({
      where: { id: scrapeRun.id },
      data: {
        status: finalStatus,
        resultCount: fetchedCount,
        fetchedCount,
        capturedCount,
        normalizedCount,
        rejectedCount: initialRejectedCount,
        erroredCount,
        dedupedCount,
        createdJobCount,
        errorSummaryJson:
          errorSummaries.length > 0 ? (errorSummaries as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        completedAt: new Date(),
      },
    });

    return {
      run,
      reusedExistingRun: false,
    };
  } catch (error) {
    const fatalMessage = getErrorMessage(error);

    await prisma.scrapeRun.update({
      where: { id: scrapeRun.id },
      data: {
        status: 'failed',
        capturedCount,
        normalizedCount,
        rejectedCount: initialRejectedCount,
        erroredCount,
        dedupedCount,
        createdJobCount,
        errorSummaryJson: [
          ...errorSummaries,
          {
            stage: 'fatal',
            message: fatalMessage,
          },
        ] as unknown as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });

    throw error;
  }
}

async function resolveScoutDecisions(args: {
  runId: string;
  sourceKey: string;
  searchTerm?: string;
  searchLocation?: string;
  triggerType: ScoutRunTriggerType;
  candidates: PendingScoutReview[];
}) {
  const decisions = new Map<string, ScoutDecisionDraft>();
  if (args.candidates.length === 0) {
    return decisions;
  }

  const reviewMode = resolveScoutReviewMode(args.triggerType);
  if (reviewMode === 'job-searcher-agent') {
    return reviewJobsWithJobSearcherAgent({
      runId: args.runId,
      sourceKey: args.sourceKey,
      searchTerm: args.searchTerm,
      searchLocation: args.searchLocation,
      triggerType: args.triggerType,
      candidates: args.candidates,
    });
  }

  for (const candidate of args.candidates) {
    decisions.set(
      candidate.jobId,
      buildScoutDecisionDraft(candidate.normalized, candidate.score, candidate.learningSignal),
    );
  }

  return decisions;
}

async function persistScoutDecision(args: {
  jobId: string;
  scrapeRunId: string;
  actorLabel: string;
  previousStatus: JobStatus | null;
  decision: ScoutDecisionDraft;
}) {
  const scoutDecision = await prisma.scoutDecision.upsert({
    where: {
      jobId_scrapeRunId: {
        jobId: args.jobId,
        scrapeRunId: args.scrapeRunId,
      },
    },
    update: {
      verdict: args.decision.verdict,
      confidence: args.decision.confidence,
      reasonsJson: args.decision.reasons as unknown as Prisma.InputJsonValue,
      ambiguityFlagsJson: args.decision.ambiguityFlags as unknown as Prisma.InputJsonValue,
      actedAutomatically: args.decision.actedAutomatically,
      policyVersion: args.decision.policyVersion,
    },
    create: {
      jobId: args.jobId,
      scrapeRunId: args.scrapeRunId,
      verdict: args.decision.verdict,
      confidence: args.decision.confidence,
      reasonsJson: args.decision.reasons as unknown as Prisma.InputJsonValue,
      ambiguityFlagsJson: args.decision.ambiguityFlags as unknown as Prisma.InputJsonValue,
      actedAutomatically: args.decision.actedAutomatically,
      policyVersion: args.decision.policyVersion,
    },
  });

  const auditEvents = [
    makeAuditEvent({
      entityType: 'job',
      entityId: args.jobId,
      eventType: 'scout.decision_recorded',
      actorType: ActorType.agent,
      actorLabel: args.actorLabel,
      payloadJson: {
        scrapeRunId: args.scrapeRunId,
        scoutDecisionId: scoutDecision.id,
        verdict: args.decision.verdict,
        confidence: args.decision.confidence,
        ambiguityFlags: args.decision.ambiguityFlags,
        actedAutomatically: args.decision.actedAutomatically,
        policyVersion: args.decision.policyVersion,
      },
    }),
  ];

  if (args.decision.actedAutomatically && args.previousStatus !== args.decision.resultingStatus) {
    auditEvents.push(
      makeAuditEvent({
        entityType: 'job',
        entityId: args.jobId,
        eventType: args.decision.resultingStatus === JobStatus.shortlisted ? 'job.shortlisted' : 'job.archived',
        actorType: ActorType.agent,
        actorLabel: args.actorLabel,
        beforeState: { status: args.previousStatus },
        afterState: { status: args.decision.resultingStatus },
        payloadJson: {
          scrapeRunId: args.scrapeRunId,
          scoutDecisionId: scoutDecision.id,
          automatic: true,
          verdict: args.decision.verdict,
          confidence: args.decision.confidence,
        },
      }),
    );
  }

  await prisma.auditEvent.createMany({
    data: auditEvents,
  });
}

function buildScoutDecisionDraft(
  normalized: ReturnType<typeof normalizeScoutJob>,
  score: ReturnType<typeof scoreScoutJob>,
  learningSignal: ScoutLearningSignal,
): ScoutDecisionDraft {
  const title = normalized.normalizedTitle;
  const isExactDataAnalyst = title.includes('data analyst');
  const isAdjacentAnalyst =
    title.includes('business analyst') ||
    title.includes('product analyst') ||
    title.includes('analytics analyst') ||
    title.includes('bi analyst') ||
    title.includes('business intelligence');

  const ambiguityFlags: string[] = [];

  if (!isExactDataAnalyst && isAdjacentAnalyst && !learningSignal.suppressAdjacentAmbiguity) {
    ambiguityFlags.push('adjacent_analyst_title');
  }

  if (!isExactDataAnalyst && !isAdjacentAnalyst) {
    ambiguityFlags.push('non_target_title');
  }

  if (!normalized.salaryText) {
    ambiguityFlags.push('salary_missing');
  }

  if (score.fitScore >= 5.5 && score.fitScore < 7.2) {
    ambiguityFlags.push('borderline_fit');
  }

  if (score.priorityScore >= 6.0 && score.priorityScore < 7.8) {
    ambiguityFlags.push('borderline_priority');
  }

  if (score.risks.length >= 2) {
    ambiguityFlags.push('high_risk_count');
  }

  if (learningSignal.archiveConfidenceDelta > learningSignal.shortlistConfidenceDelta) {
    ambiguityFlags.push('historical_archive_bias');
  }

  const reasons = [...score.topReasons.slice(0, 3)];

  if (isExactDataAnalyst) {
    reasons.push('Exact data analyst title match.');
  } else if (isAdjacentAnalyst) {
    reasons.push(
      learningSignal.suppressAdjacentAmbiguity
        ? 'Adjacent analyst title has positive manual-override history.'
        : 'Adjacent analyst title needs human review.',
    );
  } else {
    reasons.push('Title does not clearly match the target profile.');
  }

  if (!normalized.salaryText) {
    reasons.push('Salary is missing, so upside is less certain.');
  }

  if (learningSignal.notes.length > 0) {
    reasons.push(...learningSignal.notes);
  }

  const shortlistConfidence = clamp(
    0.56 +
      score.priorityScore / 24 +
      score.fitScore / 26 +
      learningSignal.shortlistConfidenceDelta -
      learningSignal.archiveConfidenceDelta * 0.45 -
      ambiguityFlags.length * 0.08 -
      score.risks.length * 0.04,
  );
  const archiveConfidence = clamp(
    0.48 +
      (10 - score.priorityScore) / 21 +
      (10 - score.fitScore) / 26 +
      learningSignal.archiveConfidenceDelta -
      learningSignal.shortlistConfidenceDelta * 0.45 +
      score.risks.length * 0.06,
  );

  if (isExactDataAnalyst && score.priorityScore >= 7.8 && score.fitScore >= 7.2 && score.risks.length <= 1) {
    const actedAutomatically = shortlistConfidence >= 0.85;
    return {
      verdict: 'shortlist',
      confidence: shortlistConfidence,
      reasons,
      ambiguityFlags,
      actedAutomatically,
      resultingStatus: actedAutomatically ? JobStatus.shortlisted : JobStatus.discovered,
      policyVersion: HEURISTIC_SCOUT_POLICY_VERSION,
    };
  }

  if (!isExactDataAnalyst && score.priorityScore <= 4.2 && score.fitScore <= 4.8) {
    const actedAutomatically = archiveConfidence >= 0.85;
    return {
      verdict: 'archive',
      confidence: archiveConfidence,
      reasons: [...reasons, 'Low-priority mismatch against the initial narrow Scout profile.'],
      ambiguityFlags,
      actedAutomatically,
      resultingStatus: actedAutomatically ? JobStatus.archived : JobStatus.discovered,
      policyVersion: HEURISTIC_SCOUT_POLICY_VERSION,
    };
  }

  if (ambiguityFlags.length > 0 || score.priorityScore >= 6.8 || score.fitScore >= 6.5) {
    return {
      verdict: 'needs_human_review',
      confidence: clamp(
        0.62 + score.priorityScore / 40 + learningSignal.shortlistConfidenceDelta * 0.5 - ambiguityFlags.length * 0.03,
      ),
      reasons: [...reasons, 'Ambiguity flags require human review before acting automatically.'],
      ambiguityFlags,
      actedAutomatically: false,
      resultingStatus: JobStatus.discovered,
      policyVersion: HEURISTIC_SCOUT_POLICY_VERSION,
    };
  }

  return {
    verdict: 'defer',
    confidence: clamp(0.52 + score.priorityScore / 50 + learningSignal.shortlistConfidenceDelta * 0.3),
    reasons: [...reasons, 'Not a strong enough match to auto-act, but not weak enough to auto-archive.'],
    ambiguityFlags,
    actedAutomatically: false,
    resultingStatus: JobStatus.discovered,
    policyVersion: HEURISTIC_SCOUT_POLICY_VERSION,
  };
}

function resolveScoutReviewMode(triggerType: ScoutRunTriggerType) {
  const configured = process.env.SCOUT_REVIEW_MODE?.trim();
  if (configured === 'heuristic' || configured === 'job-searcher-agent') {
    return configured;
  }

  return triggerType === 'test' ? 'heuristic' : 'job-searcher-agent';
}

function buildScoutRunQueryJson(input: RunScoutIngestionInput, triggerType: ScoutRunTriggerType) {
  const base = {
    searchTerm: input.searchTerm ?? null,
    searchLocation: input.searchLocation ?? null,
    triggerType,
    reviewMode: resolveScoutReviewMode(triggerType),
    idempotencyKey: input.idempotencyKey ?? null,
    fetchedCount: input.fetchedCount ?? input.records.length,
    rejectedCount: input.rejectedCount ?? 0,
  };

  if (!input.queryJson || typeof input.queryJson !== 'object' || Array.isArray(input.queryJson)) {
    return base;
  }

  return {
    ...(input.queryJson as Record<string, unknown>),
    ...base,
  };
}

function clamp(value: number) {
  return Math.max(0, Math.min(0.99, Number(value.toFixed(2))));
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
