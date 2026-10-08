/**
 * Stage 3 — canonical headless run executor.
 *
 * Worker-safe: no window/document/React/requestAnimationFrame/Zustand.
 * The ONLY yields are time-budgeted `setTimeout(0)` macrotask yields that
 * let a worker's message handler process cancel requests — they never
 * consume RNG, so scheduling cannot affect outcomes.
 *
 * Every run owns its result state. Module-global counters (event sequence,
 * id counter) are reset per run so outcomes are identical regardless of
 * what ran before in the same thread/worker.
 */
import type { GameState } from "../types/gameState";
import type { GameEvent } from "../types/events";
import type { Suit } from "../types/cards";
import type {
  RunTask,
  RunRecord,
  RunDiagnostics,
  ExecutionStatus,
  GameplayOutcome,
  TelemetryCompleteness,
  SimRunPolicy,
} from "../types/experiment";

import { RngEngine } from "../utils/random";
import { resetIdCounter } from "../utils/ids";
import {
  initializeGame,
  createDefaultConfig,
  rollWelcomeBonus,
  applyWelcomeBonusResults,
  type PartySetupChoice,
} from "./gameState";
import {
  advanceRoom,
  resolveSplitChoice,
  markRoomResolved,
  getLivingHeroes,
  getHeroById,
  getDeadHeroes,
} from "./rulesEngine";
import { startCombat } from "./combatEngine";
import { runCombatStep, completeHeroTurn } from "./combatRunner";
import {
  enterMerchant,
  buyItem,
  buyUpgrade,
  upgradeWeapon,
  leaveMerchant,
} from "./merchantEngine";
import { resolveRestChoice, calculateScore, finalizeRunStats, resolveCombatRoom } from "./progressionEngine";
import { emitEvent, resetEventSequence, setTraceObserver } from "./eventLog";
import { ALL_CLASSES, getSpecialization } from "../data/classes";
import { buildHeroRecords, buildEncounterRecords, TELEMETRY_SCHEMA_VERSION } from "./telemetry";
import { ENGINE_FINGERPRINT } from "./experimentSpec";

export { getItemUsageThreshold } from "./simPolicies";

const ALL_SUITS: Suit[] = ["clubs", "diamonds", "hearts", "spades"];

// ─── Run execution context ───────────────────────────────────────────────────

interface RunCtx {
  /** Set by the cooperative-cancel callback polled at safe boundaries. */
  isCancelled?: () => boolean;
  /** Wall-clock budget between macrotask yields (ms). */
  yieldIntervalMs: number;
  lastYieldAt: number;
  roomIterations: number;
  combatIterations: number;
  maxRooms: number;
  maxCombatIterations: number;
  /** Per-run defeated-by tracking — replaces the old module-global. */
  defeatedByMonster?: string;
  combatLimitHit: boolean;
  /** Times the stuck-AI loop breaker forced a hero turn completion. */
  noProgressBreaks: number;
}

export interface ExecuteRunOptions {
  isCancelled?: () => boolean;
  /** Max ms between cooperative yields. Default 40. Set Infinity for
   *  fully synchronous execution (tests, CLI). */
  yieldIntervalMs?: number;
}

const DEFAULT_YIELD_MS = 40;
const DEFAULT_MAX_ROOMS = 40;
const DEFAULT_MAX_COMBAT_ITERATIONS = 500;

function yieldControl(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function maybeYield(ctx: RunCtx, force = false): Promise<void> {
  const now = Date.now();
  if (force || now - ctx.lastYieldAt >= ctx.yieldIntervalMs) {
    ctx.lastYieldAt = now;
    await yieldControl();
  }
}

// ─── Party / choice policies ─────────────────────────────────────────────────

/**
 * Random party selection — unbiased.
 *
 * Stage 3 fix: suit selection previously mapped a d6 onto 4 suit buckets
 * ((roll-1)*4/6), producing p(clubs)=2/6, p(diamonds)=1/6, p(hearts)=2/6,
 * p(spades)=1/6. chooseRandom uses the raw PRNG uniform over 4 buckets —
 * each suit is now exactly 1/4. RNG step consumption is unchanged
 * (one draw per hero), but realized suit assignments differ, so
 * ENGINE_FINGERPRINT was bumped to 3.1.0.
 */
export function randomParty(rng: RngEngine): PartySetupChoice[] {
  const shuffled = rng.shuffleDeck([...ALL_CLASSES], "party_shuffle");
  const chosen = shuffled.slice(0, 3);
  return chosen.map((className, i) => {
    const suit = rng.chooseRandom(ALL_SUITS, "party_suit_select");
    return {
      className,
      suit,
      position: (i + 1) as 1 | 2 | 3,
    };
  });
}

function pickSplitChoice(
  state: GameState,
  rng: RngEngine,
  strategy: SimRunPolicy["splitStrategy"]
): number {
  const room = state.spire.currentRoom;
  if (!room?.splitOptions) return 0;

  if (strategy === "random") {
    // Unbiased uniform index via the canonical RNG (replaces the biased
    // d6→N bucket mapping, which was non-uniform for N=4).
    const indices = room.splitOptions.map((_, i) => i);
    return rng.chooseRandom(indices, "split_random");
  }

  if (strategy === "safe") {
    for (let i = 0; i < room.splitOptions.length; i++) {
      const t = room.splitOptions[i].type;
      if (t === "merchant" || t === "rest" || t === "combat") return i;
    }
    return 0;
  }

  // combat: prefer elite_combat or combat
  for (let i = 0; i < room.splitOptions.length; i++) {
    const t = room.splitOptions[i].type;
    if (t === "elite_combat" || t === "combat") return i;
  }
  return 0;
}

// ─── Combat / room autoplay ──────────────────────────────────────────────────

async function autoPlayCombat(
  state: GameState,
  rng: RngEngine,
  policy: SimRunPolicy,
  ctx: RunCtx
): Promise<GameState> {
  let newState = state;
  let noProgressCount = 0;
  let lastProgressKey = "";
  const runnerConfig = {
    combatStrategy: policy.combatStrategy,
    itemUsageStrategy: policy.itemUsageStrategy,
  };

  while (newState.combat && !newState.combat.combatResult) {
    ctx.combatIterations++;
    if (ctx.combatIterations >= ctx.maxCombatIterations) {
      ctx.combatLimitHit = true;
      return newState;
    }
    if (ctx.combatIterations % 64 === 0) {
      if (ctx.isCancelled?.()) return newState;
      await maybeYield(ctx);
    }
    newState = runCombatStep(newState, rng, runnerConfig);

    // No-progress loop breaker — a stuck-AI guard, not a stalemate retreat.
    const progressKey = `${newState.combat?.round ?? 0}:${newState.combat?.completedHeroTurns.length ?? 0}:${newState.combat?.combatResult ?? ""}`;
    if (progressKey === lastProgressKey) {
      noProgressCount++;
      if (noProgressCount >= 3) {
        const nextHeroId = newState.combat?.heroTurnOrder.find(
          id => !newState.combat!.completedHeroTurns.includes(id) &&
            getHeroById(newState, id)?.alive
        );
        if (nextHeroId) {
          newState = completeHeroTurn(newState, nextHeroId);
          ctx.noProgressBreaks++;
        }
        else return newState; // no completable hero — give up
        noProgressCount = 0;
      }
    } else {
      noProgressCount = 0;
      lastProgressKey = progressKey;
    }
  }

  return newState;
}

function autoMerchant(state: GameState, policy: SimRunPolicy): GameState {
  let newState = enterMerchant(state);

  if (policy.merchantStrategy === "skip") {
    return leaveMerchant(newState);
  }

  const living = getLivingHeroes(newState);

  if (policy.weaponUpgradeStrategy !== "never") {
    for (const hero of living) {
      if (newState.party.gold < 50) break;
      const upgradeCost = 50; // approximate minimum upgrade cost
      if (policy.weaponUpgradeStrategy === "prioritize") {
        if (newState.party.gold >= upgradeCost) {
          newState = upgradeWeapon(newState, hero.id);
        }
      } else if (policy.weaponUpgradeStrategy === "when-affordable") {
        if (newState.party.gold >= upgradeCost + 30) {
          newState = upgradeWeapon(newState, hero.id);
        }
      }
    }
  }

  if (policy.merchantStrategy === "heal-items" || policy.merchantStrategy === "balanced") {
    for (const hero of living) {
      if (hero.currentHp / hero.maxHp < 0.6) {
        newState = buyItem(newState, "Minor Potion", hero.id);
      }
    }
    if (policy.merchantStrategy === "balanced") {
      if (newState.party.gold > 60) {
        newState = buyUpgrade(newState, "HP Increase", living[0].id);
      }
    }
  } else if (policy.merchantStrategy === "upgrades") {
    for (const hero of living) {
      if (newState.party.gold > 60) {
        newState = buyUpgrade(newState, "HP Increase", hero.id);
      }
    }
  }

  return leaveMerchant(newState);
}

function autoRest(
  state: GameState,
  rng: RngEngine,
  strategy: SimRunPolicy["restStrategy"]
): GameState {
  let choice: 1 | 2 | 3 | 4;

  const dead = getDeadHeroes(state);
  const living = getLivingHeroes(state);
  const anyHurt = living.some(h => h.currentHp < h.maxHp);

  switch (strategy) {
    case "full-heal":
      choice = 1;
      break;
    case "revive":
      if (dead.length > 0) {
        choice = 2;
      } else if (anyHurt) {
        choice = 1;
      } else {
        choice = 4;
      }
      break;
    case "gold":
      choice = 3;
      break;
    case "max-hp":
      choice = 4;
      break;
    case "smart":
      if (dead.length > 0) {
        choice = 2;
      } else if (living.some(h => h.currentHp / h.maxHp < 0.5)) {
        choice = 1;
      } else if (!state.party.maxHpBoostUsed && !anyHurt) {
        choice = 4;
      } else if (state.spire.roomIndex < 4 && state.party.gold < 50 * state.spire.tier) {
        choice = 3;
      } else {
        choice = 1;
      }
      break;
    default:
      choice = 1;
  }

  return resolveRestChoice(state, choice, rng);
}

async function processRoom(
  state: GameState,
  rng: RngEngine,
  policy: SimRunPolicy,
  ctx: RunCtx
): Promise<GameState> {
  let newState = state;
  const room = newState.spire.currentRoom;
  if (!room) return newState;

  if (room.type === "split" && newState.spire.splitChoicePending) {
    const choiceIdx = pickSplitChoice(newState, rng, policy.splitStrategy);
    newState = resolveSplitChoice(newState, choiceIdx, rng);
  }

  const currentRoom = newState.spire.currentRoom;
  if (!currentRoom) return newState;

  switch (currentRoom.type) {
    case "combat":
    case "elite_combat": {
      ctx.combatIterations = 0;
      const combatState = startCombat(newState, rng, {
        isElite: currentRoom.type === "elite_combat",
      });
      const afterCombat = await autoPlayCombat(combatState, rng, policy, ctx);
      if (ctx.combatLimitHit || ctx.isCancelled?.()) return afterCombat;
      const result = resolveCombatRoom(afterCombat);
      if (result.defeatedByMonster) ctx.defeatedByMonster = result.defeatedByMonster;
      if (result.terminal === "victory" || result.terminal === "defeat") {
        return result.state;
      }
      newState = result.state;
      break;
    }

    case "mini_boss": {
      ctx.combatIterations = 0;
      const combatState = startCombat(newState, rng, { isMiniBoss: true });
      const afterCombat = await autoPlayCombat(combatState, rng, policy, ctx);
      if (ctx.combatLimitHit || ctx.isCancelled?.()) return afterCombat;
      const result = resolveCombatRoom(afterCombat);
      if (result.defeatedByMonster) ctx.defeatedByMonster = result.defeatedByMonster;
      if (result.terminal === "victory" || result.terminal === "defeat") {
        return result.state;
      }
      newState = result.state;
      break;
    }

    case "final_boss": {
      ctx.combatIterations = 0;
      const combatState = startCombat(newState, rng, { isFinalBoss: true });
      const afterCombat = await autoPlayCombat(combatState, rng, policy, ctx);
      if (ctx.combatLimitHit || ctx.isCancelled?.()) return afterCombat;
      const result = resolveCombatRoom(afterCombat);
      if (result.defeatedByMonster) ctx.defeatedByMonster = result.defeatedByMonster;
      // final_boss always returns a terminal state from resolveCombatRoom
      // (victory if boss dead + survivors, defeat otherwise).
      return result.state;
    }

    case "merchant": {
      newState = autoMerchant(newState, policy);
      newState = markRoomResolved(newState);
      newState = advanceRoom(newState);
      break;
    }

    case "rest": {
      newState = autoRest(newState, rng, policy.restStrategy);
      newState = markRoomResolved(newState);
      newState = advanceRoom(newState);
      break;
    }

    default:
      newState = markRoomResolved(newState);
      newState = advanceRoom(newState);
      break;
  }

  return newState;
}

// ─── Validation ─────────────────────────────────────────────────────────────

function validateTask(task: RunTask): string | null {
  const p = task.policy;
  if (p.partyMode === "fixed") {
    if (!p.partyChoices || p.partyChoices.length !== 3) {
      return "fixed party mode requires exactly 3 party choices";
    }
    const classes = p.partyChoices.map((c) => c.className);
    if (new Set(classes).size !== classes.length) {
      return "fixed party has duplicate classes";
    }
    if (p.partyChoices.some((c) => !ALL_SUITS.includes(c.suit))) {
      return "fixed party has an invalid suit";
    }
  }
  return null;
}

// ─── Canonical run executor ──────────────────────────────────────────────────

function baseRecord(
  task: RunTask,
  status: ExecutionStatus,
  partyComposition: RunRecord["partyComposition"],
  diagnostics?: RunDiagnostics
): RunRecord {
  return {
    runId: task.runId,
    experimentId: task.experimentId,
    comboId: task.comboId,
    comboIndex: task.comboIndex,
    cohortIndex: task.cohortIndex,
    runIndex: task.runIndex,
    seed: task.seed,
    status,
    partyComposition,
    runSummary: "",
    diagnostics,
    telemetryLevel: task.telemetryLevel,
    telemetryCompleteness: status === "completed" ? "complete" : "invalid",
    engineFingerprint: ENGINE_FINGERPRINT,
  };
}

function diagnosticsFor(state: GameState | undefined, ctx: RunCtx): RunDiagnostics {
  return {
    phase: state?.phase ?? "unknown",
    roomIndex: state?.spire.roomIndex ?? -1,
    tier: state?.spire.tier ?? -1,
    roomType: state?.spire.currentRoom?.type,
    roomIterations: ctx.roomIterations,
    combatIterations: ctx.combatIterations,
    noProgressBreaks: ctx.noProgressBreaks,
    retrySafe: false,
  };
}

/**
 * Execute one simulated game. Always resolves with a RunRecord —
 * exceptions are captured as status "error" records, never thrown.
 */
export async function executeRun(
  task: RunTask,
  opts: ExecuteRunOptions = {}
): Promise<RunRecord> {
  const startedAt = Date.now();
  // Per-run isolation of module-global counters — required for identical
  // IDs/event sequences regardless of execution order or worker history.
  resetEventSequence();
  resetIdCounter();

  const ctx: RunCtx = {
    isCancelled: opts.isCancelled,
    yieldIntervalMs: opts.yieldIntervalMs ?? DEFAULT_YIELD_MS,
    lastYieldAt: 0,
    roomIterations: 0,
    combatIterations: 0,
    combatLimitHit: false,
    noProgressBreaks: 0,
    maxRooms: task.limits?.maxRooms ?? DEFAULT_MAX_ROOMS,
    maxCombatIterations: task.limits?.maxCombatIterations ?? DEFAULT_MAX_COMBAT_ITERATIONS,
  };

  let state: GameState | undefined;
  let partyChoices: PartySetupChoice[] = [];

  // Deep trace capture: observes every event BEFORE bounded-log pruning.
  // Bounded retention — never an unbounded in-memory trace. `emitted`
  // counts every event even when retention is capped, so the record can
  // state exactly what was captured vs produced.
  const TRACE_RETENTION_CAP = 8000;
  const traceEvents: GameEvent[] | null =
    task.telemetryLevel === "deep" ? [] : null;
  let traceEmitted = 0;
  let traceTruncated = false;
  if (traceEvents) {
    setTraceObserver((e) => {
      traceEmitted++;
      if (traceEvents.length < TRACE_RETENTION_CAP) traceEvents.push(e);
      else traceTruncated = true;
    });
  }

  try {
    // ── Setup phase: invalid inputs become "invalid", not "error" ──
    const invalidReason = validateTask(task);
    if (invalidReason) {
      const rec = baseRecord(task, "invalid", []);
      rec.diagnostics = {
        phase: "setup", roomIndex: -1, tier: -1,
        roomIterations: 0, combatIterations: 0,
        errorCategory: "invalid-config", errorMessage: invalidReason,
        retrySafe: false,
      };
      rec.runSummary = `Run ${task.runIndex + 1} [${task.seed}]: INVALID — ${invalidReason}`;
      rec.durationMs = Date.now() - startedAt;
      return rec;
    }

    const policy = task.policy;
    const simConfig = createDefaultConfig({
      seed: task.seed,
      difficulty: policy.difficulty,
      mode: "simulation",
      speed: "batch",
      logLevel: "normal",
      partyControl: "ai",
      showCardFlips: false,
      showDiceRolls: false,
    });

    let rng = new RngEngine(task.seed);
    partyChoices = policy.partyMode === "fixed" && policy.partyChoices
      ? policy.partyChoices
      : randomParty(rng);

    state = initializeGame(simConfig, partyChoices);
    rng = RngEngine.deserialize(state.rng);

    if (state.welcomeBonusPending) {
      const wbResults = rollWelcomeBonus(state, rng);
      state = applyWelcomeBonusResults(state, wbResults, rng);
      state = { ...state, welcomeBonusPending: false };
    }

    // ── Room loop ──
    let lastRoomIndex = state.spire.roomIndex;
    let stuckCount = 0;
    let stuckHit = false;
    let cancelled = false;

    while (state.phase !== "victory" && state.phase !== "defeat") {
      if (ctx.isCancelled?.()) { cancelled = true; break; }
      if (ctx.roomIterations >= ctx.maxRooms) break;
      if (state.phase === "tier_transition") {
        state = { ...state, phase: "exploration" };
      }
      ctx.roomIterations++;
      state = await processRoom(state, rng, policy, ctx);
      if (ctx.isCancelled?.()) { cancelled = true; break; }
      if (ctx.combatLimitHit) break;
      if (state.phase === "victory" || state.phase === "defeat") break;

      if (state.spire.roomIndex === lastRoomIndex) {
        stuckCount++;
        if (stuckCount >= 2) { stuckHit = true; break; }
      } else {
        stuckCount = 0;
        lastRoomIndex = state.spire.roomIndex;
      }
      await maybeYield(ctx);
    }

    const partyComp = partyChoices.map((c) => ({
      className: c.className,
      suit: c.suit,
      specialization: getSpecialization(c.className, c.suit as never) as string,
    }));

    // ── Classification ──
    if (cancelled) {
      const rec = baseRecord(task, "cancelled", partyComp);
      const d = diagnosticsFor(state, ctx);
      d.errorCategory = "cancelled";
      d.retrySafe = true;
      rec.diagnostics = d;
      rec.runSummary = `Run ${task.runIndex + 1} [${task.seed}]: CANCELLED at room ${d.roomIndex + 1}`;
      rec.durationMs = Date.now() - startedAt;
      return rec;
    }

    if (state.phase !== "victory" && state.phase !== "defeat") {
      // Safety-limit termination — NOT a gameplay defeat.
      const rec = baseRecord(task, "timeout", partyComp);
      const d = diagnosticsFor(state, ctx);
      d.errorCategory = ctx.combatLimitHit
        ? "combat-iteration-limit"
        : stuckHit
          ? "stuck-progression"
          : "room-limit";
      rec.diagnostics = d;
      rec.runSummary = `Run ${task.runIndex + 1} [${task.seed}]: TIMEOUT (${d.errorCategory}) at room ${d.roomIndex + 1}`;
      rec.durationMs = Date.now() - startedAt;
      attachTelemetry(rec, state, partyChoices, task.telemetryLevel,
        traceEvents ? { events: traceEvents, emitted: traceEmitted, truncated: traceTruncated } : undefined);
      return rec;
    }

    // ── Legitimate terminal state: finalize exactly once ──
    const finalState = finalizeRunStats(state);
    const score = calculateScore(finalState);
    const livingHeroes = getLivingHeroes(finalState);
    const outcome: GameplayOutcome = finalState.phase === "victory" ? "victory" : "defeat";

    const rec = baseRecord(task, "completed", partyComp);
    rec.outcome = outcome;
    rec.defeatedBy = ctx.defeatedByMonster;
    rec.score = score;
    rec.stats = finalState.stats;
    rec.heroesAlive = livingHeroes.length;
    rec.totalTurns = finalState.stats.totalTurns;
    rec.roomsCleared = finalState.stats.roomsCleared;
    rec.runSummary = `Run ${task.runIndex + 1} [${task.seed}]: ${outcome.toUpperCase()} — Score: ${score.finalScore}, Turns: ${finalState.stats.totalTurns}, Rooms: ${finalState.stats.roomsCleared}, Heroes Alive: ${livingHeroes.length}`;
    rec.durationMs = Date.now() - startedAt;
    attachTelemetry(rec, finalState, partyChoices, task.telemetryLevel,
      traceEvents ? { events: traceEvents, emitted: traceEmitted, truncated: traceTruncated } : undefined);
    return rec;
  } catch (err) {
    const rec = baseRecord(task, "error", []);
    const d = diagnosticsFor(state, ctx);
    d.errorCategory = state === undefined ? "invalid-state" : "exception";
    d.errorMessage = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    d.retrySafe = state === undefined; // setup errors may be transient input issues
    rec.diagnostics = d;
    rec.runSummary = `Run ${task.runIndex + 1} [${task.seed}]: ERROR — ${d.errorMessage}`;
    rec.durationMs = Date.now() - startedAt;
    return rec;
  } finally {
    // The trace observer is module-global — always release it so a
    // subsequent run (or game) never writes into this run's buffer.
    if (traceEvents) setTraceObserver(null);
  }
}

function attachTelemetry(
  rec: RunRecord,
  state: GameState,
  partyChoices: PartySetupChoice[],
  level: RunTask["telemetryLevel"],
  trace?: { events: GameEvent[]; emitted: number; truncated: boolean }
): void {
  let completeness: TelemetryCompleteness = rec.status === "completed" ? "complete" : "partial";
  rec.telemetryVersion = TELEMETRY_SCHEMA_VERSION;

  if (level === "minimal") {
    rec.telemetryCompleteness = rec.status === "completed" ? "summary-only" : completeness;
    return;
  }

  rec.heroes = buildHeroRecords(state, partyChoices);
  // terminatedMidCombat: an unresolved combat still active at capture.
  const terminatedMidCombat =
    rec.status !== "completed" && state.combat != null && !state.combat.combatResult;
  const enc = buildEncounterRecords(state, { terminatedMidCombat });
  rec.encounters = enc.encounters;
  if (enc.completeness === "partial") completeness = "partial";

  if (level === "deep" && trace) {
    // Deep trace: events captured before display-log pruning, bounded by
    // the retention cap. traceStats states exactly what was produced vs
    // retained — a truncated trace never wears a "complete" badge.
    rec.combatLog = trace.events;
    rec.traceStats = {
      emitted: trace.emitted,
      retained: trace.events.length,
      truncated: trace.truncated,
    };
    if (trace.truncated) completeness = "partial";
    const rngData = state.rng;
    rec.rngHistorySummary = {
      totalSteps: rngData?.step ?? 0,
      retainedEvents: rngData?.history?.length ?? 0,
    };
  } else {
    rec.combatLog = state.log;
  }

  rec.telemetryCompleteness = completeness;
}

/**
 * Compatibility adapter: the pre-Stage-3 signature. Prefer executeRun
 * with an explicit RunTask for new code.
 */
export async function runSingleGameTask(
  runIndex: number,
  seed: string,
  policy: SimRunPolicy,
  telemetryLevel: RunTask["telemetryLevel"] = "standard"
): Promise<RunRecord> {
  return executeRun({
    runId: `adhoc:${runIndex}`,
    comboIndex: -1,
    cohortIndex: runIndex,
    runIndex,
    seed,
    policy,
    telemetryLevel,
  });
}
