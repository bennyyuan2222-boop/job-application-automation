import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ActorType,
  ApplicationStatus,
  AttachmentType,
  AnswerReviewState,
  AnswerSourceType,
  JobStatus,
  PortalSessionMode,
  PortalSessionStatus,
  Prisma,
  ResumeCreatedByType,
  ResumeVersionKind,
} from '@prisma/client';
import {
  buildTailoredResumeDraft,
  parseLegacyResumeMarkdown,
  renderResumeDocument,
  type JobContext,
  type ResumeCandidate,
} from '@job-ops/tailoring';
import { prisma } from '../src/client';

type LegacyResumeInventory = {
  sources: Array<{
    id: string;
    source_file: string;
    workspace_text_path: string;
    notes?: string[];
  }>;
};

type LegacyBaseManifest = {
  variants: Array<{
    variant_id: string;
    label: string;
    summary: string;
    source_achievement_ids: string[];
  }>;
};

type SeededBaseResume = ResumeCandidate & {
  prismaId: string;
  lane: string;
};

const seedActorLabel = 'seed-script';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const legacyRoot = path.join(repoRoot, 'legacy/source-resume-tailor-workspace');

async function readJsonFile<T>(relativePath: string): Promise<T> {
  const absolutePath = path.join(legacyRoot, relativePath);
  const content = await readFile(absolutePath, 'utf8');
  return JSON.parse(content) as T;
}

async function readLegacyFile(relativePath: string): Promise<string> {
  return readFile(path.join(legacyRoot, relativePath), 'utf8');
}

function jobSnapshot(job: JobContext): Prisma.InputJsonObject {
  return {
    title: job.title,
    companyName: job.companyName,
    locationText: job.locationText ?? null,
    description: job.description,
    requirements: (job.requirements ?? { mustHave: [], niceToHave: [] }) as Prisma.InputJsonObject,
  };
}

function asJson(value: Prisma.InputJsonValue | null | undefined) {
  return value ?? Prisma.JsonNull;
}

async function ensureAuditEvent(params: {
  entityType: string;
  entityId: string;
  eventType: string;
  actorType: ActorType;
  actorLabel: string;
  beforeState?: Prisma.InputJsonValue | null;
  afterState?: Prisma.InputJsonValue | null;
  payloadJson?: Prisma.InputJsonValue | null;
}) {
  const existing = await prisma.auditEvent.findFirst({
    where: {
      entityType: params.entityType,
      entityId: params.entityId,
      eventType: params.eventType,
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.auditEvent.create({
    data: {
      entityType: params.entityType,
      entityId: params.entityId,
      eventType: params.eventType,
      actorType: params.actorType,
      actorLabel: params.actorLabel,
      beforeState: asJson(params.beforeState),
      afterState: asJson(params.afterState),
      payloadJson: asJson(params.payloadJson),
    },
  });
}

async function ensureLegacyBaseResumes(): Promise<Record<string, SeededBaseResume>> {
  const inventory = await readJsonFile<LegacyResumeInventory>('data/profile/resume_inventory.json');
  const manifests = await readJsonFile<LegacyBaseManifest>('data/profile/base_resume_manifests.json');

  const mapping = [
    {
      prismaId: 'seed-resume-base-analytics',
      legacyResumeId: 'resume_variant_1',
      lane: 'analytics',
      title: 'Analytics Base Resume',
    },
    {
      prismaId: 'seed-resume-base-business-analyst',
      legacyResumeId: 'resume_variant_2',
      lane: 'business_analyst',
      title: 'Business Analyst Base Resume',
    },
    {
      prismaId: 'seed-resume-base-product-strategy',
      legacyResumeId: 'resume_variant_3',
      lane: 'product_strategy',
      title: 'Product Strategy Base Resume',
    },
  ] as const;

  const result: Record<string, SeededBaseResume> = {};

  for (const item of mapping) {
    const source = inventory.sources.find((entry) => entry.id === item.legacyResumeId);
    const manifest = manifests.variants.find((entry) => entry.variant_id === item.lane);

    if (!source || !manifest) {
      throw new Error(`Missing legacy resume seed mapping for ${item.lane}`);
    }

    const markdown = await readLegacyFile(source.workspace_text_path);
    const document = parseLegacyResumeMarkdown(markdown, {
      lane: item.lane,
      source: source.source_file,
      summary: manifest.summary,
      keywords: source.notes ?? [],
    });

    const seeded = await prisma.resumeVersion.upsert({
      where: { id: item.prismaId },
      update: {
        kind: ResumeVersionKind.base,
        title: item.title,
        contentMarkdown: markdown,
        sectionsJson: document,
        changeSummaryJson: [
          'Seeded from legacy resume-tailor truth-source raw resume markdown.',
          `Legacy source file: ${source.source_file}`,
        ],
        createdByType: ResumeCreatedByType.manual,
      },
      create: {
        id: item.prismaId,
        kind: ResumeVersionKind.base,
        title: item.title,
        contentMarkdown: markdown,
        sectionsJson: document,
        changeSummaryJson: [
          'Seeded from legacy resume-tailor truth-source raw resume markdown.',
          `Legacy source file: ${source.source_file}`,
        ],
        createdByType: ResumeCreatedByType.manual,
      },
    });

    result[item.lane] = {
      prismaId: seeded.id,
      id: seeded.id,
      lane: item.lane,
      title: seeded.title,
      contentMarkdown: seeded.contentMarkdown,
      document,
    };
  }

  return result;
}

async function seedApplyingSlice(baseResumes: Record<string, SeededBaseResume>, ownerEmail: string) {
  const company = await prisma.company.upsert({
    where: { normalizedName: 'acme-ai' },
    update: {
      name: 'Acme AI',
      website: 'https://acme.ai',
    },
    create: {
      id: 'seed-company-acme-ai',
      name: 'Acme AI',
      normalizedName: 'acme-ai',
      website: 'https://acme.ai',
    },
  });

  await prisma.companyProfile.upsert({
    where: { companyId: company.id },
    update: {
      aiNativeScore: 9,
      brandValueScore: 7,
      growthSignalScore: 8,
      qualitySummary: 'Seeded demo company with strong AI-native positioning.',
      signalsJson: ['ai-native', 'high-growth', 'seeded-demo'],
      lastEnrichedAt: new Date(),
    },
    create: {
      companyId: company.id,
      aiNativeScore: 9,
      brandValueScore: 7,
      growthSignalScore: 8,
      qualitySummary: 'Seeded demo company with strong AI-native positioning.',
      signalsJson: ['ai-native', 'high-growth', 'seeded-demo'],
      lastEnrichedAt: new Date(),
    },
  });

  const job = await prisma.job.upsert({
    where: { id: 'seed-job-acme-analytics' },
    update: {
      companyId: company.id,
      title: 'Analytics Associate',
      normalizedTitle: 'analytics associate',
      locationText: 'New York, NY',
      workMode: 'hybrid',
      employmentType: 'full-time',
      salaryText: '$85k-$100k',
      salaryMin: 85000,
      salaryMax: 100000,
      jobUrl: 'https://acme.ai/jobs/analytics-associate',
      jobDescriptionRaw:
        'Support product analytics, growth reporting, and lightweight AI workflow analysis for a fast-moving startup. Partner with stakeholders, maintain dashboards, and communicate operating insights clearly.',
      jobDescriptionClean:
        'Support product analytics, growth reporting, and lightweight AI workflow analysis for a fast-moving startup. Partner with stakeholders, maintain dashboards, and communicate operating insights clearly.',
      jobRequirementsJson: {
        mustHave: ['SQL', 'analytics', 'stakeholder communication'],
        niceToHave: ['AI product exposure', 'dashboarding'],
      },
      status: JobStatus.shortlisted,
    },
    create: {
      id: 'seed-job-acme-analytics',
      companyId: company.id,
      title: 'Analytics Associate',
      normalizedTitle: 'analytics associate',
      locationText: 'New York, NY',
      workMode: 'hybrid',
      employmentType: 'full-time',
      salaryText: '$85k-$100k',
      salaryMin: 85000,
      salaryMax: 100000,
      jobUrl: 'https://acme.ai/jobs/analytics-associate',
      jobDescriptionRaw:
        'Support product analytics, growth reporting, and lightweight AI workflow analysis for a fast-moving startup. Partner with stakeholders, maintain dashboards, and communicate operating insights clearly.',
      jobDescriptionClean:
        'Support product analytics, growth reporting, and lightweight AI workflow analysis for a fast-moving startup. Partner with stakeholders, maintain dashboards, and communicate operating insights clearly.',
      jobRequirementsJson: {
        mustHave: ['SQL', 'analytics', 'stakeholder communication'],
        niceToHave: ['AI product exposure', 'dashboarding'],
      },
      status: JobStatus.shortlisted,
    },
  });

  const existingScorecard = await prisma.jobScorecard.findFirst({ where: { jobId: job.id } });
  if (!existingScorecard) {
    await prisma.jobScorecard.create({
      data: {
        jobId: job.id,
        fitScore: 8.2,
        companyQualityScore: 8.8,
        aiRelevanceScore: 8.1,
        freshnessScore: 7.5,
        priorityScore: 8.4,
        topReasonsJson: ['strong analytics fit', 'AI-adjacent product exposure'],
        risksJson: ['salary band needs confirmation'],
        scorerType: 'system',
      },
    });
  }

  const baseResume = baseResumes.analytics;
  const jobContext: JobContext = {
    id: job.id,
    title: job.title,
    companyName: company.name,
    locationText: job.locationText,
    description: job.jobDescriptionClean ?? job.jobDescriptionRaw,
    requirements: {
      mustHave: ['SQL', 'analytics', 'stakeholder communication'],
      niceToHave: ['AI product exposure', 'dashboarding'],
    },
  };

  const draft = buildTailoredResumeDraft(jobContext, baseResume);
  draft.contentMarkdown = renderResumeDocument(draft.title, draft.document);

  const tailoredResume = await prisma.resumeVersion.upsert({
    where: { id: 'seed-resume-tailored-acme' },
    update: {
      kind: ResumeVersionKind.tailored,
      parentResumeVersionId: baseResume.id,
      title: draft.title,
      contentMarkdown: draft.contentMarkdown,
      sectionsJson: draft.document,
      changeSummaryJson: draft.changeSummary,
      createdByType: ResumeCreatedByType.agent,
    },
    create: {
      id: 'seed-resume-tailored-acme',
      kind: ResumeVersionKind.tailored,
      parentResumeVersionId: baseResume.id,
      title: draft.title,
      contentMarkdown: draft.contentMarkdown,
      sectionsJson: draft.document,
      changeSummaryJson: draft.changeSummary,
      createdByType: ResumeCreatedByType.agent,
    },
  });

  const application = await prisma.application.upsert({
    where: { id: 'seed-application-acme' },
    update: {
      jobId: job.id,
      status: ApplicationStatus.applying,
      baseResumeVersionId: baseResume.id,
      tailoredResumeVersionId: tailoredResume.id,
      portalUrl: 'https://jobs.acme.ai/applications/seed-application-acme',
      portalDomain: 'jobs.acme.ai',
      completionPercent: 67,
      missingRequiredCount: 1,
      lowConfidenceCount: 1,
      pausedReason: null,
    },
    create: {
      id: 'seed-application-acme',
      jobId: job.id,
      status: ApplicationStatus.applying,
      baseResumeVersionId: baseResume.id,
      tailoredResumeVersionId: tailoredResume.id,
      portalUrl: 'https://jobs.acme.ai/applications/seed-application-acme',
      portalDomain: 'jobs.acme.ai',
      completionPercent: 67,
      missingRequiredCount: 1,
      lowConfidenceCount: 1,
      pausedReason: null,
    },
  });

  await prisma.tailoringRun.upsert({
    where: { id: 'seed-tailoring-run-acme' },
    update: {
      applicationId: application.id,
      inputResumeVersionId: baseResume.id,
      outputResumeVersionId: tailoredResume.id,
      status: 'approved',
      jobSnapshotJson: jobSnapshot(jobContext),
      rationaleJson: draft.rationale,
      risksJson: draft.risks,
      changeSummaryJson: draft.changeSummary,
      instructions: 'Seeded approved tailoring run for the applying slice.',
      revisionNote: null,
      completedAt: new Date(),
    },
    create: {
      id: 'seed-tailoring-run-acme',
      applicationId: application.id,
      inputResumeVersionId: baseResume.id,
      outputResumeVersionId: tailoredResume.id,
      status: 'approved',
      jobSnapshotJson: jobSnapshot(jobContext),
      rationaleJson: draft.rationale,
      risksJson: draft.risks,
      changeSummaryJson: draft.changeSummary,
      instructions: 'Seeded approved tailoring run for the applying slice.',
      revisionNote: null,
      completedAt: new Date(),
    },
  });

  const resumeAttachment = await prisma.applicationAttachment.findFirst({
    where: { applicationId: application.id, attachmentType: AttachmentType.resume },
  });

  if (!resumeAttachment) {
    await prisma.applicationAttachment.create({
      data: {
        applicationId: application.id,
        attachmentType: AttachmentType.resume,
        resumeVersionId: tailoredResume.id,
        fileUrl: 'seed://resume/acme-tailored.pdf',
        filename: 'benny-yuan-acme-tailored.pdf',
      },
    });
  }

  await prisma.applicationAnswer.upsert({
    where: { applicationId_fieldKey: { applicationId: application.id, fieldKey: 'work_authorization' } },
    update: {
      fieldLabel: 'Are you authorized to work in the United States?',
      fieldGroup: 'eligibility',
      answerJson: { value: 'Yes', required: true },
      sourceType: AnswerSourceType.manual,
      confidence: 0.99,
      reviewState: AnswerReviewState.accepted,
    },
    create: {
      applicationId: application.id,
      fieldKey: 'work_authorization',
      fieldLabel: 'Are you authorized to work in the United States?',
      fieldGroup: 'eligibility',
      answerJson: { value: 'Yes', required: true },
      sourceType: AnswerSourceType.manual,
      confidence: 0.99,
      reviewState: AnswerReviewState.accepted,
    },
  });

  await prisma.applicationAnswer.upsert({
    where: { applicationId_fieldKey: { applicationId: application.id, fieldKey: 'salary_expectation' } },
    update: {
      fieldLabel: 'Salary expectation',
      fieldGroup: 'compensation',
      answerJson: { value: '$95,000', required: false },
      sourceType: AnswerSourceType.derived,
      confidence: 0.58,
      reviewState: AnswerReviewState.needs_review,
    },
    create: {
      applicationId: application.id,
      fieldKey: 'salary_expectation',
      fieldLabel: 'Salary expectation',
      fieldGroup: 'compensation',
      answerJson: { value: '$95,000', required: false },
      sourceType: AnswerSourceType.derived,
      confidence: 0.58,
      reviewState: AnswerReviewState.needs_review,
    },
  });

  await prisma.applicationAnswer.upsert({
    where: { applicationId_fieldKey: { applicationId: application.id, fieldKey: 'linkedin_url' } },
    update: {
      fieldLabel: 'LinkedIn profile URL',
      fieldGroup: 'profile',
      answerJson: { value: '', required: true },
      sourceType: AnswerSourceType.manual,
      confidence: null,
      reviewState: AnswerReviewState.blocked,
    },
    create: {
      applicationId: application.id,
      fieldKey: 'linkedin_url',
      fieldLabel: 'LinkedIn profile URL',
      fieldGroup: 'profile',
      answerJson: { value: '', required: true },
      sourceType: AnswerSourceType.manual,
      confidence: null,
      reviewState: AnswerReviewState.blocked,
    },
  });

  const existingPortalSession = await prisma.portalSession.findFirst({ where: { applicationId: application.id } });
  if (!existingPortalSession) {
    await prisma.portalSession.create({
      data: {
        applicationId: application.id,
        mode: PortalSessionMode.manual,
        launchUrl: 'https://jobs.acme.ai/applications/seed-application-acme',
        providerDomain: 'jobs.acme.ai',
        status: PortalSessionStatus.in_progress,
        lastKnownPageTitle: 'Application form',
        lastSyncedAt: new Date(),
        sessionSummaryJson: {
          currentStep: 'profile',
          completionHint: 'resume uploaded, profile step incomplete',
        },
        notes: 'Seeded portal session for the Latch applying workspace.',
      },
    });
  }

  await ensureAuditEvent({
    entityType: 'job',
    entityId: job.id,
    eventType: 'job.shortlisted',
    actorType: ActorType.user,
    actorLabel: ownerEmail,
    afterState: { status: JobStatus.shortlisted },
    payloadJson: { source: 'seed' },
  });

  await ensureAuditEvent({
    entityType: 'application',
    entityId: application.id,
    eventType: 'application.created',
    actorType: ActorType.system,
    actorLabel: seedActorLabel,
    afterState: { status: ApplicationStatus.tailoring },
    payloadJson: { baseResumeVersionId: baseResume.id },
  });

  await ensureAuditEvent({
    entityType: 'tailoring_run',
    entityId: 'seed-tailoring-run-acme',
    eventType: 'tailoring_run.approved',
    actorType: ActorType.agent,
    actorLabel: 'needle',
    afterState: { status: 'approved' },
    payloadJson: {
      applicationId: application.id,
      outputResumeVersionId: tailoredResume.id,
    },
  });

  await ensureAuditEvent({
    entityType: 'application',
    entityId: application.id,
    eventType: 'application.moved_to_applying',
    actorType: ActorType.agent,
    actorLabel: 'needle',
    beforeState: { status: ApplicationStatus.tailoring_review },
    afterState: { status: ApplicationStatus.applying, tailoredResumeVersionId: tailoredResume.id },
    payloadJson: { approvedTailoringRunId: 'seed-tailoring-run-acme' },
  });
}

async function seedTailoringSlice(baseResumes: Record<string, SeededBaseResume>, ownerEmail: string) {
  const company = await prisma.company.upsert({
    where: { normalizedName: 'northstar-insights' },
    update: {
      name: 'Northstar Insights',
      website: 'https://northstar.example',
    },
    create: {
      id: 'seed-company-northstar-insights',
      name: 'Northstar Insights',
      normalizedName: 'northstar-insights',
      website: 'https://northstar.example',
    },
  });

  const job = await prisma.job.upsert({
    where: { id: 'seed-job-northstar-bizops' },
    update: {
      companyId: company.id,
      title: 'Business Operations Analyst',
      normalizedTitle: 'business operations analyst',
      locationText: 'New York, NY',
      workMode: 'hybrid',
      employmentType: 'full-time',
      salaryText: '$90k-$110k',
      salaryMin: 90000,
      salaryMax: 110000,
      jobUrl: 'https://northstar.example/jobs/business-operations-analyst',
      jobDescriptionRaw:
        'Support planning, workflow analysis, KPI reporting, and stakeholder-ready recommendations across product and operations. Translate ambiguous requests into structured requirements and recurring reporting.',
      jobDescriptionClean:
        'Support planning, workflow analysis, KPI reporting, and stakeholder-ready recommendations across product and operations. Translate ambiguous requests into structured requirements and recurring reporting.',
      jobRequirementsJson: {
        mustHave: ['workflow analysis', 'stakeholder communication', 'KPI reporting', 'requirements'],
        niceToHave: ['SQL', 'market research', 'cross-functional planning'],
      },
      status: JobStatus.shortlisted,
    },
    create: {
      id: 'seed-job-northstar-bizops',
      companyId: company.id,
      title: 'Business Operations Analyst',
      normalizedTitle: 'business operations analyst',
      locationText: 'New York, NY',
      workMode: 'hybrid',
      employmentType: 'full-time',
      salaryText: '$90k-$110k',
      salaryMin: 90000,
      salaryMax: 110000,
      jobUrl: 'https://northstar.example/jobs/business-operations-analyst',
      jobDescriptionRaw:
        'Support planning, workflow analysis, KPI reporting, and stakeholder-ready recommendations across product and operations. Translate ambiguous requests into structured requirements and recurring reporting.',
      jobDescriptionClean:
        'Support planning, workflow analysis, KPI reporting, and stakeholder-ready recommendations across product and operations. Translate ambiguous requests into structured requirements and recurring reporting.',
      jobRequirementsJson: {
        mustHave: ['workflow analysis', 'stakeholder communication', 'KPI reporting', 'requirements'],
        niceToHave: ['SQL', 'market research', 'cross-functional planning'],
      },
      status: JobStatus.shortlisted,
    },
  });

  const existingScorecard = await prisma.jobScorecard.findFirst({ where: { jobId: job.id } });
  if (!existingScorecard) {
    await prisma.jobScorecard.create({
      data: {
        jobId: job.id,
        fitScore: 8.7,
        companyQualityScore: 8.1,
        aiRelevanceScore: 6.9,
        freshnessScore: 7.8,
        priorityScore: 8.3,
        topReasonsJson: ['strong business-analyst alignment', 'clear KPI + stakeholder overlap'],
        risksJson: ['final role scope still needs confirmation'],
        scorerType: 'system',
      },
    });
  }

  const baseResume = baseResumes.business_analyst;
  const jobContext: JobContext = {
    id: job.id,
    title: job.title,
    companyName: company.name,
    locationText: job.locationText,
    description: job.jobDescriptionClean ?? job.jobDescriptionRaw,
    requirements: {
      mustHave: ['workflow analysis', 'stakeholder communication', 'KPI reporting', 'requirements'],
      niceToHave: ['SQL', 'market research', 'cross-functional planning'],
    },
  };

  const draft = buildTailoredResumeDraft(jobContext, baseResume);
  draft.contentMarkdown = renderResumeDocument(draft.title, draft.document);

  const tailoredDraft = await prisma.resumeVersion.upsert({
    where: { id: 'seed-resume-tailored-northstar-draft' },
    update: {
      kind: ResumeVersionKind.tailored,
      parentResumeVersionId: baseResume.id,
      title: draft.title,
      contentMarkdown: draft.contentMarkdown,
      sectionsJson: draft.document,
      changeSummaryJson: draft.changeSummary,
      createdByType: ResumeCreatedByType.agent,
    },
    create: {
      id: 'seed-resume-tailored-northstar-draft',
      kind: ResumeVersionKind.tailored,
      parentResumeVersionId: baseResume.id,
      title: draft.title,
      contentMarkdown: draft.contentMarkdown,
      sectionsJson: draft.document,
      changeSummaryJson: draft.changeSummary,
      createdByType: ResumeCreatedByType.agent,
    },
  });

  const application = await prisma.application.upsert({
    where: { id: 'seed-application-northstar-tailoring' },
    update: {
      jobId: job.id,
      status: ApplicationStatus.tailoring_review,
      baseResumeVersionId: baseResume.id,
      tailoredResumeVersionId: null,
      portalUrl: null,
      portalDomain: null,
      completionPercent: 20,
      missingRequiredCount: 0,
      lowConfidenceCount: 0,
      pausedReason: null,
    },
    create: {
      id: 'seed-application-northstar-tailoring',
      jobId: job.id,
      status: ApplicationStatus.tailoring_review,
      baseResumeVersionId: baseResume.id,
      tailoredResumeVersionId: null,
      completionPercent: 20,
      missingRequiredCount: 0,
      lowConfidenceCount: 0,
      pausedReason: null,
    },
  });

  await prisma.tailoringRun.upsert({
    where: { id: 'seed-tailoring-run-northstar' },
    update: {
      applicationId: application.id,
      inputResumeVersionId: baseResume.id,
      outputResumeVersionId: tailoredDraft.id,
      status: 'generated_for_review',
      jobSnapshotJson: jobSnapshot(jobContext),
      rationaleJson: draft.rationale,
      risksJson: draft.risks,
      changeSummaryJson: draft.changeSummary,
      instructions: 'Seeded review-oriented draft for the Needle tailoring workspace.',
      revisionNote: null,
      completedAt: new Date(),
    },
    create: {
      id: 'seed-tailoring-run-northstar',
      applicationId: application.id,
      inputResumeVersionId: baseResume.id,
      outputResumeVersionId: tailoredDraft.id,
      status: 'generated_for_review',
      jobSnapshotJson: jobSnapshot(jobContext),
      rationaleJson: draft.rationale,
      risksJson: draft.risks,
      changeSummaryJson: draft.changeSummary,
      instructions: 'Seeded review-oriented draft for the Needle tailoring workspace.',
      revisionNote: null,
      completedAt: new Date(),
    },
  });

  await ensureAuditEvent({
    entityType: 'job',
    entityId: job.id,
    eventType: 'job.shortlisted',
    actorType: ActorType.user,
    actorLabel: ownerEmail,
    afterState: { status: JobStatus.shortlisted },
    payloadJson: { source: 'seed' },
  });

  await ensureAuditEvent({
    entityType: 'application',
    entityId: application.id,
    eventType: 'application.created',
    actorType: ActorType.system,
    actorLabel: seedActorLabel,
    afterState: { status: ApplicationStatus.tailoring },
    payloadJson: { baseResumeVersionId: baseResume.id },
  });

  await ensureAuditEvent({
    entityType: 'application',
    entityId: application.id,
    eventType: 'application.moved_to_tailoring_review',
    actorType: ActorType.agent,
    actorLabel: 'needle',
    beforeState: { status: ApplicationStatus.tailoring },
    afterState: { status: ApplicationStatus.tailoring_review },
    payloadJson: { tailoringRunId: 'seed-tailoring-run-northstar' },
  });

  await ensureAuditEvent({
    entityType: 'tailoring_run',
    entityId: 'seed-tailoring-run-northstar',
    eventType: 'tailoring_run.generated',
    actorType: ActorType.agent,
    actorLabel: 'needle',
    afterState: { status: 'generated_for_review' },
    payloadJson: {
      applicationId: application.id,
      outputResumeVersionId: tailoredDraft.id,
      risks: draft.risks,
      changeSummary: draft.changeSummary,
    },
  });
}

async function main() {
  const user = await prisma.user.upsert({
    where: { email: 'benny@example.com' },
    update: { lastLoginAt: new Date() },
    create: {
      email: 'benny@example.com',
      role: 'owner',
      lastLoginAt: new Date(),
    },
  });

  const baseResumes = await ensureLegacyBaseResumes();
  await seedApplyingSlice(baseResumes, user.email);
  await seedTailoringSlice(baseResumes, user.email);

  console.log(`Seeded demo user: ${user.email}`);
  console.log(`Seeded base resumes: ${Object.keys(baseResumes).join(', ')}`);
  console.log('Seeded applying slice: seed-application-acme');
  console.log('Seeded tailoring slice: seed-application-northstar-tailoring');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
