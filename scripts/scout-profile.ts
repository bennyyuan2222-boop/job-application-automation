import type { RawScoutJobInput } from '@job-ops/domain';
import type { RunScoutIngestionInput } from '../workers/scout/index.js';

export const scoutRunTriggers = ['scheduled', 'manual', 'backfill', 'test'] as const;
export type ScoutRunTrigger = (typeof scoutRunTriggers)[number];

export const scoutProviders = ['fixture', 'jobspy-mcp'] as const;
export type ScoutProvider = (typeof scoutProviders)[number];

export const initialScoutProfile = Object.freeze({
  board: 'indeed',
  searchTerm: 'Data Analyst',
  searchLocation: 'New York City',
  resultsWanted: 10,
  hoursOld: 72,
  countryIndeed: 'USA',
  timezone: 'America/New_York',
} as const);

export function isScoutRunTrigger(value: string): value is ScoutRunTrigger {
  return scoutRunTriggers.includes(value as ScoutRunTrigger);
}

export function isScoutProvider(value: string): value is ScoutProvider {
  return scoutProviders.includes(value as ScoutProvider);
}

export function buildScoutSourceKey(provider: ScoutProvider): string {
  return provider === 'fixture' ? 'fixture-jobspy-indeed' : 'jobspy-mcp-indeed';
}

export function buildScoutIdempotencyKey(provider: ScoutProvider, trigger: ScoutRunTrigger, now = new Date()) {
  if (trigger !== 'scheduled' && trigger !== 'backfill') {
    return null;
  }

  const dateKey = formatDateInTimezone(now, initialScoutProfile.timezone);
  return [
    'scout',
    provider,
    trigger,
    initialScoutProfile.board,
    slugify(initialScoutProfile.searchTerm),
    slugify(initialScoutProfile.searchLocation),
    dateKey,
  ].join(':');
}

export function getInitialScoutFixtureRecords(sourceKey = buildScoutSourceKey('fixture')): RawScoutJobInput[] {
  const nowIso = new Date().toISOString();

  return [
    {
      sourceKey,
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
      sourceKey,
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
  const sourceKey = buildScoutSourceKey('fixture');
  const records = getInitialScoutFixtureRecords(sourceKey);

  return {
    sourceKey,
    searchTerm: initialScoutProfile.searchTerm,
    searchLocation: initialScoutProfile.searchLocation,
    actorLabel: `scout-${trigger}-fixture`,
    triggerType: trigger,
    fetchedCount: records.length,
    rejectedCount: 0,
    queryJson: {
      providerKey: 'fixture',
      boardKey: initialScoutProfile.board,
      triggerType: trigger,
      requestedResults: records.length,
      receivedCount: records.length,
      mappedCount: records.length,
      droppedCount: 0,
    },
    notes: `provider=fixture;board=${initialScoutProfile.board};requested=${records.length};received=${records.length};mapped=${records.length};dropped=0`,
    records,
  };
}

function formatDateInTimezone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return formatter.format(date);
}

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
