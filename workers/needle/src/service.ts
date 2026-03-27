import {
  ActorType,
  ApplicationStatus,
  Prisma,
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

import {
  NeedleAgentError,
  ensureNeedleApplicationSession,
  requestTailoringFromNeedleAgent,
  type NeedlePriorRunContext,
} from './agent';

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
        include: {
          outputResumeVersion: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
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

type GenerateTailoringDraftOptions = {
  instructions?: string;
  actorLabel?: string;
  sourceTailoringRunId?: string;
};

type TailoringDraftRuntimeMode = 'agent' | 'heuristic';

function assertTailoringDraftRuntimeModeAllowed(mode: TailoringDraftRuntimeMode) {
  if (mode === 'heuristic' && process.env.NODE_ENV === 'production') {
    throw new Error('Heuristic tailoring generation is dev/test-only and cannot run in production.');
  }
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function mapPriorRunsForNeedle(
  application: Awaited<ReturnType<typeof loadApplicationContext>>,
): NeedlePriorRunContext[] {
  return application.tailoringRuns.map((run) => ({
    id: run.id,
    status: run.status,
    createdAt: run.createdAt.toISOString(),
    completedAt: run.completedAt ? run.completedAt.toISOString() : null,
    sourceTailoringRunId: run.sourceTailoringRunId,
    revisionNote: run.revisionNote,
    instructions: run.instructions,
    fitAssessment: (run.fitAssessmentJson as NeedlePriorRunContext['fitAssessment']) ?? null,
    baseSelection: (run.baseSelectionJson as NeedlePriorRunContext['baseSelection']) ?? null,
    rationale: Array.isArray(run.rationaleJson) ? (run.rationaleJson as string[]) : [],
    changeSummary: Array.isArray(run.changeSummaryJson) ? (run.changeSummaryJson as string[]) : [],
    risks: Array.isArray(run.risksJson) ? (run.risksJson as NeedlePriorRunContext['risks']) : [],
    outputResumeVersionId: run.outputResumeVersionId,
    outputResumeTitle: run.outputResumeVersion?.title ?? null,
    outputResumeMarkdown: run.outputResumeVersion?.contentMarkdown ?? null,
  }));
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

function buildHeuristicGenerationMetadata(
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

function buildAgentGenerationMetadata(args: {
  strategyVersion: string;
  promptVersion?: string | null;
  modelId?: string | null;
  provider?: string | null;
  latencyMs: number;
  sessionKey?: string | null;
  sourceTailoringRunId?: string;
}): TailoringGenerationMetadata {
  return {
    strategyVersion: args.strategyVersion,
    ...(args.promptVersion ? { promptVersion: args.promptVersion } : {}),
    ...(args.modelId ? { modelId: args.modelId } : {}),
    ...(args.provider ? { provider: args.provider } : {}),
    executionMode: 'agent',
    latencyMs: args.latencyMs,
    ...(args.sessionKey ? { sessionKey: args.sessionKey } : {}),
    ...(args.sourceTailoringRunId ? { sourceTailoringRunId: args.sourceTailoringRunId } : {}),
  };
}

function describeGenerationFailure(error: unknown, generationMode: 'agent' | 'heuristic') {
  if (generationMode === 'agent' && error instanceof NeedleAgentError) {
    return {
      failureCode: error.code,
      failureMessage: error.message,
      failureDetails: error.details ?? null,
    };
  }

  return {
    failureCode: generationMode === 'agent' ? 'needle_agent_failed' : 'heuristic_generation_failed',
    failureMessage: error instanceof Error ? error.message : String(error),
    failureDetails: null,
  };
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function generateTailoringDraftForApplication(
  applicationId: string,
  options?: GenerateTailoringDraftOptions,
) {
  return generateTailoringDraftForApplicationWithMode(applicationId, options, 'agent');
}

export async function generateTailoringDraftForApplicationHeuristicDevOnly(
  applicationId: string,
  options?: GenerateTailoringDraftOptions,
) {
  return generateTailoringDraftForApplicationWithMode(applicationId, options, 'heuristic');
}

async function generateTailoringDraftForApplicationWithMode(
  applicationId: string,
  options: GenerateTailoringDraftOptions | undefined,
  generationMode: TailoringDraftRuntimeMode,
) {
  assertTailoringDraftRuntimeModeAllowed(generationMode);
  const actorLabel = options?.actorLabel ?? 'needle';
  const startedAt = Date.now();
  const application = await loadApplicationContext(applicationId);
  const candidates = await loadBaseResumeCandidates();
  if (candidates.length === 0) {
    throw new Error('No base resume versions available');
  }

  const jobContext = buildJobContext(application);
  const heuristicSelection = chooseBestBaseResume(jobContext, candidates);
  const heuristicBase = candidates.find((candidate) => candidate.id === heuristicSelection.resumeVersionId);
  if (!heuristicBase) {
    throw new Error(`Selected base resume not found: ${heuristicSelection.resumeVersionId}`);
  }
  const heuristicBaseSelectionRecord = buildBaseSelectionRecord(heuristicSelection, heuristicBase, candidates.length);
  const initialInputResumeVersionId =
    generationMode === 'agent' ? application.baseResumeVersionId : heuristicBase.id;

  const shouldMoveToReview = application.status !== ApplicationStatus.tailoring_review;
  if (shouldMoveToReview) {
    assertApplicationTransition(application.status as DomainApplicationStatus, ApplicationStatus.tailoring_review as DomainApplicationStatus);
  }

  const run = await prisma.tailoringRun.create({
    data: {
      applicationId: application.id,
      inputResumeVersionId: initialInputResumeVersionId,
      sourceTailoringRunId: options?.sourceTailoringRunId ?? null,
      status: 'generating',
      instructions: options?.instructions ?? null,
      jobSnapshotJson: jobContext,
      ...(generationMode === 'heuristic' ? { baseSelectionJson: heuristicBaseSelectionRecord } : {}),
      generationMetadataJson:
        generationMode === 'agent'
          ? buildAgentGenerationMetadata({
              strategyVersion: 'needle-agent-phase3',
              provider: 'openclaw',
              latencyMs: 0,
              sessionKey: application.needleSessionKey,
              sourceTailoringRunId: options?.sourceTailoringRunId,
            })
          : buildHeuristicGenerationMetadata(application, 0, options?.sourceTailoringRunId),
    },
  });

  let sessionKeyForUpdate: string | null = application.needleSessionKey ?? null;

  try {
    let selectedBase = heuristicBase;
    let baseSelectionRecord = buildBaseSelectionRecord(heuristicSelection, heuristicBase, candidates.length);
    let fitAssessment: TailoringFitAssessment;
    let rationale: string[];
    let risks: TailoredResumeDraft['risks'];
    let changeSummary: string[];
    let generatedTitle: string;
    let generatedMarkdown: string;
    let generatedDocument: ReturnType<typeof coerceResumeDocument>;
    let generationMetadata: TailoringGenerationMetadata;

    if (generationMode === 'agent') {
      const sessionKey = await ensureNeedleApplicationSession({
        applicationId: application.id,
        existingSessionKey: application.needleSessionKey,
      });
      sessionKeyForUpdate = sessionKey;

      const agentResult = await requestTailoringFromNeedleAgent({
        sessionKey,
        applicationId: application.id,
        applicationStatus: application.status,
        job: jobContext,
        instructions: options?.instructions,
        sourceTailoringRunId: options?.sourceTailoringRunId ?? null,
        priorRuns: mapPriorRunsForNeedle(application),
        baseResumeCandidates: candidates,
        provisionalBaseHint: {
          selectedResumeVersionId: heuristicBase.id,
          selectedResumeTitle: heuristicBase.title,
          reasons: heuristicSelection.reasons,
          lane: heuristicSelection.lane ?? null,
        },
      });

      const agentSelectedBase = candidates.find(
        (candidate) => candidate.id === agentResult.response.baseSelection.selectedResumeVersionId,
      );
      if (!agentSelectedBase) {
        throw new Error(`Needle selected unknown base resume: ${agentResult.response.baseSelection.selectedResumeVersionId}`);
      }

      selectedBase = agentSelectedBase;
      baseSelectionRecord = {
        selectedResumeVersionId: agentSelectedBase.id,
        selectedResumeTitle:
          agentResult.response.baseSelection.selectedResumeTitle.trim() || agentSelectedBase.title,
        ...(agentResult.response.baseSelection.lane
          ? { lane: agentResult.response.baseSelection.lane }
          : agentSelectedBase.document.meta?.lane
            ? { lane: agentSelectedBase.document.meta.lane }
            : {}),
        ...(typeof agentResult.response.baseSelection.score === 'number'
          ? { score: agentResult.response.baseSelection.score }
          : {}),
        reasons: agentResult.response.baseSelection.reasons,
        candidateCount: candidates.length,
      };
      fitAssessment = agentResult.response.fitAssessment;
      rationale = dedupeStrings([
        ...agentResult.response.baseSelection.reasons,
        ...agentResult.response.draft.rationale,
      ]);
      risks = agentResult.response.draft.risks;
      changeSummary = agentResult.response.draft.changeSummary;
      generatedTitle = agentResult.response.draft.title.trim() || `${jobContext.title} Resume`;
      generatedMarkdown = agentResult.response.draft.contentMarkdown.trim();
      if (!generatedMarkdown) {
        throw new NeedleAgentError('needle_agent_empty_markdown', 'Needle returned an empty markdown draft', {
          sessionKey,
          applicationId: application.id,
        });
      }
      generatedDocument = coerceResumeDocument(undefined, generatedMarkdown);
      generationMetadata = buildAgentGenerationMetadata({
        strategyVersion: agentResult.response.generation.strategyVersion,
        promptVersion: agentResult.response.generation.promptVersion ?? undefined,
        modelId: agentResult.response.generation.modelId ?? undefined,
        provider: agentResult.response.generation.provider ?? 'openclaw',
        latencyMs: Date.now() - startedAt,
        sessionKey,
        sourceTailoringRunId: options?.sourceTailoringRunId,
      });
    } else {
      const draft = buildTailoredResumeDraft(jobContext, heuristicBase);
      draft.contentMarkdown = renderResumeDocument(draft.title, draft.document);
      fitAssessment = buildFitAssessment(jobContext, draft);
      rationale = [...heuristicSelection.reasons, ...draft.rationale];
      risks = draft.risks;
      changeSummary = draft.changeSummary;
      generatedTitle = draft.title;
      generatedMarkdown = draft.contentMarkdown;
      generatedDocument = draft.document;
      generationMetadata = buildHeuristicGenerationMetadata(
        application,
        Date.now() - startedAt,
        options?.sourceTailoringRunId,
      );
    }

    const resultingApplicationStatus = shouldMoveToReview
      ? ApplicationStatus.tailoring_review
      : application.status;

    const result = await prisma.$transaction(async (tx) => {
      const beforeBaseResumeVersionId = application.baseResumeVersionId;
      const applicationUpdateData: any = {};
      if (beforeBaseResumeVersionId !== selectedBase.id) {
        applicationUpdateData.baseResumeVersionId = selectedBase.id;
      }
      if (generationMode === 'agent' && sessionKeyForUpdate) {
        applicationUpdateData.needleSessionKey = sessionKeyForUpdate;
        applicationUpdateData.needleSessionUpdatedAt = new Date();
      }
      if (shouldMoveToReview) {
        applicationUpdateData.status = ApplicationStatus.tailoring_review;
        applicationUpdateData.pausedReason = null;
      }

      if (Object.keys(applicationUpdateData).length > 0) {
        await tx.application.update({
          where: { id: application.id },
          data: applicationUpdateData,
        });
      }

      const tailoredResumeVersion = await tx.resumeVersion.create({
        data: {
          kind: ResumeVersionKind.tailored,
          parentResumeVersionId: selectedBase.id,
          title: generatedTitle,
          contentMarkdown: generatedMarkdown,
          sectionsJson: generatedDocument,
          changeSummaryJson: changeSummary,
          createdByType: ResumeCreatedByType.agent,
        },
      });

      const updatedRun = await tx.tailoringRun.update({
        where: { id: run.id },
        data: {
          inputResumeVersionId: selectedBase.id,
          outputResumeVersionId: tailoredResumeVersion.id,
          status: 'generated_for_review',
          fitAssessmentJson: fitAssessment,
          baseSelectionJson: baseSelectionRecord,
          rationaleJson: rationale,
          risksJson: risks,
          changeSummaryJson: changeSummary,
          generationMetadataJson: generationMetadata,
          failureCode: null,
          failureMessage: null,
          completedAt: new Date(),
        },
      });

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
              reasons: baseSelectionRecord.reasons,
              lane: 'lane' in baseSelectionRecord ? baseSelectionRecord.lane ?? null : null,
              mode: generationMode,
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
            baseSelection: baseSelectionRecord,
            changeSummary,
            risks,
            generationMetadata,
            mode: generationMode,
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
            afterState: { status: resultingApplicationStatus },
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
    const failure = describeGenerationFailure(error, generationMode);
    const failureDetails = toJsonValue({
      stage: generationMode === 'agent' ? 'needle_agent_generation' : 'heuristic_generation',
      actorLabel,
      sessionKey: sessionKeyForUpdate,
      mode: generationMode,
      ...(failure.failureDetails ? { detail: failure.failureDetails } : {}),
    });

    await prisma.$transaction(async (tx) => {
      if (generationMode === 'agent' && sessionKeyForUpdate) {
        await tx.application.update({
          where: { id: application.id },
          data: {
            needleSessionKey: sessionKeyForUpdate,
            needleSessionUpdatedAt: new Date(),
          },
        });
      }

      await tx.tailoringRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          generationMetadataJson:
            generationMode === 'agent'
              ? buildAgentGenerationMetadata({
                  strategyVersion: 'needle-agent-phase3',
                  provider: 'openclaw',
                  latencyMs: Date.now() - startedAt,
                  sessionKey: sessionKeyForUpdate,
                  sourceTailoringRunId: options?.sourceTailoringRunId,
                })
              : buildHeuristicGenerationMetadata(application, Date.now() - startedAt, options?.sourceTailoringRunId),
          failureCode: failure.failureCode,
          failureMessage: failure.failureMessage,
          failureDetailsJson: failureDetails ?? Prisma.JsonNull,
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
            failureCode: failure.failureCode,
            failureMessage: failure.failureMessage,
            mode: generationMode,
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

  const artifactFilename = buildResumeArtifactFilename(approvedResume.title, 'pdf');
  const artifactPath = buildResumeArtifactPath(approvedResume.id);

  await prisma.$transaction(async (tx) => {
    await tx.tailoringRun.update({
      where: { id: run.id },
      data: { status: 'approved' },
    });

    await tx.resumeVersion.update({
      where: { id: approvedResume.id },
      data: {
        renderedPdfUrl: artifactPath,
      },
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
