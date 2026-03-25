import { ActorType, JobStatus, Prisma } from '@job-ops/db';
import { prisma } from '@job-ops/db';
import { makeAuditEvent, normalizeScoutJob, scoreScoutJob, type RawScoutJobInput } from '@job-ops/domain';

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
              actorLabel: input.actorLabel ?? 'scout',
              payloadJson: {
                scrapeRunId: scrapeRun.id,
                sourceRecordId: sourceRecord.id,
                matchType: 'dedupe',
              },
            }),
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
              actorLabel: input.actorLabel ?? 'scout',
              payloadJson: { jobId: job.id, sourceRecordId: sourceRecord.id },
            }),
            makeAuditEvent({
              entityType: 'job',
              entityId: job.id,
              eventType: 'job.discovered',
              actorType: ActorType.agent,
              actorLabel: input.actorLabel ?? 'scout',
              afterState: { status: JobStatus.discovered },
              payloadJson: {
                scrapeRunId: scrapeRun.id,
                sourceRecordId: sourceRecord.id,
                priorityScore: score.priorityScore,
              },
            }),
          ],
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

function buildScoutRunQueryJson(input: RunScoutIngestionInput, triggerType: ScoutRunTriggerType) {
  const base = {
    searchTerm: input.searchTerm ?? null,
    searchLocation: input.searchLocation ?? null,
    triggerType,
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

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
