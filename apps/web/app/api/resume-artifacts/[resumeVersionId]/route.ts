import { NextResponse } from 'next/server';
import { prisma } from '@job-ops/db';
import { buildResumeArtifactFilename } from '@job-ops/tailoring';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ resumeVersionId: string }> },
) {
  const { resumeVersionId } = await params;

  const resumeVersion = await prisma.resumeVersion.findUnique({
    where: { id: resumeVersionId },
    select: {
      id: true,
      title: true,
      contentMarkdown: true,
    },
  });

  if (!resumeVersion) {
    return new NextResponse('Resume artifact not found', { status: 404 });
  }

  return new NextResponse(resumeVersion.contentMarkdown, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `inline; filename="${buildResumeArtifactFilename(resumeVersion.title)}"`,
      'Cache-Control': 'private, max-age=60',
    },
  });
}
