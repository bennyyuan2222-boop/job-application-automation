import { accessSync, constants as fsConstants } from 'node:fs';
import { hostname as getHostname } from 'node:os';

import { ActorType, NeedleTaskStatus, NeedleTaskType, prisma } from '@job-ops/db';
import { makeAuditEvent } from '@job-ops/domain';

import {
  generateTailoringDraftForApplication,
  requestTailoringEditsForApplication,
} from './service';

const STALE_QUEUED_MS = parseInteger(process.env.NEEDLE_TASK_STALE_QUEUED_MS, 60_000);
const STALE_PROCESSING_MS = parseInteger(process.env.NEEDLE_TASK_STALE_PROCESSING_MS, 15 * 60_000);
const HEARTBEAT_FRESH_MS = parseInteger(process.env.NEEDLE_WORKER_HEARTBEAT_FRESH_MS, 20_000);
const OPENCLAW_BIN_CANDIDATES = ['/opt/homebrew/bin/openclaw', '/usr/local/bin/openclaw', '/bin/openclaw'];

export type EnqueueNeedleTaskOptions = {
  actorLabel: string;
  instructions?: string;
};

export type NeedleWorkerRuntimeInfo = {
  workerLabel: string;
  processId: number;
  hostname: string;
  dbHost: string | null;
  openclawBin: string;
};

export async function enqueueTailoringDraftGeneration(
  applicationId: string,
  options: EnqueueNeedleTaskOptions,
) {
  return enqueueNeedleTask({
    applicationId,
    taskType: NeedleTaskType.generate_draft,
    actorLabel: options.actorLabel,
    instructions: options.instructions,
  });
}

export async function enqueueTailoringRevisionRequest(
  applicationId: string,
  tailoringRunId: string,
  revisionNote: string,
  options: { actorLabel: string },
) {
  return enqueueNeedleTask({
    applicationId,
    taskType: NeedleTaskType.request_edits,
    actorLabel: options.actorLabel,
    instructions: revisionNote,
    sourceTailoringRunId: tailoringRunId,
  });
}

type EnqueueNeedleTaskInput = {
  applicationId: string;
  taskType: NeedleTaskType;
  actorLabel: string;
  instructions?: string;
  sourceTailoringRunId?: string;
};

export async function enqueueNeedleTask(input: EnqueueNeedleTaskInput) {
  return prisma.$transaction(async (tx) => {
    const application = await tx.application.findUnique({
      where: { id: input.applicationId },
      select: { id: true },
    });

    if (!application) {
      throw new Error(`Application not found: ${input.applicationId}`);
    }

    const activeTask = await tx.needleTask.findFirst({
      where: {
        applicationId: input.applicationId,
        status: {
          in: [NeedleTaskStatus.queued, NeedleTaskStatus.processing],
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (activeTask) {
      const recovered = await maybeRecoverStaleNeedleTask(tx, activeTask);
      if (!recovered) {
        return activeTask;
      }
    }

    const task = await tx.needleTask.create({
      data: {
        applicationId: input.applicationId,
        taskType: input.taskType,
        requestedByLabel: input.actorLabel,
        instructions: input.instructions ?? null,
        sourceTailoringRunId: input.sourceTailoringRunId ?? null,
      },
    });

    await tx.auditEvent.create({
      data: makeAuditEvent({
        entityType: 'application',
        entityId: input.applicationId,
        eventType: 'needle_task.queued',
        actorType: ActorType.user,
        actorLabel: input.actorLabel,
        payloadJson: {
          needleTaskId: task.id,
          taskType: task.taskType,
          instructions: task.instructions,
          sourceTailoringRunId: task.sourceTailoringRunId,
        },
      }),
    });

    return task;
  });
}

export async function processNextNeedleTask(options?: { workerLabel?: string }) {
  const runtime = getNeedleWorkerRuntimeInfo(options?.workerLabel ?? 'needle-queue-worker');
  await writeNeedleWorkerHeartbeat({
    ...runtime,
    state: 'polling',
  });

  const task = await claimNextNeedleTask(runtime.workerLabel);
  if (!task) {
    await writeNeedleWorkerHeartbeat({
      ...runtime,
      state: 'idle',
    });
    return null;
  }

  await writeNeedleWorkerHeartbeat({
    ...runtime,
    state: 'processing',
    currentTaskId: task.id,
    currentTaskType: task.taskType,
    lastClaimedTaskId: task.id,
  });

  try {
    let result: { tailoringRunId: string; tailoredResumeVersionId: string | null | undefined };
    if (task.taskType === NeedleTaskType.generate_draft) {
      result = await generateTailoringDraftForApplication(task.applicationId, {
        actorLabel: task.requestedByLabel,
        instructions: task.instructions ?? undefined,
      });
    } else if (task.taskType === NeedleTaskType.request_edits) {
      if (!task.sourceTailoringRunId || !task.instructions) {
        throw new Error('Queued request_edits task is missing sourceTailoringRunId or revision instructions');
      }

      result = await requestTailoringEditsForApplication(
        task.applicationId,
        task.sourceTailoringRunId,
        task.instructions,
        {
          actorLabel: task.requestedByLabel,
        },
      );
    } else {
      throw new Error(`Unsupported Needle task type: ${task.taskType}`);
    }

    await prisma.$transaction(async (tx) => {
      await tx.needleTask.update({
        where: { id: task.id },
        data: {
          status: NeedleTaskStatus.completed,
          resultTailoringRunId: result.tailoringRunId,
          completedAt: new Date(),
          failureCode: null,
          failureMessage: null,
        },
      });

      await tx.auditEvent.create({
        data: makeAuditEvent({
          entityType: 'application',
          entityId: task.applicationId,
          eventType: 'needle_task.completed',
          actorType: ActorType.system,
          actorLabel: runtime.workerLabel,
          payloadJson: {
            needleTaskId: task.id,
            taskType: task.taskType,
            resultTailoringRunId: result.tailoringRunId,
          },
        }),
      });
    });

    await writeNeedleWorkerHeartbeat({
      ...runtime,
      state: 'idle',
      lastCompletedTaskId: task.id,
    });

    return {
      id: task.id,
      status: NeedleTaskStatus.completed,
      resultTailoringRunId: result.tailoringRunId,
    };
  } catch (error) {
    const failureMessage = error instanceof Error ? error.message : String(error);

    await prisma.$transaction(async (tx) => {
      await tx.needleTask.update({
        where: { id: task.id },
        data: {
          status: NeedleTaskStatus.failed,
          failureCode: 'needle_task_failed',
          failureMessage,
          completedAt: new Date(),
        },
      });

      await tx.auditEvent.create({
        data: makeAuditEvent({
          entityType: 'application',
          entityId: task.applicationId,
          eventType: 'needle_task.failed',
          actorType: ActorType.system,
          actorLabel: runtime.workerLabel,
          payloadJson: {
            needleTaskId: task.id,
            taskType: task.taskType,
            failureMessage,
          },
        }),
      });
    });

    await writeNeedleWorkerHeartbeat({
      ...runtime,
      state: 'error',
      lastErrorCode: 'needle_task_failed',
      lastErrorMessage: failureMessage,
    });

    throw error;
  }
}

export async function drainNeedleTaskQueue(options?: {
  workerLabel?: string;
  maxTasks?: number;
}) {
  const maxTasks = options?.maxTasks ?? 25;
  const processed = [] as Array<{ id: string; status: NeedleTaskStatus; resultTailoringRunId?: string | null }>;

  for (let index = 0; index < maxTasks; index += 1) {
    const result = await processNextNeedleTask({ workerLabel: options?.workerLabel });
    if (!result) {
      break;
    }
    processed.push(result);
  }

  return processed;
}

export function getNeedleWorkerRuntimeInfo(workerLabel: string): NeedleWorkerRuntimeInfo {
  return {
    workerLabel,
    processId: process.pid,
    hostname: getHostname(),
    dbHost: resolveDatabaseHost(process.env.DATABASE_URL),
    openclawBin: resolveOpenClawBin(),
  };
}

export async function writeNeedleWorkerHeartbeat(args: NeedleWorkerRuntimeInfo & {
  state: string;
  currentTaskId?: string | null;
  currentTaskType?: NeedleTaskType | null;
  lastClaimedTaskId?: string | null;
  lastCompletedTaskId?: string | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
}) {
  return prisma.needleWorkerHeartbeat.upsert({
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

export async function getActiveNeedleTaskForApplication(applicationId: string) {
  return prisma.needleTask.findFirst({
    where: {
      applicationId,
      status: {
        in: [NeedleTaskStatus.queued, NeedleTaskStatus.processing],
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

async function claimNextNeedleTask(workerLabel: string) {
  return prisma.$transaction(async (tx) => {
    const nextTask = await tx.needleTask.findFirst({
      where: {
        status: NeedleTaskStatus.queued,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!nextTask) {
      return null;
    }

    const claimed = await tx.needleTask.updateMany({
      where: {
        id: nextTask.id,
        status: NeedleTaskStatus.queued,
      },
      data: {
        status: NeedleTaskStatus.processing,
        startedAt: new Date(),
        workerLabel,
      },
    });

    if (claimed.count === 0) {
      return null;
    }

    return tx.needleTask.findUnique({ where: { id: nextTask.id } });
  });
}

async function maybeRecoverStaleNeedleTask(tx: any, task: {
  id: string;
  applicationId: string;
  taskType: NeedleTaskType;
  status: NeedleTaskStatus;
  workerLabel: string | null;
  createdAt: Date;
  startedAt: Date | null;
}) {
  const now = Date.now();
  const heartbeat = task.workerLabel
    ? await tx.needleWorkerHeartbeat.findUnique({ where: { workerLabel: task.workerLabel } })
    : await tx.needleWorkerHeartbeat.findFirst({ orderBy: { updatedAt: 'desc' } });

  const heartbeatAgeMs = heartbeat ? now - new Date(heartbeat.updatedAt).getTime() : Number.POSITIVE_INFINITY;
  const hasFreshHeartbeat = heartbeatAgeMs <= HEARTBEAT_FRESH_MS;

  const queuedAgeMs = now - new Date(task.createdAt).getTime();
  if (task.status === NeedleTaskStatus.queued && queuedAgeMs > STALE_QUEUED_MS && !hasFreshHeartbeat) {
    await failRecoveredTask(tx, task.id, task.applicationId, 'needle_task_stale_queue', 'Queued task was replaced after the worker heartbeat went stale.');
    return true;
  }

  const startedAtMs = task.startedAt ? new Date(task.startedAt).getTime() : new Date(task.createdAt).getTime();
  const processingAgeMs = now - startedAtMs;
  if (task.status === NeedleTaskStatus.processing && processingAgeMs > STALE_PROCESSING_MS && !hasFreshHeartbeat) {
    await failRecoveredTask(tx, task.id, task.applicationId, 'needle_task_stale_processing', 'Processing task was replaced after the worker heartbeat went stale.');
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
  await tx.needleTask.update({
    where: { id: taskId },
    data: {
      status: NeedleTaskStatus.failed,
      failureCode,
      failureMessage,
      completedAt: new Date(),
    },
  });

  await tx.auditEvent.create({
    data: makeAuditEvent({
      entityType: 'application',
      entityId: applicationId,
      eventType: 'needle_task.recovered_from_stale_state',
      actorType: ActorType.system,
      actorLabel: 'needle-queue-system',
      payloadJson: {
        needleTaskId: taskId,
        failureCode,
        failureMessage,
      },
    }),
  });
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
