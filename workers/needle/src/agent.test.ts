import assert from 'node:assert/strict';
import test from 'node:test';

import type { ResumeCandidate } from '@job-ops/tailoring';

import {
  NeedleAgentError,
  buildNeedlePromptForTest,
  validateNeedleResponseForTest,
} from './agent';

const candidates: ResumeCandidate[] = [
  {
    id: 'resume-base-business-analyst',
    title: 'Business Analyst Base Resume',
    contentMarkdown: '# Business Analyst Base Resume\n\n- KPI reporting\n- stakeholder communication',
    document: {
      meta: {
        lane: 'business_analyst',
        summary: 'Business-facing analytics and stakeholder communication.',
      },
      sections: [],
    },
  },
];

const validResponse = {
  contractVersion: 'needle-tailoring-v1',
  fitAssessment: {
    summary: 'Strong overlap with analytics, KPI reporting, and stakeholder communication.',
    verdict: 'strong_match',
    matchedStrengths: ['KPI reporting', 'Stakeholder communication'],
    likelyGaps: ['Direct operations ownership is less explicit.'],
    riskNotes: ['Do not overstate operations management.'],
    proceedRecommendation: 'proceed',
  },
  baseSelection: {
    selectedResumeVersionId: 'resume-base-business-analyst',
    selectedResumeTitle: 'Business Analyst Base Resume',
    lane: 'business_analyst',
    score: 0.94,
    reasons: ['Closest truthful match to workflow analysis and KPI reporting.'],
    candidateCount: 1,
  },
  draft: {
    title: 'Northstar Business Analyst Resume',
    contentMarkdown: '# Northstar Business Analyst Resume\n\n## Experience\n- Reported KPIs to stakeholders.',
    changeSummary: ['Raised KPI reporting higher in the resume.'],
    rationale: ['Highlights already-supported KPI reporting and stakeholder communication.'],
    risks: [
      {
        requirement: 'Operations ownership',
        severity: 'medium',
        reason: 'Support is indirect and should stay carefully phrased.',
      },
    ],
  },
  generation: {
    strategyVersion: 'needle-tailoring-v1',
    promptVersion: 'phase2-test',
    modelId: 'test-model',
    provider: 'openclaw',
  },
};

test('validateNeedleResponseForTest accepts a valid response', () => {
  const parsed = validateNeedleResponseForTest(validResponse, candidates);
  assert.equal(parsed.baseSelection.selectedResumeVersionId, candidates[0]?.id);
  assert.equal(parsed.draft.changeSummary.length, 1);
});

test('validateNeedleResponseForTest rejects unknown base resume ids with a typed error', () => {
  assert.throws(
    () =>
      validateNeedleResponseForTest(
        {
          ...validResponse,
          baseSelection: {
            ...validResponse.baseSelection,
            selectedResumeVersionId: 'resume-base-unknown',
          },
        },
        candidates,
      ),
    (error: unknown) => {
      assert.ok(error instanceof NeedleAgentError);
      assert.equal(error.code, 'needle_agent_unknown_base_resume');
      return true;
    },
  );
});

test('validateNeedleResponseForTest rejects empty rationale arrays with a typed error', () => {
  assert.throws(
    () =>
      validateNeedleResponseForTest(
        {
          ...validResponse,
          draft: {
            ...validResponse.draft,
            rationale: [],
          },
        },
        candidates,
      ),
    (error: unknown) => {
      assert.ok(error instanceof NeedleAgentError);
      assert.equal(error.code, 'needle_agent_missing_rationale');
      return true;
    },
  );
});

test('buildNeedlePromptForTest includes app context, candidate resumes, and contract instructions', () => {
  const prompt = buildNeedlePromptForTest({
    applicationId: 'application-123',
    applicationStatus: 'tailoring',
    instructions: 'Emphasize KPI reporting without inflating ownership.',
    sourceTailoringRunId: 'run-previous',
    job: {
      id: 'job-1',
      title: 'Business Analyst',
      companyName: 'Northstar',
      locationText: 'New York, NY',
      description: 'Analyze workflows and report KPIs.',
      requirements: {
        mustHave: ['Workflow analysis', 'Stakeholder communication'],
        niceToHave: ['SQL'],
      },
    },
    priorRuns: [],
    baseResumeCandidates: candidates,
    provisionalBaseHint: {
      selectedResumeVersionId: candidates[0]!.id,
      selectedResumeTitle: candidates[0]!.title,
      reasons: ['Closest truthful fit.'],
      lane: 'business_analyst',
    },
  });

  assert.match(prompt, /application-123/);
  assert.match(prompt, /Business Analyst Base Resume/);
  assert.match(prompt, /Return ONLY valid JSON/);
  assert.match(prompt, /the first line must be Benny's actual name/);
  assert.match(prompt, /preserve section order: EDUCATION, SKILLS, EXPERIENCE, PROJECTS, LEADERSHIP & ACTIVITIES/);
  assert.match(prompt, /do not add a SUMMARY section unless the user explicitly asks for one/);
  assert.match(prompt, /AEBenny one-page serif resume layout/);
  assert.match(prompt, /about 18-21 bullets total/);
  assert.match(prompt, /Emphasize KPI reporting without inflating ownership\./);
});

test('buildNeedlePromptForTest includes density revision constraints when requested', () => {
  const prompt = buildNeedlePromptForTest({
    applicationId: 'application-123',
    applicationStatus: 'tailoring',
    job: {
      id: 'job-1',
      title: 'Business Analyst',
      companyName: 'Northstar',
      locationText: 'New York, NY',
      description: 'Analyze workflows and report KPIs.',
      requirements: {
        mustHave: ['Workflow analysis'],
      },
    },
    priorRuns: [],
    baseResumeCandidates: [candidates[0]!],
    supportingTruthSources: [
      {
        ...candidates[0]!,
        id: 'resume-base-business-analyst-2',
        title: 'Business Analyst Support Resume',
      },
    ],
    densityRevision: {
      previousDraftMarkdown: '# Benny Yuan\nContact line\n\n## EXPERIENCE\n- Short bullet',
      lockedBaseSelection: {
        selectedResumeVersionId: candidates[0]!.id,
        selectedResumeTitle: candidates[0]!.title,
        lane: 'business_analyst',
      },
      assessment: {
        status: 'underfilled',
        score: 58,
        reasons: ['Bottom whitespace is too high.'],
        machineFeedback: ['Expand short bullets with supported detail instead of adding filler.'],
        summary: {
          bottomWhitespacePts: 96,
          bottomWhitespaceRatio: 0.14,
          oneLineBulletRatio: 0.67,
          skillsRenderedLines: 4,
          finalSectionRenderedLines: 3,
          totalRenderedLines: 28,
        },
      },
    },
  });

  assert.match(prompt, /Density revision mode:/);
  assert.match(prompt, /base selection is LOCKED/);
  assert.match(prompt, /Supporting truth sources/);
  assert.match(prompt, /Renderer density assessment/);
  assert.match(prompt, /previous draft markdown/i);
});
