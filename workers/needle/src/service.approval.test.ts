import assert from 'node:assert/strict';
import test from 'node:test';

import { ApplicationStatus } from '@job-ops/db';

import { approveTailoringRunForApplicationWithDependencies } from './service';

test('approveTailoringRunForApplicationWithDependencies rolls back application changes if latch enqueue fails', async () => {
  const state = {
    application: {
      id: 'app-123',
      status: ApplicationStatus.tailoring_review,
      tailoredResumeVersionId: null,
      pausedReason: 'waiting-for-approval',
    },
    tailoringRun: {
      id: 'run-321',
      applicationId: 'app-123',
      status: 'generated_for_review',
      outputResumeVersionId: 'resume-789',
    },
    resumeVersion: {
      id: 'resume-789',
      title: 'Northstar Resume',
      renderedPdfUrl: null,
    },
    attachments: [
      {
        id: 'attachment-old',
        applicationId: 'app-123',
        attachmentType: 'resume',
        resumeVersionId: 'resume-old',
        filename: 'old-resume.pdf',
        fileUrl: '/api/resume-artifacts/resume-old',
      },
    ],
    auditEvents: [] as unknown[],
  };

  const originalState = structuredClone(state);
  const enqueueCalls: Array<{ applicationId: string; tailoringRunId: string; actorLabel: string; approvedAt: Date }> = [];

  const prismaClient = {
    tailoringRun: {
      findUnique: async ({ where: { id } }: { where: { id: string } }) =>
        state.tailoringRun.id === id ? structuredClone(state.tailoringRun) : null,
    },
    resumeVersion: {
      findUnique: async ({ where: { id } }: { where: { id: string } }) =>
        state.resumeVersion.id === id
          ? { id: state.resumeVersion.id, title: state.resumeVersion.title }
          : null,
    },
    $transaction: async <T>(callback: (tx: any) => Promise<T>) => {
      const draft = structuredClone(state);
      const tx = {
        tailoringRun: {
          update: async ({ where: { id }, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            assert.equal(id, draft.tailoringRun.id);
            Object.assign(draft.tailoringRun, data);
            return structuredClone(draft.tailoringRun);
          },
        },
        resumeVersion: {
          update: async ({ where: { id }, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            assert.equal(id, draft.resumeVersion.id);
            Object.assign(draft.resumeVersion, data);
            return structuredClone(draft.resumeVersion);
          },
        },
        application: {
          update: async ({ where: { id }, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            assert.equal(id, draft.application.id);
            Object.assign(draft.application, data);
            return structuredClone(draft.application);
          },
        },
        applicationAttachment: {
          deleteMany: async ({ where }: { where: { applicationId: string; attachmentType: string } }) => {
            const before = draft.attachments.length;
            draft.attachments = draft.attachments.filter(
              (attachment) =>
                attachment.applicationId !== where.applicationId || attachment.attachmentType !== where.attachmentType,
            );
            return { count: before - draft.attachments.length };
          },
          create: async ({ data }: { data: Record<string, unknown> }) => {
            const created = { id: 'attachment-new', ...data };
            draft.attachments.push(created as never);
            return created;
          },
        },
        auditEvent: {
          createMany: async ({ data }: { data: unknown[] }) => {
            draft.auditEvents.push(...data);
            return { count: data.length };
          },
        },
      };

      const result = await callback(tx);
      Object.assign(state, draft);
      return result;
    },
  };

  await assert.rejects(
    () =>
      approveTailoringRunForApplicationWithDependencies(
        'app-123',
        'run-321',
        { actorLabel: 'operator:latch-test' },
        {
          now: () => new Date('2026-04-07T20:00:00.000Z'),
          loadApplicationContext: async () => structuredClone(state.application) as any,
          prismaClient: prismaClient as any,
          enqueuePrepareApplicationWorkspace: async (applicationId, tailoringRunId, options) => {
            enqueueCalls.push({
              applicationId,
              tailoringRunId,
              actorLabel: options.actorLabel,
              approvedAt: options.approvedAt ?? new Date(0),
            });
            throw new Error('enqueue blew up');
          },
          buildResumeArtifactFilename: (title: string) => `${title}.pdf`,
          buildResumeArtifactPath: (resumeVersionId: string) => `/api/resume-artifacts/${resumeVersionId}`,
        },
      ),
    /enqueue blew up/,
  );

  assert.equal(enqueueCalls.length, 1);
  assert.deepEqual(enqueueCalls[0], {
    applicationId: 'app-123',
    tailoringRunId: 'run-321',
    actorLabel: 'operator:latch-test',
    approvedAt: new Date('2026-04-07T20:00:00.000Z'),
  });

  assert.deepEqual(state, originalState);
});
