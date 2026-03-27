import { ResumeVersionKind, prisma } from '@job-ops/db';
import { chooseBestBaseResume, coerceResumeDocument, type JobContext, type ResumeCandidate } from '@job-ops/tailoring';

function toRequirementList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function toJobContext(job: {
  id: string;
  title: string;
  locationText: string;
  jobDescriptionRaw: string;
  jobDescriptionClean: string | null;
  jobRequirementsJson: unknown;
  company: { name: string };
}): JobContext {
  const requirements = (job.jobRequirementsJson ?? {}) as Record<string, unknown>;

  return {
    id: job.id,
    title: job.title,
    companyName: job.company.name,
    locationText: job.locationText,
    description: job.jobDescriptionClean ?? job.jobDescriptionRaw,
    requirements: {
      mustHave: toRequirementList(requirements.mustHave),
      niceToHave: toRequirementList(requirements.niceToHave),
    },
  };
}

function toResumeCandidate(record: {
  id: string;
  title: string;
  contentMarkdown: string;
  sectionsJson: unknown;
}): ResumeCandidate {
  return {
    id: record.id,
    title: record.title,
    contentMarkdown: record.contentMarkdown,
    document: coerceResumeDocument(record.sectionsJson, record.contentMarkdown),
  };
}

export type ProvisionalBaseResumeSelection = {
  resumeVersionId: string;
  title: string;
  reasons: string[];
  lane?: string;
  score: number;
};

export async function chooseProvisionalBaseResumeForJob(jobId: string): Promise<ProvisionalBaseResumeSelection | null> {
  const [job, baseResumes] = await Promise.all([
    prisma.job.findUnique({
      where: { id: jobId },
      include: {
        company: true,
      },
    }),
    prisma.resumeVersion.findMany({
      where: { kind: ResumeVersionKind.base },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  if (!job || baseResumes.length === 0) {
    return null;
  }

  const candidates = baseResumes.map((resume) => toResumeCandidate(resume));
  const selection = chooseBestBaseResume(toJobContext(job), candidates);
  const selected = candidates.find((candidate) => candidate.id === selection.resumeVersionId);

  if (!selected) {
    return null;
  }

  return {
    resumeVersionId: selected.id,
    title: selected.title,
    reasons: selection.reasons,
    ...(selection.lane ? { lane: selection.lane } : {}),
    score: selection.score,
  };
}
