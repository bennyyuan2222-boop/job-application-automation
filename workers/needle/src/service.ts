import {
  ActorType,
  ApplicationStatus,
  ResumeCreatedByType,
  ResumeVersionKind,
  prisma,
} from '@job-ops/db';
import {
  assertApplicationTransition,
  assertTailoringRunTransition,
  makeAuditEvent,
  type ApplicationStatus as DomainApplicationStatus,
  type TailoringRunStatus,
} from '@job-ops/domain';
import {
  buildTailoredResumeDraft,
  chooseBestBaseResume,
  coerceResumeDocument,
  renderResumeDocument,
  type JobContext,
  type ResumeCandidate,
} from '@job-ops/tailoring';

function toRequirementList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function buildJobContext(application: {
  job: {
    id: string;
    title: string;
    locationText: string;
    jobDescriptionRaw: string;
    jobDescriptionClean: string | null;
    jobRequirementsJson: unknown;
    company: { name: string };
  };
}): JobContext {
  const requirements = (application.job.jobRequirementsJson ?? {}) as Record<string, unknown>;

  return {
    id: application.job.id,
    title: application.job.title,
    companyName: application.job.company.name,
    locationText: application.job.locationText,
    description: application.job.jobDescriptionClean ?? application.job.jobDescriptionRaw,
    requirements: {
      mustHave: toRequirementList(requirements.mustHave),
      niceToHave: toRequirementList(requirements.niceToHave),
    },
  };
}

function toResumeCandidate(record: { id: string; title: string; contentMarkdown: string; sectionsJson: unknown }): ResumeCandidate {
  return {
    id: record.id,
    title: record.title,
    contentMarkdown: record.contentMarkdown,
    document: coerceResumeDocument(record.sectionsJson, record.contentMarkdown),
  };
}

async function loadApplicationContext(applicationId: string) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      job: {
        include: {
          company: true,
        },
      },
      tailoringRuns: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!application) {
    throw new Error(`Application not found: ${applicationId}`);
  }

  return application;
}

async function loadBaseResumeCandidates(): Promise<ResumeCandidate[]> {
  const baseResumes = await prisma.resumeVersion.findMany({
    where: { kind: ResumeVersionKind.base },
    orderBy: { createdAt: 'asc' },
  });

  return baseResumes.map((resume) => toResumeCandidate(resume));
}

export async function generateTailoringDraftForApplication(
  applicationId: string,
  options?: { instructions?: string; actorLabel?: string },
) {
  const actorLabel = options?.actorLabel ?? 'needle';
  const application = await loadApplicationContext(applicationId);
  const candidates = await loadBaseResumeCandidates();
  if (candidates.length === 0) {
    throw new Error('No base resume versions available');
  }

  const jobContext = buildJobContext(application);
  const selection = chooseBestBaseResume(jobContext, candidates);
  const selectedBase = candidates.find((candidate) => candidate.id === selection.resumeVersionId);
  if (!selectedBase) {
    throw new Error(`Selected base resume not found: ${selection.resumeVersionId}`);
  }

  const draft = buildTailoredResumeDraft(jobContext, selectedBase);
  draft.contentMarkdown = renderResumeDocument(draft.title, draft.document);

  const shouldMoveToReview = application.status !== ApplicationStatus.tailoring_review;
  if (shouldMoveToReview) {
    assertApplicationTransition(application.status as DomainApplicationStatus, ApplicationStatus.tailoring_review as DomainApplicationStatus);
  }

  const result = await prisma.$transaction(async (tx) => {
    const beforeBaseResumeVersionId = application.baseResumeVersionId;
    if (beforeBaseResumeVersionId !== selectedBase.id) {
      await tx.application.update({
        where: { id: application.id },
        data: {
          baseResumeVersionId: selectedBase.id,
        },
      });
    }

    const run = await tx.tailoringRun.create({
      data: {
        applicationId: application.id,
        inputResumeVersionId: selectedBase.id,
        status: 'created',
        instructions: options?.instructions ?? null,
        jobSnapshotJson: jobContext,
      },
    });

    const tailoredResumeVersion = await tx.resumeVersion.create({
      data: {
        kind: ResumeVersionKind.tailored,
        parentResumeVersionId: selectedBase.id,
        title: draft.title,
        contentMarkdown: draft.contentMarkdown,
        sectionsJson: draft.document,
        changeSummaryJson: draft.changeSummary,
        createdByType: ResumeCreatedByType.agent,
      },
    });

    const updatedRun = await tx.tailoringRun.update({
      where: { id: run.id },
      data: {
        outputResumeVersionId: tailoredResumeVersion.id,
        status: 'generated_for_review',
        rationaleJson: [...selection.reasons, ...draft.rationale],
        risksJson: draft.risks,
        changeSummaryJson: draft.changeSummary,
        completedAt: new Date(),
      },
    });

    const applicationUpdate = shouldMoveToReview
      ? await tx.application.update({
          where: { id: application.id },
          data: {
            status: ApplicationStatus.tailoring_review,
            pausedReason: null,
          },
        })
      : application;

    const auditEvents = [];
    if (beforeBaseResumeVersionId !== selectedBase.id) {
      auditEvents.push(
        makeAuditEvent({
          entityType: 'application',
          entityId: application.id,
          eventType: 'application.base_resume_selected',
          actorType: ActorType.agent,
          actorLabel,
          beforeState: { baseResumeVersionId: beforeBaseResumeVersionId },
          afterState: { baseResumeVersionId: selectedBase.id },
          payloadJson: {
            reasons: selection.reasons,
            lane: selection.lane ?? null,
          },
        }),
      );
    }

    auditEvents.push(
      makeAuditEvent({
        entityType: 'tailoring_run',
        entityId: updatedRun.id,
        eventType: 'tailoring_run.generated',
        actorType: ActorType.agent,
        actorLabel,
        afterState: { status: updatedRun.status },
        payloadJson: {
          applicationId: application.id,
          inputResumeVersionId: selectedBase.id,
          outputResumeVersionId: tailoredResumeVersion.id,
          changeSummary: draft.changeSummary,
          risks: draft.risks,
        },
      }),
    );

    if (shouldMoveToReview) {
      auditEvents.push(
        makeAuditEvent({
          entityType: 'application',
          entityId: application.id,
          eventType: 'application.moved_to_tailoring_review',
          actorType: ActorType.agent,
          actorLabel,
          beforeState: { status: application.status },
          afterState: { status: applicationUpdate.status },
          payloadJson: {
            tailoringRunId: updatedRun.id,
          },
        }),
      );
    }

    if (auditEvents.length > 0) {
      await tx.auditEvent.createMany({ data: auditEvents });
    }

    return {
      tailoringRunId: updatedRun.id,
      tailoredResumeVersionId: tailoredResumeVersion.id,
    };
  });

  return result;
}

export async function approveTailoringRunForApplication(
  applicationId: string,
  tailoringRunId: string,
  options?: { actorLabel?: string },
) {
  const actorLabel = options?.actorLabel ?? 'needle';
  const application = await loadApplicationContext(applicationId);
  const run = await prisma.tailoringRun.findUnique({ where: { id: tailoringRunId } });

  if (!run || run.applicationId !== application.id) {
    throw new Error(`Tailoring run not found for application: ${tailoringRunId}`);
  }

  if (!run.outputResumeVersionId) {
    throw new Error('Tailoring run has no generated resume to approve');
  }

  assertTailoringRunTransition(run.status as TailoringRunStatus, 'approved');
  if (application.status !== ApplicationStatus.applying) {
    assertApplicationTransition(application.status as DomainApplicationStatus, ApplicationStatus.applying as DomainApplicationStatus);
  }

  await prisma.$transaction(async (tx) => {
    await tx.tailoringRun.update({
      where: { id: run.id },
      data: { status: 'approved' },
    });

    await tx.application.update({
      where: { id: application.id },
      data: {
        status: ApplicationStatus.applying,
        tailoredResumeVersionId: run.outputResumeVersionId,
        pausedReason: null,
      },
    });

    await tx.auditEvent.createMany({
      data: [
        makeAuditEvent({
          entityType: 'tailoring_run',
          entityId: run.id,
          eventType: 'tailoring_run.approved',
          actorType: ActorType.user,
          actorLabel,
          beforeState: { status: run.status },
          afterState: { status: 'approved' },
          payloadJson: { outputResumeVersionId: run.outputResumeVersionId },
        }),
        makeAuditEvent({
          entityType: 'application',
          entityId: application.id,
          eventType: 'application.moved_to_applying',
          actorType: ActorType.user,
          actorLabel,
          beforeState: { status: application.status },
          afterState: { status: ApplicationStatus.applying, tailoredResumeVersionId: run.outputResumeVersionId },
          payloadJson: { approvedTailoringRunId: run.id },
        }),
      ],
    });
  });
}

export async function requestTailoringEditsForApplication(
  applicationId: string,
  tailoringRunId: string,
  revisionNote: string,
  options?: { actorLabel?: string },
) {
  const actorLabel = options?.actorLabel ?? 'needle';
  const application = await loadApplicationContext(applicationId);
  const run = await prisma.tailoringRun.findUnique({ where: { id: tailoringRunId } });

  if (!run || run.applicationId !== application.id) {
    throw new Error(`Tailoring run not found for application: ${tailoringRunId}`);
  }

  assertTailoringRunTransition(run.status as TailoringRunStatus, 'edits_requested');
  if (application.status !== ApplicationStatus.tailoring) {
    assertApplicationTransition(application.status as DomainApplicationStatus, ApplicationStatus.tailoring as DomainApplicationStatus);
  }

  await prisma.$transaction(async (tx) => {
    await tx.tailoringRun.update({
      where: { id: run.id },
      data: {
        status: 'edits_requested',
        revisionNote,
      },
    });

    await tx.application.update({
      where: { id: application.id },
      data: {
        status: ApplicationStatus.tailoring,
        pausedReason: null,
      },
    });

    await tx.auditEvent.createMany({
      data: [
        makeAuditEvent({
          entityType: 'tailoring_run',
          entityId: run.id,
          eventType: 'tailoring_run.edits_requested',
          actorType: ActorType.user,
          actorLabel,
          beforeState: { status: run.status },
          afterState: { status: 'edits_requested' },
          payloadJson: { revisionNote },
        }),
        makeAuditEvent({
          entityType: 'application',
          entityId: application.id,
          eventType: 'application.moved_to_tailoring',
          actorType: ActorType.user,
          actorLabel,
          beforeState: { status: application.status },
          afterState: { status: ApplicationStatus.tailoring },
          payloadJson: { revisionNote, sourceTailoringRunId: run.id },
        }),
      ],
    });
  });

  return generateTailoringDraftForApplication(applicationId, {
    instructions: revisionNote,
    actorLabel,
  });
}

export async function pauseTailoringForApplication(
  applicationId: string,
  reason: string,
  options?: { actorLabel?: string },
) {
  const actorLabel = options?.actorLabel ?? 'needle';
  const application = await loadApplicationContext(applicationId);
  const latestRun = application.tailoringRuns[0] ?? null;

  if (application.status !== ApplicationStatus.paused) {
    assertApplicationTransition(application.status as DomainApplicationStatus, ApplicationStatus.paused as DomainApplicationStatus);
  }

  await prisma.$transaction(async (tx) => {
    await tx.application.update({
      where: { id: application.id },
      data: {
        status: ApplicationStatus.paused,
        pausedReason: reason,
      },
    });

    if (latestRun && latestRun.status !== 'approved' && latestRun.status !== 'paused') {
      await tx.tailoringRun.update({
        where: { id: latestRun.id },
        data: {
          status: 'paused',
          revisionNote: reason,
        },
      });
    }

    const auditEvents = [
      makeAuditEvent({
        entityType: 'application',
        entityId: application.id,
        eventType: 'application.paused',
        actorType: ActorType.user,
        actorLabel,
        beforeState: { status: application.status },
        afterState: { status: ApplicationStatus.paused },
        payloadJson: { reason },
      }),
    ];

    if (latestRun && latestRun.status !== 'approved' && latestRun.status !== 'paused') {
      auditEvents.push(
        makeAuditEvent({
          entityType: 'tailoring_run',
          entityId: latestRun.id,
          eventType: 'tailoring_run.paused',
          actorType: ActorType.user,
          actorLabel,
          beforeState: { status: latestRun.status },
          afterState: { status: 'paused' },
          payloadJson: { reason },
        }),
      );
    }

    await tx.auditEvent.createMany({ data: auditEvents });
  });
}
