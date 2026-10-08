import { describe, it, expect, beforeEach } from "vitest";
import { startExperiment, getResumableRunIds } from "../app/experimentRunner";
import {
  MemoryExperimentStore,
  newExperimentMeta,
  resetExperimentStore,
  setExperimentStoreForTest,
} from "../persistence/experimentDb";
import { expandBatchTasks, configFingerprint } from "../engine/experimentSpec";
import type { BatchConfig } from "../types/batch";
import type { RunRecord } from "../types/experiment";
import type { PartySetupChoice } from "../engine/gameState";

/**
 * Stage 3 Phase C/D — coordinator scheduling, persistence, resume.
 * Tests use the inline executor (workers need a browser; e2e covers those)
 * with a MemoryExperimentStore injected via a store factory seam.
 */

let memStore: MemoryExperimentStore;

beforeEach(async () => {
  resetExperimentStore();
  memStore = new MemoryExperimentStore();
  await memStore.init();
  setExperimentStoreForTest(memStore);
});

const fixedParty: PartySetupChoice[] = [
  { className: "Bladedancer", suit: "spades", position: 1 },
  { className: "Manipulator", suit: "hearts", position: 2 },
  { className: "Tracker", suit: "clubs", position: 3 },
];

function batchConfig(runs = 4, seed = "coord-test"): BatchConfig {
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

function fingerprintRuns(records: RunRecord[]) {
  return records.map((r) => ({
    runId: r.runId, status: r.status, outcome: r.outcome,
    score: r.score?.finalScore, turns: r.totalTurns, rooms: r.roomsCleared,
  }));
}

describe("Stage 3 — coordinator execution", () => {
  it("runs a batch experiment to completion via the inline executor", async () => {
    const cfg = batchConfig(3);
    const tasks = expandBatchTasks(cfg, "expA");
    const handle = startExperiment({
      experimentId: "expA",
      kind: "batch",
      config: cfg,
      configFingerprint: configFingerprint(cfg),
      tasks,
      executor: "inline",
    });
    const outcome = await handle.done;
    expect(outcome.status).toBe("completed");
    expect(outcome.records.length).toBe(3);
    // All runs completed with gameplay outcomes (or honest technical status).
    for (const r of outcome.records) {
      expect(r.experimentId).toBe("expA");
    }
  }, 60000);

  it("inline results match direct executeRun results (executor independence)", async () => {
    const cfg = batchConfig(2, "exec-equiv");
    const tasks = expandBatchTasks(cfg, "expB");
    const direct = await Promise.all(
      tasks.map(async (t) => {
        const { executeRun } = await import("../engine/simRunner");
        return executeRun(t, { yieldIntervalMs: Infinity });
      })
    );
    const handle = startExperiment({
      experimentId: "expB",
      kind: "batch",
      config: cfg,
      configFingerprint: configFingerprint(cfg),
      tasks,
      executor: "inline",
    });
    const outcome = await handle.done;
    expect(fingerprintRuns(outcome.records)).toEqual(fingerprintRuns(direct));
  }, 60000);

  it("task scheduling order does not change run results", async () => {
    // The same task run 1st vs 3rd must produce identical records.
    const cfg = batchConfig(3, "order-test");
    const tasks = expandBatchTasks(cfg, "expC");
    const { executeRun } = await import("../engine/simRunner");
    const forward = [] as RunRecord[];
    for (const t of tasks) forward.push(await executeRun(t, { yieldIntervalMs: Infinity }));
    const reverse = [] as RunRecord[];
    for (const t of [...tasks].reverse()) reverse.push(await executeRun(t, { yieldIntervalMs: Infinity }));
    expect(fingerprintRuns(forward)).toEqual(fingerprintRuns([...reverse].reverse()));
  }, 90000);

  it("cancel before start yields cancelled status with no persisted runs", async () => {
    const cfg = batchConfig(10, "cancel-early");
    const tasks = expandBatchTasks(cfg, "expD");
    const handle = startExperiment({
      experimentId: "expD",
      kind: "batch",
      config: cfg,
      configFingerprint: configFingerprint(cfg),
      tasks,
      executor: "inline",
    });
    handle.cancel();
    const outcome = await handle.done;
    expect(outcome.status).toBe("cancelled");
    expect(outcome.records.length).toBe(0);
  }, 30000);

  it("mid-execution cancel stops promptly and preserves committed work", async () => {
    const cfg = batchConfig(50, "cancel-mid");
    const tasks = expandBatchTasks(cfg, "expE");
    let seen = 0;
    const handle = startExperiment({
      experimentId: "expE",
      kind: "batch",
      config: cfg,
      configFingerprint: configFingerprint(cfg),
      tasks,
      executor: "inline",
      onRecord: () => {
        seen++;
        if (seen >= 2) handle.cancel();
      },
    });
    const outcome = await handle.done;
    expect(outcome.status).toBe("cancelled");
    expect(outcome.records.length).toBeLessThan(50);
    expect(outcome.records.length).toBeGreaterThan(0);
  }, 120000);

  it("resume skips committed runs and produces the same logical result set", async () => {
    const cfg = batchConfig(5, "resume-test");
    const expId = "expResume";
    const tasks = expandBatchTasks(cfg, expId);
    const fp = configFingerprint(cfg);

    // Simulate an interrupted session: first 2 runs committed to the store,
    // experiment marked interrupted.
    const meta = newExperimentMeta(expId, "batch", cfg, tasks.length, undefined, {
      engine: (await import("../engine/experimentSpec")).ENGINE_FINGERPRINT,
      config: fp,
    });
    await memStore.createExperiment(meta);
    const { executeRun } = await import("../engine/simRunner");
    const committed: RunRecord[] = [];
    for (const t of tasks.slice(0, 2)) {
      committed.push(await executeRun(t, { yieldIntervalMs: Infinity }));
    }
    await memStore.putRuns(committed);
    await memStore.updateExperiment(expId, { status: "interrupted" });

    const resumable = await getResumableRunIds(expId);
    expect(resumable).not.toBeNull();
    expect(resumable!.runIds.size).toBe(2);

    let handle = startExperiment({
      experimentId: expId, kind: "batch", config: cfg,
      configFingerprint: fp, tasks, executor: "inline",
      resume: true,
      skipRunIds: resumable!.runIds,
      priorSummary: resumable!.priorSummary,
    });
    const second = await handle.done;
    expect(second.status).toBe("completed");
    // Only the remaining 3 tasks ran this session.
    expect(second.records.length).toBe(3);
    // The full logical result set (committed + resumed) equals a fresh run.
    const fresh = [] as RunRecord[];
    for (const t of tasks) fresh.push(await executeRun(t, { yieldIntervalMs: Infinity }));
    const combined = [...committed, ...second.records].sort((a, b) => a.runIndex - b.runIndex);
    expect(fingerprintRuns(combined)).toEqual(fingerprintRuns(fresh));
  }, 120000);

  it("resume rejects incompatible fingerprints", async () => {
    const cfg = batchConfig(3, "incompat");
    const expId = "expIncompat";
    const tasks = expandBatchTasks(cfg, expId);
    const meta = newExperimentMeta(expId, "batch", cfg, tasks.length, undefined, {
      engine: "old-engine-v999", config: "different-fp",
    });
    await memStore.createExperiment(meta);
    await memStore.updateExperiment(expId, { status: "interrupted" });

    const handle = startExperiment({
      experimentId: expId, kind: "batch", config: cfg,
      configFingerprint: configFingerprint(cfg), tasks,
      executor: "inline", resume: true,
      skipRunIds: new Set(),
    });
    const outcome = await handle.done;
    expect(outcome.status).toBe("incompatible");
    expect(outcome.records.length).toBe(0);
    expect((await memStore.getExperiment(expId))!.status).toBe("incompatible");
  });
});

describe("Stage 3 — persistence store contract", () => {
  it("memory store supports full CRUD and run indexing", async () => {
    const store = new MemoryExperimentStore();
    await store.init();
    const meta = newExperimentMeta("e1", "batch", { a: 1 }, 3, "test", { engine: "f1", config: "c1" });
    await store.createExperiment(meta);
    await store.putRuns([
      { runId: "e1:r0", experimentId: "e1" } as RunRecord,
      { runId: "e1:r1", experimentId: "e1" } as RunRecord,
    ]);
    expect((await store.getRunIds("e1")).size).toBe(2);
    expect((await store.getRuns("e1")).length).toBe(2);
    // Duplicate put is idempotent
    await store.putRuns([{ runId: "e1:r0", experimentId: "e1" } as RunRecord]);
    expect((await store.getRunIds("e1")).size).toBe(2);
    await store.updateExperiment("e1", { status: "completed" });
    expect((await store.getExperiment("e1"))!.status).toBe("completed");
    expect((await store.listExperiments()).length).toBe(1);
    await store.deleteExperiment("e1");
    expect((await store.getRunIds("e1")).size).toBe(0);
    expect(await store.getExperiment("e1")).toBeUndefined();
  });
});
