import type { ResumeLayoutMetrics, SectionLayoutMetric } from './pdf';

export type DensityAssessmentStatus = 'pass' | 'underfilled' | 'overflow' | 'accepted_with_warning';

export type DensityBaselineProfile = {
  bottomWhitespacePts: number;
  bottomWhitespaceRatio: number;
  skillsRenderedLines: number;
  finalSectionRenderedLines: number;
  totalRenderedLines: number;
  oneLineBulletRatio: number;
  sectionLineDistribution: Record<string, number>;
};

export type DensityAssessment = {
  status: DensityAssessmentStatus;
  score: number;
  reasons: string[];
  machineFeedback: string[];
  summary: {
    bottomWhitespacePts: number;
    bottomWhitespaceRatio: number;
    oneLineBulletRatio: number;
    skillsRenderedLines: number;
    finalSectionRenderedLines: number;
    totalRenderedLines: number;
  };
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function getSectionMetric(metrics: ResumeLayoutMetrics, matcher: (section: SectionLayoutMetric) => boolean) {
  return metrics.sectionMetrics.find(matcher) ?? null;
}

function getFinalSectionMetric(metrics: ResumeLayoutMetrics) {
  return metrics.sectionMetrics.at(-1) ?? null;
}

function sectionDistribution(metrics: ResumeLayoutMetrics) {
  const distribution: Record<string, number> = {};
  const denominator = Math.max(metrics.totalRenderedLines, 1);

  for (const section of metrics.sectionMetrics) {
    distribution[section.sectionName] = round(section.renderedLines / denominator, 4);
  }

  return distribution;
}

export function buildDensityBaselineProfile(metrics: ResumeLayoutMetrics): DensityBaselineProfile {
  const skillsSection = getSectionMetric(metrics, (section) => section.sectionKind === 'skills');
  const finalSection = getFinalSectionMetric(metrics);

  return {
    bottomWhitespacePts: round(metrics.bottomWhitespacePts),
    bottomWhitespaceRatio: round(metrics.bottomWhitespaceRatio, 4),
    skillsRenderedLines: skillsSection?.renderedLines ?? 0,
    finalSectionRenderedLines: finalSection?.renderedLines ?? 0,
    totalRenderedLines: metrics.totalRenderedLines,
    oneLineBulletRatio: round(metrics.oneLineBulletRatio, 4),
    sectionLineDistribution: sectionDistribution(metrics),
  };
}

export function analyzeResumeDensity(
  metrics: ResumeLayoutMetrics,
  baseline: DensityBaselineProfile,
): DensityAssessment {
  const skillsSection = getSectionMetric(metrics, (section) => section.sectionKind === 'skills');
  const finalSection = getFinalSectionMetric(metrics);

  const summary = {
    bottomWhitespacePts: round(metrics.bottomWhitespacePts),
    bottomWhitespaceRatio: round(metrics.bottomWhitespaceRatio, 4),
    oneLineBulletRatio: round(metrics.oneLineBulletRatio, 4),
    skillsRenderedLines: skillsSection?.renderedLines ?? 0,
    finalSectionRenderedLines: finalSection?.renderedLines ?? 0,
    totalRenderedLines: metrics.totalRenderedLines,
  };

  if (metrics.overflowed || metrics.pageCount > 1) {
    return {
      status: 'overflow',
      score: 20,
      reasons: ['Rendered output overflowed beyond one page.'],
      machineFeedback: [
        'Compress Skills before trimming substantive content.',
        'Shorten bullets only where the value stays intact and grounded.',
        'Remove the lowest-value bullets before dropping stronger evidence.',
      ],
      summary,
    };
  }

  const reasons: string[] = [];
  const machineFeedback: string[] = [];

  const whitespaceLimit = Math.max(baseline.bottomWhitespacePts + 18, metrics.pageHeightPts * 0.08);
  const whitespaceDelta = Math.max(0, metrics.bottomWhitespacePts - whitespaceLimit);
  const whitespacePenalty = clamp((whitespaceDelta / Math.max(whitespaceLimit, 1)) * 40, 0, 40);
  if (whitespaceDelta > 0) {
    reasons.push(
      `Bottom whitespace is too high (${round(metrics.bottomWhitespacePts)}pt vs max ${round(whitespaceLimit)}pt).`,
    );
    machineFeedback.push('Expand short bullets with supported detail instead of adding filler.');
    machineFeedback.push('Prefer strengthening Experience content before weaker end sections.');
  }

  const oneLineBulletMax = Math.max(0.5, baseline.oneLineBulletRatio + 0.08);
  const oneLineDelta = Math.max(0, metrics.oneLineBulletRatio - oneLineBulletMax);
  const oneLinePenalty = clamp((oneLineDelta / Math.max(1 - oneLineBulletMax, 0.01)) * 20, 0, 20);
  if (oneLineDelta > 0) {
    reasons.push(
      `Too many bullets render as short one-liners (${round(metrics.oneLineBulletRatio * 100)}% vs max ${round(
        oneLineBulletMax * 100,
      )}%).`,
    );
    machineFeedback.push('Allow slightly longer bullets when the added detail increases value and remains truthful.');
    machineFeedback.push('Restore omitted supported detail before introducing weaker filler bullets.');
  }

  const skillsLineMax = Math.min(3, Math.max(1, baseline.skillsRenderedLines + 1));
  const skillsDelta = Math.max(0, (skillsSection?.renderedLines ?? 0) - skillsLineMax);
  const skillsPenalty = clamp(skillsDelta * 5, 0, 10);
  if (skillsDelta > 0) {
    reasons.push(`Skills is using too many rendered lines (${skillsSection?.renderedLines ?? 0} vs max ${skillsLineMax}).`);
    machineFeedback.push('Compress Skills so denser evidence gets room elsewhere on the page.');
  }

  const finalSectionMin = Math.max(1, baseline.finalSectionRenderedLines - 2);
  const weakFinalSection =
    (finalSection?.renderedLines ?? 0) < finalSectionMin &&
    metrics.bottomWhitespaceRatio > baseline.bottomWhitespaceRatio + 0.03;
  const finalSectionPenalty = weakFinalSection ? 15 : 0;
  if (weakFinalSection) {
    reasons.push(
      `Final section feels stranded (${finalSection?.renderedLines ?? 0} rendered lines vs min ${finalSectionMin}).`,
    );
    machineFeedback.push('If space still feels light, add a stronger project before padding weaker sections.');
  }

  const totalLinesMin = Math.max(0, baseline.totalRenderedLines - 4);
  const totalLinesDelta = Math.max(0, totalLinesMin - metrics.totalRenderedLines);
  const totalLinesPenalty = clamp((totalLinesDelta / Math.max(totalLinesMin, 1)) * 10, 0, 10);
  if (totalLinesDelta > 0) {
    reasons.push(`Total rendered line count is light (${metrics.totalRenderedLines} vs target floor ${totalLinesMin}).`);
  }

  const score = clamp(Math.round(100 - whitespacePenalty - oneLinePenalty - skillsPenalty - finalSectionPenalty - totalLinesPenalty), 0, 100);

  const dedupedFeedback = [...new Set(machineFeedback)];
  if (reasons.length === 0 && score >= 75) {
    return {
      status: 'pass',
      score,
      reasons: ['Rendered density is within the current baseline tolerance.'],
      machineFeedback: [],
      summary,
    };
  }

  const strongUnderfill = whitespaceDelta > 0 || score < 60;
  return {
    status: strongUnderfill ? 'underfilled' : 'accepted_with_warning',
    score,
    reasons,
    machineFeedback: dedupedFeedback,
    summary,
  };
}

export function shouldRetryForDensity(assessment: DensityAssessment) {
  return assessment.status === 'underfilled';
}
