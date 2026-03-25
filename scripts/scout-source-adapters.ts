import type { RawScoutJobInput } from '@job-ops/domain';
import type { RunScoutIngestionInput } from '../workers/scout/index.js';
import {
  buildInitialScoutFixtureRunInput,
  buildScoutSourceKey,
  initialScoutProfile,
  type ScoutProvider,
  type ScoutRunTrigger,
} from './scout-profile.js';

type ResolveScoutRunInputOptions = {
  provider: ScoutProvider;
  trigger: ScoutRunTrigger;
};

type ResolveScoutRunInputResult = {
  provider: ScoutProvider;
  profile: typeof initialScoutProfile & { provider: ScoutProvider };
  runInput: RunScoutIngestionInput;
  caveat?: string;
};

type JobSpySearchResponse = {
  count?: unknown;
  message?: unknown;
  jobs?: unknown;
};

type JobSpyJob = {
  id?: unknown;
  jobTitle?: unknown;
  jobSummary?: unknown;
  description?: unknown;
  jobUrl?: unknown;
  jobUrlDirect?: unknown;
  location?: unknown;
  city?: unknown;
  state?: unknown;
  datePosted?: unknown;
  salary?: unknown;
  salaryCurrency?: unknown;
  minAmount?: unknown;
  maxAmount?: unknown;
  companyName?: unknown;
  isRemote?: unknown;
  workFromHomeType?: unknown;
};

export async function resolveScoutRunInput(
  options: ResolveScoutRunInputOptions,
): Promise<ResolveScoutRunInputResult> {
  if (options.provider === 'fixture') {
    return {
      provider: options.provider,
      profile: { ...initialScoutProfile, provider: options.provider },
      runInput: buildInitialScoutFixtureRunInput(options.trigger),
      caveat: 'Fixture-backed entrypoint is live. Real JobSpy MCP fetching is still a separate next feature.',
    };
  }

  return buildJobSpyMcpRunInput(options.trigger);
}

async function buildJobSpyMcpRunInput(
  trigger: ScoutRunTrigger,
): Promise<ResolveScoutRunInputResult> {
  const provider: ScoutProvider = 'jobspy-mcp';
  const sourceKey = buildScoutSourceKey(provider);
  const apiUrl = buildJobSpyApiUrl();
  const requestedResults = parseInteger(process.env.SCOUT_RESULTS_WANTED, initialScoutProfile.resultsWanted);
  const hoursOld = parseInteger(process.env.SCOUT_HOURS_OLD, initialScoutProfile.hoursOld);
  const timeoutMs = parseInteger(process.env.JOBSPY_MCP_TIMEOUT_MS, 120_000);

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      siteNames: initialScoutProfile.board,
      searchTerm: initialScoutProfile.searchTerm,
      location: initialScoutProfile.searchLocation,
      resultsWanted: requestedResults,
      hoursOld,
      countryIndeed: process.env.SCOUT_COUNTRY_INDEED ?? initialScoutProfile.countryIndeed,
      descriptionFormat: 'markdown',
      format: 'json',
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`JobSpy MCP request failed with ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as JobSpySearchResponse;
  const jobs = Array.isArray(data.jobs) ? (data.jobs as JobSpyJob[]) : [];

  const mappedRecords = jobs
    .map((job, index) => mapJobSpyJobToRawScoutInput(job, index, sourceKey))
    .filter((value): value is RawScoutJobInput => value !== null);

  const droppedCount = jobs.length - mappedRecords.length;

  return {
    provider,
    profile: { ...initialScoutProfile, provider },
    runInput: {
      sourceKey,
      searchTerm: initialScoutProfile.searchTerm,
      searchLocation: initialScoutProfile.searchLocation,
      actorLabel: `scout-${trigger}-jobspy-mcp`,
      notes: [
        `provider=jobspy-mcp`,
        `board=${initialScoutProfile.board}`,
        `trigger=${trigger}`,
        `url=${apiUrl}`,
        `requested=${requestedResults}`,
        `received=${jobs.length}`,
        `mapped=${mappedRecords.length}`,
        `dropped=${droppedCount}`,
      ].join(';'),
      records: mappedRecords,
    },
  };
}

function buildJobSpyApiUrl(): string {
  const baseUrl = process.env.JOBSPY_MCP_URL;
  if (!baseUrl) {
    throw new Error('JOBSPY_MCP_URL is required when --provider=jobspy-mcp');
  }

  return baseUrl.endsWith('/api') ? baseUrl : `${baseUrl.replace(/\/$/, '')}/api`;
}

function mapJobSpyJobToRawScoutInput(
  job: JobSpyJob,
  index: number,
  sourceKey: string,
): RawScoutJobInput | null {
  const companyName = asNonEmptyString(job.companyName);
  const title = asNonEmptyString(job.jobTitle);

  if (!companyName || !title) {
    return null;
  }

  const cityStateLocation = [asNonEmptyString(job.city), asNonEmptyString(job.state)]
    .filter((value): value is string => Boolean(value))
    .join(', ');

  const locationText =
    asNonEmptyString(job.location) ??
    (cityStateLocation || initialScoutProfile.searchLocation);

  const directUrl = asNonEmptyString(job.jobUrlDirect);
  const fallbackUrl = asNonEmptyString(job.jobUrl);
  const sourceUrl = directUrl ?? fallbackUrl ?? null;
  const sourceRecordId =
    asNonEmptyString(job.id) ?? sourceUrl ?? `${companyName}:${title}:${locationText}:${index + 1}`;

  const workFromHomeType = asNonEmptyString(job.workFromHomeType)?.toLowerCase() ?? null;

  return {
    sourceKey,
    sourceRecordId,
    sourceUrl,
    companyName,
    title,
    locationText,
    description: asNonEmptyString(job.description) ?? asNonEmptyString(job.jobSummary) ?? null,
    salaryText: buildSalaryText(job),
    remote: asBoolean(job.isRemote) ?? (workFromHomeType?.includes('remote') ?? false),
    hybrid: workFromHomeType?.includes('hybrid') ?? false,
    datePosted: asDateLike(job.datePosted),
  };
}

function buildSalaryText(job: JobSpyJob): string | null {
  const directSalary = asNonEmptyString(job.salary);
  if (directSalary) {
    return directSalary;
  }

  const minAmount = asNumber(job.minAmount);
  const maxAmount = asNumber(job.maxAmount);
  if (minAmount === null && maxAmount === null) {
    return null;
  }

  const currency = asNonEmptyString(job.salaryCurrency) ?? '$';
  if (minAmount !== null && maxAmount !== null) {
    return `${currency}${Math.round(minAmount)}-${currency}${Math.round(maxAmount)}`;
  }

  const onlyAmount = minAmount ?? maxAmount;
  return onlyAmount === null ? null : `${currency}${Math.round(onlyAmount)}`;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asDateLike(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
