import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { RawScoutJobInput } from '@job-ops/domain';
import type { RunScoutIngestionInput } from '../workers/scout/index.js';

export const scoutRunTriggers = ['scheduled', 'manual', 'backfill', 'test'] as const;
export type ScoutRunTrigger = (typeof scoutRunTriggers)[number];

export const scoutProviders = ['fixture', 'jobspy-mcp'] as const;
export type ScoutProvider = (typeof scoutProviders)[number];

export type ScoutProfile = {
  board: string;
  searchTerm: string;
  searchLocation: string;
  resultsWanted: number;
  hoursOld: number;
  countryIndeed: string;
  timezone: string;
};

export type ScoutPreferenceSource = {
  path: string;
  exists: boolean;
  primaryTargetRoles: string[];
  currentLocation: string | null;
  preferredCities: string[];
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const scoutPreferenceSourcePath = path.join(
  repoRoot,
  'legacy/source-job-search-workspace/job-search-spec.md',
);

function extractSection(markdown: string, heading: string): string | null {
  const marker = `**${heading}**`;
  const start = markdown.indexOf(marker);
  if (start === -1) {
    return null;
  }

  const remainder = markdown.slice(start + marker.length);
  const nextHeadingIndex = remainder.search(/\n## |\n\*\*[^*]+\*\*/);
  return (nextHeadingIndex === -1 ? remainder : remainder.slice(0, nextHeadingIndex)).trim();
}

function parseBulletSection(markdown: string, heading: string): string[] {
  const section = extractSection(markdown, heading);
  if (!section) {
    return [];
  }

  return section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

function parseNamedListLine(markdown: string, label: string): string[] {
  const pattern = new RegExp(`${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(.+)`);
  const match = markdown.match(pattern);
  if (!match?.[1]) {
    return [];
  }

  return match[1]
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseScoutPreferenceSource(filePath = scoutPreferenceSourcePath): ScoutPreferenceSource {
  if (!fs.existsSync(filePath)) {
    return {
      path: filePath,
      exists: false,
      primaryTargetRoles: [],
      currentLocation: null,
      preferredCities: [],
    };
  }

  const markdown = fs.readFileSync(filePath, 'utf8');
  const primaryTargetRoles = parseBulletSection(markdown, 'Primary target roles');
  const currentLocation = parseBulletSection(markdown, 'Current location')[0] ?? null;
  const preferredCities = parseNamedListLine(markdown, 'Preferred cities/regions:');

  return {
    path: filePath,
    exists: true,
    primaryTargetRoles,
    currentLocation,
    preferredCities,
  };
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pickDefaultSearchTerm(preferenceSource: ScoutPreferenceSource) {
  return (
    preferenceSource.primaryTargetRoles.find((role) => /data analyst/i.test(role)) ??
    preferenceSource.primaryTargetRoles[0] ??
    'Data Analyst'
  );
}

function buildInitialScoutProfile(preferenceSource: ScoutPreferenceSource): ScoutProfile {
  return {
    board: process.env.SCOUT_BOARD?.trim() || 'indeed',
    searchTerm: process.env.SCOUT_SEARCH_TERM?.trim() || pickDefaultSearchTerm(preferenceSource),
    searchLocation: process.env.SCOUT_SEARCH_LOCATION?.trim() || preferenceSource.currentLocation || 'New York City',
    resultsWanted: parseInteger(process.env.SCOUT_RESULTS_WANTED, 10),
    hoursOld: parseInteger(process.env.SCOUT_HOURS_OLD, 72),
    countryIndeed: process.env.SCOUT_COUNTRY_INDEED?.trim() || 'USA',
    timezone: process.env.SCOUT_TIMEZONE?.trim() || 'America/New_York',
  };
}

export const broaderScoutPreferenceSource = Object.freeze(parseScoutPreferenceSource());
export const initialScoutProfile = Object.freeze(buildInitialScoutProfile(broaderScoutPreferenceSource));

export function isScoutRunTrigger(value: string): value is ScoutRunTrigger {
  return scoutRunTriggers.includes(value as ScoutRunTrigger);
}

export function isScoutProvider(value: string): value is ScoutProvider {
  return scoutProviders.includes(value as ScoutProvider);
}

export function buildScoutSourceKey(provider: ScoutProvider): string {
  return provider === 'fixture' ? 'fixture-jobspy-indeed' : 'jobspy-mcp-indeed';
}

export function buildScoutIdempotencyKey(
  provider: ScoutProvider,
  trigger: ScoutRunTrigger,
  profile: ScoutProfile = initialScoutProfile,
  now = new Date(),
) {
  if (trigger !== 'scheduled' && trigger !== 'backfill') {
    return null;
  }

  const dateKey = formatDateInTimezone(now, profile.timezone);
  return [
    'scout',
    provider,
    trigger,
    profile.board,
    slugify(profile.searchTerm),
    slugify(profile.searchLocation),
    dateKey,
  ].join(':');
}

export function getInitialScoutFixtureRecords(
  profile: ScoutProfile = initialScoutProfile,
  sourceKey = buildScoutSourceKey('fixture'),
): RawScoutJobInput[] {
  const nowIso = new Date().toISOString();

  return [
    {
      sourceKey,
      sourceRecordId: 'nyc-data-analyst-1',
      sourceUrl: 'https://jobs.example.com/nyc-data-analyst-1',
      companyName: 'Northstar AI',
      title: 'Data Analyst',
      locationText: profile.searchLocation,
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
      locationText: profile.searchLocation,
      hybrid: true,
      description:
        'Entry-level data analyst role focused on KPI reporting, Excel/SQL analysis, dashboard QA, and business insights for operations teams in NYC.',
      salaryText: '$75k-$88k',
      datePosted: nowIso,
    },
  ];
}

export function buildInitialScoutFixtureRunInput(
  trigger: ScoutRunTrigger,
  profile: ScoutProfile = initialScoutProfile,
): RunScoutIngestionInput {
  const sourceKey = buildScoutSourceKey('fixture');
  const records = getInitialScoutFixtureRecords(profile, sourceKey);

  return {
    sourceKey,
    searchTerm: profile.searchTerm,
    searchLocation: profile.searchLocation,
    actorLabel: `scout-${trigger}-fixture`,
    triggerType: trigger,
    fetchedCount: records.length,
    rejectedCount: 0,
    queryJson: {
      providerKey: 'fixture',
      boardKey: profile.board,
      triggerType: trigger,
      requestedResults: records.length,
      receivedCount: records.length,
      mappedCount: records.length,
      droppedCount: 0,
      preferenceSourcePath: broaderScoutPreferenceSource.path,
      broaderPrimaryRoles: broaderScoutPreferenceSource.primaryTargetRoles,
      broaderPreferredCities: broaderScoutPreferenceSource.preferredCities,
    },
    notes: `provider=fixture;board=${profile.board};requested=${records.length};received=${records.length};mapped=${records.length};dropped=0`,
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
