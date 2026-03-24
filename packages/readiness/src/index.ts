export type ReadinessLevel = 'info' | 'warning' | 'blocker';

export type ReadinessIssueCode =
  | 'tailored_resume_missing'
  | 'resume_attachment_missing'
  | 'resume_attachment_mismatch'
  | 'required_answers_missing'
  | 'blocked_answers_present'
  | 'low_confidence_answers_present'
  | 'portal_session_missing'
  | 'portal_session_not_ready';

export type ReadinessIssue = {
  code: ReadinessIssueCode;
  level: ReadinessLevel;
  message: string;
  count?: number;
};

export type ReadinessInputAnswer = {
  fieldKey: string;
  fieldLabel: string;
  answerJson: unknown;
  confidence: number | null;
  reviewState: 'accepted' | 'needs_review' | 'blocked';
};

export type ReadinessInputAttachment = {
  attachmentType: 'resume' | 'other';
  resumeVersionId: string | null;
  filename: string;
};

export type ReadinessInputPortalSession = {
  status: 'not_started' | 'in_progress' | 'ready_for_review' | 'submitted' | 'abandoned';
};

export type ReadinessInput = {
  status:
    | 'tailoring'
    | 'tailoring_review'
    | 'paused'
    | 'applying'
    | 'submit_review'
    | 'submitted'
    | 'archived';
  tailoredResumeVersionId: string | null;
  answers: ReadinessInputAnswer[];
  attachments: ReadinessInputAttachment[];
  portalSessions: ReadinessInputPortalSession[];
};

export type ReadinessSummary = {
  ready: boolean;
  completionPercent: number;
  missingRequiredCount: number;
  lowConfidenceCount: number;
  hardBlockers: ReadinessIssue[];
  softWarnings: ReadinessIssue[];
  recommendedNextAction: string;
};

function extractValue(answerJson: unknown): unknown {
  if (!answerJson || typeof answerJson !== 'object' || Array.isArray(answerJson)) {
    return answerJson;
  }

  return (answerJson as { value?: unknown }).value ?? answerJson;
}

function isRequired(answerJson: unknown): boolean {
  if (!answerJson || typeof answerJson !== 'object' || Array.isArray(answerJson)) {
    return false;
  }

  return Boolean((answerJson as { required?: boolean }).required);
}

function hasValue(value: unknown): boolean {
  if (value == null) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }

  return true;
}

export function evaluateApplicationReadiness(input: ReadinessInput): ReadinessSummary {
  const hardBlockers: ReadinessIssue[] = [];
  const softWarnings: ReadinessIssue[] = [];

  const resumeAttachments = input.attachments.filter((attachment) => attachment.attachmentType === 'resume');
  const matchingResumeAttachment = input.tailoredResumeVersionId
    ? resumeAttachments.find((attachment) => attachment.resumeVersionId === input.tailoredResumeVersionId)
    : null;

  if (!input.tailoredResumeVersionId) {
    hardBlockers.push({
      code: 'tailored_resume_missing',
      level: 'blocker',
      message: 'Select a tailored resume before moving to submit review.',
    });
  }

  if (resumeAttachments.length === 0) {
    hardBlockers.push({
      code: 'resume_attachment_missing',
      level: 'blocker',
      message: 'Attach a resume artifact for this application.',
    });
  } else if (input.tailoredResumeVersionId && !matchingResumeAttachment) {
    hardBlockers.push({
      code: 'resume_attachment_mismatch',
      level: 'blocker',
      message: 'The attached resume does not match the selected tailored resume version.',
    });
  }

  const requiredAnswers = input.answers.filter((answer) => isRequired(answer.answerJson));
  const missingRequiredAnswers = requiredAnswers.filter((answer) => !hasValue(extractValue(answer.answerJson)));

  if (missingRequiredAnswers.length > 0) {
    hardBlockers.push({
      code: 'required_answers_missing',
      level: 'blocker',
      message: 'Required application answers are still missing.',
      count: missingRequiredAnswers.length,
    });
  }

  const blockedAnswers = input.answers.filter((answer) => answer.reviewState === 'blocked');
  if (blockedAnswers.length > 0) {
    hardBlockers.push({
      code: 'blocked_answers_present',
      level: 'blocker',
      message: 'One or more answers are blocked and need resolution.',
      count: blockedAnswers.length,
    });
  }

  const lowConfidenceAnswers = input.answers.filter(
    (answer) => answer.reviewState === 'needs_review' || (answer.confidence ?? 1) < 0.75,
  );

  if (lowConfidenceAnswers.length > 0) {
    softWarnings.push({
      code: 'low_confidence_answers_present',
      level: 'warning',
      message: 'Some answers are low-confidence or still need review.',
      count: lowConfidenceAnswers.length,
    });
  }

  if (input.portalSessions.length === 0) {
    softWarnings.push({
      code: 'portal_session_missing',
      level: 'warning',
      message: 'No portal session is registered yet.',
    });
  } else {
    const latestPortalSession = input.portalSessions[0];
    if (latestPortalSession.status !== 'ready_for_review' && latestPortalSession.status !== 'submitted') {
      softWarnings.push({
        code: 'portal_session_not_ready',
        level: 'warning',
        message: `Latest portal session is ${latestPortalSession.status.replaceAll('_', ' ')}.`,
      });
    }
  }

  const completedRequiredAnswers = requiredAnswers.filter((answer) => hasValue(extractValue(answer.answerJson))).length;
  const readinessChecks = [
    input.tailoredResumeVersionId ? 1 : 0,
    matchingResumeAttachment ? 1 : 0,
    requiredAnswers.length === 0 ? 1 : completedRequiredAnswers / requiredAnswers.length,
  ];

  const completionPercent = Math.max(0, Math.min(100, Math.round((readinessChecks.reduce((sum, value) => sum + value, 0) / readinessChecks.length) * 100)));
  const ready = hardBlockers.length === 0;

  let recommendedNextAction = 'Open the real portal for Benny’s final review.';
  if (!input.tailoredResumeVersionId) {
    recommendedNextAction = 'Select the tailored resume version for this application.';
  } else if (resumeAttachments.length === 0) {
    recommendedNextAction = 'Attach the resume artifact that will be used in the portal.';
  } else if (missingRequiredAnswers.length > 0) {
    recommendedNextAction = 'Complete the missing required answers.';
  } else if (blockedAnswers.length > 0) {
    recommendedNextAction = 'Resolve the blocked answers before advancing.';
  } else if (lowConfidenceAnswers.length > 0) {
    recommendedNextAction = 'Review the low-confidence answers before final handoff.';
  } else if (input.portalSessions.length === 0) {
    recommendedNextAction = 'Register the portal session so the live application surface is tracked.';
  }

  return {
    ready,
    completionPercent,
    missingRequiredCount: missingRequiredAnswers.length,
    lowConfidenceCount: lowConfidenceAnswers.length,
    hardBlockers,
    softWarnings,
    recommendedNextAction,
  };
}
