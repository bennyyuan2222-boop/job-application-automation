'use server';

import { ActorType, ApplicationStatus, Prisma, ResumeVersionKind, prisma } from '@job-ops/db';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { makeAuditEvent, type RawScoutJobInput } from '@job-ops/domain';

import { requireSession } from '../../../lib/auth';
import { sameOriginUrlFromHeaders } from '../../../lib/redirects';
import { generateTailoringDraftForApplication } from '@job-ops/needle-worker';
import { runScoutIngestion } from '@job-ops/scout-worker';

const SAMPLE_SCOUT_RECORDS: RawScoutJobInput[] = [
  {
    sourceKey: 'manual-scout-sample',
    sourceRecordId: 'sample-northstar-data-analyst',
    sourceUrl: 'https://jobs.example.com/northstar-data-analyst',
    companyName: 'Northstar AI',
    title: 'Data Analyst',
    locationText: 'New York, NY',
    description:
      'SQL, dashboarding, experimentation, and AI workflow reporting for a fast-growing product team.',
    salaryText: '$82k-$96k',
    datePosted: new Date().toISOString(),
  },
  {
    sourceKey: 'manual-scout-sample',
    sourceRecordId: 'sample-signal-grid-business-analyst',
    sourceUrl: 'https://jobs.example.com/signal-grid-business-analyst',
    companyName: 'Signal Grid',
    title: 'Business Analyst, AI Operations',
    locationText: 'Remote - US',
    remote: true,
    description: 'Cross-functional business analysis, KPI reporting, SQL, and AI operations support.',
    salaryText: '$78k-$92k',
    datePosted: new Date().toISOString(),
  },
];

function revalidateScoutPaths() {
  revalidatePath('/');
  revalidatePath('/inbox');
  revalidatePath('/shortlist');
  revalidatePath('/activity');
}

function applicationRouteForStatus(applicationId: string, status: string) {
  if (status === ApplicationStatus.applying || status === ApplicationStatus.submit_review || status === ApplicationStatus.submitted) {
    return `/applications/${applicationId}`;
  }

  return `/tailoring/${applicationId}`;
}

function asJson(value: Prisma.InputJsonValue | null | undefined) {
  return value ?? Prisma.JsonNull;
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', '1'].includes(normalized)) return true;
    if (['false', 'no', '0'].includes(normalized)) return false;
  }
  return null;
}

function normalizeManualScoutRecords(sourceKey: string, payload: string): RawScoutJobInput[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new Error('recordsJson must be valid JSON');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('recordsJson must be a JSON array');
  }

  return parsed.map((record, index) => {
    if (!record || typeof record !== 'object') {
      throw new Error(`Record ${index + 1} must be an object`);
    }

    const value = record as Record<string, unknown>;
    const companyName = String(value.companyName ?? '').trim();
    const title = String(value.title ?? '').trim();

    if (!companyName || !title) {
      throw new Error(`Record ${index + 1} is missing companyName or title`);
    }

    return {
      sourceKey,
      sourceRecordId: String(value.sourceRecordId ?? `${sourceKey}-${Date.now()}-${index + 1}`),
      sourceUrl: value.sourceUrl ? String(value.sourceUrl) : null,
      companyName,
      title,
      locationText: value.locationText ? String(value.locationText) : null,
      description: value.description ? String(value.description) : null,
      salaryText: value.salaryText ? String(value.salaryText) : null,
      remote: toBoolean(value.remote),
      hybrid: toBoolean(value.hybrid),
      datePosted: value.datePosted ? String(value.datePosted) : null,
    };
  });
}

export async function shortlistJobAction(formData: FormData) {
  const session = await requireSession();
  const jobId = String(formData.get('jobId') ?? '');
  if (!jobId) throw new Error('jobId is required');

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new Error('Job not found');

  await prisma.$transaction(async (tx) => {
    await tx.job.update({
      where: { id: jobId },
      data: { status: 'shortlisted' },
    });

    await tx.auditEvent.create({
      data: makeAuditEvent({
        entityType: 'job',
        entityId: jobId,
        eventType: 'job.shortlisted',
        actorType: ActorType.user,
        actorLabel: session.email,
        beforeState: { status: job.status },
        afterState: { status: 'shortlisted' },
      }),
    });
  });

  revalidateScoutPaths();
}

export async function archiveJobAction(formData: FormData) {
  const session = await requireSession();
  const jobId = String(formData.get('jobId') ?? '');
  if (!jobId) throw new Error('jobId is required');

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new Error('Job not found');

  await prisma.$transaction(async (tx) => {
    await tx.job.update({
      where: { id: jobId },
      data: { status: 'archived' },
    });

    await tx.auditEvent.create({
      data: makeAuditEvent({
        entityType: 'job',
        entityId: jobId,
        eventType: 'job.archived',
        actorType: ActorType.user,
        actorLabel: session.email,
        beforeState: { status: job.status },
        afterState: { status: 'archived' },
      }),
    });
  });

  revalidateScoutPaths();
}

export async function runSampleScoutPassAction() {
  const session = await requireSession();

  await runScoutIngestion({
    sourceKey: 'manual-scout-sample',
    searchTerm: 'sample analytics roles',
    searchLocation: 'Remote / New York',
    actorLabel: session.email,
    records: SAMPLE_SCOUT_RECORDS,
  });

  revalidateScoutPaths();
  redirect(await sameOriginUrlFromHeaders('/inbox'));
}

export async function runManualScoutIngestionAction(formData: FormData) {
  const session = await requireSession();
  const sourceKey = String(formData.get('sourceKey') ?? 'manual-scout').trim() || 'manual-scout';
  const searchTerm = String(formData.get('searchTerm') ?? 'manual import').trim() || 'manual import';
  const searchLocation = String(formData.get('searchLocation') ?? 'manual').trim() || 'manual';
  const recordsJson = String(formData.get('recordsJson') ?? '').trim();

  if (!recordsJson) {
    throw new Error('recordsJson is required');
  }

  const records = normalizeManualScoutRecords(sourceKey, recordsJson);

  await runScoutIngestion({
    sourceKey,
    searchTerm,
    searchLocation,
    actorLabel: session.email,
    records,
  });

  revalidateScoutPaths();
  redirect(await sameOriginUrlFromHeaders('/inbox'));
}

export async function createApplicationAction(formData: FormData) {
  const session = await requireSession();
  const jobId = String(formData.get('jobId') ?? '');

  if (!jobId) {
    throw new Error('jobId is required');
  }

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      applications: {
        where: {
          status: {
            not: 'archived',
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!job) {
    throw new Error('Job not found');
  }

  const existingApplication = job.applications[0] ?? null;
  if (existingApplication) {
    revalidateScoutPaths();
    redirect(await sameOriginUrlFromHeaders(applicationRouteForStatus(existingApplication.id, existingApplication.status)));
  }

  const fallbackBaseResume = await prisma.resumeVersion.findFirst({
    where: { kind: ResumeVersionKind.base },
    orderBy: { createdAt: 'asc' },
  });

  if (!fallbackBaseResume) {
    throw new Error('No base resume versions are available to start an application');
  }

  const application = await prisma.$transaction(async (tx) => {
    const createdApplication = await tx.application.create({
      data: {
        jobId,
        status: ApplicationStatus.tailoring,
        baseResumeVersionId: fallbackBaseResume.id,
      },
    });

    await tx.auditEvent.createMany({
      data: [
        makeAuditEvent({
          entityType: 'application',
          entityId: createdApplication.id,
          eventType: 'application.created',
          actorType: ActorType.user,
          actorLabel: session.email,
          afterState: { status: ApplicationStatus.tailoring, jobId },
          payloadJson: { jobId, baseResumeVersionId: fallbackBaseResume.id },
        }),
        makeAuditEvent({
          entityType: 'job',
          entityId: jobId,
          eventType: 'job.application_started',
          actorType: ActorType.user,
          actorLabel: session.email,
          beforeState: { status: job.status },
          afterState: { status: job.status },
          payloadJson: { applicationId: createdApplication.id },
        }),
      ],
    });

    return createdApplication;
  });

  await generateTailoringDraftForApplication(application.id, {
    actorLabel: session.email,
    instructions: 'Auto-generated after starting application from shortlist.',
  });

  revalidateScoutPaths();
  revalidatePath('/tailoring');
  revalidatePath(`/tailoring/${application.id}`);
  revalidatePath('/activity');
  redirect(await sameOriginUrlFromHeaders(`/tailoring/${application.id}`));
}
