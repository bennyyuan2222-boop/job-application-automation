import { ActorType, NeedleTaskStatus, NeedleTaskType, prisma } from '@job-ops/db';
import { makeAuditEvent } from '@job-ops/domain';

import {
  generateTailoringDraftForApplication,
  requestTailoringEditsForApplication,
} from './service';

export type EnqueueNeedleTaskOptions = {
  actorLabel: string;
  instructions?: string;
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
  taskType: typeof NeedleTaskType[keyof typeof NeedleTaskType];
  actorLabel: string;
  instructions?: string;
  sourceTailoringRunId?: string;
};

async function enqueueNeedleTask(input: EnqueueNeedleTaskInput) {
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
      return activeTask;
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
  const workerLabel = options?.workerLabel ?? 'needle-queue-worker';
  const task = await claimNextNeedleTask(workerLabel);
  if (!task) {
    return null;
  }

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
        },
      });

      await tx.auditEvent.create({
        data: makeAuditEvent({
          entityType: 'application',
          entityId: task.applicationId,
          eventType: 'needle_task.completed',
          actorType: ActorType.system,
          actorLabel: workerLabel,
          payloadJson: {
            needleTaskId: task.id,
            taskType: task.taskType,
            resultTailoringRunId: result.tailoringRunId,
          },
        }),
      });
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
          actorLabel: workerLabel,
          payloadJson: {
            needleTaskId: task.id,
            taskType: task.taskType,
            failureMessage,
          },
        }),
      });
    });

    throw error;
  }
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
