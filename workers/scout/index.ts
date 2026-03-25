import { ActorType, JobStatus, Prisma } from '@job-ops/db';
import { prisma } from '@job-ops/db';
import { makeAuditEvent, normalizeScoutJob, scoreScoutJob, type RawScoutJobInput } from '@job-ops/domain';

export type RunScoutIngestionInput = {
  sourceKey: string;
  searchTerm?: string;
  searchLocation?: string;
  actorLabel?: string;
  notes?: string;
  records: RawScoutJobInput[];
};

export async function runScoutIngestion(input: RunScoutIngestionInput) {
  const scrapeRun = await prisma.scrapeRun.create({
    data: {
      sourceKey: input.sourceKey,
      searchTerm: input.searchTerm,
      searchLocation: input.searchLocation,
      queryJson: {
        searchTerm: input.searchTerm ?? null,
        searchLocation: input.searchLocation ?? null,
      },
      status: 'created',
      resultCount: input.records.length,
      notes: input.notes ?? null,
    },
  });

  let dedupedCount = 0;
  let createdJobCount = 0;

  for (const record of input.records) {
    const normalized = normalizeScoutJob(record);

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

    const company = await prisma.company.upsert({
      where: { normalizedName: normalized.normalizedCompanyName },
      update: { name: normalized.companyName },
      create: {
        name: normalized.companyName,
        normalizedName: normalized.normalizedCompanyName,
      },
    });

    const score = scoreScoutJob(normalized);

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
        data: { status: 'deduped' },
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
      data: { status: 'normalized' },
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
          payloadJson: { scrapeRunId: scrapeRun.id, sourceRecordId: sourceRecord.id, priorityScore: score.priorityScore },
        }),
      ],
    });
  }

  return prisma.scrapeRun.update({
    where: { id: scrapeRun.id },
    data: {
      status: 'completed',
      dedupedCount,
      createdJobCount,
      completedAt: new Date(),
    },
  });
}
