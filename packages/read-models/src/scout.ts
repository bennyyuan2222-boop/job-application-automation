import { scoutRunSummarySchema, type ScoutRunSummary } from '@job-ops/contracts';
import { prisma } from '@job-ops/db';

export async function getRecentScoutRuns(limit = 25): Promise<ScoutRunSummary[]> {
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
}
