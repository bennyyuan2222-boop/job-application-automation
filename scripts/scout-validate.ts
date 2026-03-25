import { prisma } from '@job-ops/db';
import { runScoutIngestion } from '../workers/scout/index.js';
import { initialScoutProfile, isScoutProvider, type ScoutProvider } from './scout-profile.js';
import { resolveScoutRunInput } from './scout-source-adapters.js';

async function main() {
  const provider: ScoutProvider = isScoutProvider(process.env.SCOUT_PROVIDER ?? '')
    ? (process.env.SCOUT_PROVIDER as ScoutProvider)
    : 'fixture';

  const resolved = await resolveScoutRunInput({
    provider,
    trigger: 'test',
  });

  await runScoutIngestion(resolved.runInput);

  const jobs = await prisma.job.findMany({
    include: {
      company: true,
      scorecards: { orderBy: { scoredAt: 'desc' }, take: 1 },
      sourceLinks: { include: { sourceRecord: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 10,
  });

  const runs = await prisma.scrapeRun.findMany({
    orderBy: { startedAt: 'desc' },
    take: 5,
  });

  const events = await prisma.auditEvent.findMany({
    where: {
      OR: [{ entityType: 'job' }, { entityType: 'scrape_run' }],
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  console.log(
    JSON.stringify(
      {
        initialProfileDefaults: initialScoutProfile,
        provider,
        profile: resolved.profile,
        caveat: resolved.caveat ?? null,
        jobs: jobs.map((job) => ({
          id: job.id,
          title: job.title,
          status: job.status,
          company: job.company.name,
          priorityScore: job.scorecards[0]?.priorityScore ?? null,
          sourceLinks: job.sourceLinks.length,
        })),
        runs: runs.map((run) => ({
          id: run.id,
          sourceKey: run.sourceKey,
          searchTerm: run.searchTerm,
          searchLocation: run.searchLocation,
          status: run.status,
          notes: run.notes,
          resultCount: run.resultCount,
          createdJobCount: run.createdJobCount,
          dedupedCount: run.dedupedCount,
        })),
        events: events.map((event) => ({
          entityType: event.entityType,
          eventType: event.eventType,
          entityId: event.entityId,
        })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
