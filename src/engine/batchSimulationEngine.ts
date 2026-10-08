/**
 * Batch simulation engine — compatibility layer.
 *
 * Stage 3 moved run execution to `simRunner.ts` (worker-safe `executeRun`)
 * and aggregation to `statistics.ts` (`aggregateRuns`). This module keeps
 * the legacy entry points working and hosts the DOM-bound export helpers.
 */
import type {
  BatchConfig,
  BatchResult,
  RunResult,
  AggregateStats,
} from "../types/batch";

import { executeRun } from "./simRunner";
import { batchPolicy, deriveRunSeed } from "./experimentSpec";
import { aggregateRuns } from "./statistics";

export { randomParty } from "./simRunner";
export { getItemUsageThreshold } from "./simPolicies";

/**
 * Legacy single-run entry point. Returns a RunRecord where `status` is the
 * execution status and `outcome` is only present for completed runs.
 */
export async function runSingleGame(
  runIndex: number,
  seed: string,
  config: BatchConfig
): Promise<RunResult> {
  return executeRun(
    {
      runId: `adhoc:${runIndex}`,
      comboIndex: -1,
      cohortIndex: runIndex,
      runIndex,
      seed,
      policy: batchPolicy(config),
      telemetryLevel: config.telemetryLevel ?? "standard",
    },
    { yieldIntervalMs: 40 }
  );
}

export function aggregateResults(runs: RunResult[]): AggregateStats {
  return aggregateRuns(runs);
}

/**
 * In-process sequential batch execution (no workers, no persistence).
 * Kept for compatibility; new callers should use the ExperimentRunner
 * coordinator, which adds worker execution and durable storage.
 */
export async function runBatch(
  config: BatchConfig,
  onProgress?: (completed: number, total: number, currentResult?: RunResult) => void,
  isCancelled?: () => boolean
): Promise<BatchResult> {
  const startedAt = new Date().toISOString();
  const runs: RunResult[] = [];

  for (let i = 0; i < config.runs; i++) {
    if (isCancelled?.()) break;

    if (onProgress) {
      onProgress(i, config.runs, runs[i - 1]);
    }

    const seed = deriveRunSeed(config.baseSeed, "batch", i);
    const result = await executeRun(
      {
        runId: `batch:${i}`,
        comboIndex: -1,
        cohortIndex: i,
        runIndex: i,
        seed,
        policy: batchPolicy(config),
        telemetryLevel: config.telemetryLevel ?? "standard",
      },
      { isCancelled }
    );
    if (result.status === "cancelled") break;
    runs.push(result);
    if (onProgress) {
      onProgress(i + 1, config.runs, result);
    }
  }

  const completedAt = new Date().toISOString();
  const aggregateStats = aggregateRuns(runs);

  return {
    config,
    runs,
    aggregateStats,
    startedAt,
    completedAt,
  };
}

export function downloadJSON(result: BatchResult): void {
  const data = JSON.stringify(result, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `batch_${result.config.baseSeed}_${result.runs.length}runs_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadCSV(result: BatchResult): void {
  const headers = ["Run", "Seed", "Status", "Outcome", "Score", "Turns", "Rooms", "Heroes Alive", "Party"];
  const rows = result.runs.map(r => [
    r.runIndex + 1,
    r.seed,
    r.status,
    r.outcome ?? "",
    r.score?.finalScore ?? "",
    r.totalTurns ?? "",
    r.roomsCleared ?? "",
    r.heroesAlive ?? "",
    r.partyComposition.map(p => `${p.className}/${p.specialization}`).join(" + "),
  ]);

  const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `batch_${result.config.baseSeed}_${result.runs.length}runs_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
