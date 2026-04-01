import { accessSync, constants as fsConstants } from 'node:fs';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

import {
  needleAgentResponseSchema,
  type NeedleAgentResponse,
  type TailoringBaseSelection,
  type TailoringFitAssessment,
  type TailoringRisk,
} from '@job-ops/contracts';
import type { DensityAssessment, JobContext, ResumeCandidate } from '@job-ops/tailoring';

const execFile = promisify(execFileCallback);

const DEFAULT_NEEDLE_AGENT_ID = process.env.NEEDLE_AGENT_ID?.trim() || 'resume-tailor';
const DEFAULT_TIMEOUT_SECONDS = parseInteger(process.env.NEEDLE_AGENT_TIMEOUT_SECONDS, 240);
const DEFAULT_POLL_INTERVAL_MS = parseInteger(process.env.NEEDLE_AGENT_POLL_INTERVAL_MS, 1500);
const SESSION_PREFIX = process.env.NEEDLE_AGENT_SESSION_PREFIX?.trim() || 'agent:resume-tailor:application:';
const OPENCLAW_BIN_CANDIDATES = ['/opt/homebrew/bin/openclaw', '/usr/local/bin/openclaw', '/bin/openclaw'];

type OpenClawMessage = {
  role?: string;
  content?: Array<{ type?: string; text?: string }>;
  __openclaw?: { seq?: number };
};

export type NeedleAgentFailureCode =
  | 'needle_agent_gateway_failed'
  | 'needle_agent_timeout'
  | 'needle_agent_empty_text'
  | 'needle_agent_missing_json_object'
  | 'needle_agent_invalid_json'
  | 'needle_agent_schema_invalid'
  | 'needle_agent_unknown_base_resume'
  | 'needle_agent_missing_base_selection_reasons'
  | 'needle_agent_missing_change_summary'
  | 'needle_agent_missing_rationale'
  | 'needle_agent_empty_markdown';

export class NeedleAgentError extends Error {
  readonly code: NeedleAgentFailureCode;
  readonly details?: Record<string, unknown>;

  constructor(code: NeedleAgentFailureCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'NeedleAgentError';
    this.code = code;
    this.details = details;
  }
}

export type NeedlePriorRunContext = {
  id: string;
  status: string;
  createdAt: string;
  completedAt?: string | null;
  sourceTailoringRunId?: string | null;
  revisionNote?: string | null;
  instructions?: string | null;
  fitAssessment?: TailoringFitAssessment | null;
  baseSelection?: TailoringBaseSelection | null;
  rationale?: string[];
  changeSummary?: string[];
  risks?: TailoringRisk[];
  outputResumeVersionId?: string | null;
  outputResumeTitle?: string | null;
  outputResumeMarkdown?: string | null;
};

export async function ensureNeedleApplicationSession(args: {
  applicationId: string;
  existingSessionKey?: string | null;
}) {
  const sessionKey = args.existingSessionKey?.trim() || buildApplicationSessionKey(args.applicationId);
  await gatewayCall('sessions.create', {
    agentId: DEFAULT_NEEDLE_AGENT_ID,
    key: sessionKey,
    label: `Needle tailoring ${args.applicationId}`,
  });
  return sessionKey;
}

export async function requestTailoringFromNeedleAgent(args: {
  sessionKey: string;
  applicationId: string;
  applicationStatus: string;
  job: JobContext;
  instructions?: string;
  sourceTailoringRunId?: string | null;
  priorRuns: NeedlePriorRunContext[];
  baseResumeCandidates: ResumeCandidate[];
  supportingTruthSources?: ResumeCandidate[];
  provisionalBaseHint?: {
    selectedResumeVersionId: string;
    selectedResumeTitle: string;
    reasons: string[];
    lane?: string | null;
  } | null;
  densityRevision?: {
    previousDraftMarkdown: string;
    lockedBaseSelection: {
      selectedResumeVersionId: string;
      selectedResumeTitle: string;
      lane?: string | null;
    };
    assessment: DensityAssessment;
  } | null;
  timeoutSeconds?: number;
}) {
  const timeoutSeconds = args.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
  const prompt = buildNeedlePromptForTest(args);
  const sendResult = await gatewayCall('sessions.send', {
    key: args.sessionKey,
    message: prompt,
  });

  const messageSeq = Number(sendResult?.messageSeq ?? 0);
  const payloadText = await waitForAssistantReply({
    sessionKey: args.sessionKey,
    afterSeq: messageSeq,
    timeoutSeconds,
  });
  const responseJson = extractJsonBlock(payloadText);

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseJson);
  } catch (error) {
    throw new NeedleAgentError(
      'needle_agent_invalid_json',
      `Failed to parse Needle JSON payload: ${getErrorMessage(error)}`,
      {
        sessionKey: args.sessionKey,
        payloadPreview: payloadText.slice(0, 2000),
      },
    );
  }

  const response = validateNeedleResponseForTest(parsed, args.baseResumeCandidates);
  return {
    sessionKey: args.sessionKey,
    rawText: payloadText,
    response,
  };
}

export function validateNeedleResponseForTest(parsed: unknown, candidates: ResumeCandidate[]): NeedleAgentResponse {
  const result = needleAgentResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new NeedleAgentError('needle_agent_schema_invalid', 'Needle response failed schema validation', {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const response = result.data;
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  if (!candidateIds.has(response.baseSelection.selectedResumeVersionId)) {
    throw new NeedleAgentError(
      'needle_agent_unknown_base_resume',
      `Needle selected unknown base resume: ${response.baseSelection.selectedResumeVersionId}`,
      {
        selectedResumeVersionId: response.baseSelection.selectedResumeVersionId,
        knownResumeVersionIds: [...candidateIds],
      },
    );
  }

  if (response.baseSelection.reasons.length === 0) {
    throw new NeedleAgentError('needle_agent_missing_base_selection_reasons', 'Needle response missing base selection reasons');
  }

  if (response.draft.changeSummary.length === 0) {
    throw new NeedleAgentError('needle_agent_missing_change_summary', 'Needle response missing draft change summary');
  }

  if (response.draft.rationale.length === 0) {
    throw new NeedleAgentError('needle_agent_missing_rationale', 'Needle response missing draft rationale');
  }

  return response;
}

export function buildNeedlePromptForTest(args: {
  applicationId: string;
  applicationStatus: string;
  job: JobContext;
  instructions?: string;
  sourceTailoringRunId?: string | null;
  priorRuns: NeedlePriorRunContext[];
  baseResumeCandidates: ResumeCandidate[];
  supportingTruthSources?: ResumeCandidate[];
  provisionalBaseHint?: {
    selectedResumeVersionId: string;
    selectedResumeTitle: string;
    reasons: string[];
    lane?: string | null;
  } | null;
  densityRevision?: {
    previousDraftMarkdown: string;
    lockedBaseSelection: {
      selectedResumeVersionId: string;
      selectedResumeTitle: string;
      lane?: string | null;
    };
    assessment: DensityAssessment;
  } | null;
}) {
  const candidatePayload = args.baseResumeCandidates.map((candidate) => ({
    id: candidate.id,
    title: candidate.title,
    lane: candidate.document.meta?.lane ?? null,
    summary: candidate.document.meta?.summary ?? null,
    contentMarkdown: candidate.contentMarkdown,
  }));

  const supportingTruthPayload = (args.supportingTruthSources ?? []).map((candidate) => ({
    id: candidate.id,
    title: candidate.title,
    lane: candidate.document.meta?.lane ?? null,
    summary: candidate.document.meta?.summary ?? null,
    contentMarkdown: candidate.contentMarkdown,
  }));

  const priorRuns = args.priorRuns.slice(0, 3).map((run) => ({
    id: run.id,
    status: run.status,
    createdAt: run.createdAt,
    completedAt: run.completedAt ?? null,
    sourceTailoringRunId: run.sourceTailoringRunId ?? null,
    instructions: run.instructions ?? null,
    revisionNote: run.revisionNote ?? null,
    fitAssessment: run.fitAssessment ?? null,
    baseSelection: run.baseSelection ?? null,
    rationale: run.rationale ?? [],
    changeSummary: run.changeSummary ?? [],
    risks: run.risks ?? [],
    outputResumeVersionId: run.outputResumeVersionId ?? null,
    outputResumeTitle: run.outputResumeTitle ?? null,
    outputResumeMarkdown: run.outputResumeMarkdown ?? null,
  }));

  const densityRevisionSection = args.densityRevision
    ? [
        '',
        'Density revision mode:',
        '- this is a revision request for rendered resume density, not a fresh base-selection task',
        '- base selection is LOCKED; do not switch away from the locked selectedResumeVersionId',
        '- preserve required sections and parseable markdown structure',
        '- do not add a SUMMARY section',
        '- improve density through truthful content shaping only',
        '- prefer strengthening Experience first',
        '- compress Skills if it is using too many lines',
        '- allow slightly longer bullets when the added detail improves value and remains grounded',
        '- do not pad with filler or generic buzzwords',
      ]
    : [];

  return [
    'You are Needle, the resume-tailor agent for Job Ops.',
    'This is an INTERNAL worker request, not a user-facing reply.',
    'Do not use tools. Do not write files. Do not ask follow-up questions.',
    'Return ONLY valid JSON. No markdown fences. No prose before or after the JSON.',
    '',
    'Truth rules:',
    '- use only facts supported by the provided job context, base resumes, supporting truth sources, and prior run context',
    '- never invent employers, titles, dates, tools, metrics, certifications, education, team size, or outcomes',
    '- if support is weak, note it in gaps/risks instead of fabricating coverage',
    '- choose exactly one provided base resume by selectedResumeVersionId',
    '- produce a complete tailored resume draft in markdown',
    '',
    'Formatting rules for contentMarkdown:',
    '- the first line must be Benny\'s actual name, not a company/job-specific resume title',
    '- the second line should be the contact line only',
    '- preserve section order: EDUCATION, SKILLS, EXPERIENCE, PROJECTS, LEADERSHIP & ACTIVITIES',
    '- do not add a SUMMARY section unless the user explicitly asks for one',
    '- keep the content compatible with Benny\'s AEBenny one-page serif resume layout: dense, polished, and visually balanced',
    '- keep bullets tight and outcome-focused; shorten wording before changing the overall layout system',
    '- do not add meta sections like JD Keywords, Density Estimate, Rationale, Notes, or Explanations inside contentMarkdown',
    '- achieve page fill through truthful bullet selection, not filler text or layout gimmicks',
    '- target roughly 2 experience roles, 2 projects, 1 leadership section, and about 18-21 bullets total unless the evidence clearly supports less',
    ...densityRevisionSection,
    '',
    'Return JSON matching this shape exactly:',
    '{',
    '  "contractVersion": "needle-tailoring-v1",',
    '  "fitAssessment": {',
    '    "summary": "string",',
    '    "verdict": "strong_match" | "viable" | "stretch" | "weak",',
    '    "matchedStrengths": ["string"],',
    '    "likelyGaps": ["string"],',
    '    "riskNotes": ["string"],',
    '    "proceedRecommendation": "proceed" | "proceed_with_caution" | "revise" | "pause"',
    '  },',
    '  "baseSelection": {',
    '    "selectedResumeVersionId": "string",',
    '    "selectedResumeTitle": "string",',
    '    "lane": "string | null",',
    '    "score": 0.0,',
    '    "reasons": ["string"],',
    '    "candidateCount": 0',
    '  },',
    '  "draft": {',
    '    "title": "string",',
    '    "contentMarkdown": "full markdown resume",',
    '    "changeSummary": ["string"],',
    '    "rationale": ["string"],',
    '    "risks": [{ "requirement": "string", "severity": "low|medium|high", "reason": "string" }]',
    '  },',
    '  "generation": {',
    '    "strategyVersion": "string",',
    '    "promptVersion": "string | null",',
    '    "modelId": "string | null",',
    '    "provider": "string | null"',
    '  }',
    '}',
    '',
    'Application context:',
    JSON.stringify(
      {
        applicationId: args.applicationId,
        applicationStatus: args.applicationStatus,
        sourceTailoringRunId: args.sourceTailoringRunId ?? null,
        instructions: args.instructions?.trim() || null,
      },
      null,
      2,
    ),
    '',
    'Job context:',
    JSON.stringify(args.job, null, 2),
    '',
    'Base resume candidates:',
    JSON.stringify(candidatePayload, null, 2),
    '',
    'Supporting truth sources (support-only, not for base switching unless explicitly allowed):',
    JSON.stringify(supportingTruthPayload, null, 2),
    '',
    'Prior run context (latest first, if any):',
    JSON.stringify(priorRuns, null, 2),
    '',
    'Provisional base hint (non-binding, you may disagree if the evidence supports a better base):',
    JSON.stringify(args.provisionalBaseHint ?? null, null, 2),
    ...(args.densityRevision
      ? [
          '',
          'Locked base selection for this revision:',
          JSON.stringify(args.densityRevision.lockedBaseSelection, null, 2),
          '',
          'Previous draft markdown:',
          args.densityRevision.previousDraftMarkdown,
          '',
          'Renderer density assessment:',
          JSON.stringify(args.densityRevision.assessment, null, 2),
        ]
      : []),
  ].join('\n');
}

async function waitForAssistantReply(args: { sessionKey: string; afterSeq: number; timeoutSeconds: number }) {
  const deadline = Date.now() + args.timeoutSeconds * 1000;

  while (Date.now() < deadline) {
    const session = await gatewayCall('sessions.get', { key: args.sessionKey });
    const messages = Array.isArray(session?.messages) ? (session.messages as OpenClawMessage[]) : [];
    const assistantReply = messages.find((message) => {
      const seq = Number(message?.__openclaw?.seq ?? 0);
      return message?.role === 'assistant' && seq > args.afterSeq;
    });

    if (assistantReply) {
      const text = extractAssistantText(assistantReply);
      if (text) {
        return text;
      }
    }

    await sleep(DEFAULT_POLL_INTERVAL_MS);
  }

  throw new NeedleAgentError('needle_agent_timeout', `Timed out waiting for Needle reply on ${args.sessionKey}`, {
    sessionKey: args.sessionKey,
    timeoutSeconds: args.timeoutSeconds,
  });
}

function extractAssistantText(message: OpenClawMessage) {
  const text = Array.isArray(message.content)
    ? message.content
        .filter((item) => item?.type === 'text' && typeof item?.text === 'string')
        .map((item) => item.text?.trim() ?? '')
        .filter(Boolean)
        .join('\n')
        .trim()
    : '';

  if (!text) {
    throw new NeedleAgentError('needle_agent_empty_text', 'Needle returned no text payload');
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
    throw new NeedleAgentError('needle_agent_missing_json_object', 'No JSON object found in Needle payload', {
      payloadPreview: input.slice(0, 2000),
    });
  }

  return trimmed.slice(first, last + 1);
}

async function gatewayCall(method: string, params: Record<string, unknown>) {
  const openclawBin = resolveOpenClawBin();

  try {
    const { stdout, stderr } = await execFile(openclawBin, ['gateway', 'call', method, '--json', '--params', JSON.stringify(params)], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        OPENCLAW_HIDE_BANNER: '1',
        OPENCLAW_SUPPRESS_NOTES: '1',
      },
      maxBuffer: 10 * 1024 * 1024,
    });

    if (stderr?.trim()) {
      throw new Error(stderr.trim());
    }

    return JSON.parse(stdout);
  } catch (error: any) {
    const stdout = typeof error?.stdout === 'string' ? error.stdout.trim() : '';
    const stderr = typeof error?.stderr === 'string' ? error.stderr.trim() : '';
    const detail = [getErrorMessage(error), stderr, stdout].filter(Boolean).join('\n');
    throw new NeedleAgentError('needle_agent_gateway_failed', `Gateway call failed (${method}): ${detail}`, {
      method,
      openclawBin,
      stderr,
      stdout,
    });
  }
}

function resolveOpenClawBin() {
  const explicit = process.env.OPENCLAW_BIN?.trim();
  if (explicit) {
    return explicit;
  }

  for (const candidate of OPENCLAW_BIN_CANDIDATES) {
    try {
      accessSync(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // keep looking
    }
  }

  return 'openclaw';
}

function buildApplicationSessionKey(applicationId: string) {
  const safeApplicationId = applicationId.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/(^-|-$)/g, '');
  return `${SESSION_PREFIX}${safeApplicationId}`;
}

function parseInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
