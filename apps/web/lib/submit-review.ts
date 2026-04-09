import crypto from 'node:crypto';

import type { Prisma } from '@job-ops/db';
import type { ReadinessSummary } from '@job-ops/readiness';

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

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, sortJson(child)]),
    );
  }

  return value;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function buildSubmitReviewPacket(application: {
  id: string;
  jobId: string;
  status: string;
  portalUrl: string | null;
  portalDomain: string | null;
  tailoredResumeVersionId: string | null;
  job: {
    id: string;
    title: string;
    locationText: string;
    company: { name: string };
  };
  tailoredResumeVersion: {
    id: string;
    title: string;
    renderedPdfUrl: string | null;
    renderedDocxUrl: string | null;
  } | null;
  answers: Array<{
    fieldKey: string;
    fieldLabel: string;
    fieldGroup: string | null;
    answerJson: unknown;
    sourceType: string;
    reviewState: string;
    confidence: number | null;
    profileAnswerId: string | null;
    updatedAt: Date;
  }>;
  attachments: Array<{
    attachmentType: string;
    filename: string;
    fileUrl: string;
    resumeVersionId: string | null;
    createdAt: Date;
  }>;
  portalSessions: Array<{
    providerDomain: string;
    launchUrl: string;
    status: string;
    mode: string;
    lastKnownPageTitle: string | null;
    notes: string | null;
    lastSyncedAt: Date | null;
  }>;
}, readiness: ReadinessSummary) {
  return {
    contractVersion: 'submit-review-packet-v1',
    application: {
      id: application.id,
      jobId: application.jobId,
      status: application.status,
      portalUrl: application.portalUrl,
      portalDomain: application.portalDomain,
    },
    job: {
      id: application.job.id,
      title: application.job.title,
      companyName: application.job.company.name,
      locationText: application.job.locationText,
    },
    tailoredResume: application.tailoredResumeVersion
      ? {
          id: application.tailoredResumeVersion.id,
          title: application.tailoredResumeVersion.title,
          renderedPdfUrl: application.tailoredResumeVersion.renderedPdfUrl,
          renderedDocxUrl: application.tailoredResumeVersion.renderedDocxUrl,
        }
      : null,
    answers: application.answers.map((answer) => {
      const extracted = answerValueFromJson(answer.answerJson);
      return {
        fieldKey: answer.fieldKey,
        fieldLabel: answer.fieldLabel,
        fieldGroup: answer.fieldGroup,
        value: extracted.value,
        required: extracted.required,
        sourceType: answer.sourceType,
        reviewState: answer.reviewState,
        confidence: answer.confidence,
        profileAnswerId: answer.profileAnswerId,
        updatedAt: answer.updatedAt.toISOString(),
      };
    }),
    attachments: application.attachments.map((attachment) => ({
      attachmentType: attachment.attachmentType,
      filename: attachment.filename,
      fileUrl: attachment.fileUrl,
      resumeVersionId: attachment.resumeVersionId,
      createdAt: attachment.createdAt.toISOString(),
    })),
    portalSessions: application.portalSessions.map((session) => ({
      providerDomain: session.providerDomain,
      launchUrl: session.launchUrl,
      status: session.status,
      mode: session.mode,
      lastKnownPageTitle: session.lastKnownPageTitle,
      notes: session.notes,
      lastSyncedAt: session.lastSyncedAt ? session.lastSyncedAt.toISOString() : null,
    })),
    readiness,
  };
}

export function fingerprintSubmitReviewPacket(packet: unknown) {
  const stable = JSON.stringify(sortJson(packet));
  return crypto.createHash('sha256').update(stable).digest('hex');
}

export function buildSubmitReviewPacketFields(
  application: Parameters<typeof buildSubmitReviewPacket>[0],
  readiness: ReadinessSummary,
) {
  const packet = buildSubmitReviewPacket(application, readiness);
  return {
    submitReviewPacketJson: toJsonValue(packet),
    submitReviewPacketHash: fingerprintSubmitReviewPacket(packet),
    submitReviewCapturedAt: new Date(),
    submitReviewDirtyAt: null,
    submitReviewDirtyReason: null,
  };
}

export function summarizeSubmitReviewPacket(packet: unknown) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) {
    return null;
  }

  const record = packet as Record<string, unknown>;
  const answers = Array.isArray(record.answers) ? record.answers : [];
  const attachments = Array.isArray(record.attachments) ? record.attachments : [];
  const portalSessions = Array.isArray(record.portalSessions) ? record.portalSessions : [];

  return {
    answerCount: answers.length,
    attachmentCount: attachments.length,
    portalSessionCount: portalSessions.length,
  };
}
