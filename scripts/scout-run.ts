import { prisma } from '@job-ops/db';
import { runScoutIngestion } from '../workers/scout/index.js';
import {
  buildInitialScoutFixtureRunInput,
  initialScoutProfile,
  isScoutRunTrigger,
  type ScoutRunTrigger,
} from './scout-profile.js';

type ScoutRunCliOptions = {
  trigger: ScoutRunTrigger;
  provider: 'fixture';
};

function parseArgs(argv: string[]): ScoutRunCliOptions {
  let trigger: ScoutRunTrigger = 'manual';
  let provider: 'fixture' = 'fixture';

  for (const arg of argv) {
    if (arg.startsWith('--trigger=')) {
      const value = arg.slice('--trigger='.length);
      if (!isScoutRunTrigger(value)) {
        throw new Error(`Invalid --trigger value: ${value}`);
      }
      trigger = value;
      continue;
    }

    if (arg.startsWith('--provider=')) {
      const value = arg.slice('--provider='.length);
      if (value !== 'fixture') {
        throw new Error(`Unsupported --provider value: ${value}. Only fixture is implemented right now.`);
      }
      provider = value;
      continue;
    }
  }

  return { trigger, provider };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.provider !== 'fixture') {
    throw new Error(`Unsupported provider: ${options.provider}`);
  }

  const run = await runScoutIngestion(buildInitialScoutFixtureRunInput(options.trigger));

  console.log(
    JSON.stringify(
      {
        mode: 'scheduled-entrypoint',
        provider: options.provider,
        trigger: options.trigger,
        profile: initialScoutProfile,
        run: {
          id: run.id,
          sourceKey: run.sourceKey,
          searchTerm: run.searchTerm,
          searchLocation: run.searchLocation,
          status: run.status,
          resultCount: run.resultCount,
          createdJobCount: run.createdJobCount,
          dedupedCount: run.dedupedCount,
          startedAt: run.startedAt.toISOString(),
          completedAt: run.completedAt ? run.completedAt.toISOString() : null,
          notes: run.notes,
        },
        caveat: 'Fixture-backed entrypoint is live. Real JobSpy MCP fetching is still a separate next feature.',
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
