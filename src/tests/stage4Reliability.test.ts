import { describe, it, expect, beforeEach } from "vitest";
import { startExperiment, planResume } from "../app/experimentRunner";
import {
  MemoryExperimentStore,
  newExperimentMeta,
  resetExperimentStore,
  setExperimentStoreForTest,
  type ExperimentStore,
  type StoredExperiment,
} from "../persistence/experimentDb";
import {
  expandBatchTasks,
  batchTaskSource,
  configFingerprint,
  ENGINE_FINGERPRINT,
} from "../engine/experimentSpec";
import { executeRun } from "../engine/simRunner";
import { aggregateRuns, evidenceTier, pairedCompare, OnlineAggregator } from "../engine/statistics";
import {
  buildEvidencePackage,
  validateEvidencePackage,
  importEvidencePackage,
} from "../engine/evidenceExport";
import { buildEncounterRecords } from "../engine/telemetry";
import { addEvent, createEvent, resetEventSequence } from "../engine/eventLog";
import type { BatchConfig } from "../types/batch";
import type { RunRecord, ExecutionStatus, SimRunPolicy } from "../types/experiment";
import type { GameState } from "../types/gameState";
import type { PartySetupChoice } from "../engine/gameState";

/**
 * Stage 4 — reliability & evidence-integrity regression tests.
 *
 * Covers the failure paths the Stage 4 rewrite addressed:
 *   - Atomic checkpoint commits + write fencing
 *   - Run-record dedupe precedence (completed is never downgraded)
 *   - Status-aware resume planning
 *   - Completion only after durable writes
 *   - completed-with-errors classification
 *   - Storage failure disclosure (never silent)
 *   - Cross-tab lease/fencing
 *   - Telemetry honesty (cumulative deaths, effective healing, unclosed encounters)
 *   - Statistics edge cases (empty samples, paired eligibility)
 *   - Evidence validation + idempotent import
 *   - Lazy task sources
 */

let memStore: MemoryExperimentStore;

beforeEach(async () => {
  resetExperimentStore();
  memStore = new MemoryExperimentStore();
  await memStore.init();
  setExperimentStoreForTest(memStore);
  resetEventSequence();
});

const fixedParty: PartySetupChoice[] = [
  { className: "Bladedancer", suit: "spades", position: 1 },
  { className: "Manipulator", suit: "hearts", position: 2 },
  { className: "Tracker", suit: "clubs", position: 3 },
];

function batchConfig(runs = 4, seed = "s4-test"): BatchConfig {
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

function policy(): SimRunPolicy {
  return {
    difficulty: "normal",
    partyMode: "fixed",
    partyChoices: fixedParty,
    combatStrategy: "balanced",
    merchantStrategy: "balanced",
    restStrategy: "full-heal",
    splitStrategy: "combat",
    itemUsageStrategy: "conservative",
    weaponUpgradeStrategy: "when-affordable",
  };
}

let recSeq = 0;
/** Minimal valid RunRecord for persistence tests. */
function mkRun(
  experimentId: string,
  runIndex: number,
  status: ExecutionStatus,
  extra: Partial<RunRecord> = {}
): RunRecord {
  return {
    runId: `${experimentId}:r${runIndex}_${recSeq++}`,
    experimentId,
    comboIndex: -1,
    cohortIndex: runIndex,
    runIndex,
    seed: `s|${runIndex}`,
    status,
    outcome: status === "completed" ? "victory" : undefined,
    partyComposition: [],
    runSummary: `run ${runIndex} ${status}`,
    telemetryLevel: "minimal",
    telemetryCompleteness: "summary-only",
    engineFingerprint: ENGINE_FINGERPRINT,
    ...extra,
  };
}

function stubMeta(id: string, status: StoredExperiment["status"] = "interrupted"): StoredExperiment {
  const meta = newExperimentMeta(id, "batch", batchConfig(4), 4, undefined, {
    engine: ENGINE_FINGERPRINT,
    config: configFingerprint(batchConfig(4)),
  });
  return { ...meta, status };
}

// ─── Persistence: atomic checkpoints, dedupe, paging, leasing ───────────────

describe("Stage 4 — atomic checkpoints & dedupe precedence", () => {
  it("commitCheckpoint commits runs and meta atomically with a sequence number", async () => {
    const meta = stubMeta("e1");
    await memStore.createExperiment(meta);
    const r1 = await memStore.commitCheckpoint("e1", [mkRun("e1", 0, "completed")], {
      completedTasks: 1, persistedTasks: 1,
    }, "owner-a");
    expect(r1.checkpointSeq).toBe(1);
    const r2 = await memStore.commitCheckpoint("e1", [mkRun("e1", 1, "completed")], {
      completedTasks: 2, persistedTasks: 2,
    }, "owner-a");
    expect(r2.checkpointSeq).toBe(2);
    const stored = (await memStore.getExperiment("e1"))!;
    expect(stored.persistedTasks).toBe(2);
    expect(stored.checkpointSeq).toBe(2);
    expect((await memStore.getRunIds("e1")).size).toBe(2);
  });

  it("a fenced-out commit (wrong ownerToken) persists neither runs nor meta", async () => {
    const meta = stubMeta("e2");
    await memStore.createExperiment(meta);
    await memStore.acquireLease("e2", "owner-real", 60_000);
    const before = await memStore.getExperiment("e2");
    await expect(
      memStore.commitCheckpoint("e2", [mkRun("e2", 0, "completed")], { status: "completed" }, "owner-stale")
    ).rejects.toThrow(/Ownership/i);
    // Nothing leaked through — this is the race the atomic tx must prevent.
    expect((await memStore.getRunIds("e2")).size).toBe(0);
    const after = await memStore.getExperiment("e2");
    expect(after!.status).toBe(before!.status);
    expect(after!.checkpointSeq).toBeUndefined();
  });

  it("dedupe precedence: a completed record is never overwritten by a weaker status", async () => {
    const rec = mkRun("e3", 0, "completed", { outcome: "victory" });
    await memStore.putRuns([rec]);
    // A late/stale failure record for the same runId must NOT downgrade it.
    const stale = { ...mkRun("e3", 0, "error"), runId: rec.runId };
    await memStore.putRuns([stale]);
    const stored = await memStore.getRun("e3", rec.runId);
    expect(stored!.status).toBe("completed");
    expect(stored!.outcome).toBe("victory");
    // Reverse direction IS allowed: a completed record supersedes a failure.
    const weak = mkRun("e3", 1, "interrupted");
    await memStore.putRuns([weak]);
    const strong = { ...mkRun("e3", 1, "completed"), runId: weak.runId };
    await memStore.putRuns([strong]);
    expect((await memStore.getRun("e3", weak.runId))!.status).toBe("completed");
  });

  it("receipts carry status + retrySafe for light resume planning", async () => {
    await memStore.createExperiment(stubMeta("e4"));
    await memStore.putRuns([
      mkRun("e4", 0, "completed"),
      mkRun("e4", 1, "error", { diagnostics: { phase: "x", roomIndex: 0, tier: 0, roomIterations: 0, combatIterations: 0, retrySafe: true } }),
      mkRun("e4", 2, "error", { diagnostics: { phase: "x", roomIndex: 0, tier: 0, roomIterations: 0, combatIterations: 0, retrySafe: false } }),
    ]);
    const receipts = await memStore.listRunReceipts("e4");
    expect(receipts.length).toBe(3);
    const retryable = receipts.filter((r) => r.status === "error" && r.retrySafe);
    const terminal = receipts.filter((r) => r.status === "error" && !r.retrySafe);
    expect(retryable.length).toBe(1);
    expect(terminal.length).toBe(1);
  });

  it("getRunsPage walks all records in runIndex order via cursor", async () => {
    await memStore.createExperiment(stubMeta("e5"));
    const runs = Array.from({ length: 250 }, (_, i) =>
      mkRun("e5", i, i % 5 === 0 ? "error" : "completed"));
    await memStore.putRuns(runs);
    const seen: number[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await memStore.getRunsPage("e5", { cursor, limit: 100 });
      for (const r of page.records) seen.push(r.runIndex);
      cursor = page.cursor;
      pages++;
      expect(pages).toBeLessThanOrEqual(4);
    } while (cursor);
    expect(seen.length).toBe(250);
    expect([...seen].sort((a, b) => a - b)).toEqual(seen); // ascending order
    expect(await memStore.countRuns("e5")).toBe(250);
    expect(await memStore.countRuns("e5", "completed")).toBe(200);
    expect(await memStore.countRuns("e5", "error")).toBe(50);
  });

  it("lease lifecycle: exclusive while live, expired lease can be taken over", async () => {
    await memStore.createExperiment(stubMeta("e6"));
    const a = await memStore.acquireLease("e6", "tab-A", 60_000);
    expect(a.ok).toBe(true);
    expect(a.fenceEpoch).toBe(1);
    const b = await memStore.acquireLease("e6", "tab-B", 60_000);
    expect(b.ok).toBe(false);
    expect(b.heldBy).toBe("tab-A");
    expect(await memStore.renewLease("e6", "tab-B", 60_000)).toBe(false);
    expect(await memStore.renewLease("e6", "tab-A", 60_000)).toBe(true);
    // Expired lease → takeover allowed, fence epoch increments.
    await memStore.updateExperiment("e6", { leaseUntil: Date.now() - 1 });
    const c = await memStore.acquireLease("e6", "tab-B", 60_000);
    expect(c.ok).toBe(true);
    expect(c.fenceEpoch).toBe(2);
    await memStore.releaseLease("e6", "tab-B");
    expect((await memStore.getExperiment("e6"))!.ownerToken).toBeUndefined();
  });
});

// ─── Resume planning ─────────────────────────────────────────────────────────

describe("Stage 4 — status-aware resume planning", () => {
  it("planResume classifies committed records: reusable vs retryable", async () => {
    await memStore.createExperiment(stubMeta("r1"));
    const retryDiag = { phase: "x", roomIndex: 0, tier: 0, roomIterations: 0, combatIterations: 0, retrySafe: true };
    const hardDiag = { ...retryDiag, retrySafe: false };
    await memStore.putRuns([
      mkRun("r1", 0, "completed"),
      mkRun("r1", 1, "timeout"),
      mkRun("r1", 2, "invalid"),
      mkRun("r1", 3, "error", { diagnostics: hardDiag }),
      mkRun("r1", 4, "error", { diagnostics: retryDiag }),
      mkRun("r1", 5, "interrupted", { diagnostics: retryDiag }),
      mkRun("r1", 6, "cancelled", { diagnostics: retryDiag }),
    ]);
    const runs = await memStore.getRuns("r1");
    const byIndex = new Map(runs.map((r) => [r.runIndex, r.runId]));
    const plan = await planResume("r1");
    expect(plan).not.toBeNull();
    // Definitive records are reused: completed, timeout, invalid,
    // non-retrySafe error.
    for (const i of [0, 1, 2, 3]) expect(plan!.reusable.has(byIndex.get(i)!)).toBe(true);
    // Transient records are re-executed: retrySafe error, interrupted, cancelled.
    for (const i of [4, 5, 6]) expect(plan!.retryable.has(byIndex.get(i)!)).toBe(true);
    expect(plan!.committedCount).toBe(7);
  });

  it("planResume returns null for terminal/experiment-absent states", async () => {
    expect(await planResume("nonexistent")).toBeNull();
    await memStore.createExperiment(stubMeta("r2", "completed"));
    expect(await planResume("r2")).toBeNull();
  });

  it("resume re-executes retryable records and preserves committed ones", async () => {
    const cfg = batchConfig(4, "resume4");
    const expId = "expResume4";
    const tasks = expandBatchTasks(cfg, expId);
    const fp = configFingerprint(cfg);
    const meta = newExperimentMeta(expId, "batch", cfg, tasks.length, undefined, {
      engine: ENGINE_FINGERPRINT, config: fp,
    });
    await memStore.createExperiment({ ...meta, status: "interrupted" });
    // Commit run 0 (real) + a stale interrupted stub for run 1 (worker died
    // mid-flight). Resume must keep run 0 and re-execute run 1.
    const committed = [await executeRun(tasks[0], { yieldIntervalMs: Infinity })];
    const stub = mkRun(expId, 1, "interrupted", {
      runId: tasks[1].runId,
      diagnostics: { phase: "x", roomIndex: 1, tier: 0, roomIterations: 0, combatIterations: 0, retrySafe: true },
    });
    await memStore.putRuns([...committed, stub]);

    const plan = (await planResume(expId))!;
    expect(plan.reusable.has(tasks[0].runId)).toBe(true);
    expect(plan.retryable.has(tasks[1].runId)).toBe(true);

    const handle = startExperiment({
      experimentId: expId, kind: "batch", config: cfg,
      configFingerprint: fp, tasks, executor: "inline",
      resume: true, resumePlan: plan,
    });
    const outcome = await handle.done;
    expect(outcome.status).toBe("completed");
    // 3 tasks executed this session (runs 1,2,3); run 0 reused.
    expect(outcome.records.length).toBe(3);
    // Full logical set == fresh run, and the stale stub was superseded.
    const all = await memStore.getRuns(expId);
    expect(all.length).toBe(4);
    const fresh = await Promise.all(tasks.map((t) => executeRun(t, { yieldIntervalMs: Infinity })));
    const fpOf = (r: RunRecord) => ({ runId: r.runId, status: r.status, outcome: r.outcome, score: r.score?.finalScore });
    expect([...all].sort((a, b) => a.runIndex - b.runIndex).map(fpOf))
      .toEqual(fresh.map(fpOf));
    expect((await memStore.getRun(expId, tasks[1].runId))!.status).not.toBe("interrupted");
  }, 120000);
});

// ─── Coordinator: completion honesty, storage failure, classification ───────

describe("Stage 4 — coordinator failure semantics", () => {
  it("technical failures produce completed-with-errors, never a clean completed", async () => {
    const cfg = batchConfig(3, "cwe");
    const tasks = expandBatchTasks(cfg, "expCWE");
    // Corrupt one task so it fails validation → status "invalid".
    tasks[1] = {
      ...tasks[1],
      policy: {
        ...tasks[1].policy,
        partyChoices: [fixedParty[0], fixedParty[0], fixedParty[2]],
      },
    };
    const handle = startExperiment({
      experimentId: "expCWE", kind: "batch", config: cfg,
      configFingerprint: configFingerprint(cfg), tasks, executor: "inline",
    });
    const outcome = await handle.done;
    expect(outcome.status).toBe("completed-with-errors");
    const meta = (await memStore.getExperiment("expCWE"))!;
    expect(meta.status).toBe("completed-with-errors");
    // Technical failure is recorded — and NOT counted as a defeat.
    const invalid = (await memStore.getRuns("expCWE")).find((r) => r.status === "invalid");
    expect(invalid).toBeDefined();
    expect(meta.summary?.validRuns).toBe(2);
    expect(meta.summary?.errorRuns).toBe(1);
    expect(meta.summary?.defeats ?? 0).toBeLessThanOrEqual(2);
  }, 90000);

  it("checkpoint write failure → status failed, storage error disclosed, no false completion", async () => {
    class FailingStore extends MemoryExperimentStore {
      override async commitCheckpoint(): Promise<never> {
        throw new Error("QuotaExceededError: simulated storage quota");
      }
    }
    const failing = new FailingStore();
    await failing.init();
    setExperimentStoreForTest(failing);
    const errors: string[] = [];
    const cfg = batchConfig(3, "store-fail");
    const handle = startExperiment({
      experimentId: "expStoreFail", kind: "batch", config: cfg,
      configFingerprint: configFingerprint(cfg),
      tasks: expandBatchTasks(cfg, "expStoreFail"),
      executor: "inline",
      onStorageError: (m) => errors.push(m),
    });
    const outcome = await handle.done;
    expect(outcome.status).toBe("failed");
    expect(outcome.persisted).toBe(0);
    expect(errors.some((e) => /Checkpoint write failed|unsaved/i.test(e))).toBe(true);
    const meta = await failing.getExperiment("expStoreFail");
    expect(meta!.status).toBe("failed");
  }, 90000);

  it("completion is not reported until every queued write has committed", async () => {
    let commitCalls = 0;
    class SlowStore extends MemoryExperimentStore {
      override async commitCheckpoint(...args: Parameters<MemoryExperimentStore["commitCheckpoint"]>) {
        commitCalls++;
        await new Promise((r) => setTimeout(r, 25));
        return super.commitCheckpoint(...args);
      }
    }
    const slow = new SlowStore();
    await slow.init();
    setExperimentStoreForTest(slow);
    const cfg = batchConfig(5, "drain");
    const handle = startExperiment({
      experimentId: "expDrain", kind: "batch", config: cfg,
      configFingerprint: configFingerprint(cfg),
      tasks: expandBatchTasks(cfg, "expDrain"),
      executor: "inline",
    });
    const outcome = await handle.done;
    // At resolution time, durable state MUST already reflect all records —
    // "completed" can never precede the last commit.
    expect(outcome.status).toBe("completed");
    expect(outcome.persisted).toBe(5);
    expect((await slow.getRunIds("expDrain")).size).toBe(5);
    const meta = (await slow.getExperiment("expDrain"))!;
    expect(meta.persistedTasks).toBe(5);
    expect(meta.status).toBe("completed");
    expect(commitCalls).toBeGreaterThanOrEqual(1);
  }, 90000);

  it("a live lease held by another owner refuses concurrent execution", async () => {
    const cfg = batchConfig(2, "locked");
    const expId = "expLocked";
    const meta = newExperimentMeta(expId, "batch", cfg, 2, undefined, {
      engine: ENGINE_FINGERPRINT, config: configFingerprint(cfg),
    });
    await memStore.createExperiment({ ...meta, status: "interrupted" });
    await memStore.acquireLease(expId, "another-tab", 60_000);
    const errors: string[] = [];
    const handle = startExperiment({
      experimentId: expId, kind: "batch", config: cfg,
      configFingerprint: configFingerprint(cfg),
      tasks: expandBatchTasks(cfg, expId),
      executor: "inline", resume: true,
      ownerToken: "this-tab",
      onStorageError: (m) => errors.push(m),
    });
    const outcome = await handle.done;
    expect(outcome.status).toBe("failed");
    expect(errors.some((e) => /owned by another tab/i.test(e))).toBe(true);
    // Nothing ran under the stolen ownership.
    expect((await memStore.getRunIds(expId)).size).toBe(0);
  });

  it("a second startExperiment while one is active throws immediately", async () => {
    const cfg = batchConfig(8, "active");
    const handle = startExperiment({
      experimentId: "expActive", kind: "batch", config: cfg,
      configFingerprint: configFingerprint(cfg),
      tasks: expandBatchTasks(cfg, "expActive"),
      executor: "inline",
    });
    expect(() =>
      startExperiment({
        experimentId: "expOther", kind: "batch", config: cfg,
        configFingerprint: configFingerprint(cfg),
        tasks: expandBatchTasks(cfg, "expOther"),
        executor: "inline",
      })
    ).toThrow(/already running/);
    const outcome = await handle.done;
    expect(outcome.status).toBe("completed");
  }, 90000);

  it("lazy TaskSource produces identical scheduling identity to materialized tasks", async () => {
    const cfg = batchConfig(6, "lazy");
    const eager = expandBatchTasks(cfg, "expLazy");
    const source = batchTaskSource(cfg, "expLazy");
    expect(source.total).toBe(eager.length);
    for (let i = 0; i < source.total; i++) {
      const t = source.get(i);
      expect(t.runId).toBe(eager[i].runId);
      expect(t.seed).toBe(eager[i].seed);
    }
    const handle = startExperiment({
      experimentId: "expLazy", kind: "batch", config: cfg,
      configFingerprint: configFingerprint(cfg),
      tasks: source,
      executor: "inline",
    });
    const outcome = await handle.done;
    expect(outcome.status).toBe("completed");
    expect((await memStore.getRunIds("expLazy")).size).toBe(6);
  }, 120000);
});

// ─── Telemetry honesty ──────────────────────────────────────────────────────

function stubHero(id: string, over: Record<string, unknown> = {}) {
  return {
    id, name: id, className: "Bladedancer", alive: true,
    currentHp: 5, maxHp: 10, position: 1, debuffs: [], ...over,
  };
}

function stubState(over: Record<string, unknown> = {}): GameState {
  return {
    log: [],
    stats: {},
    party: { heroes: [stubHero("h1"), stubHero("h2"), stubHero("h3")], deadHeroIds: [] },
    ...over,
  } as unknown as GameState;
}

describe("Stage 4 — telemetry honesty", () => {
  it("deathsByHero is cumulative and survives bounded-log pruning", async () => {
    let state = stubState();
    // 600 events > 500-entry cap; early HERO_DIED records are pruned from
    // the log but must still accumulate.
    for (let i = 0; i < 600; i++) {
      const type = i % 100 === 0 ? "HERO_DIED" : "DICE_ROLLED";
      state = addEvent(state, createEvent(type, `e${i}`, {
        targetIds: type === "HERO_DIED" ? ["h1"] : undefined,
      }));
    }
    expect(state.log.length).toBeLessThanOrEqual(500);
    // 6 HERO_DIED events (i=0..500), all counted even though i=0 was pruned.
    expect(state.stats.deathsByHero?.h1).toBe(6);
    const retained = state.log.filter((e) => e.type === "HERO_DIED").length;
    expect(retained).toBeLessThan(6); // proves pruning actually happened
  });

  it("healing telemetry uses EFFECTIVE (post-clamp) amounts", async () => {
    let state = stubState();
    // Single-target heal with effectiveAmount — the accumulator must use
    // the effective value, not the requested `amount`.
    state = addEvent(state, createEvent("HEAL_APPLIED", "healed", {
      targetIds: ["h1"],
      details: { amount: 8, effectiveAmount: 1 },
    }));
    // Multi-target rest heal via `amounts` map.
    state = addEvent(state, createEvent("HEAL_APPLIED", "rest", {
      targetIds: ["h2", "h3"],
      details: { amounts: { h2: 4, h3: 0 }, cause: "rest_full_heal" },
    }));
    expect(state.stats.healingByHero?.h1).toBe(1); // not 8 (requested)
    expect(state.stats.healingByHero?.h2).toBe(4);
    expect(state.stats.healingByHero?.h3).toBeUndefined(); // 0 effective → absent
  });

  it("encounters never fabricate outcomes for unobserved endings", () => {
    let state = stubState();
    // One closed victory + one span left open (run ended mid-combat).
    state = addEvent(state, createEvent("COMBAT_STARTED", "c1", { details: { monsterName: "Rat" } }));
    state = addEvent(state, createEvent("COMBAT_ENDED", "c1 end", { details: { result: "victory" } }));
    state = addEvent(state, createEvent("COMBAT_STARTED", "c2", { details: { monsterName: "Wolf" } }));
    const { encounters, completeness } = buildEncounterRecords(state, { terminatedMidCombat: true });
    expect(encounters.length).toBe(2);
    expect(encounters[0].result).toBe("victory");
    expect(encounters[0].closed).toBe(true);
    expect(encounters[1].result).toBe("in-progress");
    expect(encounters[1].closed).toBe(false);
    // terminatedMidCombat → honest in-progress, NOT a fabricated retreat.
    expect(completeness).toBe("complete"); // log not truncated, span observed
  });

  it("superseded combat spans are closed:false unknown — not retreat", () => {
    let state = stubState();
    state = addEvent(state, createEvent("COMBAT_STARTED", "c1", { details: { monsterName: "Rat" } }));
    // Second COMBAT_STARTED before any COMBAT_ENDED — boundary lost.
    state = addEvent(state, createEvent("COMBAT_STARTED", "c2", { details: { monsterName: "Wolf" } }));
    state = addEvent(state, createEvent("COMBAT_ENDED", "c2 end", { details: { result: "defeat" } }));
    const { encounters } = buildEncounterRecords(state);
    expect(encounters[0].closed).toBe(false);
    expect(encounters[0].result).toBe("unknown");
    expect(encounters[1].closed).toBe(true);
    expect(encounters[1].result).toBe("defeat");
  });

  it("a real timeout run marks in-flight combat honestly (e2e through executeRun)", async () => {
    const task = {
      runId: "tel:t0",
      experimentId: "tel",
      comboIndex: -1,
      cohortIndex: 0,
      runIndex: 0,
      seed: "tel-seed-timeout",
      policy: policy(),
      telemetryLevel: "standard" as const,
      // Force the combat-iteration safety limit.
      limits: { maxCombatIterations: 3 },
    };
    const rec = await executeRun(task, { yieldIntervalMs: Infinity });
    expect(["timeout", "completed"]).toContain(rec.status);
    if (rec.status === "timeout") {
      expect(rec.outcome).toBeUndefined(); // never a gameplay outcome
      expect(rec.encounters?.some((e) => !e.closed)).toBe(true);
      // No encounter may claim victory/retreat without an observed end.
      for (const e of rec.encounters ?? []) {
        if (!e.closed) expect(["in-progress", "unknown"]).toContain(e.result);
      }
      expect(rec.telemetryVersion).toBe(2);
      expect(["partial", "invalid"]).toContain(rec.telemetryCompleteness);
    }
  }, 60000);
});

// ─── Statistics edge cases ──────────────────────────────────────────────────

describe("Stage 4 — statistics honesty", () => {
  it("empty and failure-only samples produce N/A, never a misleading 0%", () => {
    const empty = aggregateRuns([]);
    expect(empty.victoryRate).toBeUndefined();
    expect(empty.victoryRateCI).toBeUndefined();
    expect(empty.evidenceTier).toBe("insufficient");

    const failures = aggregateRuns([mkRun("s", 0, "error"), mkRun("s", 1, "timeout")]);
    expect(failures.validRuns).toBe(0);
    expect(failures.victoryRate).toBeUndefined(); // "no data" ≠ "0%"
    expect(failures.errorRuns).toBe(1);
    expect(failures.timeoutRuns).toBe(1);
  });

  it("technical failures never enter the win-rate denominator", () => {
    const runs = [
      mkRun("s", 0, "completed", { outcome: "victory" }),
      mkRun("s", 1, "completed", { outcome: "defeat" }),
      mkRun("s", 2, "error"),
      mkRun("s", 3, "interrupted"),
    ];
    const agg = aggregateRuns(runs);
    expect(agg.validRuns).toBe(2);
    expect(agg.victoryRate).toBe(50); // 1/2, not 1/4
    expect(agg.errorRuns).toBe(1);
    expect(agg.interruptedRuns).toBe(1);
  });

  it("evidenceTier: sample size alone never claims replication", () => {
    expect(evidenceTier(0)).toBe("insufficient");
    expect(evidenceTier(9)).toBe("insufficient");
    expect(evidenceTier(10)).toBe("exploratory");
    expect(evidenceTier(49)).toBe("exploratory");
    expect(evidenceTier(50)).toBe("estimated");
    expect(evidenceTier(10_000)).toBe("estimated"); // still not "replicated"
    expect(evidenceTier(50, true)).toBe("replicated"); // explicit flag only
  });

  it("pairedCompare matches only completed shared-cohort pairs", () => {
    const a = [
      mkRun("A", 0, "completed", { outcome: "victory", score: { finalScore: 1000 } as RunRecord["score"] }),
      mkRun("A", 1, "completed", { outcome: "defeat", score: { finalScore: 500 } as RunRecord["score"] }),
      mkRun("A", 2, "error"), // technical failure — cannot pair
      mkRun("A", 3, "completed", { outcome: "victory", score: { finalScore: 800 } as RunRecord["score"] }),
    ];
    const b = [
      mkRun("B", 0, "completed", { outcome: "defeat", score: { finalScore: 700 } as RunRecord["score"] }),
      mkRun("B", 1, "completed", { outcome: "victory", score: { finalScore: 900 } as RunRecord["score"] }),
      // cohort 2 missing on B side
      mkRun("B", 4, "completed", { outcome: "victory", score: { finalScore: 600 } as RunRecord["score"] }),
    ];
    const cmp = pairedCompare(a, b);
    expect(cmp.pairs).toBe(2); // cohorts 0 and 1 only
    expect(cmp.unmatchedA).toBe(2); // cohorts 2,3 have no B partner
    expect(cmp.unmatchedB).toBe(1); // cohort 4 has no A partner
    expect(cmp.winDiffs.aWins).toBe(1); // cohort 0: A won, B lost
    expect(cmp.winDiffs.bWins).toBe(1); // cohort 1: B won, A lost
    expect(cmp.meanScoreDiff).toBe((1000 - 700 + 500 - 900) / 2);
  });

  it("OnlineAggregator reconciles with batch aggregateRuns", () => {
    const runs = [
      mkRun("s", 0, "completed", { outcome: "victory", score: { finalScore: 100 } as RunRecord["score"] }),
      mkRun("s", 1, "completed", { outcome: "defeat", score: { finalScore: 300 } as RunRecord["score"] }),
      mkRun("s", 2, "error"),
      mkRun("s", 3, "timeout"),
      mkRun("s", 4, "interrupted"),
    ];
    const online = new OnlineAggregator();
    for (const r of runs) online.push(r);
    const batch = aggregateRuns(runs);
    expect(online.valid).toBe(batch.validRuns);
    expect(online.victories).toBe(batch.victories);
    expect(online.errors).toBe(batch.errorRuns);
    expect(online.timeouts).toBe(batch.timeoutRuns);
    expect(online.interrupted).toBe(batch.interruptedRuns);
    expect(online.scoreStats.mean).toBeCloseTo(200);
  });
});

// ─── Evidence integrity ─────────────────────────────────────────────────────

describe("Stage 4 — evidence validation & import", () => {
  it("rejects malformed packages and illegal status/outcome combos", () => {
    expect(validateEvidencePackage(null).ok).toBe(false);
    expect(validateEvidencePackage({ schema: "other" }).ok).toBe(false);
    const base = buildEvidencePackage(stubMeta("ev", "completed"), []);
    expect(validateEvidencePackage(base).ok).toBe(true);

    const badCombo = {
      ...base,
      runs: [mkRun("ev", 0, "error", { outcome: "victory" })], // illegal combo
    };
    const v = validateEvidencePackage(badCombo);
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toMatch(/status\/outcome/i);

    const dup = { ...base, runs: [mkRun("ev", 0, "completed"), mkRun("ev", 0, "completed")] };
    const dupRun = { ...dup.runs[1], runId: dup.runs[0].runId };
    expect(validateEvidencePackage({ ...base, runs: [dup.runs[0], dupRun] }).ok).toBe(false);
  });

  it("fingerprint mismatch is a warning, not a silent pass", () => {
    const pkg = buildEvidencePackage(
      { ...stubMeta("ev2", "completed"), engineFingerprint: "old-engine/9.9.9" },
      []
    );
    const v = validateEvidencePackage(pkg);
    expect(v.ok).toBe(true);
    expect(v.warnings.some((w) => /fingerprint/i.test(w))).toBe(true);
  });

  it("import is idempotent: re-import skips duplicates, never merges", async () => {
    const pkg = buildEvidencePackage(stubMeta("src-exp", "completed"), [
      mkRun("src-exp", 0, "completed"),
      mkRun("src-exp", 1, "completed"),
    ]);
    const first = await importEvidencePackage(memStore, pkg);
    expect(first.ok).toBe(true);
    expect(first.imported).toBe(2);
    const meta = (await memStore.getExperiment(first.experimentId!))!;
    expect(meta.status).toBe("imported");
    expect(meta.importedFrom).toBe("src-exp");

    const second = await importEvidencePackage(memStore, pkg);
    expect(second.imported).toBe(0);
    expect(second.skippedDuplicates).toBe(2);
    expect(second.warnings.some((w) => /duplicate/i.test(w))).toBe(true);
    // Still exactly 2 runs — never doubled.
    expect((await memStore.getRunIds(first.experimentId!)).size).toBe(2);
  });
});
