import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateApplicationReadiness } from './index';
import { latchReadinessMatrix } from './latch-readiness-matrix';

for (const fixture of latchReadinessMatrix) {
  test(fixture.name, () => {
    const result = evaluateApplicationReadiness(fixture.input);

    assert.equal(result.ready, fixture.expected.ready);
    assert.equal(result.missingRequiredCount, fixture.expected.missingRequiredCount);
    assert.equal(result.lowConfidenceCount, fixture.expected.lowConfidenceCount);
    assert.equal(result.recommendedNextAction, fixture.expected.recommendedNextAction);

    assert.deepEqual(
      result.hardBlockers.map((issue) => issue.code).sort(),
      [...fixture.expected.hardBlockerCodes].sort(),
    );

    assert.deepEqual(
      result.softWarnings.map((issue) => issue.code).sort(),
      [...fixture.expected.softWarningCodes].sort(),
    );
  });
}
