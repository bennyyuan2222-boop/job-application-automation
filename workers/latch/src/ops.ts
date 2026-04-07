import {
  AnswerReviewState,
  LatchTaskStatus,
  Prisma,
  TailoringRunStatus,
  prisma,
} from '@job-ops/db';

import { enqueuePrepareApplicationWorkspace, getLatchWorkerRuntimeInfo } from './queue';

type ParsedArgs = {
  command: string;
  flags: Map<string, string | boolean>;
  positionals: string[];
};

async function main() {
  const parsed = parseArgs(process.argv.slice(2));

  switch (parsed.command) {
    case 'enqueue':
      await runEnqueue(parsed.flags);
      return;
    case 'status':
      await runStatus(parsed.flags);
      return;
    case 'queue':
      await runQueue(parsed.flags);
      return;
    case 'heartbeat':
      await runHeartbeat(parsed.flags);
      return;
    case 'help':
    case '--help':
    case '-h':
    default:
      printHelp();
      return;
  }
}

async function runEnqueue(flags: Map<string, string | boolean>) {
  const applicationId = requireStringFlag(flags, 'applicationId');
  const explicitTailoringRunId = getStringFlag(flags, 'approvedTailoringRunId');
  const approvedTailoringRunId = explicitTailoringRunId ?? (await resolveLatestApprovedTailoringRunId(applicationId));
  const actorLabel =
    getStringFlag(flags, 'actorLabel') ?? process.env.LATCH_DEBUG_ACTOR_LABEL?.trim() ?? 'operator:latch-debug';

  const task = await enqueuePrepareApplicationWorkspace(applicationId, approvedTailoringRunId, {
    actorLabel,
  });

  await printJson({
    command: 'enqueue',
    actorLabel,
    applicationId,
    approvedTailoringRunId,
    approvedTailoringRunSource: explicitTailoringRunId ? 'cli' : 'latest-approved-tailoring-run',
    task: serializeTask(task),
    note:
      'If an active queued or processing task already existed, enqueue may reuse that task instead of creating a new one.',
  });
}

async function runStatus(flags: Map<string, string | boolean>) {
  const applicationId = requireStringFlag(flags, 'applicationId');
  const limit = getIntegerFlag(flags, 'limit', 5);
  const includePayloads = getBooleanFlag(flags, 'includePayloads');

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      jobId: true,
      status: true,
      tailoredResumeVersionId: true,
      portalUrl: true,
      portalDomain: true,
      completionPercent: true,
      missingRequiredCount: true,
      lowConfidenceCount: true,
      pausedReason: true,
      submittedAt: true,
      createdAt: true,
      updatedAt: true,
      job: {
        select: {
          id: true,
          title: true,
          company: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      latchTasks: {
        orderBy: [{ createdAt: 'desc' }],
        take: limit,
        select: {
          id: true,
          taskType: true,
          status: true,
          requestedByLabel: true,
          workerLabel: true,
          failureCode: true,
          failureMessage: true,
          requestPayloadJson: includePayloads,
          responsePayloadJson: includePayloads,
          createdAt: true,
          startedAt: true,
          completedAt: true,
          updatedAt: true,
        },
      },
      attachments: {
        orderBy: [{ createdAt: 'desc' }],
        take: 10,
        select: {
          id: true,
          attachmentType: true,
          filename: true,
          fileUrl: true,
          resumeVersionId: true,
          createdAt: true,
        },
      },
      answers: {
        orderBy: [{ updatedAt: 'desc' }],
        take: 10,
        select: {
          id: true,
          fieldKey: true,
          fieldLabel: true,
          reviewState: true,
          sourceType: true,
          confidence: true,
          updatedAt: true,
        },
      },
      portalSessions: {
        orderBy: [{ lastSyncedAt: 'desc' }, { id: 'desc' }],
        take: 5,
        select: {
          id: true,
          mode: true,
          status: true,
          launchUrl: true,
          providerDomain: true,
          lastKnownPageTitle: true,
          lastSyncedAt: true,
          notes: true,
        },
      },
      _count: {
        select: {
          answers: true,
          attachments: true,
          latchTasks: true,
          portalSessions: true,
          tailoringRuns: true,
        },
      },
    },
  });

  if (!application) {
    throw new Error(`Application not found: ${applicationId}`);
  }

  const [latestApprovedTailoringRun, reviewStateCounts, recentLatchEvents, workerHeartbeats] = await Promise.all([
    prisma.tailoringRun.findFirst({
      where: {
        applicationId,
        status: TailoringRunStatus.approved,
      },
      orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        status: true,
        createdAt: true,
        completedAt: true,
        outputResumeVersionId: true,
        revisionNote: true,
      },
    }),
    prisma.applicationAnswer.groupBy({
      by: ['reviewState'],
      where: { applicationId },
      _count: { _all: true },
    }),
    prisma.auditEvent.findMany({
      where: {
        entityType: 'application',
        entityId: applicationId,
        eventType: {
          startsWith: 'latch_',
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        eventType: true,
        actorType: true,
        actorLabel: true,
        payloadJson: includePayloads,
        createdAt: true,
      },
    }),
    prisma.latchWorkerHeartbeat.findMany({
      orderBy: [{ updatedAt: 'desc' }],
      take: limit,
      select: {
        workerLabel: true,
        state: true,
        processId: true,
        hostname: true,
        dbHost: true,
        openclawBin: true,
        currentTaskId: true,
        currentTaskType: true,
        lastPolledAt: true,
        lastClaimedTaskId: true,
        lastCompletedTaskId: true,
        lastErrorCode: true,
        lastErrorMessage: true,
        updatedAt: true,
      },
    }),
  ]);

  const answerReviewSummary = {
    accepted: 0,
    needsReview: 0,
    blocked: 0,
  };

  for (const item of reviewStateCounts) {
    if (item.reviewState === AnswerReviewState.accepted) {
      answerReviewSummary.accepted = item._count._all;
    } else if (item.reviewState === AnswerReviewState.needs_review) {
      answerReviewSummary.needsReview = item._count._all;
    } else if (item.reviewState === AnswerReviewState.blocked) {
      answerReviewSummary.blocked = item._count._all;
    }
  }

  await printJson({
    command: 'status',
    application: {
      id: application.id,
      status: application.status,
      jobId: application.jobId,
      tailoredResumeVersionId: application.tailoredResumeVersionId,
      portalUrl: application.portalUrl,
      portalDomain: application.portalDomain,
      completionPercent: application.completionPercent,
      missingRequiredCount: application.missingRequiredCount,
      lowConfidenceCount: application.lowConfidenceCount,
      pausedReason: application.pausedReason,
      submittedAt: application.submittedAt,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
      job: application.job,
      counts: application._count,
      answerReviewSummary,
    },
    latestApprovedTailoringRun,
    latestLatchTasks: application.latchTasks.map(serializeTask),
    latestAttachments: application.attachments,
    latestAnswers: application.answers,
    latestPortalSessions: application.portalSessions,
    recentLatchEvents,
    workerHeartbeats,
  });
}

async function runQueue(flags: Map<string, string | boolean>) {
  const limit = getIntegerFlag(flags, 'limit', 10);
  const status = getStringFlag(flags, 'status');
  const includePayloads = getBooleanFlag(flags, 'includePayloads');

  const where = status
    ? {
        status: parseLatchTaskStatus(status),
      }
    : undefined;

  const [counts, tasks, workerHeartbeats] = await Promise.all([
    prisma.latchTask.groupBy({
      by: ['status'],
      ...(where ? { where } : {}),
      _count: { _all: true },
    }),
    prisma.latchTask.findMany({
      ...(where ? { where } : {}),
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        applicationId: true,
        taskType: true,
        status: true,
        requestedByLabel: true,
        workerLabel: true,
        failureCode: true,
        failureMessage: true,
        requestPayloadJson: includePayloads,
        responsePayloadJson: includePayloads,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        updatedAt: true,
        application: {
          select: {
            status: true,
            job: {
              select: {
                title: true,
                company: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.latchWorkerHeartbeat.findMany({
      orderBy: [{ updatedAt: 'desc' }],
      take: Math.min(limit, 5),
      select: {
        workerLabel: true,
        state: true,
        processId: true,
        hostname: true,
        dbHost: true,
        openclawBin: true,
        currentTaskId: true,
        currentTaskType: true,
        lastPolledAt: true,
        lastClaimedTaskId: true,
        lastCompletedTaskId: true,
        lastErrorCode: true,
        lastErrorMessage: true,
        updatedAt: true,
      },
    }),
  ]);

  await printJson({
    command: 'queue',
    filter: status ?? null,
    counts: counts.map((item) => ({ status: item.status, count: item._count._all })),
    tasks: tasks.map((task) => ({
      ...serializeTask(task),
      applicationStatus: task.application.status,
      jobTitle: task.application.job.title,
      companyName: task.application.job.company.name,
    })),
    workerHeartbeats,
  });
}

async function runHeartbeat(flags: Map<string, string | boolean>) {
  const limit = getIntegerFlag(flags, 'limit', 5);
  const workerLabel = getStringFlag(flags, 'workerLabel');
  const resolvedWorkerLabel = workerLabel ?? process.env.LATCH_WORKER_LABEL?.trim() ?? 'latch-macmini-worker';

  const heartbeats = await prisma.latchWorkerHeartbeat.findMany({
    ...(workerLabel
      ? {
          where: { workerLabel },
        }
      : {}),
    orderBy: [{ updatedAt: 'desc' }],
    take: limit,
    select: {
      workerLabel: true,
      state: true,
      processId: true,
      hostname: true,
      dbHost: true,
      openclawBin: true,
      currentTaskId: true,
      currentTaskType: true,
      lastPolledAt: true,
      lastClaimedTaskId: true,
      lastCompletedTaskId: true,
      lastErrorCode: true,
      lastErrorMessage: true,
      updatedAt: true,
    },
  });

  await printJson({
    command: 'heartbeat',
    resolvedRuntimeInfo: getLatchWorkerRuntimeInfo(resolvedWorkerLabel),
    heartbeats,
  });
}

function serializeTask(task: {
  id: string;
  applicationId?: string;
  taskType: string;
  status: string;
  requestedByLabel: string;
  workerLabel: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  requestPayloadJson?: unknown;
  responsePayloadJson?: unknown;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  updatedAt?: Date;
}) {
  return {
    id: task.id,
    applicationId: task.applicationId,
    taskType: task.taskType,
    status: task.status,
    requestedByLabel: task.requestedByLabel,
    workerLabel: task.workerLabel,
    failureCode: task.failureCode,
    failureMessage: task.failureMessage,
    requestPayloadJson: task.requestPayloadJson,
    responsePayloadJson: task.responsePayloadJson,
    createdAt: task.createdAt,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
    updatedAt: task.updatedAt,
  };
}

async function resolveLatestApprovedTailoringRunId(applicationId: string) {
  const latestApproved = await prisma.tailoringRun.findFirst({
    where: {
      applicationId,
      status: TailoringRunStatus.approved,
    },
    orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
    },
  });

  if (!latestApproved) {
    throw new Error(
      `No approved tailoring run found for application ${applicationId}. Pass --approvedTailoringRunId explicitly if you need a different source.`,
    );
  }

  return latestApproved.id;
}

function parseArgs(argv: string[]): ParsedArgs {
  const command = (argv[0] ?? 'help').trim();
  const flags = new Map<string, string | boolean>();
  const positionals: string[] = [];

  for (const arg of argv.slice(1)) {
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }

    const stripped = arg.slice(2);
    const equalsIndex = stripped.indexOf('=');
    if (equalsIndex === -1) {
      flags.set(stripped, true);
      continue;
    }

    const key = stripped.slice(0, equalsIndex);
    const value = stripped.slice(equalsIndex + 1);
    flags.set(key, value);
  }

  return { command, flags, positionals };
}

function requireStringFlag(flags: Map<string, string | boolean>, key: string) {
  const value = getStringFlag(flags, key);
  if (!value) {
    throw new Error(`Missing required flag: --${key}=...`);
  }

  return value;
}

function getStringFlag(flags: Map<string, string | boolean>, key: string) {
  const value = flags.get(key);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function getIntegerFlag(flags: Map<string, string | boolean>, key: string, fallback: number) {
  const value = getStringFlag(flags, key);
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getBooleanFlag(flags: Map<string, string | boolean>, key: string) {
  return flags.get(key) === true;
}

function parseLatchTaskStatus(value: string): LatchTaskStatus {
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case LatchTaskStatus.queued:
    case LatchTaskStatus.processing:
    case LatchTaskStatus.completed:
    case LatchTaskStatus.failed:
    case LatchTaskStatus.cancelled:
      return normalized;
    default:
      throw new Error(`Unsupported Latch task status: ${value}`);
  }
}

async function printJson(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

function printHelp() {
  console.log(`Latch ops helper

Usage:
  npm run --workspace @job-ops/latch-worker ops -- <command> [flags]

Commands:
  enqueue   Queue prepare_application_workspace for an application
  status    Show application-centric Latch status, recent tasks, and heartbeats
  queue     Show recent Latch tasks across applications
  heartbeat Show recent worker heartbeat rows

Common flags:
  --applicationId=<id>
  --approvedTailoringRunId=<id>   Optional for enqueue, otherwise latest approved run is used
  --actorLabel=<label>            Optional for enqueue
  --limit=<n>                     Optional for status, queue, heartbeat
  --status=<queued|processing|completed|failed|cancelled>
  --includePayloads               Include request/response payload JSON in output
`);
}

main()
  .catch((error) => {
    console.error(formatFatalError(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

function formatFatalError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
    const tableName = typeof error.meta?.table === 'string' ? error.meta.table : null;
    return [
      tableName ? `Missing database table: ${tableName}.` : 'Missing database table.',
      'The current DATABASE_URL does not have the latest Latch schema yet.',
      'Run `npm run db:migrate:deploy` against the same database, then retry the Latch ops command.',
    ].join(' ');
  }

  return error instanceof Error ? error.message : String(error);
}
