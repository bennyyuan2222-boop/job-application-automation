import { NextResponse } from 'next/server';

import { prisma } from '@job-ops/db';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: 'up' });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        db: 'down',
        error: error instanceof Error ? error.message : 'unknown-error',
      },
      { status: 503 },
    );
  }
}
