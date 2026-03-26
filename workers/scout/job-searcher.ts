import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

import type { JobStatus } from '@job-ops/db';
import type { NormalizedScoutJob, ScoutScore } from '@job-ops/domain';

import type { ScoutDecisionDraft, ScoutDecisionVerdict } from './decision';
import { JOB_SEARCHER_SCOUT_POLICY_VERSION, resolveResultingStatus } from './decision';
import type { ScoutLearningSignal } from './learning';

const execFile = promisify(execFileCallback);

const VALID_VERDICTS: ScoutDecisionVerdict[] = ['shortlist', 'archive', 'defer', 'needs_human_review'];
const VALID_AUTO_ACTIONS = ['none', 'shortlist', 'archive'] as const;

type JobSearcherAutoAction = (typeof VALID_AUTO_ACTIONS)[number];

export type JobSearcherReviewCandidate = {
  jobId: string;
  previousStatus: JobStatus;
  normalized: NormalizedScoutJob;
  score: ScoutScore;
  learningSignal: ScoutLearningSignal;
};

export async function reviewJobsWithJobSearcherAgent(args: {
  runId: string;
  sourceKey: string;
  searchTerm?: string;
  searchLocation?: string;
  triggerType: string;
  candidates: JobSearcherReviewCandidate[];
}): Promise<Map<string, ScoutDecisionDraft>> {
  const decisions = new Map<string, ScoutDecisionDraft>();
  if (args.candidates.length === 0) {
    return decisions;
  }

  const batchSize = parseInteger(process.env.SCOUT_JOB_SEARCHER_BATCH_SIZE, 10);
  const timeoutSeconds = parseInteger(process.env.SCOUT_JOB_SEARCHER_TIMEOUT_SECONDS, 180);

  for (let start = 0; start < args.candidates.length; start += batchSize) {
    const batch = args.candidates.slice(start, start + batchSize);
    const parsed = await runJobSearcherReview({
      ...args,
      candidates: batch,
      timeoutSeconds,
    });

    for (const [jobId, decision] of parsed.entries()) {
      decisions.set(jobId, decision);
    }
  }

  return decisions;
}

async function runJobSearcherReview(args: {
  runId: string;
  sourceKey: string;
  searchTerm?: string;
  searchLocation?: string;
  triggerType: string;
  candidates: JobSearcherReviewCandidate[];
  timeoutSeconds: number;
}) {
  const message = buildJobSearcherPrompt(args);
  const { stdout, stderr } = await execFile(
    process.env.OPENCLAW_BIN || 'openclaw',
    [
      'agent',
      '--agent',
      'job-searcher',
      '--message',
      message,
      '--json',
      '--timeout',
      String(args.timeoutSeconds),
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        OPENCLAW_HIDE_BANNER: '1',
        OPENCLAW_SUPPRESS_NOTES: '1',
      },
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  if (stderr?.trim()) {
    throw new Error(`job-searcher stderr: ${stderr.trim()}`);
  }

  let envelope: any;
  try {
    envelope = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`Failed to parse openclaw agent JSON output: ${getErrorMessage(error)}`);
  }

  const payloadText = extractPayloadText(envelope);
  const responseJson = extractJsonBlock(payloadText);

  let parsed: any;
  try {
    parsed = JSON.parse(responseJson);
  } catch (error) {
    throw new Error(`Failed to parse job-searcher JSON payload: ${getErrorMessage(error)}\nPayload: ${payloadText}`);
  }

  return validateJobSearcherResponse(parsed, args.candidates);
}

function buildJobSearcherPrompt(args: {
  runId: string;
  sourceKey: string;
  searchTerm?: string;
  searchLocation?: string;
  triggerType: string;
  candidates: JobSearcherReviewCandidate[];
}) {
  const candidatePayload = args.candidates.map((candidate) => ({
    jobId: candidate.jobId,
    previousStatus: candidate.previousStatus,
    title: candidate.normalized.title,
    normalizedTitle: candidate.normalized.normalizedTitle,
    companyName: candidate.normalized.companyName,
    locationText: candidate.normalized.locationText,
    workMode: candidate.normalized.workMode,
    freshnessBucket: candidate.normalized.freshnessBucket,
    salaryText: candidate.normalized.salaryText,
    sourceUrl: candidate.normalized.sourceUrl,
    description: truncate(candidate.normalized.descriptionClean || candidate.normalized.descriptionRaw, 1400),
    score: {
      fitScore: candidate.score.fitScore,
      companyQualityScore: candidate.score.companyQualityScore,
      aiRelevanceScore: candidate.score.aiRelevanceScore,
      freshnessScore: candidate.score.freshnessScore,
      priorityScore: candidate.score.priorityScore,
      topReasons: candidate.score.topReasons,
      risks: candidate.score.risks,
      rationale: candidate.score.rationale,
    },
    learningSignal: {
      notes: candidate.learningSignal.notes,
      archiveConfidenceDelta: candidate.learningSignal.archiveConfidenceDelta,
      shortlistConfidenceDelta: candidate.learningSignal.shortlistConfidenceDelta,
      suppressAdjacentAmbiguity: candidate.learningSignal.suppressAdjacentAmbiguity,
    },
  }));

  return [
    'You are receiving an internal Scout review request from the job-ops Scout worker.',
    'This is not a user-facing reply. Do not use tools. Use your own workspace context (including SCOUT_CONTEXT.md) plus the candidate data below.',
    '',
    'Current run context:',
    `- runId: ${args.runId}`,
    `- sourceKey: ${args.sourceKey}`,
    `- triggerType: ${args.triggerType}`,
    `- activeSearchTerm: ${args.searchTerm ?? 'unknown'}`,
    `- activeSearchLocation: ${args.searchLocation ?? 'unknown'}`,
    '- current v1 sourcing profile should stay narrow and conservative, but you may use Benny’s broader preferences from your workspace to distinguish "archive" from "needs_human_review".',
    '',
    'Return ONLY valid JSON matching this exact schema:',
    '{',
    '  "policyVersion": "job-searcher-scout-v1",',
    '  "decisions": [',
    '    {',
    '      "jobId": "string",',
    '      "verdict": "shortlist" | "archive" | "defer" | "needs_human_review",',
    '      "confidence": 0.0-0.99,',
    '      "reasons": ["1-4 concise reasons"],',
    '      "ambiguityFlags": ["optional_flag"],',
    '      "autoAction": "none" | "shortlist" | "archive"',
    '    }',
    '  ]',
    '}',
    '',
    'Rules:',
    '- include every jobId exactly once',
    '- no markdown, no prose before or after the JSON',
    '- use autoAction=shortlist only for unusually strong matches you would actually auto-shortlist',
    '- use autoAction=archive only for clear low-fit noise that should be auto-archived',
    '- otherwise use autoAction=none',
    '- prefer needs_human_review over archive when a role could plausibly fit Benny with human judgment',
    '- defer is for weak-but-not-clearly-bad roles that should remain discovered without urgent review',
    '',
    'Candidates:',
    JSON.stringify(candidatePayload, null, 2),
  ].join('\n');
}

function validateJobSearcherResponse(parsed: any, candidates: JobSearcherReviewCandidate[]) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('job-searcher response must be a JSON object');
  }

  if (!Array.isArray(parsed.decisions)) {
    throw new Error('job-searcher response missing decisions array');
  }

  const byId = new Map(candidates.map((candidate) => [candidate.jobId, candidate]));
  const decisions = new Map<string, ScoutDecisionDraft>();
  const policyVersion =
    typeof parsed.policyVersion === 'string' && parsed.policyVersion.trim().length > 0
      ? parsed.policyVersion.trim()
      : JOB_SEARCHER_SCOUT_POLICY_VERSION;

  for (const item of parsed.decisions) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('job-searcher decisions must be objects');
    }

    const jobId = typeof item.jobId === 'string' ? item.jobId : '';
    if (!jobId || !byId.has(jobId)) {
      throw new Error(`job-searcher returned unknown jobId: ${jobId || '(missing)'}`);
    }

    const verdict = VALID_VERDICTS.includes(item.verdict) ? item.verdict : null;
    if (!verdict) {
      throw new Error(`job-searcher returned invalid verdict for ${jobId}`);
    }

    const confidence = clampConfidence(item.confidence);
    const reasons = Array.isArray(item.reasons)
      ? item.reasons
          .filter((value: unknown): value is string => typeof value === 'string')
          .map((value: string) => value.trim())
          .filter(Boolean)
          .slice(0, 4)
      : [];
    const ambiguityFlags = Array.isArray(item.ambiguityFlags)
      ? item.ambiguityFlags
          .filter((value: unknown): value is string => typeof value === 'string')
          .map((value: string) => value.trim())
          .filter(Boolean)
          .slice(0, 6)
      : [];
    const autoAction: JobSearcherAutoAction = VALID_AUTO_ACTIONS.includes(item.autoAction) ? item.autoAction : 'none';

    if (reasons.length === 0) {
      throw new Error(`job-searcher returned no reasons for ${jobId}`);
    }

    const actedAutomatically =
      (verdict === 'shortlist' && autoAction === 'shortlist') || (verdict === 'archive' && autoAction === 'archive');

    decisions.set(jobId, {
      verdict,
      confidence,
      reasons,
      ambiguityFlags,
      actedAutomatically,
      resultingStatus: resolveResultingStatus(verdict, actedAutomatically),
      policyVersion,
    });
  }

  for (const candidate of candidates) {
    if (!decisions.has(candidate.jobId)) {
      throw new Error(`job-searcher response missing decision for ${candidate.jobId}`);
    }
  }

  return decisions;
}

function extractPayloadText(envelope: any) {
  const payloads = Array.isArray(envelope?.result?.payloads) ? envelope.result.payloads : [];
  const text = payloads
    .map((payload: any) => (typeof payload?.text === 'string' ? payload.text : ''))
    .join('\n')
    .trim();

  if (!text) {
    throw new Error('job-searcher returned no text payload');
  }

  return text;
}

function extractJsonBlock(input: string) {
  const trimmed = input.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) {
    throw new Error(`No JSON object found in payload: ${input}`);
  }

  return trimmed.slice(first, last + 1);
}

function clampConfidence(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) {
    return 0.5;
  }

  return Math.max(0, Math.min(0.99, Number(number.toFixed(2))));
}

function truncate(value: string | null | undefined, maxChars: number) {
  const text = (value ?? '').trim();
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, maxChars - 1)}…`;
}

function parseInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
