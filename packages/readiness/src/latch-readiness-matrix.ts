import type { ReadinessInput, ReadinessIssueCode } from './index';

export type LatchReadinessMatrixCase = {
  name: string;
  input: ReadinessInput;
  expected: {
    ready: boolean;
    missingRequiredCount: number;
    lowConfidenceCount: number;
    hardBlockerCodes: ReadinessIssueCode[];
    softWarningCodes: ReadinessIssueCode[];
    recommendedNextAction: string;
  };
};

export const latchReadinessMatrix: LatchReadinessMatrixCase[] = [
  {
    name: 'blocks when the approved tailored resume has not been selected yet',
    input: {
      status: 'applying',
      tailoredResumeVersionId: null,
      answers: [],
      attachments: [],
      portalSessions: [],
    },
    expected: {
      ready: false,
      missingRequiredCount: 0,
      lowConfidenceCount: 0,
      hardBlockerCodes: ['tailored_resume_missing', 'resume_attachment_missing'],
      softWarningCodes: ['portal_session_missing'],
      recommendedNextAction: 'Select the tailored resume version for this application.',
    },
  },
  {
    name: 'blocks when the selected tailored resume has no attached artifact yet',
    input: {
      status: 'applying',
      tailoredResumeVersionId: 'resume-tailored-1',
      answers: [],
      attachments: [],
      portalSessions: [],
    },
    expected: {
      ready: false,
      missingRequiredCount: 0,
      lowConfidenceCount: 0,
      hardBlockerCodes: ['resume_attachment_missing'],
      softWarningCodes: ['portal_session_missing'],
      recommendedNextAction: 'Attach the resume artifact that will be used in the portal.',
    },
  },
  {
    name: 'blocks when required answers are still missing',
    input: {
      status: 'applying',
      tailoredResumeVersionId: 'resume-tailored-1',
      answers: [
        {
          fieldKey: 'work_auth',
          fieldLabel: 'Are you authorized to work in the United States?',
          answerJson: { required: true, value: '' },
          confidence: null,
          reviewState: 'accepted',
        },
      ],
      attachments: [
        {
          attachmentType: 'resume',
          resumeVersionId: 'resume-tailored-1',
          filename: 'benny-tailored.pdf',
        },
      ],
      portalSessions: [],
    },
    expected: {
      ready: false,
      missingRequiredCount: 1,
      lowConfidenceCount: 0,
      hardBlockerCodes: ['required_answers_missing'],
      softWarningCodes: ['portal_session_missing'],
      recommendedNextAction: 'Complete the missing required answers.',
    },
  },
  {
    name: 'blocks when an answer is explicitly marked blocked',
    input: {
      status: 'applying',
      tailoredResumeVersionId: 'resume-tailored-1',
      answers: [
        {
          fieldKey: 'desired_salary',
          fieldLabel: 'Desired salary',
          answerJson: { required: true, value: '$120,000' },
          confidence: 0.92,
          reviewState: 'blocked',
        },
      ],
      attachments: [
        {
          attachmentType: 'resume',
          resumeVersionId: 'resume-tailored-1',
          filename: 'benny-tailored.pdf',
        },
      ],
      portalSessions: [
        {
          status: 'ready_for_review',
        },
      ],
    },
    expected: {
      ready: false,
      missingRequiredCount: 0,
      lowConfidenceCount: 0,
      hardBlockerCodes: ['blocked_answers_present'],
      softWarningCodes: [],
      recommendedNextAction: 'Resolve the blocked answers before advancing.',
    },
  },
  {
    name: 'keeps inferred answers in warning state even when confidence is high',
    input: {
      status: 'applying',
      tailoredResumeVersionId: 'resume-tailored-1',
      answers: [
        {
          fieldKey: 'linkedin_url',
          fieldLabel: 'LinkedIn URL',
          answerJson: { required: true, value: 'https://www.linkedin.com/in/benny-example' },
          confidence: 0.95,
          reviewState: 'needs_review',
        },
      ],
      attachments: [
        {
          attachmentType: 'resume',
          resumeVersionId: 'resume-tailored-1',
          filename: 'benny-tailored.pdf',
        },
      ],
      portalSessions: [
        {
          status: 'ready_for_review',
        },
      ],
    },
    expected: {
      ready: true,
      missingRequiredCount: 0,
      lowConfidenceCount: 1,
      hardBlockerCodes: [],
      softWarningCodes: ['low_confidence_answers_present'],
      recommendedNextAction: 'Review the low-confidence answers before final handoff.',
    },
  },
  {
    name: 'is ready for final human review when blockers and warnings are cleared',
    input: {
      status: 'applying',
      tailoredResumeVersionId: 'resume-tailored-1',
      answers: [
        {
          fieldKey: 'work_auth',
          fieldLabel: 'Are you authorized to work in the United States?',
          answerJson: { required: true, value: 'Yes' },
          confidence: 1,
          reviewState: 'accepted',
        },
      ],
      attachments: [
        {
          attachmentType: 'resume',
          resumeVersionId: 'resume-tailored-1',
          filename: 'benny-tailored.pdf',
        },
      ],
      portalSessions: [
        {
          status: 'ready_for_review',
        },
      ],
    },
    expected: {
      ready: true,
      missingRequiredCount: 0,
      lowConfidenceCount: 0,
      hardBlockerCodes: [],
      softWarningCodes: [],
      recommendedNextAction: 'Open the real portal for Benny’s final review.',
    },
  },
];
