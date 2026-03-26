import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertApplicationTransition,
  assertJobTransition,
  assertTailoringRunTransition,
  canTransitionApplication,
  canTransitionJob,
  canTransitionTailoringRun,
  listAllowedApplicationTransitions,
  listAllowedTailoringRunTransitions,
} from './state';

test('job transitions allow discovered -> shortlisted', () => {
  assert.equal(canTransitionJob('discovered', 'shortlisted'), true);
  assert.doesNotThrow(() => assertJobTransition('discovered', 'archived'));
});

test('job transitions reject archived -> discovered', () => {
  assert.equal(canTransitionJob('archived', 'discovered'), false);
  assert.throws(() => assertJobTransition('archived', 'discovered'));
});

test('application transitions allow tailoring_review -> applying', () => {
  assert.equal(canTransitionApplication('tailoring_review', 'applying'), true);
  assert.deepEqual(listAllowedApplicationTransitions('applying'), ['paused', 'submit_review', 'archived']);
});

test('application transitions reject submitted -> applying', () => {
  assert.equal(canTransitionApplication('submitted', 'applying'), false);
  assert.throws(() => assertApplicationTransition('submitted', 'applying'));
});

test('tailoring run transitions allow generating -> generated_for_review', () => {
  assert.equal(canTransitionTailoringRun('generating', 'generated_for_review'), true);
  assert.deepEqual(listAllowedTailoringRunTransitions('edits_requested'), ['generating', 'paused', 'failed']);
});

test('tailoring run transitions allow generated_for_review -> approved and rejected', () => {
  assert.equal(canTransitionTailoringRun('generated_for_review', 'approved'), true);
  assert.equal(canTransitionTailoringRun('generated_for_review', 'rejected'), true);
});

test('tailoring run transitions reject approved -> edits_requested', () => {
  assert.equal(canTransitionTailoringRun('approved', 'edits_requested'), false);
  assert.throws(() => assertTailoringRunTransition('approved', 'edits_requested'));
});
