import { ActorType, JobStatus, WorkMode, prisma } from '@job-ops/db';
import { makeAuditEvent } from '@job-ops/domain';
import { runScoutIngestion } from '../workers/scout/index.js';

async function seedAdjacentOverrideHistory() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  for (let i = 0; i < 2; i += 1) {
    const company = await prisma.company.create({
      data: {
        name: `Scout Learning Seed ${suffix}-${i}`,
        normalizedName: `scout-learning-seed-${suffix}-${i}`,
      },
    });

    const scrapeRun = await prisma.scrapeRun.create({
      data: {
        sourceKey: 'learning-seed',
        searchTerm: 'Data Analyst',
        searchLocation: 'New York City',
        triggerType: 'test',
        status: 'completed',
        resultCount: 1,
        fetchedCount: 1,
        capturedCount: 1,
        normalizedCount: 1,
        rejectedCount: 0,
        erroredCount: 0,
        dedupedCount: 0,
        createdJobCount: 1,
        notes: `learning-seed-${i}`,
        completedAt: new Date(),
      },
    });

    const job = await prisma.job.create({
      data: {
        companyId: company.id,
        title: `Business Analyst Learning Seed ${suffix}-${i}`,
        normalizedTitle: 'business analyst learning seed',
        locationText: 'New York City',
        workMode: WorkMode.hybrid,
        jobUrl: `https://example.com/learning-seed/${suffix}/${i}`,
        jobDescriptionRaw: 'Learning seed job',
        jobDescriptionClean: 'Learning seed job',
        status: JobStatus.shortlisted,
      },
    });

    const decision = await prisma.scoutDecision.create({
      data: {
        jobId: job.id,
        scrapeRunId: scrapeRun.id,
        verdict: 'needs_human_review',
        confidence: 0.64,
        reasonsJson: ['Seeded ambiguity for learning validation.'],
        ambiguityFlagsJson: ['adjacent_analyst_title'],
        actedAutomatically: false,
        policyVersion: 'scout-decision-v2-learning',
      },
    });

    await prisma.auditEvent.create({
      data: makeAuditEvent({
        entityType: 'job',
        entityId: job.id,
        eventType: 'scout.feedback_recorded',
        actorType: ActorType.user,
        actorLabel: 'learning-validator',
        payloadJson: {
          actionTaken: 'shortlist',
          feedbackType: 'override',
          scoutDecisionId: decision.id,
          scoutVerdict: decision.verdict,
          scoutConfidence: decision.confidence,
        },
      }),
    });
  }
}

async function main() {
  await seedAdjacentOverrideHistory();

  const result = await runScoutIngestion({
    sourceKey: 'learning-validation',
    searchTerm: 'Data Analyst',
    searchLocation: 'New York City',
    actorLabel: 'learning-validator',
    triggerType: 'test',
    fetchedCount: 1,
    rejectedCount: 0,
    records: [
      {
        sourceKey: 'learning-validation',
        sourceRecordId: `learning-record-${Date.now()}`,
        sourceUrl: `https://example.com/learning-validation/${Date.now()}`,
        companyName: 'Learning Validation Co',
        title: 'Business Analyst, Data & AI',
        locationText: 'New York City',
        description: 'Adjacent analyst role with SQL, dashboards, and AI workflow reporting responsibilities.',
        salaryText: '$98k-$110k',
        datePosted: new Date().toISOString(),
      },
    ],
  });

  const decision = await prisma.scoutDecision.findFirst({
    where: { scrapeRunId: result.run.id },
    orderBy: { createdAt: 'desc' },
  });

  if (!decision) {
    throw new Error('No ScoutDecision created for learning validation run');
  }

  const ambiguityFlags = Array.isArray(decision.ambiguityFlagsJson) ? decision.ambiguityFlagsJson : [];
  const reasons = Array.isArray(decision.reasonsJson) ? decision.reasonsJson : [];

  if (ambiguityFlags.includes('adjacent_analyst_title')) {
    throw new Error('Adjacent analyst ambiguity flag was not reduced by learned override history');
  }

  const hasLearningReason = reasons.some(
    (reason) => typeof reason === 'string' && reason.includes('manual-override history'),
  );

  if (!hasLearningReason) {
    throw new Error('Learning reason was not reflected in Scout decision reasons');
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        runId: result.run.id,
        verdict: decision.verdict,
        confidence: decision.confidence,
        ambiguityFlags,
        reasons,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
