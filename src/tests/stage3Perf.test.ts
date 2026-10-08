import { describe, it, expect, beforeAll } from "vitest";
import { startExperiment } from "../app/experimentRunner";
import {
  MemoryExperimentStore,
  setExperimentStoreForTest,
} from "../persistence/experimentDb";
import { expandBatchTasks, configFingerprint, newExperimentId } from "../engine/experimentSpec";
import type { BatchConfig } from "../types/batch";
import type { PartySetupChoice } from "../engine/gameState";

/**
 * Stage 3 — throughput benchmark.
 *
 * Report-only: logs measured runs/sec so the numbers land in the Stage 3
 * report. Assertions are intentionally loose (runs complete) — timing is
 * environment-dependent and must not gate CI.
 */

const fixedParty: PartySetupChoice[] = [
  { className: "Bladedancer", suit: "spades", position: 1 },
  { className: "Manipulator", suit: "hearts", position: 2 },
  { className: "Tracker", suit: "clubs", position: 3 },
];

function benchConfig(runs: number, seed: string): BatchConfig {
  return {
    runs,
    difficulty: "normal",
    partyMode: "fixed",
    partyChoices: fixedParty,
    combatStrategy: "balanced",
    merchantStrategy: "balanced",
    restStrategy: "full-heal",
    splitStrategy: "combat",
    itemUsageStrategy: "conservative",
    weaponUpgradeStrategy: "when-affordable",
    baseSeed: seed,
    telemetryLevel: "minimal",
  };
}

beforeAll(async () => {
  const store = new MemoryExperimentStore();
  await store.init();
  setExperimentStoreForTest(store);
});

describe("Stage 3 — throughput benchmark (report-only)", () => {
  it("measures inline executor throughput over 20 runs", async () => {
    const config = benchConfig(20, "bench-inline");
    const tasks = expandBatchTasks(config, "bench", config.telemetryLevel);
    const t0 = performance.now();
    const handle = startExperiment({
      experimentId: newExperimentId("batch"),
      kind: "batch",
      config,
      configFingerprint: configFingerprint(config),
      tasks,
      executor: "inline",
    });
    const outcome = await handle.done;
    const elapsedMs = performance.now() - t0;
    const valid = outcome.records.filter((r) => r.status === "completed").length;
    const rps = valid / (elapsedMs / 1000);
    console.log(
      `[BENCH] inline executor: ${valid} valid runs in ${elapsedMs.toFixed(0)}ms ` +
      `= ${rps.toFixed(1)} runs/sec (avg ${(elapsedMs / Math.max(valid, 1)).toFixed(0)} ms/run)`
    );
    expect(outcome.status).toBe("completed");
    expect(valid).toBe(20);
  }, 120_000);

  it("measures run determinism cost — same seed, two executions", async () => {
    const config = benchConfig(6, "bench-det");
    const tasksA = expandBatchTasks(config, "bench-a", config.telemetryLevel);
    const tasksB = expandBatchTasks(config, "bench-b", config.telemetryLevel);
    const a = await startExperiment({
      experimentId: newExperimentId("batch"),
      kind: "batch",
      config,
      configFingerprint: configFingerprint(config),
      tasks: tasksA,
      executor: "inline",
    }).done;
    const b = await startExperiment({
      experimentId: newExperimentId("batch"),
      kind: "batch",
      config,
      configFingerprint: configFingerprint(config),
      tasks: tasksB,
      executor: "inline",
    }).done;
    const fp = (r: typeof a.records) =>
      r.map((x) => `${x.outcome}:${x.score?.finalScore}:${x.totalTurns}:${x.roomsCleared}`);
    expect(fp(a.records)).toEqual(fp(b.records));
  }, 120_000);
});
