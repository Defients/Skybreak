import type { GameState } from "../types/gameState";
import type { ScoreResult } from "../types/ui";
import { getLivingHeroes } from "./rulesEngine";
import { emitEvent } from "./eventLog";
import { grantRewards, cleanupCombat, checkCombatEnd } from "./combatEngine";
import { markRoomResolved, advanceRoom } from "./rulesEngine";

export function resolveRestChoice(
  state: GameState,
  choice: 1 | 2 | 3 | 4,
  rng: { roll2D6: (label: string) => { total: number } }
): GameState {
  let newState = { ...state };
  const living = getLivingHeroes(newState);
  const dead = newState.party.heroes.filter(h => !h.alive);

  /**
   * Emit effective per-hero healing telemetry for rest restores. Rest
   * applies HP directly (no HEAL_APPLIED historically), so without this
   * the healingByHero accumulator missed the largest healing source.
   * `details.amounts` is a heroId → effective-HP-restored map.
   */
  const emitRestHealing = (before: GameState["party"]["heroes"], after: GameState["party"]["heroes"], cause: string) => {
    const amounts: Record<string, number> = {};
    const targets: string[] = [];
    for (const h of after) {
      const prev = before.find(b => b.id === h.id);
      const restored = Math.max(0, h.currentHp - Math.max(0, prev?.currentHp ?? 0));
      if (restored > 0) {
        amounts[h.id] = restored;
        targets.push(h.id);
      }
    }
    if (targets.length > 0) {
      return emitEvent(newState, "HEAL_APPLIED", `Rest restored HP to ${targets.length} hero(es).`, {
        targetIds: targets,
        details: { amounts, cause },
      });
    }
    return newState;
  };

  if (choice === 1) {
    const before = newState.party.heroes;
    newState = {
      ...newState,
      party: {
        ...newState.party,
        heroes: newState.party.heroes.map(h => ({
          ...h,
          currentHp: h.alive ? h.maxHp : h.currentHp,
        })),
      },
    };
    newState = emitRestHealing(before, newState.party.heroes, "rest_full_heal");
    newState = emitEvent(newState, "REST_CHOICE", "Party fully healed all living Heroes.", {
      details: { choice: 1, effect: "full_heal" },
    });
  } else if (choice === 2) {
    // Hard mode: death is permanent
    if (state.settings.difficulty === "hard" && dead.length > 0) {
      const before = newState.party.heroes;
      newState = emitEvent(newState, "REST_CHOICE", "Death is permanent in Hard mode. Cannot revive. All Heroes fully healed instead.", {
        details: { choice: 2, effect: "full_heal_fallback_hard" },
      });
      newState = {
        ...newState,
        party: {
          ...newState.party,
          heroes: newState.party.heroes.map(h => ({
            ...h,
            currentHp: h.alive ? h.maxHp : h.currentHp,
          })),
        },
      };
      newState = emitRestHealing(before, newState.party.heroes, "rest_full_heal");
    } else if (dead.length > 0) {
      const revived = dead[0];
      const reviveHp = Math.floor(revived.maxHp * 0.5);
      const before = newState.party.heroes;
      newState = {
        ...newState,
        party: {
          ...newState.party,
          heroes: newState.party.heroes.map(h => {
            if (h.id === revived.id) {
              return { ...h, alive: true, currentHp: reviveHp };
            }
            return { ...h, currentHp: h.alive ? h.maxHp : h.currentHp };
          }),
          deadHeroIds: newState.party.heroes.filter(h => h.id !== revived.id && !h.alive).map(h => h.id),
        },
        stats: { ...newState.stats, revivals: newState.stats.revivals + 1 },
      };
      newState = emitRestHealing(before, newState.party.heroes, "rest_revive");
      newState = emitEvent(newState, "REST_CHOICE", `Revived ${revived.name} at 50% HP (${reviveHp}). All other Heroes fully healed.`, {
        details: { choice: 2, revivedHero: revived.name, reviveHp },
      });
    } else {
      const before = newState.party.heroes;
      newState = {
        ...newState,
        party: {
          ...newState.party,
          heroes: newState.party.heroes.map(h => ({
            ...h,
            currentHp: h.alive ? h.maxHp : h.currentHp,
          })),
        },
      };
      newState = emitRestHealing(before, newState.party.heroes, "rest_full_heal");
      newState = emitEvent(newState, "REST_CHOICE", "No dead Heroes to revive. All Heroes fully healed instead.", {
        details: { choice: 2, effect: "full_heal_fallback" },
      });
    }
  } else if (choice === 3) {
    const roll = rng.roll2D6("rest_gold");
    const goldGained = roll.total * 10 * state.spire.tier;
    newState = {
      ...newState,
      party: {
        ...newState.party,
        gold: newState.party.gold + goldGained,
      },
      stats: { ...newState.stats, goldEarned: newState.stats.goldEarned + goldGained },
    };
    newState = emitEvent(newState, "REST_CHOICE", `Rolled ${roll.total} for gold. Gained ${goldGained}g.`, {
      details: { choice: 3, roll: roll.total, goldGained },
    });
  } else if (choice === 4) {
    if (newState.party.maxHpBoostUsed) {
      // Fall back to full heal instead of wasting the rest
      const before = newState.party.heroes;
      newState = {
        ...newState,
        party: {
          ...newState.party,
          heroes: newState.party.heroes.map(h => ({
            ...h,
            currentHp: h.alive ? h.maxHp : h.currentHp,
          })),
        },
      };
      newState = emitRestHealing(before, newState.party.heroes, "rest_full_heal");
      newState = emitEvent(newState, "REST_CHOICE", "Max HP boost already used. Party fully healed instead.", {
        details: { choice: 4, effect: "full_heal_fallback" },
      });
      return newState;
    }
    newState = {
      ...newState,
      party: {
        ...newState.party,
        maxHpBoostUsed: true,
        heroes: newState.party.heroes.map(h => ({
          ...h,
          maxHp: h.maxHp + 2,
          baseMaxHp: h.baseMaxHp + 2,
          currentHp: h.alive ? h.currentHp + 2 : h.currentHp,
        })),
      },
    };
    newState = emitEvent(newState, "REST_CHOICE", "All Heroes gained +2 max HP.", {
      details: { choice: 4, effect: "max_hp_increase" },
    });
  }

  return newState;
}

export function calculateScore(state: GameState): ScoreResult {
  const heroesAlive = getLivingHeroes(state).length;
  const goldRemaining = state.party.gold;
  const tier3RoomsCleared = state.stats.tier3RoomsCleared;
  const totalTurns = state.stats.totalTurns;
  const itemsRetained = state.party.heroes.reduce((sum, h) => sum + h.items.length, 0) + state.party.sharedInventory.length;
  const perfectCombats = state.stats.perfectCombats;

  const baseScore = 1000;
  const heroesAliveBonus = heroesAlive * 1000;
  const goldBonus = goldRemaining * 10;
  const tier3Bonus = tier3RoomsCleared * 100;
  const turnPenalty = totalTurns * 50;
  const itemBonus = itemsRetained * 200;
  const perfectCombatBonus = perfectCombats * 500;

  const finalScore = baseScore + heroesAliveBonus + goldBonus + tier3Bonus - turnPenalty + itemBonus + perfectCombatBonus;

  return {
    baseScore,
    heroesAlive,
    heroesAliveBonus,
    goldRemaining,
    goldBonus,
    tier3RoomsCleared,
    tier3Bonus,
    totalTurns,
    turnPenalty,
    itemsRetained,
    itemBonus,
    perfectCombats,
    perfectCombatBonus,
    finalScore,
    title: finalScore > 0 ? "Ascendant Champions" : undefined,
  };
}

export function checkVictory(state: GameState): boolean {
  return state.combat?.isFinalBoss === true &&
    !state.combat?.monster.alive &&
    getLivingHeroes(state).length > 0;
}

export function checkDefeat(state: GameState): boolean {
  return getLivingHeroes(state).length === 0;
}

export function finalizeRunStats(state: GameState): GameState {
  const heroIds = new Set(state.party.heroes.map(h => h.id));
  const damageByHero: Record<string, number> = { ...state.stats.damageByHero };
  const damageByMonster: Record<string, number> = { ...state.stats.damageByMonster };

  for (const event of state.log) {
    if (state.stats.damageByHero && state.stats.damageByMonster) break;
    if (event.type !== "DAMAGE_APPLIED") continue;
    const damage = (event.details as Record<string, unknown>)?.damage as number | undefined;
    if (!damage || damage <= 0) continue;
    const actorId = event.actorId;
    if (!actorId) continue;

    if (heroIds.has(actorId)) {
      damageByHero[actorId] = (damageByHero[actorId] ?? 0) + damage;
    } else {
      const attackerName = (event.details as Record<string, unknown>)?.attackerName as string | undefined
        ?? event.summary.split(" dealt ")[0]
        ?? "Unknown";
      damageByMonster[attackerName] = (damageByMonster[attackerName] ?? 0) + damage;
    }
  }

  let mvpHeroId: string | undefined;
  let mvpDamage = 0;
  for (const [id, dmg] of Object.entries(damageByHero)) {
    if (dmg > mvpDamage) {
      mvpDamage = dmg;
      mvpHeroId = id;
    }
  }

  let deadliestMonster: string | undefined;
  let deadliestDamage = 0;
  for (const [name, dmg] of Object.entries(damageByMonster)) {
    if (dmg > deadliestDamage) {
      deadliestDamage = dmg;
      deadliestMonster = name;
    }
  }

  return {
    ...state,
    stats: {
      ...state.stats,
      mvpHeroId,
      deadliestMonster,
    },
  };
}

// ──────────────────────────────────────────────────────────────────
// Shared combat room resolution
// ──────────────────────────────────────────────────────────────────

export interface ResolveCombatRoomResult {
  state: GameState;
  /** "victory" if the final boss was defeated and the run is won.
   *  "defeat" if the party was wiped.
   *  "continue" if the room was resolved and the run advances.
   *  "retreat" if the heroes retreated (treated like continue). */
  terminal: "victory" | "defeat" | "continue";
  /** The monster that defeated the party, if applicable. */
  defeatedByMonster?: string;
}

/**
 * Shared terminal resolver for a combat room. Called after combat has
 * produced a combatResult. Handles:
 *   - grantRewards + cleanupCombat on victory
 *   - checkVictory BEFORE cleanup (final-boss finalization)
 *   - checkDefeat + finalizeRunStats + phase: "defeat" on party wipe
 *   - cleanupCombat + markRoomResolved + advanceRoom for non-terminal results
 *
 * Both the playable path (gameStore.doResolveRoom) and the batch path
 * (batchSimulationEngine.processRoom) use this to ensure identical terminal
 * semantics.
 */
export function resolveCombatRoom(state: GameState): ResolveCombatRoomResult {
  if (state.phase === "victory" || state.phase === "defeat") return { state, terminal: state.phase };
  const combatResult = state.combat?.combatResult;
  if (!combatResult) {
    return { state, terminal: "continue" };
  }

  if (combatResult === "victory") {
    // Capture final-boss victory BEFORE cleanupCombat clears the combat object.
    const finalBossVictory = checkVictory(state);
    let newState = grantRewards(state);
    const defeatedBy = state.combat?.monster.name;
    newState = cleanupCombat(newState);
    if (finalBossVictory) {
      newState = markRoomResolved(newState);
      newState = finalizeRunStats(newState);
      const score = calculateScore(newState);
      newState = { ...newState, phase: "victory", score };
      newState = emitEvent(newState, "VICTORY",
        `Judgment survived! The ascent is complete! Final Score: ${score.finalScore}. Title: ${score.title}`,
        { details: { score: score.finalScore, title: score.title } });
      return { state: newState, terminal: "victory" };
    }
    // Non-final-boss victory: advance to next room.
    newState = markRoomResolved(newState);
    newState = advanceRoom(newState);
    return { state: newState, terminal: "continue" };
  }

  if (combatResult === "defeat") {
    const defeatedBy = state.combat?.monster.name;
    // Nightmare's deadline is a defeat even if heroes survive. Retreat has
    // its own result and cannot be treated as defeat-with-survivors here.
    {
      const reason = checkDefeat(state) ? "party_wipe" : "combat_defeat";
      const explanation = checkCombatEnd(state).reason;
      let newState = finalizeRunStats(state);
      newState = { ...newState, phase: "defeat" };
      newState = emitEvent(newState, "DEFEAT",
        reason === "party_wipe" ? "The party has been wiped out. The Astrilith claims another group of adventurers." : explanation,
        { details: { reason } });
      return { state: newState, terminal: "defeat", defeatedByMonster: defeatedBy };
    }
  }

  // retreat or other: cleanup and advance
  let newState = cleanupCombat(state);
  // The summit has no next room. Leave an unwon encounter available to retry.
  if (state.combat?.isFinalBoss) return { state: newState, terminal: "continue" };
  newState = markRoomResolved(newState);
  newState = advanceRoom(newState);
  return { state: newState, terminal: "continue" };
}
