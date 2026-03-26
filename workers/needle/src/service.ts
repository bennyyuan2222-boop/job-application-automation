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
  type TailoringBaseSelectionRecord,
  type TailoringFitAssessment,
  type TailoringGenerationMetadata,
  type TailoringRunStatus,
} from '@job-ops/domain';
import {
  buildResumeArtifactFilename,
  buildTailoredResumeDraft,
  chooseBestBaseResume,
  coerceResumeDocument,
  extractJobKeywords,
  renderResumeDocument,
  type BaseResumeSelection,
  type JobContext,
  type ResumeCandidate,
  type TailoredResumeDraft,
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

function buildResumeArtifactPath(resumeVersionId: string) {
  return `/api/resume-artifacts/${resumeVersionId}`;
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

function buildBaseSelectionRecord(
  selection: BaseResumeSelection,
  selectedBase: ResumeCandidate,
  candidateCount: number,
): TailoringBaseSelectionRecord {
  return {
    selectedResumeVersionId: selectedBase.id,
    selectedResumeTitle: selectedBase.title,
    ...(selection.lane ? { lane: selection.lane } : {}),
    ...(typeof selection.score === 'number' ? { score: selection.score } : {}),
    reasons: selection.reasons,
    candidateCount,
  };
}

function buildFitAssessment(jobContext: JobContext, draft: TailoredResumeDraft): TailoringFitAssessment {
  const requirements = [...(jobContext.requirements?.mustHave ?? []), ...(jobContext.requirements?.niceToHave ?? [])];
  const likelyGaps = draft.risks.map((risk) => risk.requirement).slice(0, 6);
  const riskNotes = draft.risks.map((risk) => risk.reason).slice(0, 6);
  const matchedKeywords = extractJobKeywords(jobContext, 8).filter((keyword) => draft.selectedKeywords.includes(keyword));
  const matchedStrengths = [
    ...matchedKeywords.slice(0, 4).map((keyword) => `Supported overlap around ${keyword}.`),
    ...draft.rationale.slice(0, 2),
  ].slice(0, 6);

  const supportedRequirementCount = Math.max(0, requirements.length - likelyGaps.length);
  const supportRatio = requirements.length === 0 ? 1 : supportedRequirementCount / requirements.length;

  let verdict: TailoringFitAssessment['verdict'] = 'weak';
  if (supportRatio >= 0.75 && matchedStrengths.length >= 3) {
    verdict = 'strong_match';
  } else if (supportRatio >= 0.5 && matchedStrengths.length >= 2) {
    verdict = 'viable';
  } else if (supportRatio >= 0.25) {
    verdict = 'stretch';
  }

  const proceedRecommendation: TailoringFitAssessment['proceedRecommendation'] =
    verdict === 'strong_match' || verdict === 'viable'
      ? 'proceed'
      : verdict === 'stretch'
        ? 'proceed_with_caution'
        : 'pause';

  const summary =
    likelyGaps.length > 0
      ? `Heuristic fit looks ${verdict.replace('_', ' ')} with ${matchedStrengths.length} supported overlap signals and ${likelyGaps.length} flagged gap(s).`
      : `Heuristic fit looks ${verdict.replace('_', ' ')} with ${matchedStrengths.length} supported overlap signals and no major truth gaps flagged.`;

  return {
    summary,
    verdict,
    matchedStrengths,
    likelyGaps,
    riskNotes,
    proceedRecommendation,
  };
}

function buildGenerationMetadata(
  application: Awaited<ReturnType<typeof loadApplicationContext>>,
  latencyMs: number,
  sourceTailoringRunId?: string,
): TailoringGenerationMetadata {
  return {
    strategyVersion: 'needle-heuristic-phase1',
    provider: 'local',
    executionMode: 'heuristic',
    latencyMs,
    ...(application.needleSessionKey ? { sessionKey: application.needleSessionKey } : {}),
    ...(sourceTailoringRunId ? { sourceTailoringRunId } : {}),
  };
}

export async function generateTailoringDraftForApplication(
  applicationId: string,
  options?: { instructions?: string; actorLabel?: string; sourceTailoringRunId?: string },
) {
  const actorLabel = options?.actorLabel ?? 'needle';
  const startedAt = Date.now();
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

  const shouldMoveToReview = application.status !== ApplicationStatus.tailoring_review;
  if (shouldMoveToReview) {
    assertApplicationTransition(application.status as DomainApplicationStatus, ApplicationStatus.tailoring_review as DomainApplicationStatus);
  }

  const run = await prisma.tailoringRun.create({
    data: {
      applicationId: application.id,
      inputResumeVersionId: selectedBase.id,
      sourceTailoringRunId: options?.sourceTailoringRunId ?? null,
      status: 'generating',
      instructions: options?.instructions ?? null,
      jobSnapshotJson: jobContext,
      baseSelectionJson: buildBaseSelectionRecord(selection, selectedBase, candidates.length),
      generationMetadataJson: buildGenerationMetadata(application, 0, options?.sourceTailoringRunId),
    },
  });

  try {
    const draft = buildTailoredResumeDraft(jobContext, selectedBase);
    draft.contentMarkdown = renderResumeDocument(draft.title, draft.document);

    const fitAssessment = buildFitAssessment(jobContext, draft);
    const generationMetadata = buildGenerationMetadata(application, Date.now() - startedAt, options?.sourceTailoringRunId);

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
          fitAssessmentJson: fitAssessment,
          baseSelectionJson: buildBaseSelectionRecord(selection, selectedBase, candidates.length),
          rationaleJson: [...selection.reasons, ...draft.rationale],
          risksJson: draft.risks,
          changeSummaryJson: draft.changeSummary,
          generationMetadataJson: generationMetadata,
          failureCode: null,
          failureMessage: null,
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
          beforeState: { status: run.status },
          afterState: { status: updatedRun.status },
          payloadJson: {
            applicationId: application.id,
            inputResumeVersionId: selectedBase.id,
            outputResumeVersionId: tailoredResumeVersion.id,
            fitAssessment,
            baseSelection: buildBaseSelectionRecord(selection, selectedBase, candidates.length),
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
  } catch (error) {
    const failureMessage = error instanceof Error ? error.message : String(error);
    const failureDetails = {
      stage: 'heuristic_generation',
      actorLabel,
    };

    await prisma.$transaction(async (tx) => {
      await tx.tailoringRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          generationMetadataJson: buildGenerationMetadata(application, Date.now() - startedAt, options?.sourceTailoringRunId),
          failureCode: 'heuristic_generation_failed',
          failureMessage,
          failureDetailsJson: failureDetails,
          completedAt: new Date(),
        },
      });

      await tx.auditEvent.create({
        data: makeAuditEvent({
          entityType: 'tailoring_run',
          entityId: run.id,
          eventType: 'tailoring_run.failed',
          actorType: ActorType.agent,
          actorLabel,
          beforeState: { status: run.status },
          afterState: { status: 'failed' },
          payloadJson: {
            applicationId: application.id,
            failureCode: 'heuristic_generation_failed',
            failureMessage,
          },
        }),
      });
    });

    throw error;
  }
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

  const approvedResume = await prisma.resumeVersion.findUnique({
    where: { id: run.outputResumeVersionId },
    select: { id: true, title: true },
  });

  if (!approvedResume) {
    throw new Error(`Approved resume version not found: ${run.outputResumeVersionId}`);
  }

  const artifactFilename = buildResumeArtifactFilename(approvedResume.title);
  const artifactPath = buildResumeArtifactPath(approvedResume.id);

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

    await tx.applicationAttachment.deleteMany({
      where: {
        applicationId: application.id,
        attachmentType: 'resume',
      },
    });

    await tx.applicationAttachment.create({
      data: {
        applicationId: application.id,
        attachmentType: 'resume',
        resumeVersionId: approvedResume.id,
        filename: artifactFilename,
        fileUrl: artifactPath,
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
        makeAuditEvent({
          entityType: 'application',
          entityId: application.id,
          eventType: 'application.resume_attachment_generated',
          actorType: ActorType.system,
          actorLabel: 'needle',
          payloadJson: {
            resumeVersionId: approvedResume.id,
            filename: artifactFilename,
            fileUrl: artifactPath,
          },
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
    sourceTailoringRunId: run.id,
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

    if (
      latestRun &&
      latestRun.status !== 'approved' &&
      latestRun.status !== 'paused' &&
      latestRun.status !== 'rejected' &&
      latestRun.status !== 'failed'
    ) {
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

    if (
      latestRun &&
      latestRun.status !== 'approved' &&
      latestRun.status !== 'paused' &&
      latestRun.status !== 'rejected' &&
      latestRun.status !== 'failed'
    ) {
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
