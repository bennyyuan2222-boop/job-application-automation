import { runScoutIngestion } from '../workers/scout/index.js';
import { buildInitialScoutFixtureRunInput } from './scout-profile.js';

async function main() {
  await runScoutIngestion(buildInitialScoutFixtureRunInput('manual'));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
