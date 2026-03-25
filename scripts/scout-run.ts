import { prisma } from '@job-ops/db';
import { runScoutIngestion } from '../workers/scout/index.js';
import {
  initialScoutProfile,
  isScoutProvider,
  isScoutRunTrigger,
  type ScoutProvider,
  type ScoutRunTrigger,
} from './scout-profile.js';
import { resolveScoutRunInput } from './scout-source-adapters.js';

type ScoutRunCliOptions = {
  trigger: ScoutRunTrigger;
  provider: ScoutProvider;
};

function parseArgs(argv: string[]): ScoutRunCliOptions {
  let trigger: ScoutRunTrigger = 'manual';
  let provider: ScoutProvider = isScoutProvider(process.env.SCOUT_PROVIDER ?? '')
    ? (process.env.SCOUT_PROVIDER as ScoutProvider)
    : 'fixture';

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
      if (!isScoutProvider(value)) {
        throw new Error(`Unsupported --provider value: ${value}`);
      }
      provider = value;
      continue;
    }
  }

  return { trigger, provider };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const resolved = await resolveScoutRunInput(options);
  const run = await runScoutIngestion(resolved.runInput);

  console.log(
    JSON.stringify(
      {
        mode: 'scheduled-entrypoint',
        provider: resolved.provider,
        trigger: options.trigger,
        profile: resolved.profile,
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
        caveat: resolved.caveat ?? null,
        initialProfileDefaults: initialScoutProfile,
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
