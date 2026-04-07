import { z } from 'zod';

export const latchContractVersionSchema = z.literal('latch-application-ops-v1');
export const latchLaneNameSchema = z.literal('Latch');
export const latchAgentRuntimeSchema = z.literal('openclaw_agent');
export const latchAgentIdSchema = z.literal('application-ops');
export const latchTaskIntentSchema = z.enum(['prepare_application_workspace']);
export const latchTaskStatusSchema = z.enum(['completed', 'blocked', 'failed']);

export const latchActorTypeSchema = z.enum(['user', 'agent', 'system']);
export const latchApplicationStatusSchema = z.enum([
  'tailoring',
  'tailoring_review',
  'paused',
  'applying',
  'submit_review',
  'submitted',
  'archived',
]);

export const latchAnswerSourceTypeSchema = z.enum([
  'manual',
  'agent',
  'resume',
  'profile',
  'derived',
  'portal_detected',
]);
export const latchAnswerReviewStateSchema = z.enum(['accepted', 'needs_review', 'blocked']);
export const latchAnswerConfidenceBandSchema = z.enum(['unknown', 'low', 'medium', 'high']);

export const latchPortalSessionModeSchema = z.enum(['manual', 'automation', 'hybrid']);
export const latchPortalSessionStatusSchema = z.enum([
  'not_started',
  'in_progress',
  'ready_for_review',
  'submitted',
  'abandoned',
]);

export const latchReadinessIssueLevelSchema = z.enum(['info', 'warning', 'blocker']);
export const latchReadinessIssueCodeSchema = z.enum([
  'tailored_resume_missing',
  'resume_attachment_missing',
  'resume_attachment_mismatch',
  'required_answers_missing',
  'blocked_answers_present',
  'answers_pending_review',
  'low_confidence_answers_present',
  'portal_session_missing',
  'portal_session_not_ready',
]);

export const latchFailureCodeSchema = z.enum([
  'needle_handoff_missing',
  'application_not_in_applying',
  'tailored_resume_missing',
  'resume_attachment_mismatch',
  'required_answers_missing',
  'blocked_answers_present',
  'policy_violation_browser_fill_not_allowed',
  'invalid_latch_contract',
  'internal_error',
]);

export const latchAgentBoundarySchema = z.object({
  runtime: latchAgentRuntimeSchema,
  agentId: latchAgentIdSchema,
});

export const latchReviewPolicySchema = z.object({
  lane: latchLaneNameSchema,
  firstTaskIntent: z.literal('prepare_application_workspace'),
  inferredAnswersDefaultReviewState: z.literal('needs_review'),
  inferredAnswersRequireHumanReview: z.literal(true),
  allowReusableProfileAnswers: z.literal(true),
  liveBrowserFillAllowed: z.literal(false),
  humanFinalReviewRequired: z.literal(true),
  humanFinalSubmitRequired: z.literal(true),
});

export const latchAnswerConfidenceSemanticsSchema = z.object({
  scale: z.literal('0_to_1'),
  bands: z.object({
    unknown: z.object({
      description: z.string(),
    }),
    low: z.object({
      minInclusive: z.number().min(0).max(1),
      maxExclusive: z.number().min(0).max(1),
      description: z.string(),
    }),
    medium: z.object({
      minInclusive: z.number().min(0).max(1),
      maxExclusive: z.number().min(0).max(1),
      description: z.string(),
    }),
    high: z.object({
      minInclusive: z.number().min(0).max(1),
      maxInclusive: z.number().min(0).max(1),
      description: z.string(),
    }),
  }),
  defaultInferredReviewState: z.literal('needs_review'),
  notes: z.array(z.string()).default([]),
});

export const latchActorRefSchema = z.object({
  actorType: latchActorTypeSchema,
  actorLabel: z.string(),
});

export const latchNeedleApprovedHandoffSchema = z.object({
  source: z.literal('needle_approved_handoff'),
  approvedTailoringRunId: z.string(),
  tailoredResumeVersionId: z.string(),
  approvedAt: z.string(),
  approvedBy: latchActorRefSchema,
  transition: z.object({
    fromStatus: z.literal('tailoring_review'),
    toStatus: z.literal('applying'),
  }),
});

export const latchAnswerProvenanceSchema = z.object({
  sourceType: latchAnswerSourceTypeSchema,
  sourceId: z.string().nullable().optional(),
  sourceLabel: z.string().nullable().optional(),
  sourceFieldKey: z.string().nullable().optional(),
  sourceArtifactId: z.string().nullable().optional(),
  sourceArtifactKind: z.string().nullable().optional(),
  capturedAt: z.string().nullable().optional(),
  evidence: z.array(z.string()).default([]),
  rationale: z.array(z.string()).default([]),
});

export const latchPreparedAnswerSchema = z.object({
  fieldKey: z.string(),
  fieldLabel: z.string(),
  fieldGroup: z.string().nullable().optional(),
  value: z.unknown().nullable().optional(),
  required: z.boolean(),
  sourceType: latchAnswerSourceTypeSchema,
  reviewState: latchAnswerReviewStateSchema,
  confidence: z.number().min(0).max(1).nullable().optional(),
  confidenceBand: latchAnswerConfidenceBandSchema,
  provenance: z.array(latchAnswerProvenanceSchema).default([]),
  notes: z.array(z.string()).default([]),
});

export const latchReadinessIssueSchema = z.object({
  code: latchReadinessIssueCodeSchema,
  level: latchReadinessIssueLevelSchema,
  message: z.string(),
  count: z.number().int().positive().optional(),
});

export const latchReadinessSnapshotSchema = z.object({
  ready: z.boolean(),
  completionPercent: z.number().min(0).max(100),
  missingRequiredCount: z.number().int().nonnegative(),
  answersPendingReviewCount: z.number().int().nonnegative(),
  lowConfidenceCount: z.number().int().nonnegative(),
  hardBlockers: z.array(latchReadinessIssueSchema).default([]),
  softWarnings: z.array(latchReadinessIssueSchema).default([]),
  recommendedNextAction: z.string(),
});

export const latchTaskRequestSchema = z.object({
  contractVersion: latchContractVersionSchema,
  lane: latchLaneNameSchema,
  boundary: latchAgentBoundarySchema,
  intent: latchTaskIntentSchema,
  applicationId: z.string(),
  jobId: z.string(),
  applicationStatus: z.literal('applying'),
  handoff: latchNeedleApprovedHandoffSchema,
  policy: latchReviewPolicySchema,
  existingPortalContext: z
    .object({
      launchUrl: z.string().nullable().optional(),
      providerDomain: z.string().nullable().optional(),
      mode: latchPortalSessionModeSchema.nullable().optional(),
      status: latchPortalSessionStatusSchema.nullable().optional(),
    })
    .optional(),
});

export const latchAgentFailureSchema = z.object({
  code: latchFailureCodeSchema,
  message: z.string(),
  retryable: z.boolean(),
  details: z.record(z.unknown()).optional(),
});

export const latchAgentResponseSchema = z.object({
  contractVersion: latchContractVersionSchema,
  lane: latchLaneNameSchema,
  boundary: latchAgentBoundarySchema,
  intent: latchTaskIntentSchema,
  status: latchTaskStatusSchema,
  applicationId: z.string(),
  summary: z.string(),
  policy: latchReviewPolicySchema,
  confidenceSemantics: latchAnswerConfidenceSemanticsSchema,
  preparedAnswers: z.array(latchPreparedAnswerSchema).default([]),
  readiness: latchReadinessSnapshotSchema,
  selectedResumeVersionId: z.string().nullable(),
  attachedResumeVersionId: z.string().nullable(),
  portalTracking: z.object({
    tracked: z.boolean(),
    mode: latchPortalSessionModeSchema.nullable().optional(),
    status: latchPortalSessionStatusSchema.nullable().optional(),
  }),
  audit: z.object({
    provenanceCaptured: z.boolean(),
    emittedEventTypes: z.array(z.string()).default([]),
  }),
  browserAutomation: z.object({
    attempted: z.literal(false),
    reason: z.literal('out_of_scope_for_milestone_3'),
  }),
  humanBoundary: z.object({
    finalReviewRequired: z.literal(true),
    finalSubmitRequired: z.literal(true),
  }),
  failure: latchAgentFailureSchema.nullable().optional(),
});

export type LatchContractVersion = z.infer<typeof latchContractVersionSchema>;
export type LatchLaneName = z.infer<typeof latchLaneNameSchema>;
export type LatchAgentRuntime = z.infer<typeof latchAgentRuntimeSchema>;
export type LatchAgentId = z.infer<typeof latchAgentIdSchema>;
export type LatchTaskIntent = z.infer<typeof latchTaskIntentSchema>;
export type LatchTaskStatus = z.infer<typeof latchTaskStatusSchema>;
export type LatchActorType = z.infer<typeof latchActorTypeSchema>;
export type LatchApplicationStatus = z.infer<typeof latchApplicationStatusSchema>;
export type LatchAnswerSourceType = z.infer<typeof latchAnswerSourceTypeSchema>;
export type LatchAnswerReviewState = z.infer<typeof latchAnswerReviewStateSchema>;
export type LatchAnswerConfidenceBand = z.infer<typeof latchAnswerConfidenceBandSchema>;
export type LatchPortalSessionMode = z.infer<typeof latchPortalSessionModeSchema>;
export type LatchPortalSessionStatus = z.infer<typeof latchPortalSessionStatusSchema>;
export type LatchReadinessIssueLevel = z.infer<typeof latchReadinessIssueLevelSchema>;
export type LatchReadinessIssueCode = z.infer<typeof latchReadinessIssueCodeSchema>;
export type LatchFailureCode = z.infer<typeof latchFailureCodeSchema>;
export type LatchAgentBoundary = z.infer<typeof latchAgentBoundarySchema>;
export type LatchReviewPolicy = z.infer<typeof latchReviewPolicySchema>;
export type LatchAnswerConfidenceSemantics = z.infer<typeof latchAnswerConfidenceSemanticsSchema>;
export type LatchActorRef = z.infer<typeof latchActorRefSchema>;
export type LatchNeedleApprovedHandoff = z.infer<typeof latchNeedleApprovedHandoffSchema>;
export type LatchAnswerProvenance = z.infer<typeof latchAnswerProvenanceSchema>;
export type LatchPreparedAnswer = z.infer<typeof latchPreparedAnswerSchema>;
export type LatchReadinessIssue = z.infer<typeof latchReadinessIssueSchema>;
export type LatchReadinessSnapshot = z.infer<typeof latchReadinessSnapshotSchema>;
export type LatchTaskRequest = z.infer<typeof latchTaskRequestSchema>;
export type LatchAgentFailure = z.infer<typeof latchAgentFailureSchema>;
export type LatchAgentResponse = z.infer<typeof latchAgentResponseSchema>;

export const DEFAULT_LATCH_REVIEW_POLICY: LatchReviewPolicy = {
  lane: 'Latch',
  firstTaskIntent: 'prepare_application_workspace',
  inferredAnswersDefaultReviewState: 'needs_review',
  inferredAnswersRequireHumanReview: true,
  allowReusableProfileAnswers: true,
  liveBrowserFillAllowed: false,
  humanFinalReviewRequired: true,
  humanFinalSubmitRequired: true,
};

export const DEFAULT_LATCH_CONFIDENCE_SEMANTICS: LatchAnswerConfidenceSemantics = {
  scale: '0_to_1',
  bands: {
    unknown: {
      description: 'Confidence was not supplied or cannot be interpreted yet.',
    },
    low: {
      minInclusive: 0,
      maxExclusive: 0.5,
      description: 'Weak support. Human review is required and likely edits are needed.',
    },
    medium: {
      minInclusive: 0.5,
      maxExclusive: 0.8,
      description: 'Plausible draft support. Human review is still required before handoff.',
    },
    high: {
      minInclusive: 0.8,
      maxInclusive: 1,
      description: 'Strong support, but Milestone 3 still keeps inferred answers in needs_review by default.',
    },
  },
  defaultInferredReviewState: 'needs_review',
  notes: [
    'Confidence is advisory, not an auto-accept signal in Milestone 3.',
    'Inferred answers remain needs_review until a human or trusted explicit workflow accepts them.',
  ],
};
