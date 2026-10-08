import { describe, it, expect } from "vitest";
import { executeRun, randomParty } from "../engine/simRunner";
import { aggregateRuns, wilsonInterval, summarize, evidenceTier, pairedCompare } from "../engine/statistics";
import { deriveRunSeed, comboToId, configFingerprint, expandBatchTasks, expandLabTasks } from "../engine/experimentSpec";
import { RngEngine } from "../utils/random";
import type { RunTask, RunRecord, SimRunPolicy } from "../types/experiment";
import type { StrategyCombo } from "../types/strategyLab";
import type { PartySetupChoice } from "../engine/gameState";

/**
 * Stage 3 Phase A/B — outcome integrity + fair sampling.
 *
 * Covers: victory/defeat classification, safety-limit termination as
 * "timeout" (NOT defeat), invalid config, cancel before/during, run-state
 * isolation, determinism, unbiased suit selection, seed derivation.
 */

const fixedParty: PartySetupChoice[] = [
  { className: "Bladedancer", suit: "spades", position: 1 },
  { className: "Manipulator", suit: "hearts", position: 2 },
  { className: "Tracker", suit: "clubs", position: 3 },
];

function policy(overrides: Partial<SimRunPolicy> = {}): SimRunPolicy {
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
    ...overrides,
  };
}

function task(overrides: Partial<RunTask> = {}): RunTask {
  return {
    runId: "test:r0",
    comboIndex: -1,
    cohortIndex: 0,
    runIndex: 0,
    seed: "stage3-test-seed",
    policy: policy(),
    telemetryLevel: "standard",
    ...overrides,
  };
}

/** Deterministic comparison — strips volatile fields (timestamps, ids, logs). */
function fingerprintRun(r: RunRecord): unknown {
  return {
    status: r.status,
    outcome: r.outcome,
    defeatedBy: r.defeatedBy,
    score: r.score?.finalScore,
    turns: r.totalTurns,
    rooms: r.roomsCleared,
    heroesAlive: r.heroesAlive,
    party: r.partyComposition,
    heroes: r.heroes?.map(h => ({ id: h.heroId, alive: h.alive, hp: h.currentHp, dmg: h.damageDealt })),
  };
}

describe("Stage 3 — run outcome integrity", () => {
  it("a normal run completes with a gameplay outcome and finalized stats", async () => {
    const rec = await executeRun(task(), { yieldIntervalMs: Infinity });
    expect(rec.status).toBe("completed");
    expect(["victory", "defeat"]).toContain(rec.outcome);
    expect(rec.score?.finalScore).toBeGreaterThanOrEqual(0);
    expect(rec.stats).toBeDefined();
    expect(rec.telemetryCompleteness === "complete" || rec.telemetryCompleteness === "partial").toBe(true);
    expect(rec.engineFingerprint).toBeTruthy();
  }, 30000);

  it("identical tasks produce identical outcomes (determinism)", async () => {
    const a = await executeRun(task({ seed: "det-1" }), { yieldIntervalMs: Infinity });
    const b = await executeRun(task({ seed: "det-1" }), { yieldIntervalMs: Infinity });
    expect(fingerprintRun(a)).toEqual(fingerprintRun(b));
  }, 30000);

  it("cancel before start produces a cancelled record, not a defeat", async () => {
    const rec = await executeRun(task(), { isCancelled: () => true });
    expect(rec.status).toBe("cancelled");
    expect(rec.outcome).toBeUndefined();
    expect(rec.score).toBeUndefined();
    expect(rec.diagnostics?.retrySafe).toBe(true);
  });

  it("cancel during execution produces a cancelled record with diagnostics", async () => {
    let calls = 0;
    const rec = await executeRun(task(), {
      isCancelled: () => ++calls > 4,
      yieldIntervalMs: Infinity,
    });
    expect(rec.status).toBe("cancelled");
    expect(rec.outcome).toBeUndefined();
    expect(rec.diagnostics).toBeDefined();
    expect(rec.diagnostics!.roomIndex).toBeGreaterThanOrEqual(0);
  }, 30000);

  it("room safety-limit termination is 'timeout', never 'defeat'", async () => {
    const rec = await executeRun(
      task({ limits: { maxRooms: 2 } }),
      { yieldIntervalMs: Infinity }
    );
    // With a 2-room cap the run cannot reach a terminal phase unless it
    // dies fast; either way the classification must be honest.
    if (rec.status === "timeout") {
      expect(rec.outcome).toBeUndefined();
      expect(rec.diagnostics?.errorCategory).toBe("room-limit");
      expect(rec.score).toBeUndefined();
      expect(rec.diagnostics?.retrySafe).toBe(false);
    } else {
      expect(rec.status).toBe("completed");
      expect(rec.outcome).toBeDefined();
    }
  }, 30000);

  it("combat-iteration limit terminates as 'timeout', not defeat", async () => {
    const rec = await executeRun(
      task({ limits: { maxCombatIterations: 5 } }),
      { yieldIntervalMs: Infinity }
    );
    // A 5-step cap will abort the first combat → room never advances →
    // stuck-progression or combat-iteration-limit. Either is "timeout".
    expect(rec.status === "timeout" || rec.status === "completed").toBe(true);
    if (rec.status === "timeout") {
      expect(["combat-iteration-limit", "stuck-progression"]).toContain(rec.diagnostics?.errorCategory);
      expect(rec.outcome).toBeUndefined();
    }
  }, 30000);

  it("invalid fixed party produces 'invalid' status", async () => {
    const rec = await executeRun(
      task({ policy: policy({ partyMode: "fixed", partyChoices: [fixedParty[0]] }) }),
      { yieldIntervalMs: Infinity }
    );
    expect(rec.status).toBe("invalid");
    expect(rec.diagnostics?.errorCategory).toBe("invalid-config");
    expect(rec.outcome).toBeUndefined();
  });

  it("duplicate-class fixed party produces 'invalid' status", async () => {
    const dup: PartySetupChoice[] = [
      { className: "Bladedancer", suit: "spades", position: 1 },
      { className: "Bladedancer", suit: "hearts", position: 2 },
      { className: "Tracker", suit: "clubs", position: 3 },
    ];
    const rec = await executeRun(
      task({ policy: policy({ partyChoices: dup }) }),
      { yieldIntervalMs: Infinity }
    );
    expect(rec.status).toBe("invalid");
  });

  it("consecutive runs do not leak defeated-by state", async () => {
    // Find a seed that produces a victory — its defeatedBy must be
    // undefined regardless of what previous runs recorded.
    let victoryRec: RunRecord | undefined;
    for (let i = 0; i < 8 && !victoryRec; i++) {
      const rec = await executeRun(task({ seed: `iso-${i}`, runIndex: i }), { yieldIntervalMs: Infinity });
      if (rec.status === "completed" && rec.outcome === "victory") victoryRec = rec;
    }
    if (victoryRec) {
      expect(victoryRec.defeatedBy).toBeUndefined();
    }
    // Independently: repeated identical runs must agree on defeatedBy.
    const a = await executeRun(task({ seed: "iso-det" }), { yieldIntervalMs: Infinity });
    const b = await executeRun(task({ seed: "iso-det" }), { yieldIntervalMs: Infinity });
    expect(a.defeatedBy).toBe(b.defeatedBy);
  }, 60000);

  it("hero telemetry attributes survival to individuals, not the party", async () => {
    const rec = await executeRun(task(), { yieldIntervalMs: Infinity });
    expect(rec.status).toBe("completed");
    expect(rec.heroes).toBeDefined();
    expect(rec.heroes!.length).toBe(3);
    for (const h of rec.heroes!) {
      expect(h.heroId).toBeTruthy();
      expect(h.className).toBeTruthy();
      expect(typeof h.alive).toBe("boolean");
      expect(h.damageDealt).toBeGreaterThanOrEqual(0);
      expect(h.damageReceived).toBeGreaterThanOrEqual(0);
    }
    // Individual survival can differ from party heroesAlive count.
    expect(rec.heroesAlive).toBe(rec.heroes!.filter(h => h.alive).length);
  }, 30000);

  it("encounter telemetry records combats with structured results", async () => {
    const rec = await executeRun(task(), { yieldIntervalMs: Infinity });
    expect(rec.encounters).toBeDefined();
    expect(rec.encounters!.length).toBeGreaterThan(0);
    for (const enc of rec.encounters!) {
      expect(["victory", "defeat", "retreat"]).toContain(enc.result);
      expect(enc.monsterName).toBeTruthy();
    }
  }, 30000);
});

describe("Stage 3 — unbiased party sampling", () => {
  it("suit selection is uniform across the four suits", () => {
    const counts: Record<string, number> = { clubs: 0, diamonds: 0, hearts: 0, spades: 0 };
    const N = 400; // parties → 1200 suit draws
    for (let i = 0; i < N; i++) {
      const rng = new RngEngine(`suit-test-${i}`);
      for (const choice of randomParty(rng)) counts[choice.suit]++;
    }
    const total = N * 3;
    // Each suit should be ~25%. With 1200 draws, σ ≈ sqrt(1200·.25·.75) ≈ 15.
    // A 3σ bound (±45 around 300) is generous; the old mapping gave
    // hearts/clubs 400 and diamonds/spades 200 — far outside this bound.
    for (const suit of Object.keys(counts)) {
      expect(counts[suit]).toBeGreaterThan(240);
      expect(counts[suit]).toBeLessThan(360);
    }
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(total);
  });

  it("randomParty is deterministic for a fixed seed", () => {
    const a = randomParty(new RngEngine("party-det"));
    const b = randomParty(new RngEngine("party-det"));
    expect(a).toEqual(b);
  });
});

describe("Stage 3 — seed derivation & identity", () => {
  it("batch, cohort, and independent seeds are distinct and unambiguous", () => {
    const comboId = "combat=balanced;itemUsage=conservative;merchant=balanced;rest=smart;split=combat;weaponUpgrade=when-affordable";
    const batch = deriveRunSeed("S", "batch", 3);
    const cohort = deriveRunSeed("S", "cohort", 3);
    const ind = deriveRunSeed("S", "ind", 3, comboId);
    expect(new Set([batch, cohort, ind]).size).toBe(3);
    // Cohort seed identical for ANY combo — that's the shared-scenario guarantee.
    expect(deriveRunSeed("S", "cohort", 3)).toBe(deriveRunSeed("S", "cohort", 3, "other=combo"));
    // Different combos → different independent seeds.
    expect(deriveRunSeed("S", "ind", 3, "a=1")).not.toBe(deriveRunSeed("S", "ind", 3, "a=2"));
    // Strategy order irrelevant: cohort index is the only differentiator.
    expect(deriveRunSeed("S", "cohort", 0)).toBe(deriveRunSeed("S", "cohort", 0));
  });

  it("comboToId covers all six axes and ignores nothing", () => {
    const a: StrategyCombo = {
      combatStrategy: "aggressive", merchantStrategy: "balanced", restStrategy: "smart",
      splitStrategy: "combat", itemUsageStrategy: "conservative", weaponUpgradeStrategy: "when-affordable",
    };
    const b: StrategyCombo = { ...a, merchantStrategy: "skip" };
    expect(comboToId(a)).not.toBe(comboToId(b));
    expect(comboToId(a)).toBe(comboToId({ ...a }));
  });

  it("configFingerprint is stable across key ordering", () => {
    const a = { x: 1, y: [1, 2], z: { p: "a", q: undefined } };
    const b = { z: { q: undefined, p: "a" }, y: [1, 2], x: 1 };
    expect(configFingerprint(a)).toBe(configFingerprint(b));
    expect(configFingerprint(a)).not.toBe(configFingerprint({ ...a, x: 2 }));
  });

  it("task expansion assigns deterministic runIds and seeds", () => {
    const cfg = {
      runs: 5, difficulty: "normal" as const, partyMode: "random" as const,
      combatStrategy: "balanced" as const, merchantStrategy: "balanced" as const,
      restStrategy: "full-heal" as const, splitStrategy: "combat" as const,
      itemUsageStrategy: "conservative" as const, weaponUpgradeStrategy: "when-affordable" as const,
      baseSeed: "expand-test",
    };
    const t1 = expandBatchTasks(cfg, "exp1");
    const t2 = expandBatchTasks(cfg, "exp1");
    expect(t1.map(t => t.runId)).toEqual(t2.map(t => t.runId));
    expect(t1.map(t => t.seed)).toEqual(t2.map(t => t.seed));
    expect(new Set(t1.map(t => t.runId)).size).toBe(5);
  });

  it("lab task expansion gives shared cohorts the same seed across combos", () => {
    const combos: StrategyCombo[] = [
      { combatStrategy: "aggressive", merchantStrategy: "balanced", restStrategy: "smart", splitStrategy: "combat", itemUsageStrategy: "conservative", weaponUpgradeStrategy: "when-affordable" },
      { combatStrategy: "defensive", merchantStrategy: "balanced", restStrategy: "smart", splitStrategy: "combat", itemUsageStrategy: "conservative", weaponUpgradeStrategy: "when-affordable" },
    ];
    const labCfg = {
      runsPerCombo: 3, difficulty: "normal" as const, partyMode: "random" as const,
      baseSeed: "lab-test", sharedCohort: true,
      axes: { combat: ["aggressive", "defensive"], merchant: ["balanced"], rest: ["smart"], split: ["combat"], itemUsage: ["conservative"], weaponUpgrade: ["when-affordable"] } as any,
    };
    const tasks = expandLabTasks(labCfg as any, combos, "expL");
    // Same cohort index → same seed across combos (shared scenario).
    expect(tasks[0].seed).toBe(tasks[3].seed); // combo0 r0 == combo1 r0
    expect(tasks[1].seed).toBe(tasks[4].seed);
    // Different cohort index → different seed.
    expect(tasks[0].seed).not.toBe(tasks[1].seed);
    // Independent mode → different seeds per combo.
    const indCfg = { ...labCfg, sharedCohort: false };
    const indTasks = expandLabTasks(indCfg as any, combos, "expL");
    expect(indTasks[0].seed).not.toBe(indTasks[3].seed);
  });
});

describe("Stage 3 — aggregation correctness", () => {
  const mk = (status: RunRecord["status"], outcome?: RunRecord["outcome"], score = 1000): RunRecord => ({
    runId: `r${Math.random()}`,
    comboIndex: -1, cohortIndex: 0, runIndex: 0, seed: "s",
    status, outcome,
    score: status === "completed" ? { finalScore: score } as any : undefined,
    partyComposition: [],
    runSummary: "", telemetryLevel: "minimal", telemetryCompleteness: "summary-only",
    engineFingerprint: "test",
  } as RunRecord);

  it("technical failures are excluded from win-rate denominators", () => {
    const runs = [
      mk("completed", "victory"),
      mk("completed", "defeat"),
      mk("timeout"), mk("error"), mk("cancelled"), mk("invalid"),
    ];
    const agg = aggregateRuns(runs);
    expect(agg.totalRuns).toBe(6);
    expect(agg.validRuns).toBe(2);
    expect(agg.victories).toBe(1);
    expect(agg.defeats).toBe(1);
    expect(agg.errorRuns).toBe(1);
    expect(agg.timeoutRuns).toBe(1);
    expect(agg.cancelledRuns).toBe(1);
    expect(agg.invalidRuns).toBe(1);
    expect(agg.victoryRate).toBe(50); // 1/2, NOT 1/6
  });

  it("Wilson interval: known cases", () => {
    // 0 of 0 → undefined
    expect(wilsonInterval(0, 0)).toBeUndefined();
    // 5 of 5 → interval bounded below 1
    const allWin = wilsonInterval(5, 5)!;
    expect(allWin.low).toBeGreaterThan(0.5);
    expect(allWin.high).toBeLessThanOrEqual(1);
    // 0 of 10 → upper bound > 0, lower = 0
    const allLoss = wilsonInterval(0, 10)!;
    expect(allLoss.low).toBe(0);
    expect(allLoss.high).toBeGreaterThan(0.2);
    // Wilson for 50/100 → ~[0.4038, 0.5962]
    const mid = wilsonInterval(50, 100)!;
    expect(mid.low).toBeCloseTo(0.4038, 3);
    expect(mid.high).toBeCloseTo(0.5962, 3);
  });

  it("summarize: sample stddev, quantiles, edge cases", () => {
    expect(summarize([])).toBeUndefined();
    const one = summarize([42])!;
    expect(one.stdDev).toBe(0);
    expect(one.median).toBe(42);
    const s = summarize([1, 2, 3, 4])!;
    expect(s.mean).toBe(2.5);
    expect(s.stdDev).toBeCloseTo(1.291, 2); // sample stddev
    expect(s.min).toBe(1);
    expect(s.max).toBe(4);
  });

  it("evidence tiers follow explicit thresholds", () => {
    expect(evidenceTier(0)).toBe("insufficient");
    expect(evidenceTier(9)).toBe("insufficient");
    expect(evidenceTier(10)).toBe("exploratory");
    expect(evidenceTier(49)).toBe("exploratory");
    expect(evidenceTier(50)).toBe("replicated");
  });

  it("pairedCompare only pairs shared cohort indices with completed runs", () => {
    const a = [
      { ...mk("completed", "victory", 2000), cohortIndex: 0 },
      { ...mk("completed", "defeat", 500), cohortIndex: 1 },
      { ...mk("timeout"), cohortIndex: 2 },     // invalid → unpairable
      { ...mk("completed", "victory", 1500), cohortIndex: 9 }, // unmatched
    ];
    const b = [
      { ...mk("completed", "defeat", 800), cohortIndex: 0 },
      { ...mk("completed", "defeat", 400), cohortIndex: 1 },
      { ...mk("completed", "victory", 3000), cohortIndex: 2 },
    ];
    const cmp = pairedCompare(a, b);
    expect(cmp.pairs).toBe(2); // only cohorts 0 and 1
    expect(cmp.winDiffs.aWins).toBe(1);
    expect(cmp.winDiffs.bWins).toBe(0);
    expect(cmp.winDiffs.ties).toBe(1);
    expect(cmp.unmatchedA).toBe(1);
    expect(cmp.meanScoreDiff).toBeCloseTo((2000 - 800 + 500 - 400) / 2, 5);
  });
});
