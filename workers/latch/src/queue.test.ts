import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_LATCH_REVIEW_POLICY } from '@job-ops/contracts';
import { ApplicationStatus, LatchTaskStatus, LatchTaskType } from '@job-ops/db';

import {
  buildPrepareApplicationWorkspaceRequest,
  buildResumeAttachmentPersistencePlan,
  enqueueLatchTaskFromNeedleApprovalWithTx,
} from './queue';

test('buildPrepareApplicationWorkspaceRequest locks the real Latch boundary and review defaults', () => {
  const request = buildPrepareApplicationWorkspaceRequest({
    applicationId: 'app-123',
    jobId: 'job-456',
    tailoredResumeVersionId: 'resume-789',
    approvedTailoringRunId: 'run-321',
    approvedAt: '2026-04-07T20:00:00.000Z',
    actorLabel: 'operator:latch-test',
    existingPortalContext: {
      launchUrl: 'https://boards.greenhouse.io/example/jobs/123',
      providerDomain: 'boards.greenhouse.io',
      mode: 'manual',
      status: 'in_progress',
    },
  });

  assert.equal(request.contractVersion, 'latch-application-ops-v1');
  assert.equal(request.lane, 'Latch');
  assert.deepEqual(request.boundary, {
    runtime: 'openclaw_agent',
    agentId: 'application-ops',
  });
  assert.equal(request.intent, 'prepare_application_workspace');
  assert.equal(request.applicationStatus, 'applying');
  assert.deepEqual(request.policy, DEFAULT_LATCH_REVIEW_POLICY);
  assert.deepEqual(request.existingPortalContext, {
    launchUrl: 'https://boards.greenhouse.io/example/jobs/123',
    providerDomain: 'boards.greenhouse.io',
    mode: 'manual',
    status: 'in_progress',
  });
});

test('buildPrepareApplicationWorkspaceRequest omits portal context when none exists', () => {
  const request = buildPrepareApplicationWorkspaceRequest({
    applicationId: 'app-123',
    jobId: 'job-456',
    tailoredResumeVersionId: 'resume-789',
    approvedTailoringRunId: 'run-321',
    approvedAt: '2026-04-07T20:00:00.000Z',
    actorLabel: 'operator:latch-test',
  });

  assert.equal('existingPortalContext' in request, false);
});

test('enqueueLatchTaskFromNeedleApprovalWithTx reuses an active task when the worker heartbeat is still fresh', async () => {
  const activeTask = {
    id: 'latch-task-existing',
    applicationId: 'app-123',
    taskType: LatchTaskType.prepare_application_workspace,
    status: LatchTaskStatus.processing,
    requestedByLabel: 'operator:earlier',
    workerLabel: 'latch-worker-1',
    createdAt: new Date(),
    startedAt: new Date(),
  };

  let created = false;
  let audited = false;

  const tx = {
    application: {
      findUnique: async () => ({
        id: 'app-123',
        jobId: 'job-456',
        status: ApplicationStatus.applying,
        tailoredResumeVersionId: 'resume-789',
        portalUrl: null,
        portalDomain: null,
        portalSessions: [],
      }),
    },
    latchTask: {
      findFirst: async () => activeTask,
      create: async () => {
        created = true;
        return null;
      },
    },
    latchWorkerHeartbeat: {
      findUnique: async () => ({
        workerLabel: 'latch-worker-1',
        updatedAt: new Date(),
      }),
    },
    auditEvent: {
      create: async () => {
        audited = true;
      },
    },
  } as any;

  const result = await enqueueLatchTaskFromNeedleApprovalWithTx(tx, {
    applicationId: 'app-123',
    approvedTailoringRunId: 'run-321',
    actorLabel: 'operator:latch-test',
    approvedAt: new Date('2026-04-07T20:00:00.000Z'),
  });

  assert.equal(result, activeTask);
  assert.equal(created, false);
  assert.equal(audited, false);
});

test('buildResumeAttachmentPersistencePlan falls back to canonical artifact route when rendered URLs are blank', () => {
  const plan = buildResumeAttachmentPersistencePlan({
    attachedResumeVersionId: 'resume-789',
    existingAttachments: [],
    resumeVersion: {
      id: 'resume-789',
      title: 'Acme AI — Analytics Associate Tailored Resume',
      renderedPdfUrl: null,
      renderedDocxUrl: null,
    },
  });

  assert.deepEqual(plan, {
    action: 'create',
    reason: 'create_missing_attachment',
    attachmentId: null,
    data: {
      resumeVersionId: 'resume-789',
      fileUrl: '/api/resume-artifacts/resume-789',
      filename: 'acme-ai-analytics-associate-tailored-resume.pdf',
    },
    fileUrl: '/api/resume-artifacts/resume-789',
    filename: 'acme-ai-analytics-associate-tailored-resume.pdf',
  });
});

test('buildResumeAttachmentPersistencePlan replaces a lone stale resume attachment with the selected tailored resume', () => {
  const plan = buildResumeAttachmentPersistencePlan({
    attachedResumeVersionId: 'resume-tailored',
    existingAttachments: [
      {
        id: 'attachment-old',
        resumeVersionId: 'resume-base',
        fileUrl: 'seed://resume/base-analytics.pdf',
        filename: 'benny-yuan-analytics-base.pdf',
      },
    ],
    resumeVersion: {
      id: 'resume-tailored',
      title: 'Acme AI Tailored Resume',
      renderedPdfUrl: null,
      renderedDocxUrl: null,
    },
  });

  assert.deepEqual(plan, {
    action: 'update',
    reason: 'replace_existing_attachment_with_selected_resume',
    attachmentId: 'attachment-old',
    data: {
      resumeVersionId: 'resume-tailored',
      fileUrl: '/api/resume-artifacts/resume-tailored',
      filename: 'acme-ai-tailored-resume.pdf',
    },
    fileUrl: '/api/resume-artifacts/resume-tailored',
    filename: 'acme-ai-tailored-resume.pdf',
  });
});

test('enqueueLatchTaskFromNeedleApprovalWithTx fails a stale queued task and creates a replacement', async () => {
  const staleTask = {
    id: 'latch-task-stale',
    applicationId: 'app-123',
    taskType: LatchTaskType.prepare_application_workspace,
    status: LatchTaskStatus.queued,
    requestedByLabel: 'operator:earlier',
    workerLabel: 'latch-worker-stale',
    createdAt: new Date(Date.now() - 5 * 60_000),
    startedAt: null,
  };

  const newTask = {
    id: 'latch-task-new',
    applicationId: 'app-123',
    taskType: LatchTaskType.prepare_application_workspace,
    status: LatchTaskStatus.queued,
    requestedByLabel: 'operator:latch-test',
    workerLabel: null,
    createdAt: new Date(),
    startedAt: null,
  };

  const updates: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
  const auditEvents: unknown[] = [];
  const createCalls: Array<Record<string, unknown>> = [];

  const tx = {
    application: {
      findUnique: async () => ({
        id: 'app-123',
        jobId: 'job-456',
        status: ApplicationStatus.applying,
        tailoredResumeVersionId: 'resume-789',
        portalUrl: null,
        portalDomain: 'boards.greenhouse.io',
        portalSessions: [],
      }),
    },
    latchTask: {
      findFirst: async () => staleTask,
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        updates.push(args);
        return { ...staleTask, ...args.data };
      },
      create: async (args: { data: Record<string, unknown> }) => {
        createCalls.push(args.data);
        return newTask;
      },
    },
    latchWorkerHeartbeat: {
      findUnique: async () => ({
        workerLabel: 'latch-worker-stale',
        updatedAt: new Date(Date.now() - 5 * 60_000),
      }),
    },
    auditEvent: {
      create: async (args: { data: unknown }) => {
        auditEvents.push(args.data);
      },
    },
  } as any;

  const result = await enqueueLatchTaskFromNeedleApprovalWithTx(tx, {
    applicationId: 'app-123',
    approvedTailoringRunId: 'run-321',
    actorLabel: 'operator:latch-test',
    approvedAt: new Date('2026-04-07T20:00:00.000Z'),
  });

  assert.equal(result, newTask);
  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.where.id, 'latch-task-stale');
  assert.equal(updates[0]?.data.status, LatchTaskStatus.failed);
  assert.equal(updates[0]?.data.failureCode, 'latch_task_stale_queue');
  assert.equal(createCalls.length, 1);
  assert.equal(createCalls[0]?.applicationId, 'app-123');
  assert.equal(createCalls[0]?.taskType, LatchTaskType.prepare_application_workspace);
  assert.equal(auditEvents.length, 2);
});
