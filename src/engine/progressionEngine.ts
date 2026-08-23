import type { GameState } from "../types/gameState";
import type { ScoreResult } from "../types/ui";
import { getLivingHeroes } from "./rulesEngine";
import { emitEvent } from "./eventLog";

export function resolveRestChoice(
  state: GameState,
  choice: 1 | 2 | 3 | 4,
  rng: { roll2D6: (label: string) => { total: number } }
): GameState {
  let newState = { ...state };
  const living = getLivingHeroes(newState);
  const dead = newState.party.heroes.filter(h => !h.alive);

  if (choice === 1) {
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
    newState = emitEvent(newState, "REST_CHOICE", "Party fully healed all living Heroes.", {
      details: { choice: 1, effect: "full_heal" },
    });
  } else if (choice === 2) {
    // Hard mode: death is permanent
    if (state.settings.difficulty === "hard" && dead.length > 0) {
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
    } else if (dead.length > 0) {
      const revived = dead[0];
      const reviveHp = Math.floor(revived.maxHp * 0.5);
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
      newState = emitEvent(newState, "REST_CHOICE", `Revived ${revived.name} at 50% HP (${reviveHp}). All other Heroes fully healed.`, {
        details: { choice: 2, revivedHero: revived.name, reviveHp },
      });
    } else {
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
      newState = emitEvent(newState, "REST_CHOICE", "Max HP boost already used this run.", {
        details: { choice: 4, effect: "already_used" },
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
  const damageByHero: Record<string, number> = {};
  const damageByMonster: Record<string, number> = {};

  for (const event of state.log) {
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
