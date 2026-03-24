import { revalidatePath } from 'next/cache';
import { ActorType, prisma } from '@job-ops/db';
import { makeAuditEvent } from '@job-ops/domain';
import { NextRequest, NextResponse } from 'next/server';

import { requireRouteSession } from '../../../../../../lib/route-auth';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { session, response } = await requireRouteSession(request);
  if (response || !session) return response;

  const { jobId } = await params;
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    return NextResponse.redirect(new URL('/shortlist', request.url));
  }

  await prisma.$transaction(async (tx) => {
    await tx.job.update({ where: { id: jobId }, data: { status: 'archived' } });
    await tx.auditEvent.create({
      data: makeAuditEvent({
        entityType: 'job',
        entityId: jobId,
        eventType: 'job.archived',
        actorType: ActorType.user,
        actorLabel: session.email,
        beforeState: { status: job.status },
        afterState: { status: 'archived' },
      }),
    });
  });

  revalidatePath('/');
  revalidatePath('/inbox');
  revalidatePath('/shortlist');
  revalidatePath('/activity');

  return NextResponse.redirect(new URL('/shortlist', request.url));
}
