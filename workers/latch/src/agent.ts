import {
  latchAgentResponseSchema,
  latchTaskRequestSchema,
  type LatchAgentResponse,
  type LatchReviewPolicy,
  type LatchTaskRequest,
} from '@job-ops/contracts';

const DEFAULT_LATCH_AGENT_ID = process.env.LATCH_AGENT_ID?.trim() || 'application-ops';
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

export type LatchAgentFailureCode =
  | 'latch_agent_invalid_request'
  | 'latch_agent_invalid_boundary'
  | 'latch_agent_invalid_response'
  | 'latch_agent_response_mismatch'
  | 'latch_agent_not_implemented';

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
}): Promise<LatchAgentResponse> {
  const request = buildLatchTaskRequest(args.taskRequest);

  throw new LatchAgentError(
    'latch_agent_not_implemented',
    `Latch task ${args.taskId} is queued for the real OpenClaw agent boundary (${request.boundary.agentId}), but the Mac mini bridge is not implemented yet. No local fallback is allowed.`,
    {
      taskId: args.taskId,
      contractVersion: request.contractVersion,
      lane: request.lane,
      intent: request.intent,
      runtime: request.boundary.runtime,
      agentId: request.boundary.agentId,
      applicationId: request.applicationId,
      nextRequiredStep: 'dispatch to the real OpenClaw agent and validate the typed response before marking the task complete',
    },
  );
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
