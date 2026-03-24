import type { JobStatus, WorkMode } from './types';

export type RawScoutJobInput = {
  sourceKey: string;
  sourceRecordId?: string | null;
  sourceUrl?: string | null;
  companyName: string;
  title: string;
  locationText?: string | null;
  description?: string | null;
  salaryText?: string | null;
  remote?: boolean | null;
  hybrid?: boolean | null;
  datePosted?: string | Date | null;
};

export type NormalizedScoutJob = {
  sourceKey: string;
  sourceRecordId: string | null;
  sourceUrl: string | null;
  companyName: string;
  normalizedCompanyName: string;
  title: string;
  normalizedTitle: string;
  locationText: string;
  normalizedLocationText: string;
  descriptionRaw: string;
  descriptionClean: string;
  salaryText: string | null;
  workMode: WorkMode;
  dedupeKey: string;
  freshnessBucket: 'fresh' | 'recent' | 'stale' | 'unknown';
};

export type ScoutScore = {
  fitScore: number;
  companyQualityScore: number;
  aiRelevanceScore: number;
  freshnessScore: number;
  priorityScore: number;
  topReasons: string[];
  risks: string[];
  rationale: string;
};

export const SCOUT_VISIBLE_JOB_STATUSES: JobStatus[] = ['discovered', 'shortlisted'];

export function normalizeCompanyName(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[.,]/g, '')
    .replace(/\b(inc|llc|ltd|corp|corporation|company|co)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeTitle(input: string): string {
  return input
    .toLowerCase()
    .replace(/[|/\-]+/g, ' ')
    .replace(/\b(i|ii|iii|iv)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeLocation(input?: string | null): string {
  const value = (input ?? 'Unknown').toLowerCase().trim();
  if (!value) return 'unknown';
  return value
    .replace(/\bnyc\b/g, 'new york, ny')
    .replace(/\bunited states remote\b/g, 'remote - us')
    .replace(/\bremote us\b/g, 'remote - us')
    .replace(/\s+/g, ' ')
    .trim();
}

export function inferWorkMode(input: Pick<RawScoutJobInput, 'remote' | 'hybrid' | 'locationText'>): WorkMode {
  if (input.remote) return 'remote';
  if (input.hybrid) return 'hybrid';
  const location = normalizeLocation(input.locationText);
  if (location.includes('remote')) return 'remote';
  return location === 'unknown' ? 'unknown' : 'onsite';
}

export function freshnessBucket(datePosted?: string | Date | null): NormalizedScoutJob['freshnessBucket'] {
  if (!datePosted) return 'unknown';
  const value = typeof datePosted === 'string' ? new Date(datePosted) : datePosted;
  const ageMs = Date.now() - value.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (Number.isNaN(ageDays)) return 'unknown';
  if (ageDays <= 7) return 'fresh';
  if (ageDays <= 21) return 'recent';
  return 'stale';
}

export function normalizeScoutJob(input: RawScoutJobInput): NormalizedScoutJob {
  const normalizedCompanyName = normalizeCompanyName(input.companyName);
  const normalizedTitle = normalizeTitle(input.title);
  const normalizedLocationText = normalizeLocation(input.locationText);
  const workMode = inferWorkMode(input);
  const descriptionRaw = (input.description ?? '').trim();
  const descriptionClean = descriptionRaw.replace(/\s+/g, ' ').trim();

  return {
    sourceKey: input.sourceKey,
    sourceRecordId: input.sourceRecordId ?? null,
    sourceUrl: input.sourceUrl ?? null,
    companyName: input.companyName.trim(),
    normalizedCompanyName,
    title: input.title.trim(),
    normalizedTitle,
    locationText: input.locationText?.trim() || 'Unknown',
    normalizedLocationText,
    descriptionRaw,
    descriptionClean,
    salaryText: input.salaryText?.trim() || null,
    workMode,
    dedupeKey: [normalizedCompanyName, normalizedTitle, normalizedLocationText].join('::'),
    freshnessBucket: freshnessBucket(input.datePosted),
  };
}

export function scoreScoutJob(job: NormalizedScoutJob): ScoutScore {
  const text = `${job.normalizedTitle} ${job.descriptionClean.toLowerCase()}`;
  let fitScore = 5.5;
  let companyQualityScore = 5.5;
  let aiRelevanceScore = 4.5;
  let freshnessScore = 5;
  const topReasons: string[] = [];
  const risks: string[] = [];

  if (/(data analyst|business analyst|analytics|analytic engineer|bi analyst)/.test(text)) {
    fitScore += 2.2;
    topReasons.push('strong title alignment');
  }

  if (/(sql|dashboard|analytics|experimentation|reporting)/.test(text)) {
    fitScore += 1;
    topReasons.push('clear analytics signal');
  }

  if (/(ai|llm|machine learning|automation|model)/.test(text)) {
    aiRelevanceScore += 2.8;
    companyQualityScore += 0.8;
    topReasons.push('AI-adjacent work appears in role');
  }

  if (job.workMode === 'remote' || /new york|ny/.test(job.normalizedLocationText)) {
    fitScore += 0.8;
  } else if (job.normalizedLocationText === 'unknown') {
    risks.push('location unclear');
  }

  if (job.freshnessBucket === 'fresh') freshnessScore = 9;
  else if (job.freshnessBucket === 'recent') freshnessScore = 7;
  else if (job.freshnessBucket === 'stale') {
    freshnessScore = 3.5;
    risks.push('posting may be stale');
  }

  if (!job.sourceUrl) risks.push('missing source url');
  if (!job.descriptionClean) risks.push('thin description');

  fitScore = clamp(fitScore);
  companyQualityScore = clamp(companyQualityScore);
  aiRelevanceScore = clamp(aiRelevanceScore);
  freshnessScore = clamp(freshnessScore);

  const priorityScore = clamp((fitScore * 0.4) + (companyQualityScore * 0.15) + (aiRelevanceScore * 0.2) + (freshnessScore * 0.25));

  return {
    fitScore,
    companyQualityScore,
    aiRelevanceScore,
    freshnessScore,
    priorityScore,
    topReasons: topReasons.slice(0, 4),
    risks: risks.slice(0, 4),
    rationale: topReasons.length > 0 ? topReasons.join('; ') : 'Captured for review with limited signal.',
  };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(10, Number(value.toFixed(1))));
}
