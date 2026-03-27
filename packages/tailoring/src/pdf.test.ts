import assert from 'node:assert/strict';
import test from 'node:test';

import type { ResumeDocument } from '@job-ops/domain';

import { renderResumePdf } from './pdf';

const sampleDocument: ResumeDocument = {
  meta: {
    headerLines: ['Benny Yuan · New York, NY · benny@example.com'],
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

test('renderResumePdf returns PDF bytes with expected header/footer markers', () => {
  const pdf = renderResumePdf('Northstar Business Analyst Resume', sampleDocument);
  const text = pdf.toString('utf8');

  assert.ok(pdf.byteLength > 200);
  assert.match(text, /^%PDF-1\.4/);
  assert.match(text, /%%EOF$/);
  assert.match(text, /Northstar Business Analyst Resume/);
});
