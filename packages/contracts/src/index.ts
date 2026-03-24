import { z } from 'zod';

export const provenanceSchema = z
  .object({
    sourceKey: z.string(),
    sourceUrl: z.string().nullable().optional(),
  })
  .nullable()
  .optional();

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

export const tailoringRunSummarySchema = z.object({
  id: z.string(),
  status: z.string(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  instructions: z.string().nullable(),
  revisionNote: z.string().nullable(),
  rationale: z.array(z.string()),
  changeSummary: z.array(z.string()),
  risks: z.array(tailoringRiskSchema),
  outputResumeVersionId: z.string().nullable(),
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
});

export const tailoringDetailSchema = z.object({
  applicationId: z.string(),
  applicationStatus: z.string(),
  pausedReason: z.string().nullable(),
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
  latestRun: tailoringRunSummarySchema.nullable(),
  runHistory: z.array(tailoringRunSummarySchema),
  auditEvents: z.array(auditEventItemSchema),
});

export type Provenance = z.infer<typeof provenanceSchema>;
export type JobListItem = z.infer<typeof jobListItemSchema>;
export type ResumeEntry = z.infer<typeof resumeEntrySchema>;
export type ResumeSection = z.infer<typeof resumeSectionSchema>;
export type ResumeDocument = z.infer<typeof resumeDocumentSchema>;
export type ResumeVersionSummary = z.infer<typeof resumeVersionSummarySchema>;
export type ResumeVersionDetail = z.infer<typeof resumeVersionDetailSchema>;
export type TailoringRisk = z.infer<typeof tailoringRiskSchema>;
export type TailoringRunSummary = z.infer<typeof tailoringRunSummarySchema>;
export type ReadinessIssue = z.infer<typeof readinessIssueSchema>;
export type ReadinessSummary = z.infer<typeof readinessSummarySchema>;
export type ApplicationAnswerItem = z.infer<typeof applicationAnswerItemSchema>;
export type ApplicationAttachmentItem = z.infer<typeof applicationAttachmentItemSchema>;
export type PortalSessionItem = z.infer<typeof portalSessionItemSchema>;
export type AuditEventItem = z.infer<typeof auditEventItemSchema>;
export type ApplicationDetail = z.infer<typeof applicationDetailSchema>;
export type ApplyingQueueItem = z.infer<typeof applyingQueueItemSchema>;
export type TailoringQueueItem = z.infer<typeof tailoringQueueItemSchema>;
export type TailoringDetail = z.infer<typeof tailoringDetailSchema>;
