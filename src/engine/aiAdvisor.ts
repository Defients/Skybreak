import type { GameState } from "../types/gameState";
import { getLivingHeroes, getDeadHeroes, getHeroById } from "./rulesEngine";
import { getSuggestedPurchases } from "./merchantEngine";
import { findItemByTag } from "../utils/tagMatchers";

export interface CombatSuggestion {
  action: "attack" | "use_item" | "end_turn";
  itemName?: string;
  targetId?: string;
  reason: string;
}

export function suggestCombatAction(
  state: GameState,
  heroId: string
): CombatSuggestion {
  const hero = getHeroById(state, heroId);
  if (!hero || !hero.alive || !state.combat) {
    return { action: "end_turn", reason: "No action available." };
  }

  const hpRatio = hero.currentHp / hero.maxHp;
  const monsterId = state.combat.monster.id;
  const monsterHp = state.combat.monster.currentHp;
  const monsterMaxHp = state.combat.monster.maxHp;

  const healItem = findItemByTag(hero.items, "healing");

  if (hpRatio < 0.25 && healItem) {
    return {
      action: "use_item",
      itemName: healItem.name,
      targetId: heroId,
      reason: `${hero.name} is critically low (${hero.currentHp}/${hero.maxHp} HP). Use ${healItem.name} to survive the next monster turn.`,
    };
  }

  if (hpRatio < 0.5 && healItem) {
    const monsterDamage = state.combat.monster.apcs.filter((a) => !a.matched).length;
    if (monsterDamage >= 2) {
      return {
        action: "use_item",
        itemName: healItem.name,
        targetId: heroId,
        reason: `${hero.name} is below 50% HP and the monster has ${monsterDamage} unmatched APCs — heal now to avoid being knocked out.`,
      };
    }
  }

  if (monsterHp <= 3) {
    return {
      action: "attack",
      targetId: monsterId,
      reason: `Monster is at ${monsterHp}/${monsterMaxHp} HP — one more attack should finish it!`,
    };
  }

  return {
    action: "attack",
    targetId: monsterId,
    reason: `Attack the monster. ${hero.name} has ${hero.currentHp}/${hero.maxHp} HP and ${hero.apcs.filter((a) => !a.matched).length} APCs available.`,
  };
}

export interface RestSuggestion {
  choice: 1 | 2 | 3 | 4;
  reason: string;
}

export function suggestRestChoice(state: GameState): RestSuggestion {
  const dead = getDeadHeroes(state);
  const living = getLivingHeroes(state);
  const injuredCount = living.filter((h) => h.currentHp < h.maxHp).length;
  const heavilyInjured = living.filter((h) => h.currentHp / h.maxHp < 0.4).length;

  if (dead.length > 0 && state.settings.difficulty !== "hard") {
    return {
      choice: 2,
      reason: `${dead.length} hero${dead.length > 1 ? "es are" : " is"} dead. Revive to restore full party strength.`,
    };
  }

  if (heavilyInjured >= 2) {
    return {
      choice: 1,
      reason: `${heavilyInjured} heroes are heavily injured. Full heal restores everyone to max HP.`,
    };
  }

  if (injuredCount > 0) {
    return {
      choice: 1,
      reason: `${injuredCount} hero${injuredCount > 1 ? "es are" : " is"} injured. Full heal is the safest choice.`,
    };
  }

  if (state.spire.tier >= 2) {
    return {
      choice: 4,
      reason: `All heroes at full HP. +2 Max HP permanently scales better for higher Astrilith tiers.`,
    };
  }

  return {
    choice: 3,
    reason: `All heroes at full HP in Tier 1. Gold roll (2d6 × 10 × tier) gives early-game purchasing power.`,
  };
}

export interface SplitSuggestion {
  index: number;
  reason: string;
}

export function suggestSplitChoice(state: GameState): SplitSuggestion {
  const room = state.spire.currentRoom;
  if (!room?.splitOptions) return { index: 0, reason: "No split options available." };

  const living = getLivingHeroes(state);
  const injuredCount = living.filter((h) => h.currentHp / h.maxHp < 0.5).length;
  const deadCount = getDeadHeroes(state).length;
  const gold = state.party.gold;

  const options = room.splitOptions;

  if (injuredCount >= 2 || deadCount > 0) {
    const restIdx = options.findIndex((o) => o.type === "rest");
    if (restIdx >= 0) {
      return {
        index: restIdx,
        reason: `${injuredCount} heroes injured${deadCount > 0 ? `, ${deadCount} dead` : ""}. Rest room to recover.`,
      };
    }
  }

  if (gold < 50) {
    const merchantIdx = options.findIndex((o) => o.type === "merchant");
    if (merchantIdx >= 0) {
      return {
        index: merchantIdx,
        reason: `Low gold (${gold}g). Merchant room may offer affordable upgrades.`,
      };
    }
  }

  const combatIdx = options.findIndex((o) => o.type === "combat");
  if (combatIdx >= 0 && injuredCount === 0) {
    return {
      index: combatIdx,
      reason: `Party is healthy. Combat room for rewards and progression.`,
    };
  }

  const restIdx = options.findIndex((o) => o.type === "rest");
  if (restIdx >= 0) {
    return { index: restIdx, reason: "Rest room for safety and recovery." };
  }

  return { index: 0, reason: "Best available path." };
}

export interface MerchantSuggestion {
  type: "buy" | "skip";
  action?: string;
  target?: string;
  reason: string;
}

export function suggestMerchantAction(state: GameState): MerchantSuggestion {
  if (!state.merchant) return { type: "skip", reason: "No merchant available." };

  const suggestions = getSuggestedPurchases(state);
  if (suggestions.length === 0) {
    return {
      type: "skip",
      reason: "No affordable or useful purchases. Save your gold for later.",
    };
  }

  const top = suggestions[0];
  return {
    type: "buy",
    action: top.name,
    target: top.targetHeroId,
    reason: top.reason,
  };
}
