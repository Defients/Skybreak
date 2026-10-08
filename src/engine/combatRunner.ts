/**
 * SA-3 / P1 — Shared AI combat runner + canonical turn-completion.
 *
 * `completeHeroTurn` is the single canonical turn-completion transition.
 * Both `runCombatStep` (headless) and the Zustand store (playable/sim/hybrid)
 * call it to ensure identical turn-lifecycle behavior:
 *   - Mark hero's turn complete
 *   - Check if all living heroes are done
 *   - If yes: increment turnCount/totalTurns ONCE, advance round, switch to monster
 *
 * `checkAndSetCombatEnd` is the single canonical post-action terminal check.
 * Called after attacks AND item use (Bomb can kill).
 *
 * `runCombatStep` performs ONE iteration of the canonical combat loop:
 *   - monster side → executeMonsterTurn
 *   - hero side   → find next hero, decide via aiPlayHeroTurn, execute,
 *                   check end, complete turn (items are free actions)
 *
 * `runCombatToCompletion` calls `runCombatStep` in a synchronous loop.
 */
import type { GameState } from "../types/gameState";
import type { CombatStrategy, ItemUsageStrategy } from "../types/batch";
import { getLivingHeroes, getHeroById } from "./rulesEngine";
import { executeMonsterTurn } from "./monsterAbilityEngine";
import { aiPlayHeroTurn, executeAiHeroDecision } from "./aiController";
import { checkCombatEnd } from "./combatEngine";
import { emitEvent } from "./eventLog";
import { getItemUsageThreshold } from "./simPolicies";
import { RngEngine } from "../utils/random";

export interface CombatRunnerConfig {
  combatStrategy: CombatStrategy;
  itemUsageStrategy: ItemUsageStrategy;
}

/**
 * Serialize the RNG engine's current state into the GameState.rng field.
 * This is the atomic RNG ownership contract: every committed semantic
 * transition returns state containing the post-action serialized RNG.
 */
function withRng(state: GameState, rng: RngEngine): GameState {
  return { ...state, rng: rng.serialize() };
}

/**
 * Canonical post-action terminal check. Sets combatResult if the combat
 * has ended. Called after attacks AND item use (Bomb can kill the monster).
 */
export function checkAndSetCombatEnd(state: GameState): GameState {
  if (!state.combat || state.combat.combatResult) return state;
  const endCheck = checkCombatEnd(state);
  if (endCheck.result !== "ongoing") {
    const newState: GameState = {
      ...state,
      combat: { ...state.combat, combatResult: endCheck.result as any },
    };
    return emitEvent(newState, "COMBAT_ENDED", `Combat ended: ${endCheck.result}. ${endCheck.reason}`, {
      details: { result: endCheck.result, reason: endCheck.reason },
    });
  }
  return state;
}

/**
 * Canonical turn-completion transition. Called after a hero performs their
 * action (attack or end-turn). Marks the hero's turn complete, checks if
 * all living heroes are done, and if so, increments turnCount/totalTurns
 * ONCE (per round, not per hero), advances the round, and switches to the
 * monster side.
 *
 * Both runCombatStep (headless) and the Zustand store (playable) call this
 * function to ensure identical turn-lifecycle behavior.
 */
export function completeHeroTurn(state: GameState, heroId: string): GameState {
  if (!state.combat || state.combat.combatResult) return state;

  const hero = getHeroById(state, heroId);
  if (hero?.alive && hero.perTurnFlags["extraAction"]) {
    return { ...state, party: { ...state.party,
      heroes: state.party.heroes.map(h => h.id === heroId
        ? { ...h, perTurnFlags: { ...h.perTurnFlags, extraAction: false } } : h),
    } };
  }

  let newState = state;
  const combat = newState.combat!;

  // Mark hero as having completed their turn
  if (!combat.completedHeroTurns.includes(heroId)) {
    newState = {
      ...newState,
      combat: {
        ...combat,
        completedHeroTurns: [...combat.completedHeroTurns, heroId],
      },
    };
  }

  // Check if all living heroes have completed their turns
  const allDone = newState.combat!.heroTurnOrder
    .filter(id => getHeroById(newState, id)?.alive)
    .every(id => newState.combat!.completedHeroTurns.includes(id));

  if (allDone) {
    const livingHeroIds = getLivingHeroes(newState).map(h => h.id);
    newState = {
      ...newState,
      stats: { ...newState.stats, totalTurns: newState.stats.totalTurns + 1 },
      combat: {
        ...newState.combat!,
        turnCount: newState.combat!.turnCount + 1,
        round: newState.combat!.round + 1,
        completedHeroTurns: [],
        activeSide: "monster" as const,
        heroTurnOrder: livingHeroIds,
      },
    };
    newState = emitEvent(newState, "TURN_STARTED", `Round ${newState.combat!.round} begins. Monster's turn.`, {
      details: { round: newState.combat!.round },
    });
  }

  return newState;
}

/**
 * One iteration of the canonical combat loop. Returns the updated state.
 * If the state is terminal or has no combat, returns it unchanged.
 *
 * Items are free actions: using an item does NOT complete the hero's turn.
 * The hero can use an item and then attack/end-turn in subsequent steps.
 */
export function runCombatStep(
  state: GameState,
  rng: RngEngine,
  config: CombatRunnerConfig
): GameState {
  if (!state.combat || state.combat.combatResult) return withRng(state, rng);

  // Monster side
  if (state.combat.activeSide === "monster") {
    return withRng(executeMonsterTurn(state, rng), rng);
  }

  // Hero side
  if (state.combat.activeSide === "heroes") {
    const livingHeroes = getLivingHeroes(state);
    if (livingHeroes.length === 0) return withRng(state, rng);

    const healThreshold = getItemUsageThreshold(config.itemUsageStrategy);
    const combat = state.combat!;

    // Find the next hero who hasn't acted
    const nextHeroId = combat.heroTurnOrder.find(
      id => !combat.completedHeroTurns.includes(id) && getHeroById(state, id)?.alive
    );

    if (nextHeroId) {
      const decision = aiPlayHeroTurn(state, rng, nextHeroId, config.combatStrategy, { healThreshold });
      let newState = executeAiHeroDecision(state, rng, nextHeroId, decision);

      // Post-action terminal check (for both attack and item use — Bomb can kill)
      newState = checkAndSetCombatEnd(newState);
      if (newState.combat?.combatResult) return withRng(newState, rng);

      if (decision.action === "use_item") {
        // Items are free actions — don't complete the turn.
        // The next runCombatStep call will find the same hero and get a new
        // decision (likely attack, since the item was consumed).
        return withRng(newState, rng);
      }

      // Attack or end_turn: complete the hero's turn canonically
      return withRng(completeHeroTurn(newState, nextHeroId), rng);
    }

    // All heroes have acted — this shouldn't happen if completeHeroTurn
    // is working correctly (it advances the round when allDone). But if
    // we get here (e.g., a hero died between actions), advance manually.
    const allDone = combat.heroTurnOrder
      .filter(id => getHeroById(state, id)?.alive)
      .every(id => combat.completedHeroTurns.includes(id));

    if (allDone) {
      return withRng(completeHeroTurn(state, combat.heroTurnOrder.find(id => getHeroById(state, id)?.alive) ?? ""), rng);
    }

    return withRng(state, rng);
  }

  return withRng(state, rng);
}

/**
 * Run combat to completion synchronously. Used by batch, strategy lab, and
 * headless paths. The `maxIterations` cap prevents infinite loops.
 */
export function runCombatToCompletion(
  state: GameState,
  rng: RngEngine,
  config: CombatRunnerConfig,
  maxIterations = 500
): GameState {
  let newState = state;
  let safety = 0;
  while (newState.combat && !newState.combat.combatResult && safety < maxIterations) {
    safety++;
    newState = runCombatStep(newState, rng, config);
  }
  return newState;
}
