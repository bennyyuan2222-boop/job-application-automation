import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { runScoutIngestion } from '@job-ops/scout-worker';
import type { RawScoutJobInput } from '@job-ops/domain';

import { requireRouteSession } from '../../../../../lib/route-auth';
import { sameOriginUrl } from '../../../../../lib/redirects';

export const dynamic = 'force-dynamic';

const SAMPLE_SCOUT_RECORDS: RawScoutJobInput[] = [
  {
    sourceKey: 'manual-scout-sample',
    sourceRecordId: 'sample-northstar-data-analyst',
    sourceUrl: 'https://jobs.example.com/northstar-data-analyst',
    companyName: 'Northstar AI',
    title: 'Data Analyst',
    locationText: 'New York, NY',
    description:
      'SQL, dashboarding, experimentation, and AI workflow reporting for a fast-growing product team.',
    salaryText: '$82k-$96k',
    datePosted: new Date().toISOString(),
  },
  {
    sourceKey: 'manual-scout-sample',
    sourceRecordId: 'sample-signal-grid-business-analyst',
    sourceUrl: 'https://jobs.example.com/signal-grid-business-analyst',
    companyName: 'Signal Grid',
    title: 'Business Analyst, AI Operations',
    locationText: 'Remote - US',
    remote: true,
    description: 'Cross-functional business analysis, KPI reporting, SQL, and AI operations support.',
    salaryText: '$78k-$92k',
    datePosted: new Date().toISOString(),
  },
];

export async function GET(request: NextRequest) {
  const auth = await requireRouteSession(request);
  if (!auth.ok) return auth.response;

  const { session } = auth;

  await runScoutIngestion({
    sourceKey: 'manual-scout-sample',
    searchTerm: 'sample analytics roles',
    searchLocation: 'Remote / New York',
    actorLabel: session.email,
    records: SAMPLE_SCOUT_RECORDS,
  });

  revalidatePath('/');
  revalidatePath('/inbox');
  revalidatePath('/shortlist');
  revalidatePath('/activity');

  return NextResponse.redirect(sameOriginUrl(request, '/inbox'));
}
