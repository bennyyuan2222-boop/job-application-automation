import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { DEFAULT_LATCH_REVIEW_POLICY } from '@job-ops/contracts';

import {
  LatchAgentError,
  buildLatchTaskRequest,
  requestApplicationWorkspacePreparation,
  validateLatchAgentResponse,
  validateLatchAgentResponseForRequest,
} from './agent';

function loadJsonFixture<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as T;
}

const validRequestFixture = loadJsonFixture<Record<string, unknown>>('prepare-application-workspace.request.json');
const validResponseFixture = loadJsonFixture<Record<string, unknown>>('prepare-application-workspace.response.completed.json');

test('buildLatchTaskRequest accepts the canonical request fixture', () => {
  const request = buildLatchTaskRequest(validRequestFixture);

  assert.equal(request.applicationId, 'app_01HXYZLATCH');
  assert.equal(request.boundary.agentId, 'application-ops');
  assert.deepEqual(request.policy, DEFAULT_LATCH_REVIEW_POLICY);
  assert.equal(request.handoff.source, 'needle_approved_handoff');
});

test('buildLatchTaskRequest rejects non-application-ops boundaries with a typed error', () => {
  const invalidRequest = structuredClone(validRequestFixture);
  const boundary = invalidRequest.boundary as { runtime: string; agentId: string };
  boundary.agentId = 'local-fake-latch';

  assert.throws(
    () => buildLatchTaskRequest(invalidRequest),
    (error: unknown) => {
      assert.ok(error instanceof LatchAgentError);
      assert.equal(error.code, 'latch_agent_invalid_boundary');
      assert.equal(error.details?.expectedAgentId, 'application-ops');
      assert.equal(error.details?.actualAgentId, 'local-fake-latch');
      return true;
    },
  );
});

test('validateLatchAgentResponseForRequest accepts the canonical request/response fixtures', () => {
  const request = buildLatchTaskRequest(validRequestFixture);
  const response = validateLatchAgentResponseForRequest(validResponseFixture, request);

  assert.equal(response.applicationId, request.applicationId);
  assert.equal(response.browserAutomation.attempted, false);
  assert.equal(response.readiness.recommendedNextAction, 'review inferred answers');
});

test('validateLatchAgentResponse rejects failed responses without a failure payload', () => {
  const invalidResponse = structuredClone(validResponseFixture);
  invalidResponse.status = 'failed';
  invalidResponse.failure = null;

  assert.throws(
    () => validateLatchAgentResponse(invalidResponse),
    (error: unknown) => {
      assert.ok(error instanceof LatchAgentError);
      assert.equal(error.code, 'latch_agent_invalid_response');
      assert.match(error.message, /must include a typed failure payload/i);
      return true;
    },
  );
});

test('validateLatchAgentResponse rejects blocked responses that do not include hard blockers', () => {
  const invalidResponse = structuredClone(validResponseFixture);
  invalidResponse.status = 'blocked';
  (invalidResponse.readiness as { ready: boolean }).ready = false;
  (invalidResponse.readiness as { hardBlockers: unknown[] }).hardBlockers = [];

  assert.throws(
    () => validateLatchAgentResponse(invalidResponse),
    (error: unknown) => {
      assert.ok(error instanceof LatchAgentError);
      assert.equal(error.code, 'latch_agent_invalid_response');
      assert.match(error.message, /must include at least one hard blocker/i);
      return true;
    },
  );
});

test('validateLatchAgentResponseForRequest rejects mismatched application ids', () => {
  const request = buildLatchTaskRequest(validRequestFixture);
  const mismatchedResponse = structuredClone(validResponseFixture);
  mismatchedResponse.applicationId = 'app_other';

  assert.throws(
    () => validateLatchAgentResponseForRequest(mismatchedResponse, request),
    (error: unknown) => {
      assert.ok(error instanceof LatchAgentError);
      assert.equal(error.code, 'latch_agent_response_mismatch');
      assert.equal(error.details?.expectedApplicationId, request.applicationId);
      assert.equal(error.details?.actualApplicationId, 'app_other');
      return true;
    },
  );
});

test('requestApplicationWorkspacePreparation fails closed until the real OpenClaw bridge exists', async () => {
  await assert.rejects(
    () =>
      requestApplicationWorkspacePreparation({
        taskId: 'latch-task-123',
        taskRequest: validRequestFixture,
      }),
    (error: unknown) => {
      assert.ok(error instanceof LatchAgentError);
      assert.equal(error.code, 'latch_agent_not_implemented');
      assert.match(error.message, /No local fallback is allowed/i);
      assert.equal(error.details?.taskId, 'latch-task-123');
      assert.equal(error.details?.agentId, 'application-ops');
      return true;
    },
  );
});
