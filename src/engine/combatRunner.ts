/**
 * SA-3 — Shared AI combat runner.
 *
 * `runCombatStep` performs ONE iteration of the canonical combat loop:
 *   - monster side → executeMonsterTurn
 *   - hero side   → find next hero who hasn't acted, decide via aiPlayHeroTurn,
 *                   execute via executeAiHeroDecision, mark turn complete
 *   - all heroes done → advance to monster side (round++)
 *
 * `runCombatToCompletion` calls `runCombatStep` in a synchronous loop with a
 * safety cap. Batch simulation, Strategy Lab, and future headless paths use
 * this. Sim mode (useAutoPlay) and hybrid mode (CombatView) share the
 * canonical decision function (aiPlayHeroTurn) but drive step-wise through
 * the Zustand store for UI pacing and autosave integration.
 */
import type { GameState } from "../types/gameState";
import type { RngEngine } from "../utils/random";
import type { CombatStrategy, ItemUsageStrategy } from "../types/batch";
import { getLivingHeroes, getHeroById } from "./rulesEngine";
import { executeMonsterTurn } from "./monsterAbilityEngine";
import { aiPlayHeroTurn, executeAiHeroDecision } from "./aiController";
import { checkCombatEnd } from "./combatEngine";
import { emitEvent } from "./eventLog";
import { getItemUsageThreshold } from "./batchSimulationEngine";

export interface CombatRunnerConfig {
  combatStrategy: CombatStrategy;
  itemUsageStrategy: ItemUsageStrategy;
}

/**
 * One iteration of the canonical combat loop. Returns the updated state.
 * If the state is terminal or has no combat, returns it unchanged.
 */
export function runCombatStep(
  state: GameState,
  rng: RngEngine,
  config: CombatRunnerConfig
): GameState {
  if (!state.combat || state.combat.combatResult) return state;

  // Monster side
  if (state.combat.activeSide === "monster") {
    return executeMonsterTurn(state, rng);
  }

  // Hero side
  if (state.combat.activeSide === "heroes") {
    const livingHeroes = getLivingHeroes(state);
    if (livingHeroes.length === 0) return state;

    const healThreshold = getItemUsageThreshold(config.itemUsageStrategy);
    let newState = state;
    const combat = newState.combat!;

    // Find the next hero who hasn't acted
    const nextHeroId = combat.heroTurnOrder.find(
      id => !newState.combat!.completedHeroTurns.includes(id) && getHeroById(newState, id)?.alive
    );

    if (nextHeroId) {
      const decision = aiPlayHeroTurn(newState, rng, nextHeroId, config.combatStrategy, { healThreshold });
      newState = executeAiHeroDecision(newState, rng, nextHeroId, decision);

      // Mark hero as having completed their turn
      if (newState.combat && !newState.combat.completedHeroTurns.includes(nextHeroId)) {
        newState = {
          ...newState,
          combat: {
            ...newState.combat,
            completedHeroTurns: [...newState.combat.completedHeroTurns, nextHeroId],
          },
        };
      }

      // Post-action terminal check (canonical — same as heroAbilityEngine)
      if (newState.combat && !newState.combat.combatResult) {
        const endCheck = checkCombatEnd(newState);
        if (endCheck.result !== "ongoing") {
          newState = {
            ...newState,
            combat: { ...newState.combat!, combatResult: endCheck.result as any },
          };
          newState = emitEvent(newState, "COMBAT_ENDED", `Combat ended: ${endCheck.result}. ${endCheck.reason}`, {
            details: { result: endCheck.result, reason: endCheck.reason },
          });
        }
      }

      return newState;
    }

    // All heroes have acted — advance to monster side
    const livingHeroIds = getLivingHeroes(newState).map(h => h.id);
    const allDone = newState.combat!.heroTurnOrder
      .filter(id => getHeroById(newState, id)?.alive)
      .every(id => newState.combat!.completedHeroTurns.includes(id));

    if (allDone) {
      return {
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
    }

    return newState;
  }

  return state;
}

/**
 * Run combat to completion synchronously. Used by batch, strategy lab, and
 * headless paths. The `maxIterations` cap prevents infinite loops.
 */
export function runCombatToCompletion(
  state: GameState,
  rng: RngEngine,
  config: CombatRunnerConfig,
  maxIterations = 200
): GameState {
  let newState = state;
  let safety = 0;
  while (newState.combat && !newState.combat.combatResult && safety < maxIterations) {
    safety++;
    newState = runCombatStep(newState, rng, config);
  }
  return newState;
}
