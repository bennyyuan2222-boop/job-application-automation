'use server';

import { Prisma, prisma } from '@job-ops/db';
import { revalidatePath } from 'next/cache';
import { evaluateApplicationReadiness } from '@job-ops/readiness';

function asJson(value: Prisma.InputJsonValue | null | undefined) {
  return value ?? Prisma.JsonNull;
}

async function syncApplicationReadiness(applicationId: string) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      answers: true,
      attachments: true,
      portalSessions: {
        orderBy: [{ lastSyncedAt: 'desc' }, { id: 'desc' }],
      },
    },
  });

  if (!application) throw new Error('Application not found');

  const readiness = evaluateApplicationReadiness({
    status: application.status,
    tailoredResumeVersionId: application.tailoredResumeVersionId,
    answers: application.answers,
    attachments: application.attachments,
    portalSessions: application.portalSessions,
  });

  await prisma.application.update({
    where: { id: applicationId },
    data: {
      completionPercent: readiness.completionPercent,
      missingRequiredCount: readiness.missingRequiredCount,
      lowConfidenceCount: readiness.lowConfidenceCount,
    },
  });

  return readiness;
}

export async function saveApplicationAnswer(formData: FormData) {
  const applicationId = String(formData.get('applicationId') ?? '');
  const fieldKey = String(formData.get('fieldKey') ?? '').trim();
  const fieldLabel = String(formData.get('fieldLabel') ?? '').trim();
  const fieldGroup = String(formData.get('fieldGroup') ?? '').trim();
  const value = String(formData.get('value') ?? '').trim();
  const required = formData.get('required') === 'on';
  const sourceType = String(formData.get('sourceType') ?? 'manual') as 'manual' | 'agent' | 'resume' | 'derived';
  const reviewState = String(formData.get('reviewState') ?? 'needs_review') as 'accepted' | 'needs_review' | 'blocked';
  const confidenceRaw = String(formData.get('confidence') ?? '').trim();
  const confidence = confidenceRaw ? Number(confidenceRaw) : null;

  if (!applicationId || !fieldKey || !fieldLabel) {
    throw new Error('applicationId, fieldKey, and fieldLabel are required');
  }

  await prisma.applicationAnswer.upsert({
    where: { applicationId_fieldKey: { applicationId, fieldKey } },
    update: {
      fieldLabel,
      fieldGroup: fieldGroup || null,
      answerJson: { value, required },
      sourceType,
      reviewState,
      confidence,
    },
    create: {
      applicationId,
      fieldKey,
      fieldLabel,
      fieldGroup: fieldGroup || null,
      answerJson: { value, required },
      sourceType,
      reviewState,
      confidence,
    },
  });

  await prisma.auditEvent.create({
    data: {
      entityType: 'application',
      entityId: applicationId,
      eventType: 'application.answer_upserted',
      actorType: 'agent',
      actorLabel: 'latch',
      payloadJson: asJson({ fieldKey, fieldLabel, reviewState, required, sourceType }),
    },
  });

  await syncApplicationReadiness(applicationId);
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath('/applying');
}

export async function addApplicationAttachment(formData: FormData) {
  const applicationId = String(formData.get('applicationId') ?? '');
  const attachmentType = String(formData.get('attachmentType') ?? 'resume') as 'resume' | 'other';
  const filename = String(formData.get('filename') ?? '').trim();
  const fileUrl = String(formData.get('fileUrl') ?? '').trim();
  const resumeVersionIdValue = String(formData.get('resumeVersionId') ?? '').trim();

  if (!applicationId || !filename || !fileUrl) {
    throw new Error('applicationId, filename, and fileUrl are required');
  }

  await prisma.applicationAttachment.create({
    data: {
      applicationId,
      attachmentType,
      filename,
      fileUrl,
      resumeVersionId: resumeVersionIdValue || null,
    },
  });

  await prisma.auditEvent.create({
    data: {
      entityType: 'application',
      entityId: applicationId,
      eventType: 'application.attachment_added',
      actorType: 'agent',
      actorLabel: 'latch',
      payloadJson: asJson({ attachmentType, filename, resumeVersionId: resumeVersionIdValue || null }),
    },
  });

  await syncApplicationReadiness(applicationId);
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath('/applying');
}

export async function savePortalSession(formData: FormData) {
  const applicationId = String(formData.get('applicationId') ?? '');
  const launchUrl = String(formData.get('launchUrl') ?? '').trim();
  const providerDomain = String(formData.get('providerDomain') ?? '').trim();
  const status = String(formData.get('status') ?? 'not_started') as
    | 'not_started'
    | 'in_progress'
    | 'ready_for_review'
    | 'submitted'
    | 'abandoned';
  const mode = String(formData.get('mode') ?? 'manual') as 'manual' | 'automation' | 'hybrid';
  const lastKnownPageTitle = String(formData.get('lastKnownPageTitle') ?? '').trim();
  const notes = String(formData.get('notes') ?? '').trim();

  if (!applicationId || !launchUrl || !providerDomain) {
    throw new Error('applicationId, launchUrl, and providerDomain are required');
  }

  const portalSession = await prisma.portalSession.create({
    data: {
      applicationId,
      launchUrl,
      providerDomain,
      status,
      mode,
      lastKnownPageTitle: lastKnownPageTitle || null,
      notes: notes || null,
      lastSyncedAt: new Date(),
      sessionSummaryJson: asJson({ source: 'latch-manual-entry' }),
    },
  });

  await prisma.application.update({
    where: { id: applicationId },
    data: { portalUrl: launchUrl, portalDomain: providerDomain },
  });

  await prisma.auditEvent.createMany({
    data: [
      {
        entityType: 'portal_session',
        entityId: portalSession.id,
        eventType: 'portal_session.created',
        actorType: 'agent',
        actorLabel: 'latch',
        payloadJson: asJson({ providerDomain, status, mode }),
      },
      {
        entityType: 'application',
        entityId: applicationId,
        eventType: 'application.portal_session_registered',
        actorType: 'agent',
        actorLabel: 'latch',
        payloadJson: asJson({ portalSessionId: portalSession.id, providerDomain, status }),
      },
    ],
  });

  await syncApplicationReadiness(applicationId);
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath('/applying');
}
