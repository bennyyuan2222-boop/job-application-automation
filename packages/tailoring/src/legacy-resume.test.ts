import assert from 'node:assert/strict';
import test from 'node:test';

import { coerceResumeDocument, parseLegacyResumeMarkdown } from './legacy-resume';

test('parseLegacyResumeMarkdown captures display name, contact line, and education headings cleanly', () => {
  const markdown = `# Benny (BinHuai) Yuan
(423)-933-0077 | bennyyuan2002@gmail.com | Available June 2026

## EDUCATION

**New York University** (Expected) — May 2026
B.S. in Data Science, Minor in Business Studies; GPA 3.77/4.0
Coursework: Data Management, Causal Inference, Fundamentals of Machine Learning
`;

  const document = parseLegacyResumeMarkdown(markdown);
  const education = document.sections[0];
  const entry = education?.entries[0];

  assert.equal(document.meta?.displayName, 'Benny (BinHuai) Yuan');
  assert.deepEqual(document.meta?.headerLines, ['(423)-933-0077 | bennyyuan2002@gmail.com | Available June 2026']);
  assert.equal(education?.title, 'EDUCATION');
  assert.equal(entry?.heading, 'New York University (Expected)');
  assert.equal(entry?.dateRange, 'May 2026');
  assert.deepEqual(entry?.lines, [
    'B.S. in Data Science, Minor in Business Studies; GPA 3.77/4.0',
    'Coursework: Data Management, Causal Inference, Fundamentals of Machine Learning',
  ]);
});

test('coerceResumeDocument reparses markdown when stored legacy sections are missing display name or contain markdown artifacts', () => {
  const markdown = `# Benny (BinHuai) Yuan
(423)-933-0077 | bennyyuan2002@gmail.com | Available June 2026

## EDUCATION

**New York University** (Expected) — May 2026
B.S. in Data Science, Minor in Business Studies; GPA 3.77/4.0
`;

  const storedLegacyDocument = {
    meta: {
      headerLines: ['(423)-933-0077 | bennyyuan2002@gmail.com | Available June 2026'],
    },
    sections: [
      {
        id: 'education',
        kind: 'education',
        title: 'EDUCATION',
        entries: [
          {
            id: 'education-entry-1',
            lines: ['**New York University** (Expected) — May 2026'],
            bullets: [],
          },
        ],
      },
    ],
  };

  const document = coerceResumeDocument(storedLegacyDocument, markdown);
  const entry = document.sections[0]?.entries[0];

  assert.equal(document.meta?.displayName, 'Benny (BinHuai) Yuan');
  assert.equal(entry?.heading, 'New York University (Expected)');
  assert.equal(entry?.dateRange, 'May 2026');
  assert.ok(!entry?.lines?.some((line) => line.includes('**')));
});
