import type { ApplicationStatus, JobStatus, TailoringRunStatus } from './types';

const jobTransitions: Record<JobStatus, JobStatus[]> = {
  discovered: ['shortlisted', 'archived'],
  shortlisted: ['archived'],
  archived: [],
};

const applicationTransitions: Record<ApplicationStatus, ApplicationStatus[]> = {
  tailoring: ['tailoring_review', 'paused', 'archived'],
  tailoring_review: ['tailoring', 'applying', 'paused', 'archived'],
  paused: ['tailoring', 'tailoring_review', 'applying', 'archived'],
  applying: ['paused', 'submit_review', 'archived'],
  submit_review: ['applying', 'paused', 'submitted', 'archived'],
  submitted: [],
  archived: [],
};

const tailoringRunTransitions: Record<TailoringRunStatus, TailoringRunStatus[]> = {
  created: ['generating', 'paused', 'failed'],
  generating: ['generated_for_review', 'failed', 'paused'],
  generated_for_review: ['edits_requested', 'approved', 'rejected', 'paused', 'failed'],
  edits_requested: ['generating', 'paused', 'failed'],
  approved: [],
  rejected: [],
  paused: ['generating', 'failed'],
  failed: [],
};

export function canTransitionJob(from: JobStatus, to: JobStatus): boolean {
  return jobTransitions[from].includes(to);
}

export function canTransitionApplication(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return applicationTransitions[from].includes(to);
}

export function canTransitionTailoringRun(from: TailoringRunStatus, to: TailoringRunStatus): boolean {
  return tailoringRunTransitions[from].includes(to);
}

export function assertJobTransition(from: JobStatus, to: JobStatus): void {
  if (!canTransitionJob(from, to)) {
    throw new Error(`Invalid job transition: ${from} -> ${to}`);
  }
}

export function assertApplicationTransition(from: ApplicationStatus, to: ApplicationStatus): void {
  if (!canTransitionApplication(from, to)) {
    throw new Error(`Invalid application transition: ${from} -> ${to}`);
  }
}

export function assertTailoringRunTransition(from: TailoringRunStatus, to: TailoringRunStatus): void {
  if (!canTransitionTailoringRun(from, to)) {
    throw new Error(`Invalid tailoring run transition: ${from} -> ${to}`);
  }
}

export function listAllowedJobTransitions(from: JobStatus): JobStatus[] {
  return [...jobTransitions[from]];
}

export function listAllowedApplicationTransitions(from: ApplicationStatus): ApplicationStatus[] {
  return [...applicationTransitions[from]];
}

export function listAllowedTailoringRunTransitions(from: TailoringRunStatus): TailoringRunStatus[] {
  return [...tailoringRunTransitions[from]];
}
