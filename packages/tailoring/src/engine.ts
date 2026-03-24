import type { ResumeDocument, ResumeEntry, ResumeSection, TailoringRisk } from '@job-ops/domain';

const STOPWORDS = new Set([
  'about',
  'across',
  'after',
  'also',
  'analysis',
  'and',
  'application',
  'applications',
  'built',
  'business',
  'company',
  'data',
  'experience',
  'for',
  'from',
  'into',
  'job',
  'jobs',
  'more',
  'role',
  'team',
  'their',
  'them',
  'this',
  'using',
  'with',
  'work',
]);

export type JobContext = {
  id?: string;
  title: string;
  companyName: string;
  locationText?: string;
  description: string;
  requirements?: {
    mustHave?: string[];
    niceToHave?: string[];
  };
};

export type ResumeCandidate = {
  id: string;
  title: string;
  contentMarkdown: string;
  document: ResumeDocument;
};

export type BaseResumeSelection = {
  resumeVersionId: string;
  score: number;
  reasons: string[];
  lane?: string;
};

export type TailoredResumeDraft = {
  title: string;
  contentMarkdown: string;
  document: ResumeDocument;
  rationale: string[];
  risks: TailoringRisk[];
  changeSummary: string[];
  selectedKeywords: string[];
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function tokenize(value: string): string[] {
  const tokens = normalize(value).match(/[a-z0-9][a-z0-9\/+.#-]*/g) ?? [];
  return tokens.filter((token) => token.length >= 4 && !STOPWORDS.has(token));
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = normalize(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value.trim());
  }
  return result;
}

function entryText(entry: ResumeEntry): string {
  return [entry.heading, entry.subheading, entry.location, entry.dateRange, ...(entry.lines ?? []), ...(entry.bullets ?? [])]
    .filter(Boolean)
    .join(' ');
}

function documentText(document: ResumeDocument): string {
  return [
    document.meta?.lane,
    document.meta?.summary,
    ...(document.meta?.keywords ?? []),
    ...document.sections.flatMap((section) => [section.title, ...section.entries.map((entry) => entryText(entry))]),
  ]
    .filter(Boolean)
    .join(' ');
}

function getRequirementPhrases(job: JobContext): string[] {
  return dedupe([...(job.requirements?.mustHave ?? []), ...(job.requirements?.niceToHave ?? [])]);
}

export function extractJobKeywords(job: JobContext, limit = 8): string[] {
  const phraseKeywords = dedupe(getRequirementPhrases(job)).slice(0, limit);
  const tokenKeywords = dedupe(tokenize([job.title, job.description, ...getRequirementPhrases(job)].join(' '))).slice(0, limit * 2);
  return dedupe([...phraseKeywords, ...tokenKeywords]).slice(0, limit);
}

function scoreOverlap(text: string, keywords: string[]): number {
  const lower = normalize(text);
  let score = 0;
  for (const keyword of keywords) {
    const tokenParts = tokenize(keyword);
    if (lower.includes(normalize(keyword))) {
      score += 4;
      continue;
    }
    score += tokenParts.filter((token) => lower.includes(token)).length;
  }
  return score;
}

export function chooseBestBaseResume(job: JobContext, candidates: ResumeCandidate[]): BaseResumeSelection {
  if (candidates.length === 0) {
    throw new Error('No base resume candidates available');
  }

  const jobKeywords = extractJobKeywords(job, 10);
  const ranked = candidates
    .map((candidate) => {
      const lane = candidate.document.meta?.lane;
      const score = scoreOverlap(documentText(candidate.document), jobKeywords);
      const laneBonus = lane ? scoreOverlap(lane, jobKeywords) : 0;
      return {
        candidate,
        score: score + laneBonus,
      };
    })
    .sort((a, b) => b.score - a.score);

  const winner = ranked[0]!;
  const reasons = [
    `Selected ${winner.candidate.title} as the strongest base resume match.`,
    `Top overlapping job keywords: ${jobKeywords.slice(0, 4).join(', ') || 'none'}.`,
  ];

  if (winner.candidate.document.meta?.lane) {
    reasons.push(`Lane match: ${winner.candidate.document.meta.lane}.`);
  }

  return {
    resumeVersionId: winner.candidate.id,
    score: winner.score,
    reasons,
    lane: winner.candidate.document.meta?.lane,
  };
}

function selectEntries(section: ResumeSection, jobKeywords: string[], maxEntries: number, maxBullets: number): ResumeSection {
  if (section.kind === 'education' || section.kind === 'skills' || section.kind === 'summary') {
    return section;
  }

  const rankedEntries = [...section.entries]
    .map((entry) => ({
      entry,
      score: scoreOverlap(entryText(entry), jobKeywords),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxEntries)
    .map(({ entry }) => ({
      ...entry,
      bullets: (entry.bullets ?? [])
        .map((bullet) => ({ bullet, score: scoreOverlap(bullet, jobKeywords) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, maxBullets)
        .map(({ bullet }) => bullet),
    }));

  return {
    ...section,
    entries: rankedEntries,
  };
}

function summarizeFocus(baseSummary: string | undefined, selectedKeywords: string[]): string | undefined {
  if (!baseSummary && selectedKeywords.length === 0) {
    return undefined;
  }

  if (!baseSummary) {
    return `Emphasis on ${selectedKeywords.slice(0, 3).join(', ')}.`;
  }

  if (selectedKeywords.length === 0) {
    return baseSummary;
  }

  return `${baseSummary.replace(/\.$/, '')} Emphasis on ${selectedKeywords.slice(0, 3).join(', ')}.`;
}

function buildRisks(job: JobContext, base: ResumeCandidate): TailoringRisk[] {
  const baseText = normalize(documentText(base.document));
  const risks: TailoringRisk[] = [];

  for (const requirement of getRequirementPhrases(job)) {
    const requirementTokens = tokenize(requirement);
    const supported =
      requirementTokens.length === 0
        ? baseText.includes(normalize(requirement))
        : requirementTokens.some((token) => baseText.includes(token));

    if (supported) {
      continue;
    }

    risks.push({
      requirement,
      severity: 'medium',
      reason: 'Requirement does not appear clearly in the selected truth-source resume content.',
    });
  }

  return risks.slice(0, 6);
}

export function buildTailoredResumeDraft(job: JobContext, base: ResumeCandidate): TailoredResumeDraft {
  const jobKeywords = extractJobKeywords(job, 10);
  const supportedKeywords = jobKeywords.filter((keyword) => scoreOverlap(documentText(base.document), [keyword]) > 0).slice(0, 5);

  const tailoredSections = base.document.sections.map((section) => {
    if (section.kind === 'experience') {
      return selectEntries(section, supportedKeywords, 2, 4);
    }
    if (section.kind === 'projects') {
      return selectEntries(section, supportedKeywords, 2, 3);
    }
    if (section.kind === 'leadership') {
      return selectEntries(section, supportedKeywords, 1, 4);
    }
    return section;
  });

  const tailoredDocument: ResumeDocument = {
    meta: {
      ...base.document.meta,
      summary: summarizeFocus(base.document.meta?.summary, supportedKeywords),
    },
    sections: tailoredSections,
  };

  const changeSummary = [
    `Started from ${base.title}.`,
    `Reweighted bullet selection toward: ${supportedKeywords.slice(0, 4).join(', ') || 'closest available overlap'}.`,
    'Preserved truth-source wording by selecting from existing resume content instead of inventing new claims.',
  ];

  const rationale = [
    `Base resume chosen for strongest overlap with ${job.title} at ${job.companyName}.`,
    `Tailored emphasis came from supported overlap only: ${supportedKeywords.slice(0, 5).join(', ') || 'no strong overlap found'}.`,
  ];

  const risks = buildRisks(job, base);
  if (risks.length > 0) {
    rationale.push('Flagged requirements with weak or missing support instead of fabricating coverage.');
  }

  return {
    title: `${job.companyName} — ${job.title} Tailored Resume`,
    contentMarkdown: '',
    document: tailoredDocument,
    rationale,
    risks,
    changeSummary,
    selectedKeywords: supportedKeywords,
  };
}
