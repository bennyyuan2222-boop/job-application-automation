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
  type TailoringQaMetadata,
  type TailoringRunStatus,
} from '@job-ops/domain';
import {
  analyzeResumeDensity,
  buildDensityBaselineProfile,
  buildResumeArtifactFilename,
  buildTailoredResumeDraft,
  chooseBestBaseResume,
  coerceResumeDocument,
  extractJobKeywords,
  renderResumeDocument,
  renderResumePdfDetailed,
  shouldRetryForDensity,
  type BaseResumeSelection,
  type DensityAssessment,
  type DensityBaselineProfile,
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

const DENSITY_BASELINE_RESUME_VERSION_ID = process.env.NEEDLE_DENSITY_BASELINE_RESUME_VERSION_ID?.trim() || null;
let densityBaselineCache: { resumeVersionId: string; profile: DensityBaselineProfile } | null = null;

type GeneratedDraftCandidate = {
  attemptIndex: number;
  selectedBase: ResumeCandidate;
  baseSelectionRecord: TailoringBaseSelectionRecord;
  fitAssessment: TailoringFitAssessment;
  rationale: string[];
  risks: TailoredResumeDraft['risks'];
  changeSummary: string[];
  generatedTitle: string;
  generatedMarkdown: string;
  generatedDocument: ResumeCandidate['document'];
  generationMetadata: TailoringGenerationMetadata;
  densityAssessment: DensityAssessment | null;
};

function getDensityBaselineProfile(candidates: ResumeCandidate[]): DensityBaselineProfile | null {
  if (!DENSITY_BASELINE_RESUME_VERSION_ID) {
    return null;
  }

  if (densityBaselineCache?.resumeVersionId === DENSITY_BASELINE_RESUME_VERSION_ID) {
    return densityBaselineCache.profile;
  }

  const baselineResume = candidates.find((candidate) => candidate.id === DENSITY_BASELINE_RESUME_VERSION_ID);
  if (!baselineResume) {
    return null;
  }

  try {
    const baselineProfile = buildDensityBaselineProfile(
      renderResumePdfDetailed(baselineResume.title, baselineResume.document).layoutMetrics,
    );
    densityBaselineCache = {
      resumeVersionId: baselineResume.id,
      profile: baselineProfile,
    };
    return baselineProfile;
  } catch {
    return null;
  }
}

function assessCandidateDensity(
  candidate: Omit<GeneratedDraftCandidate, 'densityAssessment'>,
  baselineProfile: DensityBaselineProfile | null,
): GeneratedDraftCandidate {
  if (!baselineProfile) {
    return {
      ...candidate,
      densityAssessment: null,
    };
  }

  try {
    const layoutMetrics = renderResumePdfDetailed(candidate.generatedTitle, candidate.generatedDocument).layoutMetrics;
    return {
      ...candidate,
      densityAssessment: analyzeResumeDensity(layoutMetrics, baselineProfile),
    };
  } catch {
    return {
      ...candidate,
      densityAssessment: null,
    };
  }
}

function getSupportingTruthSources(selectedBase: ResumeCandidate, candidates: ResumeCandidate[]) {
  const selectedLane = selectedBase.document.meta?.lane?.trim().toLowerCase() || null;
  if (!selectedLane) {
    return [];
  }

  return candidates.filter(
    (candidate) =>
      candidate.id !== selectedBase.id &&
      (candidate.document.meta?.lane?.trim().toLowerCase() || null) === selectedLane,
  );
}

function fitVerdictRank(verdict: TailoringFitAssessment['verdict']) {
  switch (verdict) {
    case 'strong_match':
      return 3;
    case 'viable':
      return 2;
    case 'stretch':
      return 1;
    default:
      return 0;
  }
}

function riskSeverityScore(risks: TailoredResumeDraft['risks']) {
  return risks.reduce((total, risk) => {
    if (risk.severity === 'high') return total + 3;
    if (risk.severity === 'medium') return total + 2;
    return total + 1;
  }, 0);
}

function fitDropIsMinor(base: GeneratedDraftCandidate, candidate: GeneratedDraftCandidate) {
  return fitVerdictRank(base.fitAssessment.verdict) - fitVerdictRank(candidate.fitAssessment.verdict) <= 1;
}

function risksMateriallyWorsened(base: GeneratedDraftCandidate, candidate: GeneratedDraftCandidate) {
  const highRiskDelta = candidate.risks.filter((risk) => risk.severity === 'high').length -
    base.risks.filter((risk) => risk.severity === 'high').length;
  if (highRiskDelta > 0) {
    return true;
  }

  return riskSeverityScore(candidate.risks) - riskSeverityScore(base.risks) > 2;
}

function chooseBestDensityCandidate(candidates: GeneratedDraftCandidate[]): GeneratedDraftCandidate {
  const [firstCandidate, ...rest] = candidates;
  if (!firstCandidate) {
    throw new Error('No generated candidates available for density selection');
  }

  let bestCandidate = firstCandidate;

  for (const candidate of rest) {
    const candidateScore = candidate.densityAssessment?.score ?? -1;
    const bestScore = bestCandidate.densityAssessment?.score ?? -1;
    if (candidateScore <= bestScore) {
      continue;
    }
    if (!fitDropIsMinor(firstCandidate, candidate)) {
      continue;
    }
    if (risksMateriallyWorsened(firstCandidate, candidate)) {
      continue;
    }
    bestCandidate = candidate;
  }

  return bestCandidate;
}

function buildQaMetadata(args: {
  attempts: number;
  selectedAttemptIndex: number;
  assessment: DensityAssessment | null;
}): TailoringQaMetadata | null {
  if (!args.assessment) {
    return null;
  }

  return {
    status: args.assessment.status === 'pass' ? 'pass' : 'accepted_with_warning',
    attempts: args.attempts,
    selectedAttemptIndex: args.selectedAttemptIndex,
    densityScore: args.assessment.score,
    reasons: args.assessment.reasons,
    metricsSummary: args.assessment.summary,
  };
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
    const densityBaselineProfile = getDensityBaselineProfile(candidates);
    const generatedCandidates: GeneratedDraftCandidate[] = [];
    let qaMetadata: TailoringQaMetadata | null = null;
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

      const initialAgentResult = await requestTailoringFromNeedleAgent({
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

      const initialSelectedBase = candidates.find(
        (candidate) => candidate.id === initialAgentResult.response.baseSelection.selectedResumeVersionId,
      );
      if (!initialSelectedBase) {
        throw new Error(`Needle selected unknown base resume: ${initialAgentResult.response.baseSelection.selectedResumeVersionId}`);
      }

      const initialBaseSelectionRecord: TailoringBaseSelectionRecord = {
        selectedResumeVersionId: initialSelectedBase.id,
        selectedResumeTitle:
          initialAgentResult.response.baseSelection.selectedResumeTitle.trim() || initialSelectedBase.title,
        ...(initialAgentResult.response.baseSelection.lane
          ? { lane: initialAgentResult.response.baseSelection.lane }
          : initialSelectedBase.document.meta?.lane
            ? { lane: initialSelectedBase.document.meta.lane }
            : {}),
        ...(typeof initialAgentResult.response.baseSelection.score === 'number'
          ? { score: initialAgentResult.response.baseSelection.score }
          : {}),
        reasons: initialAgentResult.response.baseSelection.reasons,
        candidateCount: candidates.length,
      };
      const initialGeneratedMarkdown = initialAgentResult.response.draft.contentMarkdown.trim();
      if (!initialGeneratedMarkdown) {
        throw new NeedleAgentError('needle_agent_empty_markdown', 'Needle returned an empty markdown draft', {
          sessionKey,
          applicationId: application.id,
        });
      }

      const initialCandidate = assessCandidateDensity(
        {
          attemptIndex: 0,
          selectedBase: initialSelectedBase,
          baseSelectionRecord: initialBaseSelectionRecord,
          fitAssessment: initialAgentResult.response.fitAssessment,
          rationale: dedupeStrings([
            ...initialAgentResult.response.baseSelection.reasons,
            ...initialAgentResult.response.draft.rationale,
          ]),
          risks: initialAgentResult.response.draft.risks,
          changeSummary: initialAgentResult.response.draft.changeSummary,
          generatedTitle: initialAgentResult.response.draft.title.trim() || `${jobContext.title} Resume`,
          generatedMarkdown: initialGeneratedMarkdown,
          generatedDocument: coerceResumeDocument(undefined, initialGeneratedMarkdown),
          generationMetadata: buildAgentGenerationMetadata({
            strategyVersion: initialAgentResult.response.generation.strategyVersion,
            promptVersion: initialAgentResult.response.generation.promptVersion ?? undefined,
            modelId: initialAgentResult.response.generation.modelId ?? undefined,
            provider: initialAgentResult.response.generation.provider ?? 'openclaw',
            latencyMs: Date.now() - startedAt,
            sessionKey,
            sourceTailoringRunId: options?.sourceTailoringRunId,
          }),
        },
        densityBaselineProfile,
      );
      generatedCandidates.push(initialCandidate);

      if (initialCandidate.densityAssessment && shouldRetryForDensity(initialCandidate.densityAssessment)) {
        const supportingTruthSources = getSupportingTruthSources(initialSelectedBase, candidates);
        const retryAgentResult = await requestTailoringFromNeedleAgent({
          sessionKey,
          applicationId: application.id,
          applicationStatus: application.status,
          job: jobContext,
          instructions: options?.instructions,
          sourceTailoringRunId: options?.sourceTailoringRunId ?? null,
          priorRuns: mapPriorRunsForNeedle(application),
          baseResumeCandidates: [initialSelectedBase],
          supportingTruthSources,
          provisionalBaseHint: {
            selectedResumeVersionId: initialSelectedBase.id,
            selectedResumeTitle: initialBaseSelectionRecord.selectedResumeTitle,
            reasons: initialBaseSelectionRecord.reasons,
            lane: initialBaseSelectionRecord.lane ?? null,
          },
          densityRevision: {
            previousDraftMarkdown: initialCandidate.generatedMarkdown,
            lockedBaseSelection: {
              selectedResumeVersionId: initialSelectedBase.id,
              selectedResumeTitle: initialBaseSelectionRecord.selectedResumeTitle,
              lane: initialBaseSelectionRecord.lane ?? null,
            },
            assessment: initialCandidate.densityAssessment,
          },
        });

        const retrySelectedBase = candidates.find(
          (candidate) => candidate.id === retryAgentResult.response.baseSelection.selectedResumeVersionId,
        );
        if (!retrySelectedBase) {
          throw new Error(`Needle selected unknown retry base resume: ${retryAgentResult.response.baseSelection.selectedResumeVersionId}`);
        }

        const retryGeneratedMarkdown = retryAgentResult.response.draft.contentMarkdown.trim();
        if (!retryGeneratedMarkdown) {
          throw new NeedleAgentError('needle_agent_empty_markdown', 'Needle returned an empty markdown draft on density retry', {
            sessionKey,
            applicationId: application.id,
          });
        }

        generatedCandidates.push(
          assessCandidateDensity(
            {
              attemptIndex: 1,
              selectedBase: retrySelectedBase,
              baseSelectionRecord: {
                selectedResumeVersionId: retrySelectedBase.id,
                selectedResumeTitle:
                  retryAgentResult.response.baseSelection.selectedResumeTitle.trim() || retrySelectedBase.title,
                ...(retryAgentResult.response.baseSelection.lane
                  ? { lane: retryAgentResult.response.baseSelection.lane }
                  : retrySelectedBase.document.meta?.lane
                    ? { lane: retrySelectedBase.document.meta.lane }
                    : {}),
                ...(typeof retryAgentResult.response.baseSelection.score === 'number'
                  ? { score: retryAgentResult.response.baseSelection.score }
                  : {}),
                reasons: retryAgentResult.response.baseSelection.reasons,
                candidateCount: 1,
              },
              fitAssessment: retryAgentResult.response.fitAssessment,
              rationale: dedupeStrings([
                ...retryAgentResult.response.baseSelection.reasons,
                ...retryAgentResult.response.draft.rationale,
              ]),
              risks: retryAgentResult.response.draft.risks,
              changeSummary: retryAgentResult.response.draft.changeSummary,
              generatedTitle: retryAgentResult.response.draft.title.trim() || `${jobContext.title} Resume`,
              generatedMarkdown: retryGeneratedMarkdown,
              generatedDocument: coerceResumeDocument(undefined, retryGeneratedMarkdown),
              generationMetadata: buildAgentGenerationMetadata({
                strategyVersion: retryAgentResult.response.generation.strategyVersion,
                promptVersion: retryAgentResult.response.generation.promptVersion ?? undefined,
                modelId: retryAgentResult.response.generation.modelId ?? undefined,
                provider: retryAgentResult.response.generation.provider ?? 'openclaw',
                latencyMs: Date.now() - startedAt,
                sessionKey,
                sourceTailoringRunId: options?.sourceTailoringRunId,
              }),
            },
            densityBaselineProfile,
          ),
        );
      }
    } else {
      const draft = buildTailoredResumeDraft(jobContext, heuristicBase);
      draft.contentMarkdown = renderResumeDocument(draft.title, draft.document);
      generatedCandidates.push(
        assessCandidateDensity(
          {
            attemptIndex: 0,
            selectedBase: heuristicBase,
            baseSelectionRecord: heuristicBaseSelectionRecord,
            fitAssessment: buildFitAssessment(jobContext, draft),
            rationale: [...heuristicSelection.reasons, ...draft.rationale],
            risks: draft.risks,
            changeSummary: draft.changeSummary,
            generatedTitle: draft.title,
            generatedMarkdown: draft.contentMarkdown,
            generatedDocument: draft.document,
            generationMetadata: buildHeuristicGenerationMetadata(
              application,
              Date.now() - startedAt,
              options?.sourceTailoringRunId,
            ),
          },
          densityBaselineProfile,
        ),
      );
    }

    const selectedCandidate = chooseBestDensityCandidate(generatedCandidates);
    qaMetadata = buildQaMetadata({
      attempts: generatedCandidates.length,
      selectedAttemptIndex: selectedCandidate.attemptIndex,
      assessment: selectedCandidate.densityAssessment,
    });

    selectedBase = selectedCandidate.selectedBase;
    baseSelectionRecord = selectedCandidate.baseSelectionRecord;
    fitAssessment = selectedCandidate.fitAssessment;
    rationale = selectedCandidate.rationale;
    risks = selectedCandidate.risks;
    changeSummary = selectedCandidate.changeSummary;
    generatedTitle = selectedCandidate.generatedTitle;
    generatedMarkdown = selectedCandidate.generatedMarkdown;
    generatedDocument = selectedCandidate.generatedDocument;
    generationMetadata = selectedCandidate.generationMetadata;

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
          qaMetadataJson: qaMetadata ? toJsonValue(qaMetadata) : Prisma.JsonNull,
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
            qaMetadata,
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
