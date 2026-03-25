import type { RawScoutJobInput } from '@job-ops/domain';
import type { RunScoutIngestionInput } from '../workers/scout/index.js';

export const scoutRunTriggers = ['scheduled', 'manual', 'backfill', 'test'] as const;
export type ScoutRunTrigger = (typeof scoutRunTriggers)[number];

export const initialScoutProfile = Object.freeze({
  provider: 'fixture',
  board: 'indeed',
  sourceKey: 'fixture-jobspy-indeed',
  searchTerm: 'Data Analyst',
  searchLocation: 'New York City',
} as const);

export function isScoutRunTrigger(value: string): value is ScoutRunTrigger {
  return scoutRunTriggers.includes(value as ScoutRunTrigger);
}

export function getInitialScoutFixtureRecords(): RawScoutJobInput[] {
  const nowIso = new Date().toISOString();

  return [
    {
      sourceKey: initialScoutProfile.sourceKey,
      sourceRecordId: 'nyc-data-analyst-1',
      sourceUrl: 'https://jobs.example.com/nyc-data-analyst-1',
      companyName: 'Northstar AI',
      title: 'Data Analyst',
      locationText: 'New York City',
      description:
        'SQL, dashboarding, experimentation analysis, stakeholder reporting, and AI workflow metrics for a fast-growing product team in New York City.',
      salaryText: '$82k-$96k',
      datePosted: nowIso,
    },
    {
      sourceKey: initialScoutProfile.sourceKey,
      sourceRecordId: 'nyc-data-analyst-2',
      sourceUrl: 'https://jobs.example.com/nyc-data-analyst-2',
      companyName: 'Signal Grid',
      title: 'Junior Data Analyst',
      locationText: 'New York City',
      hybrid: true,
      description:
        'Entry-level data analyst role focused on KPI reporting, Excel/SQL analysis, dashboard QA, and business insights for operations teams in NYC.',
      salaryText: '$75k-$88k',
      datePosted: nowIso,
    },
  ];
}

export function buildInitialScoutFixtureRunInput(trigger: ScoutRunTrigger): RunScoutIngestionInput {
  return {
    sourceKey: initialScoutProfile.sourceKey,
    searchTerm: initialScoutProfile.searchTerm,
    searchLocation: initialScoutProfile.searchLocation,
    actorLabel: `scout-${trigger}-fixture`,
    notes: `provider=${initialScoutProfile.provider};board=${initialScoutProfile.board};trigger=${trigger}`,
    records: getInitialScoutFixtureRecords(),
  };
}
