import { prisma } from '@job-ops/db';
import { backfillPostingViabilityChecksForShortlistedJobs } from '../workers/scout/index.js';

type CliOptions = {
  limit?: number;
  force: boolean;
  freshnessWindowHours?: number;
  jobIds: string[];
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    force: false,
    jobIds: [],
  };

  for (const arg of argv) {
    if (arg === '--force') {
      options.force = true;
      continue;
    }

    if (arg.startsWith('--limit=')) {
      options.limit = parsePositiveInteger(arg.slice('--limit='.length), '--limit');
      continue;
    }

    if (arg.startsWith('--freshness-hours=')) {
      options.freshnessWindowHours = parsePositiveNumber(arg.slice('--freshness-hours='.length), '--freshness-hours');
      continue;
    }

    if (arg.startsWith('--job-id=')) {
      const jobId = arg.slice('--job-id='.length).trim();
      if (!jobId) {
        throw new Error('Expected non-empty value for --job-id');
      }
      options.jobIds.push(jobId);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await backfillPostingViabilityChecksForShortlistedJobs({
    limit: options.limit,
    force: options.force,
    freshnessWindowHours: options.freshnessWindowHours,
    actorLabel: 'scout-posting-backfill-script',
    jobIds: options.jobIds,
  });

  console.log(
    JSON.stringify(
      {
        mode: 'scout-posting-check-backfill',
        options,
        result,
      },
      null,
      2,
    ),
  );

  if (result.errors.length > 0) {
    process.exitCode = 1;
  }
}

function parsePositiveInteger(value: string, flagName: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected positive integer for ${flagName}, got: ${value}`);
  }

  return parsed;
}

function parsePositiveNumber(value: string, flagName: string) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected positive number for ${flagName}, got: ${value}`);
  }

  return parsed;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
