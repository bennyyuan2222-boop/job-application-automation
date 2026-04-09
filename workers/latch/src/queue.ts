import { accessSync, constants as fsConstants } from 'node:fs';
import { hostname as getHostname } from 'node:os';

import {
  ActorType,
  AnswerReviewState,
  AnswerSourceType,
  ApplicationStatus,
  LatchTaskStatus,
  LatchTaskType,
  PortalSessionMode,
  PortalSessionStatus,
  Prisma,
  prisma,
} from '@job-ops/db';
import {
  DEFAULT_LATCH_REVIEW_POLICY,
  latchTaskRequestSchema,
  type LatchAgentResponse,
  type LatchPreparedAnswer,
  type LatchTaskRequest,
} from '@job-ops/contracts';
import { makeAuditEvent } from '@job-ops/domain';
import { evaluateApplicationReadiness } from '@job-ops/readiness';

import {
  LatchAgentError,
  buildLatchTaskRequest,
  requestApplicationWorkspacePreparation,
} from './agent';

const STALE_QUEUED_MS = parseInteger(process.env.LATCH_TASK_STALE_QUEUED_MS, 60_000);
const STALE_PROCESSING_MS = parseInteger(process.env.LATCH_TASK_STALE_PROCESSING_MS, 15 * 60_000);
const HEARTBEAT_FRESH_MS = parseInteger(process.env.LATCH_WORKER_HEARTBEAT_FRESH_MS, 20_000);
const OPENCLAW_BIN_CANDIDATES = ['/opt/homebrew/bin/openclaw', '/usr/local/bin/openclaw', '/bin/openclaw'];

export type EnqueuePrepareApplicationWorkspaceOptions = {
  actorLabel: string;
  approvedAt?: Date;
  tx?: Prisma.TransactionClient;
};

export type LatchWorkerRuntimeInfo = {
  workerLabel: string;
  processId: number;
  hostname: string;
  dbHost: string | null;
  openclawBin: string;
};

export async function enqueuePrepareApplicationWorkspace(
  applicationId: string,
  approvedTailoringRunId: string,
  options: EnqueuePrepareApplicationWorkspaceOptions,
) {
  return enqueueLatchTaskFromNeedleApproval({
    applicationId,
    approvedTailoringRunId,
    actorLabel: options.actorLabel,
    approvedAt: options.approvedAt,
    tx: options.tx,
  });
}

export async function enqueueLatchTaskFromNeedleApproval(input: {
  applicationId: string;
  approvedTailoringRunId: string;
  actorLabel: string;
  approvedAt?: Date;
  tx?: Prisma.TransactionClient;
}) {
  if (input.tx) {
    return enqueueLatchTaskFromNeedleApprovalWithTx(input.tx, input);
  }

  return prisma.$transaction(async (tx) => {
    return enqueueLatchTaskFromNeedleApprovalWithTx(tx, input);
  });
}

export async function enqueueLatchTaskFromNeedleApprovalWithTx(
  tx: Prisma.TransactionClient,
  input: {
    applicationId: string;
    approvedTailoringRunId: string;
    actorLabel: string;
    approvedAt?: Date;
  },
) {
  const application = await tx.application.findUnique({
    where: { id: input.applicationId },
    select: {
      id: true,
      jobId: true,
      status: true,
      tailoredResumeVersionId: true,
      portalUrl: true,
      portalDomain: true,
      portalSessions: {
        orderBy: [{ lastSyncedAt: 'desc' }, { id: 'desc' }],
        take: 1,
        select: {
          launchUrl: true,
          providerDomain: true,
          mode: true,
          status: true,
        },
      },
    },
  });

  if (!application) {
    throw new Error(`Application not found: ${input.applicationId}`);
  }

  if (application.status !== ApplicationStatus.applying) {
    throw new Error(
      `Latch tasks may only be queued after the Needle approval handoff reaches applying. Current status: ${application.status}`,
    );
  }

  if (!application.tailoredResumeVersionId) {
    throw new Error('Cannot queue Latch without a selected tailored resume version on the application');
  }

  const activeTask = await tx.latchTask.findFirst({
    where: {
      applicationId: input.applicationId,
      status: {
        in: [LatchTaskStatus.queued, LatchTaskStatus.processing],
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (activeTask) {
    const recovered = await maybeRecoverStaleLatchTask(tx, activeTask);
    if (!recovered) {
      return activeTask;
    }
  }

  const latestPortalSession = application.portalSessions[0] ?? null;
  const approvedAt = (input.approvedAt ?? new Date()).toISOString();
  const request = buildPrepareApplicationWorkspaceRequest({
    applicationId: application.id,
    jobId: application.jobId,
    tailoredResumeVersionId: application.tailoredResumeVersionId,
    approvedTailoringRunId: input.approvedTailoringRunId,
    approvedAt,
    actorLabel: input.actorLabel,
    existingPortalContext: latestPortalSession || application.portalUrl || application.portalDomain
      ? {
          launchUrl: latestPortalSession?.launchUrl ?? application.portalUrl ?? null,
          providerDomain: latestPortalSession?.providerDomain ?? application.portalDomain ?? null,
          mode: latestPortalSession?.mode ?? null,
          status: latestPortalSession?.status ?? null,
        }
      : undefined,
  });

  const task = await tx.latchTask.create({
    data: {
      applicationId: input.applicationId,
      taskType: LatchTaskType.prepare_application_workspace,
      requestedByLabel: input.actorLabel,
      requestPayloadJson: toJsonValue(request),
    },
  });

  await tx.auditEvent.create({
    data: makeAuditEvent({
      entityType: 'application',
      entityId: input.applicationId,
      eventType: 'latch_task.queued',
      actorType: ActorType.user,
      actorLabel: input.actorLabel,
      payloadJson: {
        latchTaskId: task.id,
        taskType: task.taskType,
        boundary: request.boundary,
        intent: request.intent,
        approvedTailoringRunId: input.approvedTailoringRunId,
        tailoredResumeVersionId: application.tailoredResumeVersionId,
      },
    }),
  });

  return task;
}

export async function processNextLatchTask(options?: { workerLabel?: string }) {
  const runtime = getLatchWorkerRuntimeInfo(options?.workerLabel ?? 'latch-queue-worker');
  await writeLatchWorkerHeartbeat({
    ...runtime,
    state: 'polling',
  });

  const task = await claimNextLatchTask(runtime.workerLabel);
  if (!task) {
    await writeLatchWorkerHeartbeat({
      ...runtime,
      state: 'idle',
    });
    return null;
  }

  await writeLatchWorkerHeartbeat({
    ...runtime,
    state: 'processing',
    currentTaskId: task.id,
    currentTaskType: task.taskType,
    lastClaimedTaskId: task.id,
  });

  try {
    const taskRequest = buildLatchTaskRequest(task.requestPayloadJson);
    const response = await requestApplicationWorkspacePreparation({
      taskId: task.id,
      taskRequest,
    });

    if (response.status === 'failed') {
      const failureCode = response.failure?.code ?? 'internal_error';
      const failureMessage = response.failure?.message ?? response.summary;

      await prisma.$transaction(async (tx) => {
        await tx.latchTask.update({
          where: { id: task.id },
          data: {
            status: LatchTaskStatus.failed,
            responsePayloadJson: toJsonValue(response),
            completedAt: new Date(),
            failureCode,
            failureMessage,
          },
        });

        await tx.auditEvent.createMany({
          data: [
            makeAuditEvent({
              entityType: 'application',
              entityId: task.applicationId,
              eventType: 'latch_task.failed',
              actorType: ActorType.system,
              actorLabel: runtime.workerLabel,
              payloadJson: {
                latchTaskId: task.id,
                taskType: task.taskType,
                failureCode,
                failureMessage,
                responseStatus: response.status,
              },
            }),
            makeAuditEvent({
              entityType: 'application',
              entityId: task.applicationId,
              eventType: 'latch.workspace_preparation_failed',
              actorType: ActorType.agent,
              actorLabel: taskRequest.boundary.agentId,
              payloadJson: {
                latchTaskId: task.id,
                summary: response.summary,
                failure: JSON.parse(JSON.stringify(response.failure)),
                readiness: response.readiness,
                emittedEventTypes: response.audit.emittedEventTypes,
              },
            }),
          ],
        });
      });

      await writeLatchWorkerHeartbeat({
        ...runtime,
        state: 'idle',
        lastCompletedTaskId: task.id,
        lastErrorCode: failureCode,
        lastErrorMessage: failureMessage,
      });

      return {
        id: task.id,
        status: LatchTaskStatus.failed,
        agentStatus: response.status,
      };
    }

    await prisma.$transaction(async (tx) => {
      const persisted = await persistLatchPreparationResult(tx, {
        taskId: task.id,
        applicationId: task.applicationId,
        taskRequest,
        response,
      });

      await tx.latchTask.update({
        where: { id: task.id },
        data: {
          status: LatchTaskStatus.completed,
          responsePayloadJson: toJsonValue(response),
          completedAt: new Date(),
          failureCode: null,
          failureMessage: null,
        },
      });

      await tx.auditEvent.create({
        data: makeAuditEvent({
          entityType: 'application',
          entityId: task.applicationId,
          eventType: 'latch_task.completed',
          actorType: ActorType.system,
          actorLabel: runtime.workerLabel,
          payloadJson: {
            latchTaskId: task.id,
            taskType: task.taskType,
            agentStatus: response.status,
            summary: response.summary,
            persistedAnswerCount: persisted.persistedAnswerCount,
            resumeAttachmentId: persisted.resumeAttachmentId,
            resumeAttachmentAction: persisted.resumeAttachmentAction,
            portalSessionId: persisted.portalSessionId,
            portalTrackingPersisted: persisted.portalTrackingPersisted,
            completionPercent: persisted.persistedReadiness.completionPercent,
            missingRequiredCount: persisted.persistedReadiness.missingRequiredCount,
          },
        }),
      });
    });

    await writeLatchWorkerHeartbeat({
      ...runtime,
      state: 'idle',
      lastCompletedTaskId: task.id,
      lastErrorCode: null,
      lastErrorMessage: null,
    });

    return {
      id: task.id,
      status: LatchTaskStatus.completed,
      agentStatus: response.status,
    };
  } catch (error) {
    const failureMessage = error instanceof Error ? error.message : String(error);
    const failureCode = error instanceof LatchAgentError ? error.code : 'latch_task_failed';

    await prisma.$transaction(async (tx) => {
      await tx.latchTask.update({
        where: { id: task.id },
        data: {
          status: LatchTaskStatus.failed,
          failureCode,
          failureMessage,
          completedAt: new Date(),
        },
      });

      await tx.auditEvent.create({
        data: makeAuditEvent({
          entityType: 'application',
          entityId: task.applicationId,
          eventType: 'latch_task.failed',
          actorType: ActorType.system,
          actorLabel: runtime.workerLabel,
          payloadJson: {
            latchTaskId: task.id,
            taskType: task.taskType,
            failureCode,
            failureMessage,
          },
        }),
      });
    });

    await writeLatchWorkerHeartbeat({
      ...runtime,
      state: 'error',
      lastErrorCode: failureCode,
      lastErrorMessage: failureMessage,
    });

    throw error;
  }
}

export async function drainLatchTaskQueue(options?: {
  workerLabel?: string;
  maxTasks?: number;
}) {
  const maxTasks = options?.maxTasks ?? 25;
  const processed = [] as Array<{ id: string; status: LatchTaskStatus; agentStatus?: string }>;

  for (let index = 0; index < maxTasks; index += 1) {
    const result = await processNextLatchTask({ workerLabel: options?.workerLabel });
    if (!result) {
      break;
    }
    processed.push(result);
  }

  return processed;
}

export function getLatchWorkerRuntimeInfo(workerLabel: string): LatchWorkerRuntimeInfo {
  return {
    workerLabel,
    processId: process.pid,
    hostname: getHostname(),
    dbHost: resolveDatabaseHost(process.env.DATABASE_URL),
    openclawBin: resolveOpenClawBin(),
  };
}

export async function writeLatchWorkerHeartbeat(args: LatchWorkerRuntimeInfo & {
  state: string;
  currentTaskId?: string | null;
  currentTaskType?: LatchTaskType | null;
  lastClaimedTaskId?: string | null;
  lastCompletedTaskId?: string | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
}) {
  return prisma.latchWorkerHeartbeat.upsert({
    where: { workerLabel: args.workerLabel },
    create: {
      workerLabel: args.workerLabel,
      state: args.state,
      processId: args.processId,
      hostname: args.hostname,
      dbHost: args.dbHost,
      openclawBin: args.openclawBin,
      currentTaskId: args.currentTaskId ?? null,
      currentTaskType: args.currentTaskType ?? null,
      lastPolledAt: new Date(),
      lastClaimedTaskId: args.lastClaimedTaskId ?? null,
      lastCompletedTaskId: args.lastCompletedTaskId ?? null,
      lastErrorCode: args.lastErrorCode ?? null,
      lastErrorMessage: args.lastErrorMessage ?? null,
    },
    update: {
      state: args.state,
      processId: args.processId,
      hostname: args.hostname,
      dbHost: args.dbHost,
      openclawBin: args.openclawBin,
      currentTaskId: args.currentTaskId ?? null,
      currentTaskType: args.currentTaskType ?? null,
      lastPolledAt: new Date(),
      ...(args.lastClaimedTaskId ? { lastClaimedTaskId: args.lastClaimedTaskId } : {}),
      ...(args.lastCompletedTaskId ? { lastCompletedTaskId: args.lastCompletedTaskId } : {}),
      lastErrorCode: args.lastErrorCode ?? null,
      lastErrorMessage: args.lastErrorMessage ?? null,
    },
  });
}

export async function getActiveLatchTaskForApplication(applicationId: string) {
  return prisma.latchTask.findFirst({
    where: {
      applicationId,
      status: {
        in: [LatchTaskStatus.queued, LatchTaskStatus.processing],
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

async function persistLatchPreparationResult(
  tx: Prisma.TransactionClient,
  args: {
    taskId: string;
    applicationId: string;
    taskRequest: LatchTaskRequest;
    response: LatchAgentResponse;
  },
) {
  for (const answer of args.response.preparedAnswers) {
    await tx.applicationAnswer.upsert({
      where: {
        applicationId_fieldKey: {
          applicationId: args.applicationId,
          fieldKey: answer.fieldKey,
        },
      },
      update: {
        fieldLabel: answer.fieldLabel,
        fieldGroup: answer.fieldGroup ?? null,
        answerJson: buildApplicationAnswerJson(answer),
        sourceType: mapPreparedAnswerSourceType(answer.sourceType),
        confidence: answer.confidence ?? null,
        reviewState: mapPreparedAnswerReviewState(answer.reviewState),
      },
      create: {
        applicationId: args.applicationId,
        fieldKey: answer.fieldKey,
        fieldLabel: answer.fieldLabel,
        fieldGroup: answer.fieldGroup ?? null,
        answerJson: buildApplicationAnswerJson(answer),
        sourceType: mapPreparedAnswerSourceType(answer.sourceType),
        confidence: answer.confidence ?? null,
        reviewState: mapPreparedAnswerReviewState(answer.reviewState),
      },
    });
  }

  const resumeAttachment = await persistResumeAttachment(tx, args);
  const portalTracking = await persistPortalTracking(tx, args);

  if (portalTracking.persisted && (portalTracking.launchUrl || portalTracking.providerDomain)) {
    await tx.application.update({
      where: { id: args.applicationId },
      data: {
        ...(portalTracking.launchUrl ? { portalUrl: portalTracking.launchUrl } : {}),
        ...(portalTracking.providerDomain ? { portalDomain: portalTracking.providerDomain } : {}),
      },
    });
  }

  const persistedReadiness = await syncApplicationReadiness(tx, args.applicationId);

  const auditEvents = [] as Prisma.AuditEventCreateManyInput[];

  if (args.response.preparedAnswers.length > 0) {
    auditEvents.push(
      makeAuditEvent({
        entityType: 'application',
        entityId: args.applicationId,
        eventType: 'latch.answers_reconciled',
        actorType: ActorType.agent,
        actorLabel: args.taskRequest.boundary.agentId,
        payloadJson: {
          latchTaskId: args.taskId,
          fieldKeys: args.response.preparedAnswers.map((answer) => answer.fieldKey),
          answerCount: args.response.preparedAnswers.length,
          responseStatus: args.response.status,
          sourceTypeCounts: countBy(args.response.preparedAnswers.map((answer) => answer.sourceType)),
          persistedSourceTypeCounts: countBy(
            args.response.preparedAnswers.map((answer) => mapPreparedAnswerSourceType(answer.sourceType)),
          ),
          reviewStateCounts: countBy(args.response.preparedAnswers.map((answer) => answer.reviewState)),
          emittedEventTypes: args.response.audit.emittedEventTypes,
        },
      }),
    );
  }

  auditEvents.push(
    makeAuditEvent({
      entityType: 'application',
      entityId: args.applicationId,
      eventType: 'latch.workspace_prepared',
      actorType: ActorType.agent,
      actorLabel: args.taskRequest.boundary.agentId,
      payloadJson: {
        latchTaskId: args.taskId,
        status: args.response.status,
        summary: args.response.summary,
        responseReadiness: args.response.readiness,
        persistedReadiness,
        selectedResumeVersionId: args.response.selectedResumeVersionId,
        attachedResumeVersionId: args.response.attachedResumeVersionId,
        resumeAttachment,
        portalTracking: args.response.portalTracking,
        browserAutomation: args.response.browserAutomation,
        humanBoundary: args.response.humanBoundary,
        emittedEventTypes: args.response.audit.emittedEventTypes,
      },
    }),
  );

  if (args.response.attachedResumeVersionId || resumeAttachment.reason) {
    auditEvents.push(
      makeAuditEvent({
        entityType: 'application',
        entityId: args.applicationId,
        eventType: 'latch.resume_attachment_reconciled',
        actorType: ActorType.agent,
        actorLabel: args.taskRequest.boundary.agentId,
        payloadJson: {
          latchTaskId: args.taskId,
          selectedResumeVersionId: args.response.selectedResumeVersionId,
          attachedResumeVersionId: args.response.attachedResumeVersionId,
          attachmentId: resumeAttachment.attachmentId,
          action: resumeAttachment.action,
          reason: resumeAttachment.reason,
          fileUrl: resumeAttachment.fileUrl,
          filename: resumeAttachment.filename,
        },
      }),
    );
  }

  if (args.response.portalTracking.tracked || portalTracking.reason) {
    auditEvents.push(
      makeAuditEvent({
        entityType: 'application',
        entityId: args.applicationId,
        eventType: 'latch.portal_tracking_reconciled',
        actorType: ActorType.agent,
        actorLabel: args.taskRequest.boundary.agentId,
        payloadJson: {
          latchTaskId: args.taskId,
          tracked: args.response.portalTracking.tracked,
          persisted: portalTracking.persisted,
          portalSessionId: portalTracking.portalSessionId,
          reason: portalTracking.reason,
          launchUrl: portalTracking.launchUrl,
          providerDomain: portalTracking.providerDomain,
          mode: args.response.portalTracking.mode ?? args.taskRequest.existingPortalContext?.mode ?? null,
          status: args.response.portalTracking.status ?? args.taskRequest.existingPortalContext?.status ?? null,
        },
      }),
    );
  }

  await tx.auditEvent.createMany({ data: auditEvents });

  return {
    persistedAnswerCount: args.response.preparedAnswers.length,
    resumeAttachmentId: resumeAttachment.attachmentId,
    resumeAttachmentAction: resumeAttachment.action,
    portalSessionId: portalTracking.portalSessionId,
    portalTrackingPersisted: portalTracking.persisted,
    persistedReadiness,
  };
}

type ResumeAttachmentPersistencePlan =
  | {
      action: 'none';
      reason:
        | 'missing_attached_resume_version'
        | 'resume_version_not_found'
        | 'resume_artifact_url_missing'
        | 'conflicting_attachment_for_artifact';
      attachmentId: null;
      fileUrl: null;
      filename: null;
    }
  | {
      action: 'existing';
      reason: 'already_present';
      attachmentId: string;
      fileUrl: string | null;
      filename: string | null;
    }
  | {
      action: 'update';
      reason:
        | 'normalize_existing_attachment'
        | 'bind_artifact_to_existing_attachment'
        | 'replace_existing_attachment_with_selected_resume';
      attachmentId: string;
      data: {
        resumeVersionId: string;
        fileUrl: string;
        filename: string;
      };
      fileUrl: string;
      filename: string;
    }
  | {
      action: 'create';
      reason: 'create_missing_attachment';
      attachmentId: null;
      data: {
        resumeVersionId: string;
        fileUrl: string;
        filename: string;
      };
      fileUrl: string;
      filename: string;
    };

export function buildResumeAttachmentPersistencePlan(args: {
  attachedResumeVersionId: string | null;
  existingAttachments: Array<{
    id: string;
    resumeVersionId: string | null;
    fileUrl: string;
    filename: string;
  }>;
  resumeVersion: {
    id: string;
    title: string;
    renderedPdfUrl: string | null;
    renderedDocxUrl: string | null;
  } | null;
}): ResumeAttachmentPersistencePlan {
  if (!args.attachedResumeVersionId) {
    return {
      action: 'none',
      reason: 'missing_attached_resume_version',
      attachmentId: null,
      fileUrl: null,
      filename: null,
    };
  }

  const existingByVersion = args.existingAttachments.find(
    (attachment) => attachment.resumeVersionId === args.attachedResumeVersionId,
  );

  if (!args.resumeVersion) {
    if (existingByVersion) {
      return {
        action: 'existing',
        reason: 'already_present',
        attachmentId: existingByVersion.id,
        fileUrl: existingByVersion.fileUrl,
        filename: existingByVersion.filename,
      };
    }

    return {
      action: 'none',
      reason: 'resume_version_not_found',
      attachmentId: null,
      fileUrl: null,
      filename: null,
    };
  }

  const artifactUrl = pickResumeArtifactUrl(args.resumeVersion);
  if (!artifactUrl) {
    if (existingByVersion) {
      return {
        action: 'existing',
        reason: 'already_present',
        attachmentId: existingByVersion.id,
        fileUrl: existingByVersion.fileUrl,
        filename: existingByVersion.filename,
      };
    }

    return {
      action: 'none',
      reason: 'resume_artifact_url_missing',
      attachmentId: null,
      fileUrl: null,
      filename: null,
    };
  }

  const filename = deriveResumeAttachmentFilename(artifactUrl, args.resumeVersion.title);

  if (existingByVersion) {
    if (existingByVersion.fileUrl === artifactUrl && existingByVersion.filename === filename) {
      return {
        action: 'existing',
        reason: 'already_present',
        attachmentId: existingByVersion.id,
        fileUrl: existingByVersion.fileUrl,
        filename: existingByVersion.filename,
      };
    }

    return {
      action: 'update',
      reason: 'normalize_existing_attachment',
      attachmentId: existingByVersion.id,
      data: {
        resumeVersionId: args.attachedResumeVersionId,
        fileUrl: artifactUrl,
        filename,
      },
      fileUrl: artifactUrl,
      filename,
    };
  }

  const existingByArtifact = args.existingAttachments.find((attachment) => attachment.fileUrl === artifactUrl);
  if (existingByArtifact) {
    if (existingByArtifact.resumeVersionId && existingByArtifact.resumeVersionId !== args.attachedResumeVersionId) {
      return {
        action: 'none',
        reason: 'conflicting_attachment_for_artifact',
        attachmentId: null,
        fileUrl: null,
        filename: null,
      };
    }

    if (
      existingByArtifact.resumeVersionId === args.attachedResumeVersionId &&
      existingByArtifact.filename === filename
    ) {
      return {
        action: 'existing',
        reason: 'already_present',
        attachmentId: existingByArtifact.id,
        fileUrl: existingByArtifact.fileUrl,
        filename: existingByArtifact.filename,
      };
    }

    return {
      action: 'update',
      reason: 'bind_artifact_to_existing_attachment',
      attachmentId: existingByArtifact.id,
      data: {
        resumeVersionId: args.attachedResumeVersionId,
        fileUrl: artifactUrl,
        filename,
      },
      fileUrl: artifactUrl,
      filename,
    };
  }

  if (args.existingAttachments.length === 1) {
    return {
      action: 'update',
      reason: 'replace_existing_attachment_with_selected_resume',
      attachmentId: args.existingAttachments[0]!.id,
      data: {
        resumeVersionId: args.attachedResumeVersionId,
        fileUrl: artifactUrl,
        filename,
      },
      fileUrl: artifactUrl,
      filename,
    };
  }

  return {
    action: 'create',
    reason: 'create_missing_attachment',
    attachmentId: null,
    data: {
      resumeVersionId: args.attachedResumeVersionId,
      fileUrl: artifactUrl,
      filename,
    },
    fileUrl: artifactUrl,
    filename,
  };
}

async function persistResumeAttachment(
  tx: Prisma.TransactionClient,
  args: {
    taskId: string;
    applicationId: string;
    taskRequest: LatchTaskRequest;
    response: LatchAgentResponse;
  },
) {
  const existingAttachments = await tx.applicationAttachment.findMany({
    where: {
      applicationId: args.applicationId,
      attachmentType: 'resume',
    },
    select: {
      id: true,
      resumeVersionId: true,
      fileUrl: true,
      filename: true,
    },
  });

  const attachedResumeVersionId = args.response.attachedResumeVersionId;
  const resumeVersion = attachedResumeVersionId
    ? await tx.resumeVersion.findUnique({
        where: { id: attachedResumeVersionId },
        select: {
          id: true,
          title: true,
          renderedPdfUrl: true,
          renderedDocxUrl: true,
        },
      })
    : null;

  const plan = buildResumeAttachmentPersistencePlan({
    attachedResumeVersionId,
    existingAttachments,
    resumeVersion,
  });

  if (plan.action === 'none' || plan.action === 'existing') {
    return {
      attachmentId: plan.attachmentId,
      action: plan.action,
      reason: plan.reason,
      fileUrl: plan.fileUrl,
      filename: plan.filename,
    };
  }

  if (plan.action === 'update') {
    const attachment = await tx.applicationAttachment.update({
      where: { id: plan.attachmentId },
      data: {
        attachmentType: 'resume',
        resumeVersionId: plan.data.resumeVersionId,
        fileUrl: plan.data.fileUrl,
        filename: plan.data.filename,
      },
      select: {
        id: true,
      },
    });

    return {
      attachmentId: attachment.id,
      action: plan.action,
      reason: plan.reason,
      fileUrl: plan.fileUrl,
      filename: plan.filename,
    };
  }

  const attachment = await tx.applicationAttachment.create({
    data: {
      applicationId: args.applicationId,
      attachmentType: 'resume',
      resumeVersionId: plan.data.resumeVersionId,
      fileUrl: plan.data.fileUrl,
      filename: plan.data.filename,
    },
    select: {
      id: true,
    },
  });

  return {
    attachmentId: attachment.id,
    action: plan.action,
    reason: plan.reason,
    fileUrl: plan.fileUrl,
    filename: plan.filename,
  };
}

async function syncApplicationReadiness(tx: Prisma.TransactionClient, applicationId: string) {
  const application = await tx.application.findUnique({
    where: { id: applicationId },
    include: {
      answers: true,
      attachments: true,
      portalSessions: {
        orderBy: [{ lastSyncedAt: 'desc' }, { id: 'desc' }],
      },
    },
  });

  if (!application) {
    throw new Error(`Application not found while syncing Latch readiness: ${applicationId}`);
  }

  const readiness = evaluateApplicationReadiness({
    status: application.status,
    tailoredResumeVersionId: application.tailoredResumeVersionId,
    answers: application.answers,
    attachments: application.attachments,
    portalSessions: application.portalSessions,
  });

  await tx.application.update({
    where: { id: applicationId },
    data: {
      completionPercent: readiness.completionPercent,
      missingRequiredCount: readiness.missingRequiredCount,
      lowConfidenceCount: readiness.lowConfidenceCount,
    },
  });

  return readiness;
}

function buildResumeArtifactPath(resumeVersionId: string) {
  return `/api/resume-artifacts/${resumeVersionId}`;
}

function pickResumeArtifactUrl(resumeVersion: {
  id: string;
  renderedPdfUrl: string | null;
  renderedDocxUrl: string | null;
}) {
  return (
    resumeVersion.renderedPdfUrl?.trim() ||
    resumeVersion.renderedDocxUrl?.trim() ||
    buildResumeArtifactPath(resumeVersion.id)
  );
}

function deriveResumeAttachmentFilename(fileUrl: string, title: string) {
  const fallbackBase = slugifyFilename(title || 'resume');
  const fallbackExtension = fileUrl.toLowerCase().includes('.docx') ? '.docx' : '.pdf';

  const normalizeCandidate = (candidate: string | undefined) => {
    const trimmed = candidate?.trim();
    if (!trimmed) {
      return null;
    }

    if (trimmed.includes('.') && !trimmed.endsWith('.')) {
      return trimmed;
    }

    return null;
  };

  try {
    const parsed = new URL(fileUrl);
    const lastSegment = normalizeCandidate(parsed.pathname.split('/').filter(Boolean).at(-1));
    if (lastSegment) {
      return lastSegment;
    }
  } catch {
    const lastSegment = normalizeCandidate(fileUrl.split('/').filter(Boolean).at(-1));
    if (lastSegment) {
      return lastSegment;
    }
  }

  return `${fallbackBase}${fallbackExtension}`;
}

function slugifyFilename(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '') || 'resume';
}

async function persistPortalTracking(
  tx: Prisma.TransactionClient,
  args: {
    taskId: string;
    applicationId: string;
    taskRequest: LatchTaskRequest;
    response: LatchAgentResponse;
  },
) {
  if (!args.response.portalTracking.tracked) {
    return {
      portalSessionId: null,
      persisted: false,
      reason: null,
      launchUrl: null,
      providerDomain: null,
    };
  }

  const launchUrl = args.taskRequest.existingPortalContext?.launchUrl?.trim() || null;
  const providerDomain = args.taskRequest.existingPortalContext?.providerDomain?.trim() || null;

  if (!launchUrl || !providerDomain) {
    return {
      portalSessionId: null,
      persisted: false,
      reason: 'tracked_without_launch_url_or_provider_domain',
      launchUrl,
      providerDomain,
    };
  }

  const latestPortalSession = await tx.portalSession.findFirst({
    where: { applicationId: args.applicationId },
    orderBy: [{ lastSyncedAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      launchUrl: true,
      providerDomain: true,
      mode: true,
      status: true,
    },
  });

  const mode =
    args.response.portalTracking.mode ??
    args.taskRequest.existingPortalContext?.mode ??
    latestPortalSession?.mode ??
    PortalSessionMode.manual;
  const status =
    args.response.portalTracking.status ??
    args.taskRequest.existingPortalContext?.status ??
    latestPortalSession?.status ??
    PortalSessionStatus.not_started;

  const sessionSummaryJson = toJsonValue({
    source: 'latch-agent-response',
    latchTaskId: args.taskId,
    tracked: args.response.portalTracking.tracked,
    summary: args.response.summary,
    readiness: args.response.readiness,
    emittedEventTypes: args.response.audit.emittedEventTypes,
  });

  if (
    latestPortalSession &&
    latestPortalSession.launchUrl === launchUrl &&
    latestPortalSession.providerDomain === providerDomain
  ) {
    await tx.portalSession.update({
      where: { id: latestPortalSession.id },
      data: {
        mode,
        status,
        lastSyncedAt: new Date(),
        sessionSummaryJson,
      },
    });

    return {
      portalSessionId: latestPortalSession.id,
      persisted: true,
      reason: null,
      launchUrl,
      providerDomain,
    };
  }

  const portalSession = await tx.portalSession.create({
    data: {
      applicationId: args.applicationId,
      mode,
      status,
      launchUrl,
      providerDomain,
      lastSyncedAt: new Date(),
      sessionSummaryJson,
      notes: 'Persisted from Latch application-ops response.',
    },
  });

  return {
    portalSessionId: portalSession.id,
    persisted: true,
    reason: null,
    launchUrl,
    providerDomain,
  };
}

function buildApplicationAnswerJson(answer: LatchPreparedAnswer): Prisma.InputJsonValue {
  return toJsonValue({
    value: answer.value ?? null,
    required: answer.required,
    sourceType: answer.sourceType,
    confidenceBand: answer.confidenceBand,
    provenance: answer.provenance,
    notes: answer.notes,
  });
}

function mapPreparedAnswerSourceType(sourceType: LatchPreparedAnswer['sourceType']) {
  switch (sourceType) {
    case 'manual':
      return AnswerSourceType.manual;
    case 'agent':
      return AnswerSourceType.agent;
    case 'resume':
      return AnswerSourceType.resume;
    case 'derived':
      return AnswerSourceType.derived;
    case 'profile':
    case 'portal_detected':
      return AnswerSourceType.derived;
    default:
      return AnswerSourceType.agent;
  }
}

function mapPreparedAnswerReviewState(reviewState: LatchPreparedAnswer['reviewState']) {
  switch (reviewState) {
    case 'accepted':
      return AnswerReviewState.accepted;
    case 'needs_review':
      return AnswerReviewState.needs_review;
    case 'blocked':
      return AnswerReviewState.blocked;
    default:
      return AnswerReviewState.needs_review;
  }
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((accumulator, value) => {
    accumulator[value] = (accumulator[value] ?? 0) + 1;
    return accumulator;
  }, {});
}

export function buildPrepareApplicationWorkspaceRequest(args: {
  applicationId: string;
  jobId: string;
  tailoredResumeVersionId: string;
  approvedTailoringRunId: string;
  approvedAt: string;
  actorLabel: string;
  existingPortalContext?: {
    launchUrl?: string | null;
    providerDomain?: string | null;
    mode?: 'manual' | 'automation' | 'hybrid' | null;
    status?: 'not_started' | 'in_progress' | 'ready_for_review' | 'submitted' | 'abandoned' | null;
  };
}): LatchTaskRequest {
  return latchTaskRequestSchema.parse({
    contractVersion: 'latch-application-ops-v1',
    lane: 'Latch',
    boundary: {
      runtime: 'openclaw_agent',
      agentId: 'application-ops',
    },
    intent: 'prepare_application_workspace',
    applicationId: args.applicationId,
    jobId: args.jobId,
    applicationStatus: 'applying',
    handoff: {
      source: 'needle_approved_handoff',
      approvedTailoringRunId: args.approvedTailoringRunId,
      tailoredResumeVersionId: args.tailoredResumeVersionId,
      approvedAt: args.approvedAt,
      approvedBy: {
        actorType: 'user',
        actorLabel: args.actorLabel,
      },
      transition: {
        fromStatus: 'tailoring_review',
        toStatus: 'applying',
      },
    },
    policy: DEFAULT_LATCH_REVIEW_POLICY,
    ...(args.existingPortalContext ? { existingPortalContext: args.existingPortalContext } : {}),
  });
}

async function claimNextLatchTask(workerLabel: string) {
  return prisma.$transaction(async (tx) => {
    const nextTask = await tx.latchTask.findFirst({
      where: {
        status: LatchTaskStatus.queued,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!nextTask) {
      return null;
    }

    const claimed = await tx.latchTask.updateMany({
      where: {
        id: nextTask.id,
        status: LatchTaskStatus.queued,
      },
      data: {
        status: LatchTaskStatus.processing,
        startedAt: new Date(),
        workerLabel,
      },
    });

    if (claimed.count === 0) {
      return null;
    }

    return tx.latchTask.findUnique({ where: { id: nextTask.id } });
  });
}

async function maybeRecoverStaleLatchTask(tx: any, task: {
  id: string;
  applicationId: string;
  taskType: LatchTaskType;
  status: LatchTaskStatus;
  workerLabel: string | null;
  createdAt: Date;
  startedAt: Date | null;
}) {
  const now = Date.now();
  const heartbeat = task.workerLabel
    ? await tx.latchWorkerHeartbeat.findUnique({ where: { workerLabel: task.workerLabel } })
    : await tx.latchWorkerHeartbeat.findFirst({ orderBy: { updatedAt: 'desc' } });

  const heartbeatAgeMs = heartbeat ? now - new Date(heartbeat.updatedAt).getTime() : Number.POSITIVE_INFINITY;
  const hasFreshHeartbeat = heartbeatAgeMs <= HEARTBEAT_FRESH_MS;

  const queuedAgeMs = now - new Date(task.createdAt).getTime();
  if (task.status === LatchTaskStatus.queued && queuedAgeMs > STALE_QUEUED_MS && !hasFreshHeartbeat) {
    await failRecoveredTask(
      tx,
      task.id,
      task.applicationId,
      'latch_task_stale_queue',
      'Queued Latch task was replaced after the worker heartbeat went stale.',
    );
    return true;
  }

  const startedAtMs = task.startedAt ? new Date(task.startedAt).getTime() : new Date(task.createdAt).getTime();
  const processingAgeMs = now - startedAtMs;
  if (task.status === LatchTaskStatus.processing && processingAgeMs > STALE_PROCESSING_MS && !hasFreshHeartbeat) {
    await failRecoveredTask(
      tx,
      task.id,
      task.applicationId,
      'latch_task_stale_processing',
      'Processing Latch task was replaced after the worker heartbeat went stale.',
    );
    return true;
  }

  return false;
}

async function failRecoveredTask(
  tx: any,
  taskId: string,
  applicationId: string,
  failureCode: string,
  failureMessage: string,
) {
  await tx.latchTask.update({
    where: { id: taskId },
    data: {
      status: LatchTaskStatus.failed,
      failureCode,
      failureMessage,
      completedAt: new Date(),
    },
  });

  await tx.auditEvent.create({
    data: makeAuditEvent({
      entityType: 'application',
      entityId: applicationId,
      eventType: 'latch_task.recovered_from_stale_state',
      actorType: ActorType.system,
      actorLabel: 'latch-queue-system',
      payloadJson: {
        latchTaskId: taskId,
        failureCode,
        failureMessage,
      },
    }),
  });
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
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

function resolveDatabaseHost(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

function parseInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
