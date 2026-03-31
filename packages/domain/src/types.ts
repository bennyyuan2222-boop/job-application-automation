export const JOB_STATUSES = ['discovered', 'shortlisted', 'archived'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const APPLICATION_STATUSES = [
  'tailoring',
  'tailoring_review',
  'paused',
  'applying',
  'submit_review',
  'submitted',
  'archived',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const RESUME_VERSION_KINDS = ['base', 'tailored'] as const;
export type ResumeVersionKind = (typeof RESUME_VERSION_KINDS)[number];

export const ACTOR_TYPES = ['user', 'agent', 'system'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const WORK_MODES = ['remote', 'hybrid', 'onsite', 'unknown'] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const ANSWER_SOURCE_TYPES = ['manual', 'agent', 'resume', 'derived'] as const;
export type AnswerSourceType = (typeof ANSWER_SOURCE_TYPES)[number];

export const ANSWER_REVIEW_STATES = ['accepted', 'needs_review', 'blocked'] as const;
export type AnswerReviewState = (typeof ANSWER_REVIEW_STATES)[number];

export const PORTAL_SESSION_MODES = ['manual', 'automation', 'hybrid'] as const;
export type PortalSessionMode = (typeof PORTAL_SESSION_MODES)[number];

export const PORTAL_SESSION_STATUSES = [
  'not_started',
  'in_progress',
  'ready_for_review',
  'submitted',
  'abandoned',
] as const;
export type PortalSessionStatus = (typeof PORTAL_SESSION_STATUSES)[number];

export const TAILORING_RUN_STATUSES = [
  'created',
  'generating',
  'generated_for_review',
  'edits_requested',
  'approved',
  'rejected',
  'paused',
  'failed',
] as const;
export type TailoringRunStatus = (typeof TAILORING_RUN_STATUSES)[number];

export const TAILORING_FIT_VERDICTS = ['strong_match', 'viable', 'stretch', 'weak'] as const;
export type TailoringFitVerdict = (typeof TAILORING_FIT_VERDICTS)[number];

export const TAILORING_PROCEED_RECOMMENDATIONS = [
  'proceed',
  'proceed_with_caution',
  'revise',
  'pause',
] as const;
export type TailoringProceedRecommendation = (typeof TAILORING_PROCEED_RECOMMENDATIONS)[number];

export const TAILORING_GENERATION_MODES = ['heuristic', 'agent', 'hybrid'] as const;
export type TailoringGenerationMode = (typeof TAILORING_GENERATION_MODES)[number];

export const RESUME_SECTION_KINDS = [
  'summary',
  'education',
  'skills',
  'experience',
  'projects',
  'leadership',
] as const;
export type ResumeSectionKind = (typeof RESUME_SECTION_KINDS)[number];

export type ResumeEntry = {
  id: string;
  heading?: string;
  subheading?: string;
  location?: string;
  dateRange?: string;
  bullets?: string[];
  lines?: string[];
};

export type ResumeSection = {
  id: string;
  kind: ResumeSectionKind;
  title: string;
  entries: ResumeEntry[];
};

export type ResumeDocument = {
  meta?: {
    displayName?: string;
    lane?: string;
    source?: string;
    summary?: string;
    keywords?: string[];
    headerLines?: string[];
  };
  sections: ResumeSection[];
};

export type TailoringRisk = {
  requirement: string;
  severity: 'low' | 'medium' | 'high';
  reason: string;
};

export type TailoringFitAssessment = {
  summary: string;
  verdict: TailoringFitVerdict;
  matchedStrengths: string[];
  likelyGaps: string[];
  riskNotes: string[];
  proceedRecommendation: TailoringProceedRecommendation;
};

export type TailoringBaseSelectionRecord = {
  selectedResumeVersionId: string;
  selectedResumeTitle: string;
  lane?: string | null;
  score?: number | null;
  reasons: string[];
  candidateCount?: number | null;
};

export type TailoringGenerationMetadata = {
  strategyVersion: string;
  promptVersion?: string | null;
  modelId?: string | null;
  provider?: string | null;
  executionMode: TailoringGenerationMode;
  latencyMs?: number | null;
  costUsd?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  sessionKey?: string | null;
  sourceTailoringRunId?: string | null;
};
