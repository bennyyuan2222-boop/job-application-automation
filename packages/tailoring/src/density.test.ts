import assert from 'node:assert/strict';
import test from 'node:test';

import type { ResumeDocument } from '@job-ops/domain';

import { analyzeResumeDensity, buildDensityBaselineProfile } from './density';
import { renderResumePdfDetailed } from './pdf';

const baselineDocument: ResumeDocument = {
  meta: {
    displayName: 'Benny Yuan',
    headerLines: ['(555) 555-5555 | benny@example.com | Available June 2026'],
  },
  sections: [
    {
      id: 'education',
      kind: 'education',
      title: 'Education',
      entries: [
        {
          id: 'edu-1',
          heading: 'University of Example',
          dateRange: '2026',
          lines: ['B.S. in Economics, GPA: 3.9'],
        },
      ],
    },
    {
      id: 'skills',
      kind: 'skills',
      title: 'Skills',
      entries: [
        {
          id: 'skills-1',
          lines: ['SQL, Python, Excel, Tableau, Power BI, Workflow Mapping, Stakeholder Communication'],
        },
      ],
    },
    {
      id: 'experience',
      kind: 'experience',
      title: 'Experience',
      entries: [
        {
          id: 'exp-1',
          heading: 'Analyst',
          subheading: 'Northstar',
          dateRange: '2022 - 2025',
          bullets: [
            'Built KPI dashboards and translated weekly performance signals into business-facing recommendations for senior stakeholders.',
            'Mapped workflow bottlenecks across handoffs, documented root causes, and partnered with operators to tighten reporting cycles.',
            'Synthesized SQL and spreadsheet analysis into concise updates that clarified trends, risks, and next-step decisions.',
          ],
        },
      ],
    },
    {
      id: 'projects',
      kind: 'projects',
      title: 'Projects',
      entries: [
        {
          id: 'proj-1',
          heading: 'Forecasting Model',
          bullets: [
            'Built a forecasting model that improved planning visibility and reduced manual spreadsheet reconciliation work.',
            'Created a lightweight QA process that caught data mismatches before weekly business review meetings.',
          ],
        },
      ],
    },
    {
      id: 'leadership',
      kind: 'leadership',
      title: 'Leadership & Activities',
      entries: [
        {
          id: 'lead-1',
          heading: 'Mentor',
          bullets: ['Supported peers with onboarding and analytics troubleshooting in a student-led organization.'],
        },
      ],
    },
  ],
};

const sparseDocument: ResumeDocument = {
  meta: {
    displayName: 'Benny Yuan',
    headerLines: ['(555) 555-5555 | benny@example.com'],
  },
  sections: [
    {
      id: 'education',
      kind: 'education',
      title: 'Education',
      entries: [{ id: 'edu-1', heading: 'University of Example', dateRange: '2026' }],
    },
    {
      id: 'skills',
      kind: 'skills',
      title: 'Skills',
      entries: [{ id: 'skills-1', lines: ['SQL, Excel'] }],
    },
    {
      id: 'experience',
      kind: 'experience',
      title: 'Experience',
      entries: [
        {
          id: 'exp-1',
          heading: 'Analyst',
          subheading: 'Northstar',
          dateRange: '2022 - 2025',
          bullets: ['Tracked KPIs.', 'Built dashboards.'],
        },
      ],
    },
    {
      id: 'projects',
      kind: 'projects',
      title: 'Projects',
      entries: [{ id: 'proj-1', heading: 'Forecasting Model', bullets: ['Built a model.'] }],
    },
    {
      id: 'leadership',
      kind: 'leadership',
      title: 'Leadership & Activities',
      entries: [{ id: 'lead-1', heading: 'Mentor', bullets: ['Helped peers.'] }],
    },
  ],
};

test('analyzeResumeDensity passes a baseline-like document', () => {
  const baselineMetrics = renderResumePdfDetailed('Baseline Resume', baselineDocument).layoutMetrics;
  const baseline = buildDensityBaselineProfile(baselineMetrics);
  const assessment = analyzeResumeDensity(baselineMetrics, baseline);

  assert.equal(assessment.status, 'pass');
  assert.ok(assessment.score >= 75);
});

test('analyzeResumeDensity flags an underfilled sparse document', () => {
  const baselineMetrics = renderResumePdfDetailed('Baseline Resume', baselineDocument).layoutMetrics;
  const sparseMetrics = renderResumePdfDetailed('Sparse Resume', sparseDocument).layoutMetrics;
  const baseline = buildDensityBaselineProfile(baselineMetrics);
  const assessment = analyzeResumeDensity(sparseMetrics, baseline);

  assert.equal(assessment.status, 'underfilled');
  assert.ok(assessment.reasons.some((reason) => reason.toLowerCase().includes('bottom whitespace')));
});
