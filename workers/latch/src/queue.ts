import { accessSync, constants as fsConstants } from 'node:fs';
import { hostname as getHostname } from 'node:os';

import {
  ActorType,
  ApplicationStatus,
  LatchTaskStatus,
  LatchTaskType,
  Prisma,
  prisma,
} from '@job-ops/db';
import {
  DEFAULT_LATCH_REVIEW_POLICY,
  latchTaskRequestSchema,
  type LatchTaskRequest,
} from '@job-ops/contracts';
import { makeAuditEvent } from '@job-ops/domain';

import { LatchAgentError, requestApplicationWorkspacePreparation } from './agent';

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

async function enqueueLatchTaskFromNeedleApprovalWithTx(
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
    const response = await requestApplicationWorkspacePreparation({
      taskId: task.id,
      taskRequest: task.requestPayloadJson,
    });

    await prisma.$transaction(async (tx) => {
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
          },
        }),
      });
    });

    await writeLatchWorkerHeartbeat({
      ...runtime,
      state: 'idle',
      lastCompletedTaskId: task.id,
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

function buildPrepareApplicationWorkspaceRequest(args: {
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
