import { accessSync, constants as fsConstants } from 'node:fs';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

import {
  latchAgentResponseSchema,
  latchTaskRequestSchema,
  type LatchAgentResponse,
  type LatchReviewPolicy,
  type LatchTaskRequest,
} from '@job-ops/contracts';

const execFile = promisify(execFileCallback);

const DEFAULT_LATCH_AGENT_ID = process.env.LATCH_AGENT_ID?.trim() || 'application-ops';
const DEFAULT_TIMEOUT_SECONDS = parseInteger(process.env.LATCH_AGENT_TIMEOUT_SECONDS, 240);
const DEFAULT_POLL_INTERVAL_MS = parseInteger(process.env.LATCH_AGENT_POLL_INTERVAL_MS, 1500);
const SESSION_PREFIX = process.env.LATCH_AGENT_SESSION_PREFIX?.trim() || 'agent:application-ops:application:';
const OPENCLAW_BIN_CANDIDATES = ['/opt/homebrew/bin/openclaw', '/usr/local/bin/openclaw', '/bin/openclaw'];
const LATCH_POLICY_KEYS: (keyof LatchReviewPolicy)[] = [
  'lane',
  'firstTaskIntent',
  'inferredAnswersDefaultReviewState',
  'inferredAnswersRequireHumanReview',
  'allowReusableProfileAnswers',
  'liveBrowserFillAllowed',
  'humanFinalReviewRequired',
  'humanFinalSubmitRequired',
];

type OpenClawMessage = {
  role?: string;
  content?: Array<{ type?: string; text?: string }>;
  __openclaw?: { seq?: number };
};

export type LatchAgentFailureCode =
  | 'latch_agent_invalid_request'
  | 'latch_agent_invalid_boundary'
  | 'latch_agent_invalid_response'
  | 'latch_agent_response_mismatch'
  | 'latch_agent_gateway_failed'
  | 'latch_agent_timeout'
  | 'latch_agent_empty_text'
  | 'latch_agent_missing_json_object'
  | 'latch_agent_invalid_json';

export class LatchAgentError extends Error {
  readonly code: LatchAgentFailureCode;
  readonly details?: Record<string, unknown>;

  constructor(code: LatchAgentFailureCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'LatchAgentError';
    this.code = code;
    this.details = details;
  }
}

export function buildLatchTaskRequest(input: unknown): LatchTaskRequest {
  const result = latchTaskRequestSchema.safeParse(input);
  if (!result.success) {
    const issues = formatSchemaIssues(result.error.issues);
    const boundaryIssues = issues.filter((issue) => issue.path === 'boundary.agentId' || issue.path === 'boundary.runtime');

    if (boundaryIssues.length > 0 && boundaryIssues.length === issues.length) {
      throw new LatchAgentError(
        'latch_agent_invalid_boundary',
        'Latch task request failed boundary validation',
        {
          expectedAgentId: DEFAULT_LATCH_AGENT_ID,
          actualAgentId: getInputAgentId(input),
          issues: boundaryIssues,
        },
      );
    }

    throw new LatchAgentError('latch_agent_invalid_request', 'Latch task request failed schema validation', {
      issues,
    });
  }

  const request = result.data;
  if (request.boundary.agentId !== DEFAULT_LATCH_AGENT_ID) {
    throw new LatchAgentError(
      'latch_agent_invalid_boundary',
      `Latch task targets ${request.boundary.agentId}, but this worker expects ${DEFAULT_LATCH_AGENT_ID}`,
      {
        expectedAgentId: DEFAULT_LATCH_AGENT_ID,
        actualAgentId: request.boundary.agentId,
        runtime: request.boundary.runtime,
        applicationId: request.applicationId,
        intent: request.intent,
      },
    );
  }

  return request;
}

export function validateLatchAgentResponse(input: unknown): LatchAgentResponse {
  const result = latchAgentResponseSchema.safeParse(input);
  if (!result.success) {
    throw new LatchAgentError('latch_agent_invalid_response', 'Latch agent response failed schema validation', {
      issues: formatSchemaIssues(result.error.issues),
    });
  }

  const response = result.data;

  if (response.status === 'failed' && !response.failure) {
    throw new LatchAgentError(
      'latch_agent_invalid_response',
      'Latch failed responses must include a typed failure payload',
      {
        status: response.status,
        applicationId: response.applicationId,
      },
    );
  }

  if (response.status !== 'failed' && response.failure) {
    throw new LatchAgentError(
      'latch_agent_invalid_response',
      'Latch completed or blocked responses must not carry a failure payload',
      {
        status: response.status,
        failureCode: response.failure.code,
        applicationId: response.applicationId,
      },
    );
  }

  if (response.readiness.ready && response.readiness.hardBlockers.length > 0) {
    throw new LatchAgentError(
      'latch_agent_invalid_response',
      'Latch readiness cannot be ready while hard blockers are present',
      {
        applicationId: response.applicationId,
        hardBlockerCodes: response.readiness.hardBlockers.map((issue) => issue.code),
      },
    );
  }

  if (response.status === 'blocked') {
    if (response.readiness.ready) {
      throw new LatchAgentError(
        'latch_agent_invalid_response',
        'Latch blocked responses must report readiness.ready = false',
        {
          applicationId: response.applicationId,
        },
      );
    }

    if (response.readiness.hardBlockers.length === 0) {
      throw new LatchAgentError(
        'latch_agent_invalid_response',
        'Latch blocked responses must include at least one hard blocker',
        {
          applicationId: response.applicationId,
        },
      );
    }
  }

  return response;
}

export function validateLatchAgentResponseForRequest(input: unknown, request: LatchTaskRequest): LatchAgentResponse {
  const response = validateLatchAgentResponse(input);

  if (response.applicationId !== request.applicationId) {
    throw new LatchAgentError(
      'latch_agent_response_mismatch',
      `Latch response applicationId ${response.applicationId} does not match request ${request.applicationId}`,
      {
        expectedApplicationId: request.applicationId,
        actualApplicationId: response.applicationId,
        taskIntent: request.intent,
      },
    );
  }

  if (response.intent !== request.intent) {
    throw new LatchAgentError(
      'latch_agent_response_mismatch',
      `Latch response intent ${response.intent} does not match request ${request.intent}`,
      {
        applicationId: request.applicationId,
        expectedIntent: request.intent,
        actualIntent: response.intent,
      },
    );
  }

  if (
    response.boundary.runtime !== request.boundary.runtime ||
    response.boundary.agentId !== request.boundary.agentId
  ) {
    throw new LatchAgentError(
      'latch_agent_response_mismatch',
      'Latch response boundary does not match the requested OpenClaw agent boundary',
      {
        applicationId: request.applicationId,
        expectedBoundary: request.boundary,
        actualBoundary: response.boundary,
      },
    );
  }

  if (
    response.selectedResumeVersionId &&
    response.selectedResumeVersionId !== request.handoff.tailoredResumeVersionId
  ) {
    throw new LatchAgentError(
      'latch_agent_response_mismatch',
      'Latch response selected resume does not match the approved Needle handoff resume version',
      {
        applicationId: request.applicationId,
        expectedResumeVersionId: request.handoff.tailoredResumeVersionId,
        actualResumeVersionId: response.selectedResumeVersionId,
      },
    );
  }

  const policyMismatches = getPolicyMismatches(request.policy, response.policy);
  if (policyMismatches.length > 0) {
    throw new LatchAgentError(
      'latch_agent_response_mismatch',
      'Latch response policy drifted from the request contract',
      {
        applicationId: request.applicationId,
        policyMismatches,
      },
    );
  }

  return response;
}

export async function requestApplicationWorkspacePreparation(args: {
  taskId: string;
  taskRequest: unknown;
  timeoutSeconds?: number;
}): Promise<LatchAgentResponse> {
  const request = buildLatchTaskRequest(args.taskRequest);
  const sessionKey = buildApplicationSessionKey(request.applicationId);
  const timeoutSeconds = args.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;

  await gatewayCall('sessions.create', {
    agentId: DEFAULT_LATCH_AGENT_ID,
    key: sessionKey,
    label: `Latch application ops ${request.applicationId}`,
  });

  const sendResult = await gatewayCall('sessions.send', {
    key: sessionKey,
    message: buildLatchPrompt({
      taskId: args.taskId,
      request,
    }),
  });

  const messageSeq = Number(sendResult?.messageSeq ?? 0);
  const payloadText = await waitForAssistantReply({
    sessionKey,
    afterSeq: messageSeq,
    timeoutSeconds,
  });
  const responseJson = extractJsonBlock(payloadText);

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseJson);
  } catch (error) {
    throw new LatchAgentError(
      'latch_agent_invalid_json',
      `Failed to parse Latch JSON payload: ${getErrorMessage(error)}`,
      {
        sessionKey,
        taskId: args.taskId,
        payloadPreview: payloadText.slice(0, 2000),
      },
    );
  }

  const normalized = normalizeLatchAgentResponse(parsed, request);
  return validateLatchAgentResponseForRequest(normalized, request);
}

function buildLatchPrompt(args: { taskId: string; request: LatchTaskRequest }) {
  return [
    'You are application-ops responding on the real Latch boundary for Job Ops.',
    'This is an INTERNAL worker request, not a user-facing reply.',
    'You may use tools if needed, but your final reply must be ONLY valid JSON.',
    'Do not wrap the JSON in markdown fences. Do not add prose before or after the JSON.',
    '',
    'Strict contract rules:',
    '- return JSON that validates against the Latch response contract',
    '- echo the request contractVersion, lane, boundary, intent, and applicationId exactly',
    '- keep policy identical to the request policy',
    '- include summary as a short plain-language status summary',
    '- include selectedResumeVersionId and prefer the request handoff tailored resume version when available',
    '- include preparedAnswers as an array, even when empty',
    '- include readiness with ready, completionPercent, missingRequiredCount, lowConfidenceCount, hardBlockers, softWarnings, and recommendedNextAction',
    '- preserve browserAutomation.attempted = false and reason = out_of_scope_for_milestone_3',
    '- preserve humanBoundary.finalReviewRequired = true and finalSubmitRequired = true',
    '- if the task cannot be completed, return status = failed with a typed failure payload',
    '- if evaluation completes but blockers remain, return status = blocked with hard blockers',
    '- do not nest blockers inside a result object, put them directly in readiness.hardBlockers and readiness.softWarnings',
    '- never attempt live browser fill in this milestone slice',
    '',
    'Worker metadata:',
    JSON.stringify(
      {
        taskId: args.taskId,
        boundaryAgentId: DEFAULT_LATCH_AGENT_ID,
      },
      null,
      2,
    ),
    '',
    'Latch task request:',
    JSON.stringify(args.request, null, 2),
  ].join('\n');
}

function normalizeLatchAgentResponse(parsed: unknown, request: LatchTaskRequest): unknown {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return parsed;
  }

  const value = parsed as Record<string, unknown>;
  const handoff = request.handoff as Record<string, unknown> & {
    resumeAttachment?: { resumeVersionId?: string | null } | null;
  };
  const selectedResumeVersionId =
    (typeof value.selectedResumeVersionId === 'string' ? value.selectedResumeVersionId : null) ??
    (typeof handoff.tailoredResumeVersionId === 'string' ? handoff.tailoredResumeVersionId : null) ??
    handoff.resumeAttachment?.resumeVersionId ??
    null;

  if (value.readiness && typeof value.readiness === 'object' && !Array.isArray(value.readiness)) {
    const readiness = value.readiness as Record<string, unknown>;
    return {
      ...value,
      selectedResumeVersionId,
      attachedResumeVersionId:
        (typeof value.attachedResumeVersionId === 'string' ? value.attachedResumeVersionId : null) ??
        handoff.resumeAttachment?.resumeVersionId ??
        selectedResumeVersionId,
      confidenceSemantics: value.confidenceSemantics ?? defaultConfidenceSemantics(),
      portalTracking:
        value.portalTracking && typeof value.portalTracking === 'object'
          ? value.portalTracking
          : {
              tracked: !!request.existingPortalContext,
              mode: request.existingPortalContext?.mode ?? null,
              status: request.existingPortalContext?.status ?? null,
            },
      audit:
        value.audit && typeof value.audit === 'object'
          ? value.audit
          : {
              provenanceCaptured: true,
              emittedEventTypes: [],
            },
      readiness: {
        ...readiness,
        answersPendingReviewCount:
          readiness.answersPendingReviewCount ?? countAnswersPendingReview(Array.isArray(value.preparedAnswers) ? value.preparedAnswers : []),
        hardBlockers: normalizeReadinessIssues(readiness.hardBlockers, 'blocker'),
        softWarnings: normalizeReadinessIssues(readiness.softWarnings, 'warning'),
      },
    };
  }

  const result = value.result;
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return parsed;
  }

  const resultValue = result as Record<string, unknown>;
  const blockers = Array.isArray(resultValue.blockers)
    ? resultValue.blockers.filter(
        (item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item),
      )
    : [];
  const hardBlockers = blockers
    .filter((item) => item.hard !== false)
    .map((item) => String(item.message ?? item.code ?? 'Unspecified blocker'));
  const softWarnings = blockers
    .filter((item) => item.hard === false)
    .map((item) => String(item.message ?? item.code ?? 'Unspecified warning'));
  const summary =
    typeof value.summary === 'string' && value.summary.trim()
      ? value.summary.trim()
      : typeof resultValue.summary === 'string' && resultValue.summary.trim()
        ? resultValue.summary.trim()
        : hardBlockers[0] ?? softWarnings[0] ?? `Latch ${String(value.status ?? 'completed')}`;
  const recommendedNextAction =
    typeof resultValue.nextAction === 'string' && resultValue.nextAction.trim()
      ? resultValue.nextAction.trim()
      : hardBlockers.length > 0
        ? 'resolve_hard_blockers'
        : softWarnings.length > 0
          ? 'review_warnings'
          : 'review_prepared_workspace';
  const completionPercent = typeof resultValue.completionPercent === 'number' ? resultValue.completionPercent : hardBlockers.length > 0 ? 0 : 100;

  return {
    ...value,
    summary,
    selectedResumeVersionId,
    attachedResumeVersionId:
      (typeof value.attachedResumeVersionId === 'string' ? value.attachedResumeVersionId : null) ??
      handoff.resumeAttachment?.resumeVersionId ??
      selectedResumeVersionId,
    confidenceSemantics: value.confidenceSemantics ?? defaultConfidenceSemantics(),
    preparedAnswers: Array.isArray(value.preparedAnswers) ? value.preparedAnswers : [],
    portalTracking:
      value.portalTracking && typeof value.portalTracking === 'object'
        ? value.portalTracking
        : {
            tracked: !!request.existingPortalContext,
            mode: request.existingPortalContext?.mode ?? null,
            status: request.existingPortalContext?.status ?? null,
          },
    audit:
      value.audit && typeof value.audit === 'object'
        ? value.audit
        : {
            provenanceCaptured: true,
            emittedEventTypes: [],
          },
    readiness: {
      ready: value.status === 'completed' && hardBlockers.length === 0,
      completionPercent,
      missingRequiredCount:
        typeof resultValue.missingRequiredCount === 'number' ? resultValue.missingRequiredCount : hardBlockers.length,
      lowConfidenceCount: typeof resultValue.lowConfidenceCount === 'number' ? resultValue.lowConfidenceCount : 0,
      answersPendingReviewCount: countAnswersPendingReview(Array.isArray(value.preparedAnswers) ? value.preparedAnswers : []),
      hardBlockers: normalizeReadinessIssues(blockers.filter((item) => item.hard !== false), 'blocker'),
      softWarnings: normalizeReadinessIssues(blockers.filter((item) => item.hard === false), 'warning'),
      recommendedNextAction,
    },
    browserAutomation:
      value.browserAutomation && typeof value.browserAutomation === 'object'
        ? value.browserAutomation
        : { attempted: false, reason: 'out_of_scope_for_milestone_3' },
    humanBoundary:
      value.humanBoundary && typeof value.humanBoundary === 'object'
        ? value.humanBoundary
        : { finalSubmitRequired: true, finalReviewRequired: true },
  };
}

function normalizeReadinessIssues(value: unknown, level: 'blocker' | 'warning' | 'info') {
  if (!Array.isArray(value)) {
    return [] as Array<{ code: string; level: 'blocker' | 'warning' | 'info'; message: string }>;
  }

  return value.map((item) => {
    if (typeof item === 'string') {
      return {
        code: level === 'blocker' ? 'required_answers_missing' : 'answers_pending_review',
        level,
        message: item,
      };
    }

    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const record = item as Record<string, unknown>;
      return {
        code: String(record.code ?? (level === 'blocker' ? 'required_answers_missing' : 'answers_pending_review')),
        level: (record.level === 'info' || record.level === 'warning' || record.level === 'blocker'
          ? record.level
          : level) as 'blocker' | 'warning' | 'info',
        message: String(record.message ?? record.code ?? 'Unspecified readiness issue'),
      };
    }

    return {
      code: level === 'blocker' ? 'required_answers_missing' : 'answers_pending_review',
      level,
      message: String(item),
    };
  });
}

function countAnswersPendingReview(value: unknown[]) {
  return value.filter((item) => item && typeof item === 'object' && (item as Record<string, unknown>).reviewState === 'needs_review').length;
}

function defaultConfidenceSemantics() {
  return {
    scale: '0_to_1',
    bands: {
      low: {
        minInclusive: 0,
        maxExclusive: 0.4,
        description: 'Low confidence, requires human review before use.',
      },
      medium: {
        minInclusive: 0.4,
        maxExclusive: 0.8,
        description: 'Medium confidence, usually reusable with review.',
      },
      high: {
        minInclusive: 0.8,
        maxInclusive: 1,
        description: 'High confidence, still defaults to needs_review for inferred answers in Milestone 3.',
      },
      unknown: {
        description: 'Confidence unknown or not provided, treat conservatively and require review.',
      },
    },
    defaultInferredReviewState: 'needs_review',
    notes: [],
  };
}

async function waitForAssistantReply(args: { sessionKey: string; afterSeq: number; timeoutSeconds: number }) {
  const deadline = Date.now() + args.timeoutSeconds * 1000;
  let sawAssistantWithoutText = false;

  while (Date.now() < deadline) {
    const session = await gatewayCall('sessions.get', { key: args.sessionKey });
    const messages = Array.isArray(session?.messages) ? (session.messages as OpenClawMessage[]) : [];
    const assistantReplies = messages.filter((message) => {
      const seq = Number(message?.__openclaw?.seq ?? 0);
      return message?.role === 'assistant' && seq > args.afterSeq;
    });

    for (let index = assistantReplies.length - 1; index >= 0; index -= 1) {
      const text = extractAssistantText(assistantReplies[index]!);
      if (text) {
        return text;
      }
      sawAssistantWithoutText = true;
    }

    await sleep(DEFAULT_POLL_INTERVAL_MS);
  }

  throw new LatchAgentError(
    sawAssistantWithoutText ? 'latch_agent_empty_text' : 'latch_agent_timeout',
    sawAssistantWithoutText
      ? `Latch produced assistant replies without text payloads on ${args.sessionKey}`
      : `Timed out waiting for Latch reply on ${args.sessionKey}`,
    {
      sessionKey: args.sessionKey,
      timeoutSeconds: args.timeoutSeconds,
    },
  );
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

  return text || null;
}

function extractJsonBlock(input: string) {
  const trimmed = input.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) {
    throw new LatchAgentError('latch_agent_missing_json_object', 'No JSON object found in Latch payload', {
      payloadPreview: input.slice(0, 2000),
    });
  }

  return trimmed.slice(first, last + 1);
}

async function gatewayCall(method: string, params: Record<string, unknown>) {
  const openclawBin = resolveOpenClawBin();

  try {
    const { stdout, stderr } = await execFile(
      openclawBin,
      ['gateway', 'call', method, '--json', '--params', JSON.stringify(params)],
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
      throw new Error(stderr.trim());
    }

    return JSON.parse(stdout);
  } catch (error: any) {
    const stdout = typeof error?.stdout === 'string' ? error.stdout.trim() : '';
    const stderr = typeof error?.stderr === 'string' ? error.stderr.trim() : '';
    const detail = [getErrorMessage(error), stderr, stdout].filter(Boolean).join('\n');
    throw new LatchAgentError('latch_agent_gateway_failed', `Gateway call failed (${method}): ${detail}`, {
      method,
      openclawBin,
      stderr,
      stdout,
    });
  }
}

function formatSchemaIssues(issues: { path: (string | number)[]; message: string }[]) {
  return issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

function getPolicyMismatches(expected: LatchReviewPolicy, actual: LatchReviewPolicy) {
  return LATCH_POLICY_KEYS.flatMap((key) => {
    if (expected[key] === actual[key]) {
      return [];
    }

    return [
      {
        key,
        expected: expected[key],
        actual: actual[key],
      },
    ];
  });
}

function getInputAgentId(input: unknown) {
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  const boundary = Reflect.get(input, 'boundary');
  if (!boundary || typeof boundary !== 'object') {
    return undefined;
  }

  const agentId = Reflect.get(boundary, 'agentId');
  return typeof agentId === 'string' ? agentId : undefined;
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
  const safeApplicationId = applicationId
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '');
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
