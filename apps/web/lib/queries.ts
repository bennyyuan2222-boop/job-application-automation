import {
  applicationDetailSchema,
  applyingQueueItemSchema,
  auditEventItemSchema,
  jobListItemSchema,
  latchAgentResponseSchema,
  latchTaskSummarySchema,
  latchWorkerHeartbeatSummarySchema,
  needleTaskSummarySchema,
  resumeVersionDetailSchema,
  tailoringBaseSelectionSchema,
  tailoringDetailSchema,
  tailoringFitAssessmentSchema,
  tailoringGenerationMetadataSchema,
  tailoringQaMetadataSchema,
  tailoringQueueItemSchema,
  tailoringRunSummarySchema,
  tailoringRunWorkspaceItemSchema,
  type ApplicationDetail,
  type ApplyingQueueItem,
  type AuditEventItem,
  type JobListItem,
  type LatchTaskSummary,
  type LatchWorkerHeartbeatSummary,
  type LatchWorkspacePrepState,
  type ResumeVersionDetail,
  type TailoringDetail,
  type TailoringQueueItem,
} from '@job-ops/contracts';
import { Prisma, prisma } from '@job-ops/db';
import {
  getInboxJobs as getReadModelInboxJobs,
  getSeededJobs as getReadModelSeededJobs,
  getShortlistedJobs as getReadModelShortlistedJobs,
} from '@job-ops/read-models';
import { evaluateApplicationReadiness } from '@job-ops/readiness';
import { coerceResumeDocument } from '@job-ops/tailoring';

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function asRiskArray(value: unknown): Array<{ requirement: string; severity: 'low' | 'medium' | 'high'; reason: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const risk = item as Record<string, unknown>;
      const severity = risk.severity;
      if (
        typeof risk.requirement !== 'string' ||
        typeof risk.reason !== 'string' ||
        (severity !== 'low' && severity !== 'medium' && severity !== 'high')
      ) {
        return null;
      }
      return {
        requirement: risk.requirement,
        severity,
        reason: risk.reason,
      };
    })
    .filter(
      (
        item,
      ): item is {
        requirement: string;
        severity: 'low' | 'medium' | 'high';
        reason: string;
      } => Boolean(item),
    );
}

function requirementsFromJson(value: unknown) {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    mustHave: asStringArray(record.mustHave),
    niceToHave: asStringArray(record.niceToHave),
  };
}

function answerValueFromJson(value: unknown): { value: unknown; required: boolean } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { value, required: false };
  }

  const record = value as Record<string, unknown>;
  return {
    value: record.value ?? null,
    required: Boolean(record.required),
  };
}

export type ProfileAnswerLibraryItem = {
  id: string;
  fieldKey: string;
  fieldLabel: string;
  fieldGroup: string | null;
  value: unknown;
  sourceType: string;
  confidence: number | null;
  reviewState: string;
  notes: string | null;
  updatedAt: string;
};

function asFitAssessment(value: unknown) {
  const parsed = tailoringFitAssessmentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function asBaseSelection(value: unknown) {
  const parsed = tailoringBaseSelectionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function asGenerationMetadata(value: unknown) {
  const parsed = tailoringGenerationMetadataSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function asQaMetadata(value: unknown) {
  const parsed = tailoringQaMetadataSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function mapResumeVersionDetail(resume: {
  id: string;
  kind: string;
  title: string;
  contentMarkdown: string;
  sectionsJson: unknown;
  changeSummaryJson: unknown;
  createdAt: Date;
}): ResumeVersionDetail {
  return resumeVersionDetailSchema.parse({
    id: resume.id,
    kind: resume.kind,
    title: resume.title,
    createdAt: resume.createdAt.toISOString(),
    contentMarkdown: resume.contentMarkdown,
    document: coerceResumeDocument(resume.sectionsJson, resume.contentMarkdown),
    changeSummary: asStringArray(resume.changeSummaryJson),
  });
}

function mapTailoringRunSummary(run: {
  id: string;
  status: string;
  createdAt: Date;
  completedAt: Date | null;
  instructions: string | null;
  revisionNote: string | null;
  sourceTailoringRunId: string | null;
  fitAssessmentJson: unknown;
  baseSelectionJson: unknown;
  rationaleJson: unknown;
  changeSummaryJson: unknown;
  risksJson: unknown;
  generationMetadataJson: unknown;
  qaMetadataJson: unknown;
  failureCode: string | null;
  failureMessage: string | null;
  outputResumeVersionId: string | null;
}) {
  return tailoringRunSummarySchema.parse({
    id: run.id,
    status: run.status,
    createdAt: run.createdAt.toISOString(),
    completedAt: run.completedAt ? run.completedAt.toISOString() : null,
    instructions: run.instructions,
    revisionNote: run.revisionNote,
    sourceTailoringRunId: run.sourceTailoringRunId,
    rationale: asStringArray(run.rationaleJson),
    changeSummary: asStringArray(run.changeSummaryJson),
    risks: asRiskArray(run.risksJson),
    fitAssessment: asFitAssessment(run.fitAssessmentJson),
    baseSelection: asBaseSelection(run.baseSelectionJson),
    generationMetadata: asGenerationMetadata(run.generationMetadataJson),
    qaMetadata: asQaMetadata(run.qaMetadataJson),
    failureCode: run.failureCode,
    failureMessage: run.failureMessage,
    outputResumeVersionId: run.outputResumeVersionId,
  });
}

function mapTailoringRunWorkspaceItem(run: {
  id: string;
  status: string;
  createdAt: Date;
  completedAt: Date | null;
  instructions: string | null;
  revisionNote: string | null;
  sourceTailoringRunId: string | null;
  fitAssessmentJson: unknown;
  baseSelectionJson: unknown;
  rationaleJson: unknown;
  changeSummaryJson: unknown;
  risksJson: unknown;
  generationMetadataJson: unknown;
  qaMetadataJson: unknown;
  failureCode: string | null;
  failureMessage: string | null;
  outputResumeVersionId: string | null;
  outputResumeVersion?: { title: string; contentMarkdown: string } | null;
}) {
  const summary = mapTailoringRunSummary(run);
  return tailoringRunWorkspaceItemSchema.parse({
    ...summary,
    outputResumeTitle: run.outputResumeVersion?.title ?? null,
    outputResumeMarkdown: run.outputResumeVersion?.contentMarkdown ?? null,
  });
}

function mapNeedleTaskSummary(task: {
  id: string;
  taskType: string;
  status: string;
  requestedByLabel: string;
  instructions: string | null;
  sourceTailoringRunId: string | null;
  resultTailoringRunId: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  workerLabel: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}) {
  return needleTaskSummarySchema.parse({
    id: task.id,
    taskType: task.taskType,
    status: task.status,
    requestedByLabel: task.requestedByLabel,
    instructions: task.instructions,
    sourceTailoringRunId: task.sourceTailoringRunId,
    resultTailoringRunId: task.resultTailoringRunId,
    failureCode: task.failureCode,
    failureMessage: task.failureMessage,
    workerLabel: task.workerLabel,
    createdAt: task.createdAt.toISOString(),
    startedAt: task.startedAt ? task.startedAt.toISOString() : null,
    completedAt: task.completedAt ? task.completedAt.toISOString() : null,
  });
}

const LATCH_WORKER_HEARTBEAT_FRESH_MS = parseInteger(process.env.LATCH_WORKER_HEARTBEAT_FRESH_MS, 20_000);
const LATCH_WORKER_HEARTBEAT_DELAYED_MS = parseInteger(
  process.env.LATCH_WORKER_HEARTBEAT_DELAYED_MS,
  LATCH_WORKER_HEARTBEAT_FRESH_MS * 3,
);

function asLatchAgentResponse(value: unknown) {
  const parsed = latchAgentResponseSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function mapLatchTaskSummary(task: {
  id: string;
  taskType: string;
  status: string;
  requestedByLabel: string;
  workerLabel: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  responsePayloadJson?: unknown;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}): LatchTaskSummary {
  const response = asLatchAgentResponse(task.responsePayloadJson);

  return latchTaskSummarySchema.parse({
    id: task.id,
    taskType: task.taskType,
    status: task.status,
    requestedByLabel: task.requestedByLabel,
    workerLabel: task.workerLabel,
    failureCode: task.failureCode,
    failureMessage: task.failureMessage,
    responseStatus: response?.status ?? null,
    responseSummary: response?.summary ?? null,
    createdAt: task.createdAt.toISOString(),
    startedAt: task.startedAt ? task.startedAt.toISOString() : null,
    completedAt: task.completedAt ? task.completedAt.toISOString() : null,
  });
}

function mapLatchWorkerHeartbeatSummary(heartbeat: {
  workerLabel: string;
  state: string;
  currentTaskId: string | null;
  currentTaskType: string | null;
  lastClaimedTaskId: string | null;
  lastCompletedTaskId: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  updatedAt: Date;
}): LatchWorkerHeartbeatSummary {
  const ageSeconds = Math.max(0, Math.floor((Date.now() - heartbeat.updatedAt.getTime()) / 1000));
  const ageMs = ageSeconds * 1000;
  const freshness = ageMs <= LATCH_WORKER_HEARTBEAT_FRESH_MS ? 'fresh' : ageMs <= LATCH_WORKER_HEARTBEAT_DELAYED_MS ? 'delayed' : 'stale';

  return latchWorkerHeartbeatSummarySchema.parse({
    workerLabel: heartbeat.workerLabel,
    state: heartbeat.state,
    freshness,
    ageSeconds,
    updatedAt: heartbeat.updatedAt.toISOString(),
    currentTaskId: heartbeat.currentTaskId,
    currentTaskType: heartbeat.currentTaskType,
    lastClaimedTaskId: heartbeat.lastClaimedTaskId,
    lastCompletedTaskId: heartbeat.lastCompletedTaskId,
    lastErrorCode: heartbeat.lastErrorCode,
    lastErrorMessage: heartbeat.lastErrorMessage,
  });
}

function pickLatchWorkerSummary(args: {
  heartbeatsByWorker: Map<string, LatchWorkerHeartbeatSummary>;
  latestHeartbeat: LatchWorkerHeartbeatSummary | null;
  workerLabel?: string | null;
}) {
  if (args.workerLabel) {
    const matching = args.heartbeatsByWorker.get(args.workerLabel);
    if (matching) {
      return matching;
    }
  }

  return args.latestHeartbeat;
}

function getWorkspacePrepState(args: {
  activeTask: LatchTaskSummary | null;
  latestTask: LatchTaskSummary | null;
}): LatchWorkspacePrepState {
  if (args.activeTask?.status === 'queued') {
    return 'queued';
  }

  if (args.activeTask?.status === 'processing') {
    return 'processing';
  }

  if (args.latestTask?.status === 'failed' || args.latestTask?.status === 'cancelled') {
    return 'failed';
  }

  if (args.latestTask?.status === 'completed') {
    return 'prepared';
  }

  return 'not_started';
}

function parseInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isMissingLatchInfrastructureError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code === 'P2021') {
    const table = typeof error.meta?.table === 'string' ? error.meta.table : '';
    if (table.includes('LatchTask') || table.includes('LatchWorkerHeartbeat')) {
      return true;
    }
  }

  if (error.code === 'P2022') {
    const column = typeof error.meta?.column === 'string' ? error.meta.column : '';
    const message = error.message ?? '';
    if (
      column.includes('LatchTask') ||
      column.includes('LatchWorkerHeartbeat') ||
      message.includes('LatchTask') ||
      message.includes('LatchWorkerHeartbeat')
    ) {
      return true;
    }
  }

  return false;
}

function isMissingProfileAnswerInfrastructureError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code === 'P2021') {
    const table = typeof error.meta?.table === 'string' ? error.meta.table : '';
    if (table.includes('ProfileAnswer')) {
      return true;
    }
  }

  if (error.code === 'P2022') {
    const column = typeof error.meta?.column === 'string' ? error.meta.column : '';
    const message = error.message ?? '';
    if (column.includes('ProfileAnswer') || message.includes('ProfileAnswer')) {
      return true;
    }
  }

  return false;
}

async function getLegacyOperationalApplicationQueue(
  statuses: Array<'applying' | 'submit_review' | 'submitted'>,
): Promise<ApplyingQueueItem[]> {
  const applications = await prisma.application.findMany({
    where: {
      status: {
        in: statuses,
      },
    },
    include: {
      job: {
        include: {
          company: true,
        },
      },
      tailoredResumeVersion: true,
      answers: true,
      attachments: true,
      portalSessions: {
        orderBy: [{ lastSyncedAt: 'desc' }, { id: 'desc' }],
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return applications.map((application) => {
    const readiness = evaluateApplicationReadiness({
      status: application.status,
      tailoredResumeVersionId: application.tailoredResumeVersionId,
      answers: application.answers,
      attachments: application.attachments,
      portalSessions: application.portalSessions,
    });

    return applyingQueueItemSchema.parse({
      id: application.id,
      status: application.status,
      updatedAt: application.updatedAt.toISOString(),
      portalDomain: application.portalDomain,
      completionPercent: readiness.completionPercent,
      missingRequiredCount: readiness.missingRequiredCount,
      lowConfidenceCount: readiness.lowConfidenceCount,
      hasHardBlockers: readiness.hardBlockers.length > 0,
      workspacePrepState: 'not_started',
      activeLatchTask: null,
      latestLatchTask: null,
      latchWorker: null,
      selectedTailoredResumeTitle: application.tailoredResumeVersion?.title ?? null,
      jobTitle: application.job.title,
      companyName: application.job.company.name,
    });
  });
}

export async function getRecentAuditEvents(limit = 20): Promise<AuditEventItem[]> {
  const events = await prisma.auditEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return events.map((event) =>
    auditEventItemSchema.parse({
      id: event.id,
      entityType: event.entityType,
      entityId: event.entityId,
      eventType: event.eventType,
      actorType: event.actorType,
      actorLabel: event.actorLabel,
      createdAt: event.createdAt.toISOString(),
      payloadJson: event.payloadJson,
    }),
  );
}

export async function getSeededJobs(): Promise<JobListItem[]> {
  return getReadModelSeededJobs();
}

export async function getInboxJobs(): Promise<JobListItem[]> {
  return getReadModelInboxJobs();
}

export async function getShortlistedJobs(): Promise<JobListItem[]> {
  return getReadModelShortlistedJobs();
}

async function getOperationalApplicationQueue(
  statuses: Array<'applying' | 'submit_review' | 'submitted'>,
): Promise<ApplyingQueueItem[]> {
  try {
    const applications = await prisma.application.findMany({
      where: {
        status: {
          in: statuses,
        },
      },
      include: {
        job: {
          include: {
            company: true,
          },
        },
        tailoredResumeVersion: true,
        answers: true,
        attachments: true,
        portalSessions: {
          orderBy: [{ lastSyncedAt: 'desc' }, { id: 'desc' }],
        },
        latchTasks: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const heartbeats = await prisma.latchWorkerHeartbeat.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: {
        workerLabel: true,
        state: true,
        currentTaskId: true,
        currentTaskType: true,
        lastClaimedTaskId: true,
        lastCompletedTaskId: true,
        lastErrorCode: true,
        lastErrorMessage: true,
        updatedAt: true,
      },
    });

    const heartbeatSummaries = heartbeats.map((heartbeat) => mapLatchWorkerHeartbeatSummary(heartbeat));
    const heartbeatsByWorker = new Map(heartbeatSummaries.map((heartbeat) => [heartbeat.workerLabel, heartbeat]));
    const latestHeartbeat = heartbeatSummaries[0] ?? null;

    return applications.map((application) => {
      const readiness = evaluateApplicationReadiness({
        status: application.status,
        tailoredResumeVersionId: application.tailoredResumeVersionId,
        answers: application.answers,
        attachments: application.attachments,
        portalSessions: application.portalSessions,
      });

      const activeLatchTask = (() => {
        const task = application.latchTasks.find((item) => item.status === 'queued' || item.status === 'processing');
        return task ? mapLatchTaskSummary(task) : null;
      })();
      const latestLatchTask = application.latchTasks[0] ? mapLatchTaskSummary(application.latchTasks[0]) : null;
      const workspacePrepState = getWorkspacePrepState({
        activeTask: activeLatchTask,
        latestTask: latestLatchTask,
      });

      return applyingQueueItemSchema.parse({
        id: application.id,
        status: application.status,
        updatedAt: application.updatedAt.toISOString(),
        portalDomain: application.portalDomain,
        completionPercent: readiness.completionPercent,
        missingRequiredCount: readiness.missingRequiredCount,
        lowConfidenceCount: readiness.lowConfidenceCount,
        hasHardBlockers: readiness.hardBlockers.length > 0,
        workspacePrepState,
        activeLatchTask: activeLatchTask,
        latestLatchTask: latestLatchTask,
        latchWorker: pickLatchWorkerSummary({
          heartbeatsByWorker,
          latestHeartbeat,
          workerLabel: activeLatchTask?.workerLabel ?? latestLatchTask?.workerLabel,
        }),
        selectedTailoredResumeTitle: application.tailoredResumeVersion?.title ?? null,
        jobTitle: application.job.title,
        companyName: application.job.company.name,
      });
    });
  } catch (error) {
    if (isMissingLatchInfrastructureError(error)) {
      return getLegacyOperationalApplicationQueue(statuses);
    }

    throw error;
  }
}

export async function getApplyingQueue(): Promise<ApplyingQueueItem[]> {
  return getOperationalApplicationQueue(['applying', 'submit_review']);
}

export async function getSubmitReviewQueue(): Promise<ApplyingQueueItem[]> {
  return getOperationalApplicationQueue(['submit_review', 'submitted']);
}

export async function getLatestLatchWorkerHeartbeatSummary(): Promise<LatchWorkerHeartbeatSummary | null> {
  try {
    const heartbeat = await prisma.latchWorkerHeartbeat.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: {
        workerLabel: true,
        state: true,
        currentTaskId: true,
        currentTaskType: true,
        lastClaimedTaskId: true,
        lastCompletedTaskId: true,
        lastErrorCode: true,
        lastErrorMessage: true,
        updatedAt: true,
      },
    });

    return heartbeat ? mapLatchWorkerHeartbeatSummary(heartbeat) : null;
  } catch (error) {
    if (isMissingLatchInfrastructureError(error)) {
      return null;
    }

    throw error;
  }
}

export async function getProfileAnswerLibrary(email: string): Promise<ProfileAnswerLibraryItem[]> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return [];
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (!user) {
      return [];
    }

    const answers = await prisma.profileAnswer.findMany({
      where: {
        ownerUserId: user.id,
        isArchived: false,
      },
      orderBy: [{ fieldLabel: 'asc' }, { updatedAt: 'desc' }],
    });

    return answers.map((answer) => ({
      id: answer.id,
      fieldKey: answer.fieldKey,
      fieldLabel: answer.fieldLabel,
      fieldGroup: answer.fieldGroup,
      value: answerValueFromJson(answer.answerJson).value,
      sourceType: answer.sourceType,
      confidence: answer.confidence,
      reviewState: answer.reviewState,
      notes: answer.notes,
      updatedAt: answer.updatedAt.toISOString(),
    }));
  } catch (error) {
    if (isMissingProfileAnswerInfrastructureError(error)) {
      return [];
    }

    throw error;
  }
}

async function getLegacyApplicationDetail(applicationId: string): Promise<ApplicationDetail | null> {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      job: {
        include: {
          company: true,
        },
      },
      baseResumeVersion: true,
      tailoredResumeVersion: true,
      answers: {
        orderBy: { fieldLabel: 'asc' },
      },
      attachments: {
        include: {
          resumeVersion: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      portalSessions: {
        orderBy: [{ lastSyncedAt: 'desc' }, { id: 'desc' }],
      },
    },
  });

  if (!application) {
    return null;
  }

  const readiness = evaluateApplicationReadiness({
    status: application.status,
    tailoredResumeVersionId: application.tailoredResumeVersionId,
    answers: application.answers,
    attachments: application.attachments,
    portalSessions: application.portalSessions,
  });

  const auditEvents = await prisma.auditEvent.findMany({
    where: {
      OR: [
        { entityType: 'application', entityId: application.id },
        { entityType: 'job', entityId: application.jobId },
        ...application.portalSessions.map((session) => ({ entityType: 'portal_session', entityId: session.id })),
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return applicationDetailSchema.parse({
    id: application.id,
    status: application.status,
    completionPercent: readiness.completionPercent,
    missingRequiredCount: readiness.missingRequiredCount,
    lowConfidenceCount: readiness.lowConfidenceCount,
    workspacePrepState: 'not_started',
    activeLatchTask: null,
    latestLatchTask: null,
    latchWorker: null,
    readiness,
    job: {
      id: application.job.id,
      title: application.job.title,
      companyName: application.job.company.name,
      locationText: application.job.locationText,
    },
    baseResume: {
      id: application.baseResumeVersion.id,
      kind: application.baseResumeVersion.kind,
      title: application.baseResumeVersion.title,
      createdAt: application.baseResumeVersion.createdAt.toISOString(),
    },
    tailoredResume: application.tailoredResumeVersion
      ? {
          id: application.tailoredResumeVersion.id,
          kind: application.tailoredResumeVersion.kind,
          title: application.tailoredResumeVersion.title,
          createdAt: application.tailoredResumeVersion.createdAt.toISOString(),
        }
      : null,
    answers: application.answers.map((answer) => {
      const extracted = answerValueFromJson(answer.answerJson);
      return {
        id: answer.id,
        fieldKey: answer.fieldKey,
        fieldLabel: answer.fieldLabel,
        fieldGroup: answer.fieldGroup,
        value: extracted.value,
        required: extracted.required,
        sourceType: answer.sourceType,
        reviewState: answer.reviewState,
        confidence: answer.confidence,
      };
    }),
    attachments: application.attachments.map((attachment) => ({
      id: attachment.id,
      attachmentType: attachment.attachmentType,
      filename: attachment.filename,
      fileUrl: attachment.fileUrl,
      resumeVersionId: attachment.resumeVersionId,
      resumeVersionTitle: attachment.resumeVersion?.title ?? null,
    })),
    portalSessions: application.portalSessions.map((session) => ({
      id: session.id,
      mode: session.mode,
      launchUrl: session.launchUrl,
      providerDomain: session.providerDomain,
      status: session.status,
      lastKnownPageTitle: session.lastKnownPageTitle,
      notes: session.notes,
    })),
    auditEvents: auditEvents.map((event) => ({
      id: event.id,
      entityType: event.entityType,
      entityId: event.entityId,
      eventType: event.eventType,
      actorType: event.actorType,
      actorLabel: event.actorLabel,
      createdAt: event.createdAt.toISOString(),
      payloadJson: event.payloadJson,
    })),
  });
}

export async function getApplicationDetail(applicationId: string): Promise<ApplicationDetail | null> {
  try {
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        job: {
          include: {
            company: true,
          },
        },
        baseResumeVersion: true,
        tailoredResumeVersion: true,
        answers: {
          orderBy: { fieldLabel: 'asc' },
        },
        attachments: {
          include: {
            resumeVersion: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        portalSessions: {
          orderBy: [{ lastSyncedAt: 'desc' }, { id: 'desc' }],
        },
        latchTasks: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!application) {
      return null;
    }

    const readiness = evaluateApplicationReadiness({
      status: application.status,
      tailoredResumeVersionId: application.tailoredResumeVersionId,
      answers: application.answers,
      attachments: application.attachments,
      portalSessions: application.portalSessions,
    });

    const [auditEvents, heartbeats] = await Promise.all([
      prisma.auditEvent.findMany({
        where: {
          OR: [
            { entityType: 'application', entityId: application.id },
            { entityType: 'job', entityId: application.jobId },
            ...application.portalSessions.map((session) => ({ entityType: 'portal_session', entityId: session.id })),
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.latchWorkerHeartbeat.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: {
          workerLabel: true,
          state: true,
          currentTaskId: true,
          currentTaskType: true,
          lastClaimedTaskId: true,
          lastCompletedTaskId: true,
          lastErrorCode: true,
          lastErrorMessage: true,
          updatedAt: true,
        },
      }),
    ]);

    const activeLatchTask = (() => {
      const task = application.latchTasks.find((item) => item.status === 'queued' || item.status === 'processing');
      return task ? mapLatchTaskSummary(task) : null;
    })();
    const latestLatchTask = application.latchTasks[0] ? mapLatchTaskSummary(application.latchTasks[0]) : null;
    const heartbeatSummaries = heartbeats.map((heartbeat) => mapLatchWorkerHeartbeatSummary(heartbeat));
    const heartbeatsByWorker = new Map(heartbeatSummaries.map((heartbeat) => [heartbeat.workerLabel, heartbeat]));
    const latestHeartbeat = heartbeatSummaries[0] ?? null;

    return applicationDetailSchema.parse({
      id: application.id,
      status: application.status,
      completionPercent: readiness.completionPercent,
      missingRequiredCount: readiness.missingRequiredCount,
      lowConfidenceCount: readiness.lowConfidenceCount,
      workspacePrepState: getWorkspacePrepState({
        activeTask: activeLatchTask,
        latestTask: latestLatchTask,
      }),
      activeLatchTask: activeLatchTask,
      latestLatchTask: latestLatchTask,
      latchWorker: pickLatchWorkerSummary({
        heartbeatsByWorker,
        latestHeartbeat,
        workerLabel: activeLatchTask?.workerLabel ?? latestLatchTask?.workerLabel,
      }),
      readiness,
      job: {
        id: application.job.id,
        title: application.job.title,
        companyName: application.job.company.name,
        locationText: application.job.locationText,
      },
      baseResume: {
        id: application.baseResumeVersion.id,
        kind: application.baseResumeVersion.kind,
        title: application.baseResumeVersion.title,
        createdAt: application.baseResumeVersion.createdAt.toISOString(),
      },
      tailoredResume: application.tailoredResumeVersion
        ? {
            id: application.tailoredResumeVersion.id,
            kind: application.tailoredResumeVersion.kind,
            title: application.tailoredResumeVersion.title,
            createdAt: application.tailoredResumeVersion.createdAt.toISOString(),
          }
        : null,
      answers: application.answers.map((answer) => {
        const extracted = answerValueFromJson(answer.answerJson);
        return {
          id: answer.id,
          fieldKey: answer.fieldKey,
          fieldLabel: answer.fieldLabel,
          fieldGroup: answer.fieldGroup,
          value: extracted.value,
          required: extracted.required,
          sourceType: answer.sourceType,
          reviewState: answer.reviewState,
          confidence: answer.confidence,
        };
      }),
      attachments: application.attachments.map((attachment) => ({
        id: attachment.id,
        attachmentType: attachment.attachmentType,
        filename: attachment.filename,
        fileUrl: attachment.fileUrl,
        resumeVersionId: attachment.resumeVersionId,
        resumeVersionTitle: attachment.resumeVersion?.title ?? null,
      })),
      portalSessions: application.portalSessions.map((session) => ({
        id: session.id,
        mode: session.mode,
        launchUrl: session.launchUrl,
        providerDomain: session.providerDomain,
        status: session.status,
        lastKnownPageTitle: session.lastKnownPageTitle,
        notes: session.notes,
      })),
      auditEvents: auditEvents.map((event) => ({
        id: event.id,
        entityType: event.entityType,
        entityId: event.entityId,
        eventType: event.eventType,
        actorType: event.actorType,
        actorLabel: event.actorLabel,
        createdAt: event.createdAt.toISOString(),
        payloadJson: event.payloadJson,
      })),
    });
  } catch (error) {
    if (isMissingLatchInfrastructureError(error)) {
      return getLegacyApplicationDetail(applicationId);
    }

    throw error;
  }
}

export async function getTailoringQueue(): Promise<TailoringQueueItem[]> {
  const applications = await prisma.application.findMany({
    where: {
      status: {
        in: ['tailoring', 'tailoring_review', 'paused'],
      },
    },
    include: {
      job: {
        include: {
          company: true,
        },
      },
      baseResumeVersion: true,
      tailoredResumeVersion: true,
      tailoringRuns: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      needleTasks: {
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return applications.map((application) =>
    tailoringQueueItemSchema.parse({
      applicationId: application.id,
      applicationStatus: application.status,
      updatedAt: application.updatedAt.toISOString(),
      job: {
        id: application.job.id,
        title: application.job.title,
        companyName: application.job.company.name,
        locationText: application.job.locationText,
      },
      baseResume: {
        id: application.baseResumeVersion.id,
        kind: application.baseResumeVersion.kind,
        title: application.baseResumeVersion.title,
        createdAt: application.baseResumeVersion.createdAt.toISOString(),
      },
      selectedTailoredResume: application.tailoredResumeVersion
        ? {
            id: application.tailoredResumeVersion.id,
            kind: application.tailoredResumeVersion.kind,
            title: application.tailoredResumeVersion.title,
            createdAt: application.tailoredResumeVersion.createdAt.toISOString(),
          }
        : null,
      latestRun: application.tailoringRuns[0] ? mapTailoringRunSummary(application.tailoringRuns[0]) : null,
      activeTask: (() => {
        const activeTask = application.needleTasks.find((task) => task.status === 'queued' || task.status === 'processing');
        return activeTask ? mapNeedleTaskSummary(activeTask) : null;
      })(),
      latestTask: application.needleTasks[0] ? mapNeedleTaskSummary(application.needleTasks[0]) : null,
    }),
  );
}

export async function getTailoringDetail(applicationId: string): Promise<TailoringDetail | null> {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      job: {
        include: {
          company: true,
        },
      },
      baseResumeVersion: true,
      tailoredResumeVersion: true,
      tailoringRuns: {
        include: {
          outputResumeVersion: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      needleTasks: {
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
  });

  if (!application) {
    return null;
  }

  const runIds = application.tailoringRuns.map((run) => run.id);
  const auditEvents = await prisma.auditEvent.findMany({
    where: {
      OR: [
        { entityType: 'application', entityId: application.id },
        { entityType: 'job', entityId: application.jobId },
        ...(runIds.length > 0 ? [{ entityType: 'tailoring_run', entityId: { in: runIds } }] : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 25,
  });

  const latestRun = application.tailoringRuns[0] ?? null;
  const latestDraft = latestRun?.outputResumeVersion ? mapResumeVersionDetail(latestRun.outputResumeVersion) : null;

  const activeTask = application.needleTasks.find((task) => task.status === 'queued' || task.status === 'processing') ?? null;
  const latestTask = application.needleTasks[0] ?? null;

  return tailoringDetailSchema.parse({
    applicationId: application.id,
    applicationStatus: application.status,
    pausedReason: application.pausedReason,
    activeTask: activeTask ? mapNeedleTaskSummary(activeTask) : null,
    latestTask: latestTask ? mapNeedleTaskSummary(latestTask) : null,
    job: {
      id: application.job.id,
      title: application.job.title,
      companyName: application.job.company.name,
      locationText: application.job.locationText,
      description: application.job.jobDescriptionClean ?? application.job.jobDescriptionRaw,
      requirements: requirementsFromJson(application.job.jobRequirementsJson),
    },
    baseResume: mapResumeVersionDetail(application.baseResumeVersion),
    selectedTailoredResume: application.tailoredResumeVersion
      ? {
          id: application.tailoredResumeVersion.id,
          kind: application.tailoredResumeVersion.kind,
          title: application.tailoredResumeVersion.title,
          createdAt: application.tailoredResumeVersion.createdAt.toISOString(),
        }
      : null,
    latestDraft,
    latestRun: latestRun ? mapTailoringRunWorkspaceItem(latestRun) : null,
    runHistory: application.tailoringRuns.map((run) => mapTailoringRunWorkspaceItem(run)),
    auditEvents: auditEvents.map((event) =>
      auditEventItemSchema.parse({
        id: event.id,
        entityType: event.entityType,
        entityId: event.entityId,
        eventType: event.eventType,
        actorType: event.actorType,
        actorLabel: event.actorLabel,
        createdAt: event.createdAt.toISOString(),
        payloadJson: event.payloadJson,
      }),
    ),
  });
}
