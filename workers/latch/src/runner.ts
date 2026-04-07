import { drainLatchTaskQueue, getLatchWorkerRuntimeInfo, writeLatchWorkerHeartbeat } from './queue';

async function main() {
  const mode = (process.argv[2] ?? 'once').trim().toLowerCase();
  const workerLabel = process.env.LATCH_WORKER_LABEL?.trim() || 'latch-macmini-worker';
  const pollMs = parseInteger(process.env.LATCH_WORKER_POLL_MS, 5000);
  const maxTasksPerCycle = parseInteger(process.env.LATCH_WORKER_MAX_TASKS_PER_CYCLE, 25);
  const runtime = getLatchWorkerRuntimeInfo(workerLabel);

  console.log(
    `[latch-runner] boot worker=${runtime.workerLabel} pid=${runtime.processId} host=${runtime.hostname} dbHost=${runtime.dbHost ?? 'unknown'} openclawBin=${runtime.openclawBin}`,
  );

  if (mode === 'once') {
    const result = await drainLatchTaskQueue({ workerLabel, maxTasks: maxTasksPerCycle });
    console.log(JSON.stringify({ mode, processed: result }, null, 2));
    return;
  }

  if (mode !== 'watch') {
    throw new Error(`Unknown runner mode: ${mode}`);
  }

  console.log(`[latch-runner] starting watch loop with poll=${pollMs}ms maxTasksPerCycle=${maxTasksPerCycle}`);
  for (;;) {
    try {
      const processed = await drainLatchTaskQueue({ workerLabel, maxTasks: maxTasksPerCycle });
      if (processed.length > 0) {
        console.log(
          `[latch-runner] processed ${processed.length} task(s): ${processed.map((task) => task.id).join(', ')}`,
        );
      }

      await writeLatchWorkerHeartbeat({
        ...runtime,
        state: processed.length > 0 ? 'drained' : 'idle',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[latch-runner] task failed', error);
      await writeLatchWorkerHeartbeat({
        ...runtime,
        state: 'error',
        lastErrorCode: 'latch_runner_loop_failed',
        lastErrorMessage: message,
      });
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
