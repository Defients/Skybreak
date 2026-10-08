import type { GameState } from "../types/gameState";
import type {
  BatchConfig,
  BatchResult,
  RunResult,
  AggregateStats,
} from "../types/batch";
import type { Suit } from "../types/cards";

import { RngEngine } from "../utils/random";
import {
  initializeGame,
  createDefaultConfig,
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
import {
  startCombat,
} from "./combatEngine";
import { runCombatStep, completeHeroTurn } from "./combatRunner";
import {
  enterMerchant,
  buyItem,
  buyUpgrade,
  upgradeWeapon,
  leaveMerchant,
} from "./merchantEngine";
import { resolveRestChoice, calculateScore, finalizeRunStats, resolveCombatRoom } from "./progressionEngine";
import { emitEvent, resetEventSequence } from "./eventLog";
import { ALL_CLASSES, getSpecialization } from "../data/classes";
import { rollWelcomeBonus, applyWelcomeBonusResults } from "./gameState";

const ALL_SUITS: Suit[] = ["clubs", "diamonds", "hearts", "spades"];

let _defeatedByMonster: string | undefined;

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export function randomParty(rng: RngEngine): PartySetupChoice[] {
  const shuffled = rng.shuffleDeck([...ALL_CLASSES], "party_shuffle");
  const chosen = shuffled.slice(0, 3);
  return chosen.map((className, i) => {
    const suitRoll = rng.rollD6("party_suit_select");
    // Map d6 results 1-6 onto ALL_SUITS indices 0..3 so all four suits are
    // reachable. The previous Math.floor((roll-1)/2) capped at index 2, making
    // spades (index 3) unreachable. The general formula (roll-1)*N/6 spreads
    // d6 across N buckets: d6=1→0, d6=6→3.
    const suit = ALL_SUITS[Math.min(ALL_SUITS.length - 1, Math.floor((suitRoll.total - 1) * ALL_SUITS.length / 6))];
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
  strategy: BatchConfig["splitStrategy"]
): number {
  const room = state.spire.currentRoom;
  if (!room?.splitOptions) return 0;

  if (strategy === "random") {
    // Map d6 results 1-6 onto split option indices 0..length-1. Using
    // (roll-1) ensures d6=6 maps to the last valid index, not one past it.
    // The previous (roll * length / 6) produced out-of-bounds indices when
    // roll=6 (e.g. 6*3/6 = 3, invalid for a 3-option split).
    return Math.min(
      room.splitOptions.length - 1,
      Math.floor(((rng.rollD6("split_random").total - 1) * room.splitOptions.length) / 6)
    );
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

export function getItemUsageThreshold(strategy: BatchConfig["itemUsageStrategy"]): number {
  switch (strategy) {
    case "never": return 0;
    case "conservative": return 0.3;
    case "aggressive": return 0.6;
    case "always-if-hurt": return 0.9;
    default: return 0.3;
  }
}

async function autoPlayCombat(
  state: GameState,
  rng: RngEngine,
  config: BatchConfig
): Promise<GameState> {
  let newState = state;
  const maxIterations = 500;
  let safetyCounter = 0;
  let lastProgressKey = "";
  let noProgressCount = 0;
  const runnerConfig = {
    combatStrategy: config.combatStrategy,
    itemUsageStrategy: config.itemUsageStrategy,
  };

  while (newState.combat && !newState.combat.combatResult && safetyCounter < maxIterations) {
    safetyCounter++;
    // Yield to event loop every few iterations so UI can paint
    if (safetyCounter % 3 === 0) {
      await nextPaint();
    }
    const beforeStep = newState;
    newState = runCombatStep(newState, rng, runnerConfig);

    // No-progress detection: if the state hasn't meaningfully changed
    // (same completedHeroTurns, same round, same combatResult), we might
    // be stuck in a loop (e.g., AI keeps deciding use_item but item is
    // unavailable). Force the current hero's turn to complete.
    const progressKey = `${newState.combat?.round ?? 0}:${newState.combat?.completedHeroTurns.length ?? 0}:${newState.combat?.combatResult ?? ""}`;
    if (progressKey === lastProgressKey) {
      noProgressCount++;
      if (noProgressCount >= 3) {
        // Force-complete the current hero's turn to break the loop
        const nextHeroId = newState.combat?.heroTurnOrder.find(
          id => !newState.combat!.completedHeroTurns.includes(id) &&
            getHeroById(newState, id)?.alive
        );
        if (nextHeroId) {
          newState = completeHeroTurn(newState, nextHeroId);
        }
        noProgressCount = 0;
      }
    } else {
      noProgressCount = 0;
      lastProgressKey = progressKey;
    }
  }

  return newState;
}

function autoMerchant(
  state: GameState,
  config: BatchConfig
): GameState {
  let newState = enterMerchant(state);

  if (config.merchantStrategy === "skip") {
    return leaveMerchant(newState);
  }

  const living = getLivingHeroes(newState);

  // Weapon upgrades based on weaponUpgradeStrategy
  if (config.weaponUpgradeStrategy !== "never") {
    for (const hero of living) {
      if (newState.party.gold < 50) break;
      const upgradeCost = 50; // approximate minimum upgrade cost
      if (config.weaponUpgradeStrategy === "prioritize") {
        if (newState.party.gold >= upgradeCost) {
          newState = upgradeWeapon(newState, hero.id);
        }
      } else if (config.weaponUpgradeStrategy === "when-affordable") {
        if (newState.party.gold >= upgradeCost + 30) {
          newState = upgradeWeapon(newState, hero.id);
        }
      }
    }
  }

  if (config.merchantStrategy === "heal-items" || config.merchantStrategy === "balanced") {
    for (const hero of living) {
      if (hero.currentHp / hero.maxHp < 0.6) {
        newState = buyItem(newState, "Minor Potion", hero.id);
      }
    }
    if (config.merchantStrategy === "balanced") {
      if (newState.party.gold > 60) {
        newState = buyUpgrade(newState, "HP Increase", living[0].id);
      }
    }
  } else if (config.merchantStrategy === "upgrades") {
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
  strategy: BatchConfig["restStrategy"]
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
  config: BatchConfig
): Promise<GameState> {
  let newState = state;
  const room = newState.spire.currentRoom;
  if (!room) return newState;

  if (room.type === "split" && newState.spire.splitChoicePending) {
    const choiceIdx = pickSplitChoice(newState, rng, config.splitStrategy);
    newState = resolveSplitChoice(newState, choiceIdx, rng);
  }

  const currentRoom = newState.spire.currentRoom;
  if (!currentRoom) return newState;

  switch (currentRoom.type) {
    case "combat":
    case "elite_combat": {
      const combatState = startCombat(newState, rng, {
        isElite: currentRoom.type === "elite_combat",
      });
      const afterCombat = await autoPlayCombat(combatState, rng, config);
      const result = resolveCombatRoom(afterCombat);
      if (result.defeatedByMonster) _defeatedByMonster = result.defeatedByMonster;
      if (result.terminal === "victory" || result.terminal === "defeat") {
        return result.state;
      }
      newState = result.state;
      break;
    }

    case "mini_boss": {
      const combatState = startCombat(newState, rng, { isMiniBoss: true });
      const afterCombat = await autoPlayCombat(combatState, rng, config);
      const result = resolveCombatRoom(afterCombat);
      if (result.defeatedByMonster) _defeatedByMonster = result.defeatedByMonster;
      if (result.terminal === "victory" || result.terminal === "defeat") {
        return result.state;
      }
      newState = result.state;
      break;
    }

    case "final_boss": {
      const combatState = startCombat(newState, rng, { isFinalBoss: true });
      const afterCombat = await autoPlayCombat(combatState, rng, config);
      const result = resolveCombatRoom(afterCombat);
      if (result.defeatedByMonster) _defeatedByMonster = result.defeatedByMonster;
      // final_boss always returns a terminal state from resolveCombatRoom
      // (victory if boss dead + survivors, defeat otherwise).
      return result.state;
    }

    case "merchant": {
      newState = autoMerchant(newState, config);
      newState = markRoomResolved(newState);
      newState = advanceRoom(newState);
      break;
    }

    case "rest": {
      newState = autoRest(newState, rng, config.restStrategy);
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

export async function runSingleGame(
  runIndex: number,
  seed: string,
  config: BatchConfig
): Promise<RunResult> {
  resetEventSequence();
  _defeatedByMonster = undefined;

  const simConfig = createDefaultConfig({
    seed,
    difficulty: config.difficulty,
    mode: "simulation",
    speed: "batch",
    logLevel: "normal",
    partyControl: "ai",
    showCardFlips: false,
    showDiceRolls: false,
  });

  let rng = new RngEngine(seed);

  const partyChoices = config.partyMode === "fixed" && config.partyChoices
    ? config.partyChoices
    : randomParty(rng);

  let state = initializeGame(simConfig, partyChoices);
  rng = RngEngine.deserialize(state.rng);

  // Resolve the welcome bonus for easy/normal difficulty, mirroring the
  // playable path. Without this, batch runs on easy/normal start without
  // bonus weapons/gold, diverging from playable runs.
  if (state.welcomeBonusPending) {
    const wbResults = rollWelcomeBonus(state, rng);
    state = applyWelcomeBonusResults(state, wbResults, rng);
    state = { ...state, welcomeBonusPending: false };
  }

  const maxRooms = 40;
  let roomCount = 0;
  let lastRoomIndex = state.spire.roomIndex;
  let stuckCount = 0;

  while (state.phase !== "victory" && state.phase !== "defeat" && roomCount < maxRooms) {
    if (state.phase === "tier_transition") {
      state = { ...state, phase: "exploration" };
    }
    roomCount++;
    state = await processRoom(state, rng, config);
    if (state.phase === "victory" || state.phase === "defeat") break;

    // Safety: if processRoom didn't advance the room index, we're stuck
    if (state.spire.roomIndex === lastRoomIndex) {
      stuckCount++;
      if (stuckCount >= 2) {
        state = { ...state, phase: "defeat" };
        state = emitEvent(state, "DEFEAT", "Run stuck — room progression halted.", {
          details: { reason: "stuck", roomIndex: lastRoomIndex },
        });
        break;
      }
    } else {
      stuckCount = 0;
      lastRoomIndex = state.spire.roomIndex;
    }
  }

  if (state.phase !== "victory" && state.phase !== "defeat") {
    state = { ...state, phase: "defeat" };
    state = emitEvent(state, "DEFEAT", "Run timed out (max rooms exceeded).", {
      details: { reason: "timeout" },
    });
  }

  // Finalize run stats (MVP, deadliest monster) — shared with the playable
  // path which calls finalizeRunStats in doResolveRoom. Without this, batch
  // results have undefined mvpHeroId and deadliestMonster.
  state = finalizeRunStats(state);

  const score = calculateScore(state);
  const livingHeroes = getLivingHeroes(state);
  const outcome: RunResult["outcome"] =
    state.phase === "victory" ? "victory" : "defeat";

  const partyComp = partyChoices.map(c => ({
    className: c.className,
    suit: c.suit,
    specialization: getSpecialization(c.className, c.suit as any) as string,
  }));

  const combatLog = state.log;

  const runSummary = `Run ${runIndex + 1} [${seed}]: ${outcome.toUpperCase()} — Score: ${score.finalScore}, Turns: ${state.stats.totalTurns}, Rooms: ${state.stats.roomsCleared}, Heroes Alive: ${livingHeroes.length}`;

  return {
    runIndex,
    seed,
    outcome,
    defeatedBy: _defeatedByMonster,
    score,
    stats: state.stats,
    heroesAlive: livingHeroes.length,
    totalTurns: state.stats.totalTurns,
    roomsCleared: state.stats.roomsCleared,
    partyComposition: partyComp,
    combatLog,
    runSummary,
  };
}

function aggregateResults(runs: RunResult[]): AggregateStats {
  const totalRuns = runs.length;
  const victories = runs.filter(r => r.outcome === "victory").length;
  const defeats = runs.filter(r => r.outcome === "defeat").length;

  const scores = runs.map(r => r.score.finalScore);
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const maxScore = scores.length > 0 ? Math.max(...scores) : 0;
  const minScore = scores.length > 0 ? Math.min(...scores) : 0;

  const avgTurns = runs.length > 0 ? Math.round(runs.reduce((a, r) => a + r.totalTurns, 0) / runs.length) : 0;
  const avgRoomsCleared = runs.length > 0 ? Math.round(runs.reduce((a, r) => a + r.roomsCleared, 0) / runs.length) : 0;
  const avgHeroesAlive = runs.length > 0 ? parseFloat((runs.reduce((a, r) => a + r.heroesAlive, 0) / runs.length).toFixed(1)) : 0;

  const buckets = [
    { range: "0-4999", min: 0, max: 4999 },
    { range: "5k-9k", min: 5000, max: 9999 },
    { range: "10k-14k", min: 10000, max: 14999 },
    { range: "15k-19k", min: 15000, max: 19999 },
    { range: "20k-24k", min: 20000, max: 24999 },
    { range: "25k-29k", min: 25000, max: 29999 },
    { range: "30k+", min: 30000, max: Infinity },
  ];
  const scoreDistribution = buckets.map(b => ({
    range: b.range,
    count: scores.filter(s => s >= b.min && s <= b.max).length,
  }));

  return {
    totalRuns,
    victories,
    defeats,
    retreats: 0,
    victoryRate: totalRuns > 0 ? Math.round((victories / totalRuns) * 100) : 0,
    avgScore,
    maxScore,
    minScore,
    avgTurns,
    avgRoomsCleared,
    avgHeroesAlive,
    scoreDistribution,
    outcomeByDifficulty: {},
  };
}

export async function runBatch(
  config: BatchConfig,
  onProgress?: (completed: number, total: number, currentResult?: RunResult) => void,
  isCancelled?: () => boolean
): Promise<BatchResult> {
  const startedAt = new Date().toISOString();
  const runs: RunResult[] = [];

  // Yield before starting so the UI can paint isRunning state
  await nextPaint();

  for (let i = 0; i < config.runs; i++) {
    // Check cancellation before starting each run
    if (isCancelled?.()) break;

    // Pre-run callback so UI can show "Running run N..."
    if (onProgress) {
      onProgress(i, config.runs, runs[i - 1]);
    }
    // Yield before each run so the pre-run progress can paint
    await nextPaint();

    const seed = `${config.baseSeed}_BATCH_${i}`;
    const result = await runSingleGame(i, seed, config);
    runs.push(result);
    if (onProgress) {
      onProgress(i + 1, config.runs, result);
    }
  }

  const completedAt = new Date().toISOString();
  const aggregateStats = aggregateResults(runs);

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
  const headers = ["Run", "Seed", "Outcome", "Score", "Turns", "Rooms", "Heroes Alive", "Party"];
  const rows = result.runs.map(r => [
    r.runIndex + 1,
    r.seed,
    r.outcome,
    r.score.finalScore,
    r.totalTurns,
    r.roomsCleared,
    r.heroesAlive,
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
