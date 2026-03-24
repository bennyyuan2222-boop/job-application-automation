'use server';

import { Prisma, prisma } from '@job-ops/db';
import { revalidatePath } from 'next/cache';

import { assertJobTransition } from '@job-ops/domain';

import { requireSession } from '../../../lib/auth';

function asJson(value: Prisma.InputJsonValue | null | undefined) {
  return value ?? Prisma.JsonNull;
}

async function transitionJob(jobId: string, nextStatus: 'shortlisted' | 'archived') {
  const session = await requireSession();
  const job = await prisma.job.findUnique({ where: { id: jobId } });

  if (!job) throw new Error('Job not found.');

  assertJobTransition(job.status, nextStatus);

  await prisma.job.update({
    where: { id: jobId },
    data: { status: nextStatus },
  });

  await prisma.auditEvent.create({
    data: {
      entityType: 'job',
      entityId: jobId,
      eventType: nextStatus === 'shortlisted' ? 'job.shortlisted' : 'job.archived',
      actorType: 'user',
      actorLabel: session.email,
      beforeState: asJson({ status: job.status }),
      afterState: asJson({ status: nextStatus }),
      payloadJson: asJson({ via: 'web-action' }),
    },
  });

  revalidatePath('/inbox');
  revalidatePath('/shortlist');
  revalidatePath('/activity');
}

export async function shortlistJobAction(formData: FormData) {
  const jobId = String(formData.get('jobId') ?? '');
  if (!jobId) throw new Error('Missing jobId');
  await transitionJob(jobId, 'shortlisted');
}

export async function archiveJobAction(formData: FormData) {
  const jobId = String(formData.get('jobId') ?? '');
  if (!jobId) throw new Error('Missing jobId');
  await transitionJob(jobId, 'archived');
}
