import { processNextNeedleTask } from './queue';

async function main() {
  const mode = (process.argv[2] ?? 'once').trim().toLowerCase();
  const workerLabel = process.env.NEEDLE_WORKER_LABEL?.trim() || 'needle-macmini-worker';
  const pollMs = parseInteger(process.env.NEEDLE_WORKER_POLL_MS, 5000);

  if (mode === 'once') {
    const result = await processNextNeedleTask({ workerLabel });
    console.log(JSON.stringify({ mode, result }, null, 2));
    return;
  }

  if (mode !== 'watch') {
    throw new Error(`Unknown runner mode: ${mode}`);
  }

  console.log(`[needle-runner] starting watch loop with poll=${pollMs}ms as ${workerLabel}`);
  for (;;) {
    try {
      const result = await processNextNeedleTask({ workerLabel });
      if (result) {
        console.log(`[needle-runner] completed task ${result.id} -> ${result.status}`);
      }
    } catch (error) {
      console.error('[needle-runner] task failed', error);
    }

    await sleep(pollMs);
  }
}

function parseInteger(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
