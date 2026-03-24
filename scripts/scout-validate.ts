import { prisma } from '@job-ops/db';
import { runScoutIngestion } from '../workers/scout/index.js';

async function main() {
  await runScoutIngestion({
    sourceKey: 'seed-jobspy',
    searchTerm: 'data analyst',
    searchLocation: 'New York, NY',
    actorLabel: 'seed-script',
    records: [
      {
        sourceKey: 'seed-jobspy',
        sourceRecordId: 'seed-1',
        sourceUrl: 'https://jobs.example.com/data-analyst-1',
        companyName: 'Northstar AI',
        title: 'Data Analyst',
        locationText: 'New York, NY',
        description: 'SQL, dashboarding, experimentation, and AI workflow reporting for a fast-growing product team.',
        salaryText: '$82k-$96k',
        datePosted: new Date().toISOString(),
      },
      {
        sourceKey: 'seed-jobspy',
        sourceRecordId: 'seed-2',
        sourceUrl: 'https://jobs.example.com/business-analyst-1',
        companyName: 'Signal Grid',
        title: 'Business Analyst, AI Operations',
        locationText: 'Remote - US',
        remote: true,
        description: 'Cross-functional business analysis, KPI reporting, SQL, and AI operations support.',
        salaryText: '$78k-$92k',
        datePosted: new Date().toISOString(),
      },
    ],
  });

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
        jobs: jobs.map((j) => ({
          id: j.id,
          title: j.title,
          status: j.status,
          company: j.company.name,
          priorityScore: j.scorecards[0]?.priorityScore ?? null,
          sourceLinks: j.sourceLinks.length,
        })),
        runs: runs.map((r) => ({
          id: r.id,
          sourceKey: r.sourceKey,
          status: r.status,
          resultCount: r.resultCount,
          createdJobCount: r.createdJobCount,
          dedupedCount: r.dedupedCount,
        })),
        events: events.map((e) => ({
          entityType: e.entityType,
          eventType: e.eventType,
          entityId: e.entityId,
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
