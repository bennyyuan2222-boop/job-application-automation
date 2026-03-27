import { z } from 'zod';

export const provenanceSchema = z
  .object({
    sourceKey: z.string(),
    sourceUrl: z.string().nullable().optional(),
  })
  .nullable()
  .optional();

export const postingCheckStatusSchema = z.enum(['live', 'probably_live', 'uncertain', 'dead']);

export const postingCheckSummarySchema = z.object({
  id: z.string(),
  status: postingCheckStatusSchema,
  checkerType: z.string(),
  checkerLabel: z.string(),
  checkedAt: z.string(),
  originalUrl: z.string().nullable(),
  finalUrl: z.string().nullable(),
  replacementUrl: z.string().nullable(),
  sourceBoard: z.string().nullable(),
  evidence: z.array(z.string()).default([]),
  notes: z.string().nullable(),
});

export const jobListItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  companyName: z.string(),
  locationText: z.string(),
  status: z.string(),
  priorityScore: z.number().nullable().optional(),
  workMode: z.string().nullable().optional(),
  lastSeenAt: z.string().nullable().optional(),
  provenance: provenanceSchema,
  rationale: z.string().nullable().optional(),
  topReasons: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  latestPostingCheck: postingCheckSummarySchema.nullable().optional(),
  activeApplication: z
    .object({
      id: z.string(),
      status: z.string(),
    })
    .nullable()
    .optional(),
});

export const resumeEntrySchema = z.object({
  id: z.string(),
  heading: z.string().optional(),
  subheading: z.string().optional(),
  location: z.string().optional(),
  dateRange: z.string().optional(),
  bullets: z.array(z.string()).optional(),
  lines: z.array(z.string()).optional(),
});

export const resumeSectionSchema = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  entries: z.array(resumeEntrySchema),
});

export const resumeDocumentSchema = z.object({
  meta: z
    .object({
      lane: z.string().optional(),
      source: z.string().optional(),
      summary: z.string().optional(),
      keywords: z.array(z.string()).optional(),
      headerLines: z.array(z.string()).optional(),
    })
    .optional(),
  sections: z.array(resumeSectionSchema),
});

export const resumeVersionSummarySchema = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  createdAt: z.string(),
});

export const resumeVersionDetailSchema = resumeVersionSummarySchema.extend({
  contentMarkdown: z.string(),
  document: resumeDocumentSchema,
  changeSummary: z.array(z.string()).optional(),
});

export const tailoringRiskSchema = z.object({
  requirement: z.string(),
  severity: z.enum(['low', 'medium', 'high']),
  reason: z.string(),
});

export const tailoringFitAssessmentSchema = z.object({
  summary: z.string(),
  verdict: z.enum(['strong_match', 'viable', 'stretch', 'weak']),
  matchedStrengths: z.array(z.string()).default([]),
  likelyGaps: z.array(z.string()).default([]),
  riskNotes: z.array(z.string()).default([]),
  proceedRecommendation: z.enum(['proceed', 'proceed_with_caution', 'revise', 'pause']),
});

export const tailoringBaseSelectionSchema = z.object({
  selectedResumeVersionId: z.string(),
  selectedResumeTitle: z.string(),
  lane: z.string().nullable().optional(),
  score: z.number().nullable().optional(),
  reasons: z.array(z.string()).default([]),
  candidateCount: z.number().int().nullable().optional(),
});

export const tailoringGenerationMetadataSchema = z.object({
  strategyVersion: z.string(),
  promptVersion: z.string().nullable().optional(),
  modelId: z.string().nullable().optional(),
  provider: z.string().nullable().optional(),
  executionMode: z.enum(['heuristic', 'agent', 'hybrid']),
  latencyMs: z.number().int().nonnegative().nullable().optional(),
  costUsd: z.number().nonnegative().nullable().optional(),
  inputTokens: z.number().int().nonnegative().nullable().optional(),
  outputTokens: z.number().int().nonnegative().nullable().optional(),
  totalTokens: z.number().int().nonnegative().nullable().optional(),
  sessionKey: z.string().nullable().optional(),
  sourceTailoringRunId: z.string().nullable().optional(),
});

export const needleAgentDraftSchema = z.object({
  title: z.string(),
  contentMarkdown: z.string().min(1),
  changeSummary: z.array(z.string()).default([]),
  rationale: z.array(z.string()).default([]),
  risks: z.array(tailoringRiskSchema).default([]),
});

export const needleAgentResponseSchema = z.object({
  contractVersion: z.string().default('needle-tailoring-v1'),
  fitAssessment: tailoringFitAssessmentSchema,
  baseSelection: tailoringBaseSelectionSchema,
  draft: needleAgentDraftSchema,
  generation: z.object({
    strategyVersion: z.string(),
    promptVersion: z.string().nullable().optional(),
    modelId: z.string().nullable().optional(),
    provider: z.string().nullable().optional(),
  }),
});

export const tailoringRunSummarySchema = z.object({
  id: z.string(),
  status: z.enum([
    'created',
    'generating',
    'generated_for_review',
    'edits_requested',
    'approved',
    'rejected',
    'paused',
    'failed',
  ]),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  instructions: z.string().nullable(),
  revisionNote: z.string().nullable(),
  sourceTailoringRunId: z.string().nullable(),
  rationale: z.array(z.string()),
  changeSummary: z.array(z.string()),
  risks: z.array(tailoringRiskSchema),
  fitAssessment: tailoringFitAssessmentSchema.nullable(),
  baseSelection: tailoringBaseSelectionSchema.nullable(),
  generationMetadata: tailoringGenerationMetadataSchema.nullable(),
  failureCode: z.string().nullable(),
  failureMessage: z.string().nullable(),
  outputResumeVersionId: z.string().nullable(),
});

export const tailoringRunWorkspaceItemSchema = tailoringRunSummarySchema.extend({
  outputResumeTitle: z.string().nullable(),
  outputResumeMarkdown: z.string().nullable(),
});

export const needleTaskSummarySchema = z.object({
  id: z.string(),
  taskType: z.enum(['generate_draft', 'request_edits']),
  status: z.enum(['queued', 'processing', 'completed', 'failed', 'cancelled']),
  requestedByLabel: z.string(),
  instructions: z.string().nullable(),
  sourceTailoringRunId: z.string().nullable(),
  resultTailoringRunId: z.string().nullable(),
  failureCode: z.string().nullable(),
  failureMessage: z.string().nullable(),
  workerLabel: z.string().nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});

export const readinessIssueSchema = z.object({
  code: z.string(),
  level: z.string(),
  message: z.string(),
  count: z.number().optional(),
});

export const readinessSummarySchema = z.object({
  ready: z.boolean(),
  completionPercent: z.number(),
  missingRequiredCount: z.number(),
  lowConfidenceCount: z.number(),
  hardBlockers: z.array(readinessIssueSchema),
  softWarnings: z.array(readinessIssueSchema),
  recommendedNextAction: z.string(),
});

export const applicationAnswerItemSchema = z.object({
  id: z.string(),
  fieldKey: z.string(),
  fieldLabel: z.string(),
  fieldGroup: z.string().nullable(),
  value: z.unknown().nullable().optional(),
  required: z.boolean(),
  sourceType: z.string(),
  reviewState: z.string(),
  confidence: z.number().nullable(),
});

export const applicationAttachmentItemSchema = z.object({
  id: z.string(),
  attachmentType: z.string(),
  filename: z.string(),
  fileUrl: z.string(),
  resumeVersionId: z.string().nullable(),
  resumeVersionTitle: z.string().nullable(),
});

export const portalSessionItemSchema = z.object({
  id: z.string(),
  mode: z.string(),
  launchUrl: z.string(),
  providerDomain: z.string(),
  status: z.string(),
  lastKnownPageTitle: z.string().nullable(),
  notes: z.string().nullable(),
});

export const auditEventItemSchema = z.object({
  id: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  eventType: z.string(),
  actorType: z.string(),
  actorLabel: z.string(),
  createdAt: z.string(),
  payloadJson: z.unknown().nullable().optional(),
});

export const scoutRunSummarySchema = z.object({
  id: z.string(),
  sourceKey: z.string(),
  searchTerm: z.string().nullable(),
  searchLocation: z.string().nullable(),
  triggerType: z.string(),
  status: z.string(),
  idempotencyKey: z.string().nullable(),
  resultCount: z.number(),
  fetchedCount: z.number(),
  capturedCount: z.number(),
  normalizedCount: z.number(),
  rejectedCount: z.number(),
  erroredCount: z.number(),
  createdJobCount: z.number(),
  dedupedCount: z.number(),
  errorSummaryJson: z.unknown().nullable().optional(),
  notes: z.string().nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
});

export const scoutDecisionSummarySchema = z.object({
  id: z.string(),
  verdict: z.enum(['shortlist', 'archive', 'defer', 'needs_human_review']),
  confidence: z.number(),
  actedAutomatically: z.boolean(),
  policyVersion: z.string(),
  reasons: z.array(z.string()),
  ambiguityFlags: z.array(z.string()),
});

export const scoutQueueJobSchema = jobListItemSchema.extend({
  latestDecision: scoutDecisionSummarySchema.nullable(),
});

export const scoutJobSourceRecordSchema = z.object({
  sourceKey: z.string(),
  sourceRecordId: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  sourceCompanyName: z.string().nullable(),
  sourceTitle: z.string().nullable(),
  sourceLocationText: z.string().nullable(),
  capturedAt: z.string(),
  matchType: z.string(),
  isPrimary: z.boolean(),
});

export const scoutJobDetailSchema = scoutQueueJobSchema.extend({
  description: z.string(),
  salaryText: z.string().nullable(),
  auditEvents: z.array(auditEventItemSchema),
  sourceRecords: z.array(scoutJobSourceRecordSchema),
});

export const applicationDetailSchema = z.object({
  id: z.string(),
  status: z.string(),
  completionPercent: z.number(),
  missingRequiredCount: z.number(),
  lowConfidenceCount: z.number(),
  readiness: readinessSummarySchema,
  job: z.object({
    id: z.string(),
    title: z.string(),
    companyName: z.string(),
    locationText: z.string(),
  }),
  baseResume: resumeVersionSummarySchema,
  tailoredResume: resumeVersionSummarySchema.nullable(),
  answers: z.array(applicationAnswerItemSchema),
  attachments: z.array(applicationAttachmentItemSchema),
  portalSessions: z.array(portalSessionItemSchema),
  auditEvents: z.array(auditEventItemSchema),
});

export const applyingQueueItemSchema = z.object({
  id: z.string(),
  status: z.string(),
  updatedAt: z.string(),
  portalDomain: z.string().nullable(),
  completionPercent: z.number(),
  missingRequiredCount: z.number(),
  lowConfidenceCount: z.number(),
  hasHardBlockers: z.boolean(),
  selectedTailoredResumeTitle: z.string().nullable(),
  jobTitle: z.string(),
  companyName: z.string(),
});

export const tailoringQueueItemSchema = z.object({
  applicationId: z.string(),
  applicationStatus: z.string(),
  updatedAt: z.string(),
  job: z.object({
    id: z.string(),
    title: z.string(),
    companyName: z.string(),
    locationText: z.string(),
  }),
  baseResume: resumeVersionSummarySchema,
  selectedTailoredResume: resumeVersionSummarySchema.nullable(),
  latestRun: tailoringRunSummarySchema.nullable(),
  activeTask: needleTaskSummarySchema.nullable(),
  latestTask: needleTaskSummarySchema.nullable(),
});

export const tailoringDetailSchema = z.object({
  applicationId: z.string(),
  applicationStatus: z.string(),
  pausedReason: z.string().nullable(),
  activeTask: needleTaskSummarySchema.nullable(),
  latestTask: needleTaskSummarySchema.nullable(),
  job: z.object({
    id: z.string(),
    title: z.string(),
    companyName: z.string(),
    locationText: z.string(),
    description: z.string(),
    requirements: z.object({
      mustHave: z.array(z.string()),
      niceToHave: z.array(z.string()),
    }),
  }),
  baseResume: resumeVersionDetailSchema,
  selectedTailoredResume: resumeVersionSummarySchema.nullable(),
  latestDraft: resumeVersionDetailSchema.nullable(),
  latestRun: tailoringRunWorkspaceItemSchema.nullable(),
  runHistory: z.array(tailoringRunWorkspaceItemSchema),
  auditEvents: z.array(auditEventItemSchema),
});

export type Provenance = z.infer<typeof provenanceSchema>;
export type PostingCheckStatus = z.infer<typeof postingCheckStatusSchema>;
export type PostingCheckSummary = z.infer<typeof postingCheckSummarySchema>;
export type JobListItem = z.infer<typeof jobListItemSchema>;
export type ResumeEntry = z.infer<typeof resumeEntrySchema>;
export type ResumeSection = z.infer<typeof resumeSectionSchema>;
export type ResumeDocument = z.infer<typeof resumeDocumentSchema>;
export type ResumeVersionSummary = z.infer<typeof resumeVersionSummarySchema>;
export type ResumeVersionDetail = z.infer<typeof resumeVersionDetailSchema>;
export type TailoringRisk = z.infer<typeof tailoringRiskSchema>;
export type TailoringFitAssessment = z.infer<typeof tailoringFitAssessmentSchema>;
export type TailoringBaseSelection = z.infer<typeof tailoringBaseSelectionSchema>;
export type TailoringGenerationMetadata = z.infer<typeof tailoringGenerationMetadataSchema>;
export type NeedleAgentDraft = z.infer<typeof needleAgentDraftSchema>;
export type NeedleAgentResponse = z.infer<typeof needleAgentResponseSchema>;
export type TailoringRunSummary = z.infer<typeof tailoringRunSummarySchema>;
export type TailoringRunWorkspaceItem = z.infer<typeof tailoringRunWorkspaceItemSchema>;
export type NeedleTaskSummary = z.infer<typeof needleTaskSummarySchema>;
export type ReadinessIssue = z.infer<typeof readinessIssueSchema>;
export type ReadinessSummary = z.infer<typeof readinessSummarySchema>;
export type ApplicationAnswerItem = z.infer<typeof applicationAnswerItemSchema>;
export type ApplicationAttachmentItem = z.infer<typeof applicationAttachmentItemSchema>;
export type PortalSessionItem = z.infer<typeof portalSessionItemSchema>;
export type AuditEventItem = z.infer<typeof auditEventItemSchema>;
export type ScoutRunSummary = z.infer<typeof scoutRunSummarySchema>;
export type ScoutDecisionSummary = z.infer<typeof scoutDecisionSummarySchema>;
export type ScoutQueueJob = z.infer<typeof scoutQueueJobSchema>;
export type ScoutJobSourceRecord = z.infer<typeof scoutJobSourceRecordSchema>;
export type ScoutJobDetail = z.infer<typeof scoutJobDetailSchema>;
export type ApplicationDetail = z.infer<typeof applicationDetailSchema>;
export type ApplyingQueueItem = z.infer<typeof applyingQueueItemSchema>;
export type TailoringQueueItem = z.infer<typeof tailoringQueueItemSchema>;
export type TailoringDetail = z.infer<typeof tailoringDetailSchema>;
