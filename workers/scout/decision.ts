import { JobStatus } from '@job-ops/db';

export type ScoutDecisionVerdict = 'shortlist' | 'archive' | 'defer' | 'needs_human_review';

export type ScoutDecisionDraft = {
  verdict: ScoutDecisionVerdict;
  confidence: number;
  reasons: string[];
  ambiguityFlags: string[];
  actedAutomatically: boolean;
  resultingStatus: JobStatus;
  policyVersion: string;
};

export const HEURISTIC_SCOUT_POLICY_VERSION = 'scout-heuristic-v2';
export const JOB_SEARCHER_SCOUT_POLICY_VERSION = 'job-searcher-scout-v1';

export function resolveResultingStatus(verdict: ScoutDecisionVerdict, actedAutomatically: boolean) {
  if (!actedAutomatically) {
    return JobStatus.discovered;
  }

  return verdict === 'shortlist' ? JobStatus.shortlisted : JobStatus.archived;
}
