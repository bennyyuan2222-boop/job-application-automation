import assert from 'node:assert/strict';
import test from 'node:test';

import type { ResumeDocument } from '@job-ops/domain';

import { renderResumePdf, renderResumePdfDetailed } from './pdf';

const sampleDocument: ResumeDocument = {
  meta: {
    displayName: 'Benny Yuan',
    headerLines: ['(555) 555-5555 | benny@example.com | Available June 2026'],
    summary: 'Business-facing analyst with workflow analysis, KPI reporting, and stakeholder communication experience.',
  },
  sections: [
    {
      id: 'experience',
      kind: 'experience',
      title: 'Experience',
      entries: [
        {
          id: 'entry-1',
          heading: 'Analyst',
          subheading: 'Northstar',
          location: 'New York, NY',
          dateRange: '2022 - 2025',
          bullets: [
            'Tracked KPI reporting for weekly business reviews.',
            'Mapped workflows and communicated findings to stakeholders.',
          ],
        },
      ],
    },
  ],
};

test('renderResumePdf returns PDF bytes with expected header/footer markers and template styling cues', () => {
  const pdf = renderResumePdf('Northstar Business Analyst Resume', sampleDocument);
  const text = pdf.toString('utf8');

  assert.ok(pdf.byteLength > 200);
  assert.match(text, /^%PDF-1\.4/);
  assert.match(text, /%%EOF$/);
  assert.match(text, /Benny Yuan/);
  assert.match(text, /benny@example.com/);
  assert.match(text, /EXPERIENCE/);
  assert.match(text, /Northstar/);
  assert.doesNotMatch(text, /SUMMARY/);
  assert.match(text, /0\.270 0\.670 0\.820 rg/);
});

test('renderResumePdfDetailed returns layout metrics for density analysis', () => {
  const result = renderResumePdfDetailed('Northstar Business Analyst Resume', sampleDocument);

  assert.ok(result.pdfBuffer.byteLength > 200);
  assert.equal(result.layoutMetrics.pageCount, 1);
  assert.equal(result.layoutMetrics.overflowed, false);
  assert.ok(result.layoutMetrics.bottomWhitespacePts > 0);
  assert.ok(result.layoutMetrics.totalRenderedLines > 0);

  const experience = result.layoutMetrics.sectionMetrics.find((section) => section.sectionKind === 'experience');
  assert.ok(experience);
  assert.ok((experience?.renderedLines ?? 0) >= 3);
  assert.equal(experience?.bulletCount, 2);
});
