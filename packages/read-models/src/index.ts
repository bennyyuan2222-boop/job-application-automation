export {
  getInboxJobs,
  getInboxScoutJobs,
  getRecentScoutRuns,
  getScoutJobDetail,
  getSeededJobs,
  getShortlistedJobs,
  getShortlistedScoutJobs,
} from './scout';

import {
  applicationAnswerItemSchema,
  applicationAttachmentItemSchema,
  applicationDetailSchema,
  applyingQueueItemSchema,
  auditEventItemSchema,
  portalSessionItemSchema,
  readinessSummarySchema,
  type ApplicationDetail,
  type ApplyingQueueItem,
  type AuditEventItem,
} from '@job-ops/contracts';
import { prisma } from '@job-ops/db';
import { evaluateApplicationReadiness } from '@job-ops/readiness';

function coerceAnswerValue(answerJson: unknown) {
  if (!answerJson || typeof answerJson !== 'object' || Array.isArray(answerJson)) {
    return answerJson;
  }

  return (answerJson as { value?: unknown }).value ?? answerJson;
}

function isRequired(answerJson: unknown) {
  if (!answerJson || typeof answerJson !== 'object' || Array.isArray(answerJson)) {
    return false;
  }

  return Boolean((answerJson as { required?: boolean }).required);
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

export async function getApplyingQueue(): Promise<ApplyingQueueItem[]> {
  const applications = await prisma.application.findMany({
    where: {
      status: {
        in: ['applying', 'paused', 'submit_review'],
      },
    },
    include: {
      job: {
        include: {
          company: true,
        },
      },
      tailoredResumeVersion: true,
      portalSessions: {
        orderBy: [{ lastSyncedAt: 'desc' }, { id: 'desc' }],
      },
      answers: true,
      attachments: true,
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
      jobTitle: application.job.title,
      companyName: application.job.company.name,
      portalDomain: application.portalDomain,
      completionPercent: readiness.completionPercent,
      missingRequiredCount: readiness.missingRequiredCount,
      lowConfidenceCount: readiness.lowConfidenceCount,
      selectedTailoredResumeTitle: application.tailoredResumeVersion?.title ?? null,
      hasHardBlockers: readiness.hardBlockers.length > 0,
      updatedAt: application.updatedAt.toISOString(),
    });
  });
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
        orderBy: [{ fieldGroup: 'asc' }, { fieldLabel: 'asc' }],
      },
      attachments: {
        include: {
          resumeVersion: true,
        },
        orderBy: { createdAt: 'asc' },
      },
      portalSessions: {
        orderBy: [{ lastSyncedAt: 'desc' }, { id: 'desc' }],
      },
    },
  });

  if (!application) {
    return null;
  }

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

  const readiness = evaluateApplicationReadiness({
    status: application.status,
    tailoredResumeVersionId: application.tailoredResumeVersionId,
    answers: application.answers,
    attachments: application.attachments,
    portalSessions: application.portalSessions,
  });

  return applicationDetailSchema.parse({
    id: application.id,
    status: application.status,
    completionPercent: readiness.completionPercent,
    missingRequiredCount: readiness.missingRequiredCount,
    lowConfidenceCount: readiness.lowConfidenceCount,
    readiness: readinessSummarySchema.parse(readiness),
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
    answers: application.answers.map((answer) =>
      applicationAnswerItemSchema.parse({
        id: answer.id,
        fieldKey: answer.fieldKey,
        fieldLabel: answer.fieldLabel,
        fieldGroup: answer.fieldGroup,
        value: coerceAnswerValue(answer.answerJson),
        required: isRequired(answer.answerJson),
        sourceType: answer.sourceType,
        confidence: answer.confidence,
        reviewState: answer.reviewState,
      }),
    ),
    attachments: application.attachments.map((attachment) =>
      applicationAttachmentItemSchema.parse({
        id: attachment.id,
        attachmentType: attachment.attachmentType,
        filename: attachment.filename,
        fileUrl: attachment.fileUrl,
        resumeVersionId: attachment.resumeVersionId,
        resumeVersionTitle: attachment.resumeVersion?.title ?? null,
      }),
    ),
    portalSessions: application.portalSessions.map((session) =>
      portalSessionItemSchema.parse({
        id: session.id,
        mode: session.mode,
        launchUrl: session.launchUrl,
        providerDomain: session.providerDomain,
        status: session.status,
        lastKnownPageTitle: session.lastKnownPageTitle,
        notes: session.notes,
      }),
    ),
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
