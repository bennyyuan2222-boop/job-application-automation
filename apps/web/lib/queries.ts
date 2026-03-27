import {
  applicationDetailSchema,
  applyingQueueItemSchema,
  auditEventItemSchema,
  jobListItemSchema,
  resumeVersionDetailSchema,
  needleTaskSummarySchema,
  tailoringBaseSelectionSchema,
  tailoringDetailSchema,
  tailoringFitAssessmentSchema,
  tailoringGenerationMetadataSchema,
  tailoringQueueItemSchema,
  tailoringRunSummarySchema,
  tailoringRunWorkspaceItemSchema,
  type ApplicationDetail,
  type ApplyingQueueItem,
  type AuditEventItem,
  type JobListItem,
  type ResumeVersionDetail,
  type TailoringDetail,
  type TailoringQueueItem,
} from '@job-ops/contracts';
import { prisma } from '@job-ops/db';
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
      selectedTailoredResumeTitle: application.tailoredResumeVersion?.title ?? null,
      jobTitle: application.job.title,
      companyName: application.job.company.name,
    });
  });
}

export async function getApplyingQueue(): Promise<ApplyingQueueItem[]> {
  return getOperationalApplicationQueue(['applying', 'submit_review']);
}

export async function getSubmitReviewQueue(): Promise<ApplyingQueueItem[]> {
  return getOperationalApplicationQueue(['submit_review', 'submitted']);
}

export async function getApplicationDetail(applicationId: string): Promise<ApplicationDetail | null> {
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
