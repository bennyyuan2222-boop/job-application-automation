import { NextResponse } from 'next/server';
import { prisma } from '@job-ops/db';
import { buildResumeArtifactFilename, coerceResumeDocument, renderResumePdf } from '@job-ops/tailoring';

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
      sectionsJson: true,
    },
  });

  if (!resumeVersion) {
    return new NextResponse('Resume artifact not found', { status: 404 });
  }

  const document = coerceResumeDocument(resumeVersion.sectionsJson, resumeVersion.contentMarkdown);
  const pdfBytes = renderResumePdf(resumeVersion.title, document);
  const pdfBody = new Blob([Uint8Array.from(pdfBytes)], { type: 'application/pdf' });

  return new NextResponse(pdfBody, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${buildResumeArtifactFilename(resumeVersion.title, 'pdf')}"`,
      'Cache-Control': 'private, max-age=300',
      'Content-Length': String(pdfBytes.byteLength),
    },
  });
}
