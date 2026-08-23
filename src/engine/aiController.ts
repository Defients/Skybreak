import type { GameState } from "../types/gameState";
import type { RngEngine } from "../utils/random";
import type { CombatStrategy, MerchantStrategy, RestStrategy, SplitStrategy } from "../types/batch";
import { getLivingHeroes, getHeroById, getDeadHeroes } from "./rulesEngine";
import { executeHeroAction, useItem } from "./heroAbilityEngine";
import { executeMonsterTurn } from "./monsterAbilityEngine";
import { checkCombatEnd } from "./combatEngine";
import { emitEvent } from "./eventLog";
import { findItemByTag } from "../utils/tagMatchers";

export interface AICombatDecision {
  action: "attack" | "use_item" | "end_turn";
  targetId?: string;
  itemName?: string;
}

export function aiPlayHeroTurn(
  state: GameState,
  rng: RngEngine,
  heroId: string,
  strategy: CombatStrategy = "balanced"
): AICombatDecision {
  const hero = getHeroById(state, heroId);
  if (!hero || !hero.alive || !state.combat) {
    return { action: "end_turn" };
  }

  const hpRatio = hero.currentHp / hero.maxHp;
  const monsterId = state.combat.monster.id;
  const healItem = findItemByTag(hero.items, "healing");

  switch (strategy) {
    case "aggressive":
      return { action: "attack", targetId: monsterId };

    case "defensive":
      if (hpRatio < 0.5 && healItem) {
        return { action: "use_item", itemName: healItem.name, targetId: heroId };
      }
      return { action: "attack", targetId: monsterId };

    case "balanced":
      if (hpRatio < 0.3 && healItem) {
        return { action: "use_item", itemName: healItem.name, targetId: heroId };
      }
      return { action: "attack", targetId: monsterId };

    case "survivalist":
      if (hpRatio < 0.4 && healItem) {
        return { action: "use_item", itemName: healItem.name, targetId: heroId };
      }
      if (hpRatio < 0.2) {
        return { action: "end_turn" };
      }
      return { action: "attack", targetId: monsterId };

    case "random-legal": {
      const roll = rng.rollD6("ai_random_choice").total;
      if (roll <= 2 && hero.items.length > 0) {
        const itemIdx = Math.floor(
          (rng.rollD6("ai_item_pick").total / 6) * hero.items.length
        );
        const randomItem = hero.items[itemIdx];
        if (randomItem && randomItem.quantity > 0) {
          return { action: "use_item", itemName: randomItem.name, targetId: heroId };
        }
      }
      if (roll <= 3) {
        return { action: "end_turn" };
      }
      return { action: "attack", targetId: monsterId };
    }

    default:
      return { action: "attack", targetId: monsterId };
  }
}

export function aiExecuteHeroTurn(
  state: GameState,
  rng: RngEngine,
  heroId: string,
  strategy: CombatStrategy = "balanced"
): GameState {
  const decision = aiPlayHeroTurn(state, rng, heroId, strategy);
  const monsterId = state.combat?.monster.id;

  switch (decision.action) {
    case "attack":
      return executeHeroAction(state, rng, heroId, decision.targetId ?? monsterId).state;
    case "use_item":
      return useItem(state, heroId, decision.itemName!, decision.targetId, rng);
    case "end_turn":
    default:
      return state;
  }
}

export function aiPickSplitChoice(
  state: GameState,
  rng: RngEngine,
  strategy: SplitStrategy = "safe"
): number {
  const room = state.spire.currentRoom;
  if (!room?.splitOptions) return 0;

  if (strategy === "random") {
    return Math.floor(
      (rng.rollD6("split_random").total * room.splitOptions.length) / 6
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

export function aiRestChoice(
  state: GameState,
  _rng: RngEngine,
  strategy: RestStrategy = "full-heal"
): 1 | 2 | 3 | 4 {
  const dead = getDeadHeroes(state);
  const living = getLivingHeroes(state);
  const anyHurt = living.some((h) => h.currentHp < h.maxHp);

  switch (strategy) {
    case "full-heal":
      return 1;
    case "revive":
      if (dead.length > 0) return 2;
      if (anyHurt) return 1;
      return 4;
    case "gold":
      return 3;
    case "max-hp":
      return 4;
    case "smart":
      if (dead.length > 0) return 2;
      if (living.some(h => h.currentHp / h.maxHp < 0.5)) return 1;
      if (!state.party.maxHpBoostUsed && !anyHurt) return 4;
      if (state.spire.roomIndex < 4 && state.party.gold < 50 * state.spire.tier) return 3;
      return 1;
    default:
      return 1;
  }
}

export interface AIMerchantPurchase {
  type: "item" | "upgrade" | "healing" | "skip";
  name: string;
  heroId: string;
}

export function aiMerchantActions(
  state: GameState,
  strategy: MerchantStrategy = "balanced"
): AIMerchantPurchase[] {
  const living = getLivingHeroes(state);
  if (living.length === 0) return [];

  if (strategy === "skip") return [];

  const purchases: AIMerchantPurchase[] = [];
  const gold = state.party.gold;

  if (strategy === "heal-items" || strategy === "balanced") {
    for (const hero of living) {
      if (hero.currentHp / hero.maxHp < 0.6) {
        purchases.push({ type: "item", name: "Minor Potion", heroId: hero.id });
      }
    }
    if (strategy === "balanced" && gold > 60) {
      purchases.push({ type: "upgrade", name: "HP Increase", heroId: living[0].id });
    }
  } else if (strategy === "upgrades") {
    for (const hero of living) {
      if (gold > 60) {
        purchases.push({ type: "upgrade", name: "HP Increase", heroId: hero.id });
      }
    }
  }

  return purchases;
}

export function aiAutoPlayFullCombat(
  state: GameState,
  rng: RngEngine,
  strategy: CombatStrategy = "balanced",
  maxIterations = 200
): GameState {
  let newState = state;
  let safetyCounter = 0;
  let roundsWithoutProgress = 0;
  let lastMonsterHp = newState.combat?.monster.currentHp ?? 0;
  let lastTotalHeroHp = getLivingHeroes(newState).reduce((s, h) => s + h.currentHp, 0);

  while (newState.combat && !newState.combat.combatResult && safetyCounter < maxIterations) {
    safetyCounter++;

    if (newState.combat.activeSide === "monster") {
      newState = executeMonsterTurn(newState, rng);
      continue;
    }

    if (newState.combat.activeSide === "heroes") {
      const livingHeroes = getLivingHeroes(newState);
      if (livingHeroes.length === 0) break;

      for (const hero of livingHeroes) {
        if (!newState.combat || newState.combat.combatResult) break;
        if (newState.combat.completedHeroTurns.includes(hero.id)) continue;
        if (!hero.alive) continue;

        newState = aiExecuteHeroTurn(newState, rng, hero.id, strategy);

        if (newState.combat && !newState.combat.completedHeroTurns.includes(hero.id)) {
          newState = {
            ...newState,
            combat: {
              ...newState.combat,
              completedHeroTurns: [...newState.combat.completedHeroTurns, hero.id],
            },
          };
        }

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
            break;
          }
        }
      }

      if (newState.combat && !newState.combat.combatResult) {
        const livingHeroIds = getLivingHeroes(newState).map((h) => h.id);
        const allDone = newState.combat.heroTurnOrder
          .filter((id) => getHeroById(newState, id)?.alive)
          .every((id) => newState.combat!.completedHeroTurns.includes(id));

        if (allDone) {
          const currentMonsterHp = newState.combat!.monster.currentHp;
          const currentTotalHeroHp = getLivingHeroes(newState).reduce((s, h) => s + h.currentHp, 0);
          if (currentMonsterHp === lastMonsterHp && currentTotalHeroHp === lastTotalHeroHp) {
            roundsWithoutProgress++;
          } else {
            roundsWithoutProgress = 0;
          }
          lastMonsterHp = currentMonsterHp;
          lastTotalHeroHp = currentTotalHeroHp;

          if (roundsWithoutProgress >= 8) {
            newState = {
              ...newState,
              combat: { ...newState.combat!, combatResult: "retreat" as any },
            };
            newState = emitEvent(newState, "COMBAT_ENDED", `Combat ended: retreat. Stalemate.`, {
              details: { result: "retreat", reason: "stalemate" },
            });
            break;
          }

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
        }
      }
    }
  }

  return newState;
}
