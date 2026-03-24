'use server';

import { revalidatePath } from 'next/cache';

import {
  approveTailoringRunForApplication,
  generateTailoringDraftForApplication,
  pauseTailoringForApplication,
  requestTailoringEditsForApplication,
} from '../../../../../workers/needle/src/service';

import { requireSession } from '../../../lib/auth';

function requiredValue(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? '').trim();
  if (!value) {
    throw new Error(`Missing required field: ${key}`);
  }
  return value;
}

function revalidateTailoringPaths(applicationId: string) {
  revalidatePath('/tailoring');
  revalidatePath(`/tailoring/${applicationId}`);
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath('/activity');
}

export async function generateDraftAction(formData: FormData) {
  const session = await requireSession();
  const applicationId = requiredValue(formData, 'applicationId');
  const instructions = String(formData.get('instructions') ?? '').trim();

  await generateTailoringDraftForApplication(applicationId, {
    instructions: instructions || undefined,
    actorLabel: session.email,
  });

  revalidateTailoringPaths(applicationId);
}

export async function approveDraftAction(formData: FormData) {
  const session = await requireSession();
  const applicationId = requiredValue(formData, 'applicationId');
  const tailoringRunId = requiredValue(formData, 'tailoringRunId');

  await approveTailoringRunForApplication(applicationId, tailoringRunId, {
    actorLabel: session.email,
  });

  revalidateTailoringPaths(applicationId);
}

export async function requestEditsAction(formData: FormData) {
  const session = await requireSession();
  const applicationId = requiredValue(formData, 'applicationId');
  const tailoringRunId = requiredValue(formData, 'tailoringRunId');
  const revisionNote = requiredValue(formData, 'revisionNote');

  await requestTailoringEditsForApplication(applicationId, tailoringRunId, revisionNote, {
    actorLabel: session.email,
  });

  revalidateTailoringPaths(applicationId);
}

export async function pauseTailoringAction(formData: FormData) {
  const session = await requireSession();
  const applicationId = requiredValue(formData, 'applicationId');
  const reason = requiredValue(formData, 'reason');

  await pauseTailoringForApplication(applicationId, reason, {
    actorLabel: session.email,
  });

  revalidateTailoringPaths(applicationId);
}
