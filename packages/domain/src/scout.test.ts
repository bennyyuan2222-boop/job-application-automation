import assert from 'node:assert/strict';
import test from 'node:test';

import { freshnessBucket, inferWorkMode, normalizeScoutJob, scoreScoutJob } from './scout';

test('normalizeScoutJob builds stable dedupe keys and cleans description text', () => {
  const normalized = normalizeScoutJob({
    sourceKey: 'fixture-jobspy-indeed',
    companyName: 'Northstar AI, Inc.',
    title: 'Data Analyst II',
    locationText: 'NYC',
    description: ' SQL\n dashboarding\tand experimentation  ',
    sourceUrl: 'https://jobs.example.com/role',
    datePosted: new Date().toISOString(),
  });

  assert.equal(normalized.normalizedCompanyName, 'northstar ai');
  assert.equal(normalized.normalizedTitle, 'data analyst');
  assert.equal(normalized.normalizedLocationText, 'new york, ny');
  assert.equal(normalized.descriptionClean, 'SQL dashboarding and experimentation');
  assert.equal(normalized.dedupeKey, 'northstar ai::data analyst::new york, ny');
});

test('inferWorkMode prefers explicit remote and hybrid flags', () => {
  assert.equal(inferWorkMode({ remote: true, hybrid: false, locationText: 'New York, NY' }), 'remote');
  assert.equal(inferWorkMode({ remote: false, hybrid: true, locationText: 'New York, NY' }), 'hybrid');
  assert.equal(inferWorkMode({ remote: false, hybrid: false, locationText: 'Remote - US' }), 'remote');
});

test('scoreScoutJob boosts analyst and AI-adjacent roles', () => {
  const score = scoreScoutJob(
    normalizeScoutJob({
      sourceKey: 'fixture-jobspy-indeed',
      companyName: 'Signal Grid',
      title: 'Business Analyst, AI Operations',
      locationText: 'Remote - US',
      description: 'SQL, analytics, dashboarding, experimentation, and AI workflow reporting.',
      sourceUrl: 'https://jobs.example.com/ai-ops',
      datePosted: new Date().toISOString(),
    }),
  );

  assert.equal(score.topReasons.includes('strong title alignment'), true);
  assert.equal(score.topReasons.includes('clear analytics signal'), true);
  assert.equal(score.topReasons.includes('AI-adjacent work appears in role'), true);
  assert.equal(score.priorityScore >= 7, true);
});

test('freshnessBucket handles fresh recent stale and unknown values', () => {
  const now = Date.now();
  assert.equal(freshnessBucket(new Date(now - 2 * 24 * 60 * 60 * 1000)), 'fresh');
  assert.equal(freshnessBucket(new Date(now - 12 * 24 * 60 * 60 * 1000)), 'recent');
  assert.equal(freshnessBucket(new Date(now - 40 * 24 * 60 * 60 * 1000)), 'stale');
  assert.equal(freshnessBucket(null), 'unknown');
});
