import { ActorType, ApplicationStatus, prisma } from '@job-ops/db';
import { makeAuditEvent } from '@job-ops/domain';
import { generateTailoringDraftForApplication } from '@job-ops/needle-worker';

import { chooseProvisionalBaseResumeForJob } from './tailoring-bootstrap';

export type StartApplicationForJobResult = {
  applicationId: string;
  provisionalBaseResumeId: string;
};

export async function startApplicationForJob(args: {
  jobId: string;
  jobStatus: string;
  actorLabel: string;
  initialTailoringInstructions?: string;
}) : Promise<StartApplicationForJobResult> {
  const provisionalBaseResume = await chooseProvisionalBaseResumeForJob(args.jobId);

  if (!provisionalBaseResume) {
    throw new Error('No base resume versions are available to start an application');
  }

  const application = await prisma.$transaction(async (tx) => {
    const createdApplication = await tx.application.create({
      data: {
        jobId: args.jobId,
        status: ApplicationStatus.tailoring,
        baseResumeVersionId: provisionalBaseResume.resumeVersionId,
      },
    });

    await tx.auditEvent.createMany({
      data: [
        makeAuditEvent({
          entityType: 'application',
          entityId: createdApplication.id,
          eventType: 'application.created',
          actorType: ActorType.user,
          actorLabel: args.actorLabel,
          afterState: { status: ApplicationStatus.tailoring, jobId: args.jobId },
          payloadJson: {
            jobId: args.jobId,
            baseResumeVersionId: provisionalBaseResume.resumeVersionId,
            baseResumeSelectionMode: 'bootstrap_provisional_selection',
            baseResumeSelectionReasons: provisionalBaseResume.reasons,
          },
        }),
        makeAuditEvent({
          entityType: 'job',
          entityId: args.jobId,
          eventType: 'job.application_started',
          actorType: ActorType.user,
          actorLabel: args.actorLabel,
          beforeState: { status: args.jobStatus },
          afterState: { status: args.jobStatus },
          payloadJson: { applicationId: createdApplication.id },
        }),
      ],
    });

    return createdApplication;
  });

  await generateTailoringDraftForApplication(application.id, {
    actorLabel: args.actorLabel,
    instructions: args.initialTailoringInstructions ?? 'Auto-generated after starting application from shortlist.',
  });

  return {
    applicationId: application.id,
    provisionalBaseResumeId: provisionalBaseResume.resumeVersionId,
  };
}
