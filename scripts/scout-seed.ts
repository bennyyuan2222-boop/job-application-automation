import { runScoutIngestion } from '../workers/scout/index.js';
import { resolveScoutRunInput } from './scout-source-adapters.js';

async function main() {
  const resolved = await resolveScoutRunInput({
    provider: 'fixture',
    trigger: 'manual',
  });

  await runScoutIngestion(resolved.runInput);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
