import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

function writeOpenClawStub(
  responsePayload: Record<string, unknown>,
  options?: {
    sessionGetResponses?: Array<{
      messages: Array<{ role: string; seq: number; content: Array<{ type: string; text?: string }> }>;
    }>;
  },
) {
  const tempDir = mkdtempSync(join(tmpdir(), 'latch-agent-test-'));
  const binaryPath = join(tempDir, 'openclaw');
  const responseText = JSON.stringify(responsePayload);
  const sessionGetResponses = options?.sessionGetResponses ?? [
    {
      messages: [
        {
          role: 'assistant',
          seq: 8,
          content: [{ type: 'text', text: responseText }],
        },
      ],
    },
  ];

  writeFileSync(
    binaryPath,
    `#!/usr/bin/env node
const { existsSync, readFileSync, writeFileSync } = require('node:fs');
const args = process.argv.slice(2);
const method = args[2];
const paramsIndex = args.indexOf('--params');
const params = paramsIndex === -1 ? {} : JSON.parse(args[paramsIndex + 1]);
const statePath = ${JSON.stringify(join(tempDir, 'state.json'))};
const sessionGetResponses = ${JSON.stringify(sessionGetResponses)};

function nextSessionGetResponse() {
  let state = { getCalls: 0 };
  if (existsSync(statePath)) {
    state = JSON.parse(readFileSync(statePath, 'utf8'));
  }
  const index = Math.min(state.getCalls, sessionGetResponses.length - 1);
  const response = sessionGetResponses[index];
  state.getCalls += 1;
  writeFileSync(statePath, JSON.stringify(state));
  return response;
}

if (method === 'sessions.create') {
  process.stdout.write(JSON.stringify({ ok: true, key: params.key }));
  process.exit(0);
}

if (method === 'sessions.send') {
  process.stdout.write(JSON.stringify({ messageSeq: 7 }));
  process.exit(0);
}

if (method === 'sessions.get') {
  const response = nextSessionGetResponse();
  process.stdout.write(
    JSON.stringify({
      messages: response.messages.map((message) => ({
        role: message.role,
        __openclaw: { seq: message.seq },
        content: message.content,
      })),
    }),
  );
  process.exit(0);
}

process.stderr.write('unexpected method: ' + method);
process.exit(1);
`,
    'utf8',
  );
  chmodSync(binaryPath, 0o755);

  return { tempDir, binaryPath };
}

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

test('requestApplicationWorkspacePreparation returns the typed agent response through the gateway bridge', async () => {
  const { tempDir, binaryPath } = writeOpenClawStub(validResponseFixture);
  const previousOpenClawBin = process.env.OPENCLAW_BIN;
  process.env.OPENCLAW_BIN = binaryPath;

  try {
    const response = await requestApplicationWorkspacePreparation({
      taskId: 'latch-task-123',
      taskRequest: validRequestFixture,
      timeoutSeconds: 1,
    });

    assert.equal(response.applicationId, 'app_01HXYZLATCH');
    assert.equal(response.status, 'completed');
    assert.equal(response.selectedResumeVersionId, 'resume_tailored_2026_04_07');
    assert.equal(response.browserAutomation.attempted, false);
  } finally {
    if (previousOpenClawBin === undefined) {
      delete process.env.OPENCLAW_BIN;
    } else {
      process.env.OPENCLAW_BIN = previousOpenClawBin;
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('requestApplicationWorkspacePreparation ignores assistant tool-only frames until a text reply arrives', async () => {
  const { tempDir, binaryPath } = writeOpenClawStub(validResponseFixture, {
    sessionGetResponses: [
      {
        messages: [
          {
            role: 'assistant',
            seq: 8,
            content: [{ type: 'tool_call' }],
          },
          {
            role: 'assistant',
            seq: 9,
            content: [{ type: 'text', text: JSON.stringify(validResponseFixture) }],
          },
        ],
      },
    ],
  });
  const previousOpenClawBin = process.env.OPENCLAW_BIN;
  process.env.OPENCLAW_BIN = binaryPath;

  try {
    const response = await requestApplicationWorkspacePreparation({
      taskId: 'latch-task-124',
      taskRequest: validRequestFixture,
      timeoutSeconds: 1,
    });

    assert.equal(response.applicationId, 'app_01HXYZLATCH');
    assert.equal(response.status, 'completed');
  } finally {
    if (previousOpenClawBin === undefined) {
      delete process.env.OPENCLAW_BIN;
    } else {
      process.env.OPENCLAW_BIN = previousOpenClawBin;
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
});
