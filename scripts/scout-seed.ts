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
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
