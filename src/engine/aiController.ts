import type { GameState } from "../types/gameState";
import type { RngEngine } from "../utils/random";
import type { CombatStrategy, MerchantStrategy, RestStrategy, SplitStrategy } from "../types/batch";
import { getLivingHeroes, getHeroById, getDeadHeroes } from "./rulesEngine";
import { executeHeroAction, useItem } from "./heroAbilityEngine";
import { findItemByTag } from "../utils/tagMatchers";

export interface AICombatDecision {
  action: "attack" | "use_item" | "end_turn";
  targetId?: string;
  itemName?: string;
}

export interface AiPlayOptions {
  /**
   * Optional heal threshold (0..1) derived from an item-usage strategy. When
   * provided, it overrides the per-strategy default heal threshold so that
   * batch simulation can tune healing aggressiveness without reimplementing
   * the decision logic. defensive/survivalist use max(strategyDefault,
   * healThreshold) so a higher item-usage threshold can only make healing
   * MORE aggressive, never less.
   */
  healThreshold?: number;
}

/**
 * Canonical hero combat decision function. Every execution path
 * (batch simulation, strategy lab, in-game simulation mode, hybrid mode)
 * MUST route hero-action selection through this function so that the game
 * has one interpretation of strategy → action. Adapters execute the returned
 * decision via executeHeroAction / useItem / end-turn; they do NOT
 * reimplement strategy semantics.
 */
export function aiPlayHeroTurn(
  state: GameState,
  rng: RngEngine,
  heroId: string,
  strategy: CombatStrategy = "balanced",
  options?: AiPlayOptions
): AICombatDecision {
  const hero = getHeroById(state, heroId);
  if (!hero || !hero.alive || !state.combat) {
    return { action: "end_turn" };
  }

  const hpRatio = hero.currentHp / hero.maxHp;
  const monsterId = state.combat.monster.id;
  const healItem = findItemByTag(hero.items, "healing");
  const ht = options?.healThreshold;

  switch (strategy) {
    case "aggressive":
      return { action: "attack", targetId: monsterId };

    case "defensive": {
      const threshold = ht === undefined ? 0.5 : Math.max(0.5, ht);
      if (hpRatio < threshold && healItem) {
        return { action: "use_item", itemName: healItem.name, targetId: heroId };
      }
      return { action: "attack", targetId: monsterId };
    }

    case "balanced": {
      const threshold = ht === undefined ? 0.3 : ht;
      if (hpRatio < threshold && healItem) {
        return { action: "use_item", itemName: healItem.name, targetId: heroId };
      }
      return { action: "attack", targetId: monsterId };
    }

    case "survivalist": {
      const threshold = ht === undefined ? 0.4 : Math.max(0.4, ht);
      if (hpRatio < threshold && healItem) {
        return { action: "use_item", itemName: healItem.name, targetId: heroId };
      }
      if (hpRatio < 0.2) {
        return { action: "end_turn" };
      }
      return { action: "attack", targetId: monsterId };
    }

    case "random-legal": {
      const roll = rng.rollD6("ai_random_choice").total;
      if (roll === 1 && hero.items.length > 0) {
        const itemIdx = Math.floor(
          (rng.rollD6("ai_item_pick").total / 6) * hero.items.length
        );
        const randomItem = hero.items[itemIdx];
        if (randomItem && randomItem.quantity > 0) {
          return { action: "use_item", itemName: randomItem.name, targetId: heroId };
        }
      }
      if (roll === 2) {
        return { action: "end_turn" };
      }
      return { action: "attack", targetId: monsterId };
    }

    default:
      return { action: "attack", targetId: monsterId };
  }
}

/**
 * Canonical executor for an AI hero combat decision. Adapters call
 * aiPlayHeroTurn to obtain a decision, then this function to apply it through
 * the same engine functions every path uses. Returns the state unchanged for
 * "end_turn" (the adapter is responsible for marking the hero's turn
 * complete). This is the single execution boundary for AI hero actions.
 */
export function executeAiHeroDecision(
  state: GameState,
  rng: RngEngine,
  heroId: string,
  decision: AICombatDecision
): GameState {
  const monsterId = state.combat?.monster.id;
  switch (decision.action) {
    case "attack":
      return executeHeroAction(state, rng, heroId, decision.targetId ?? monsterId ?? "").state;
    case "use_item":
      return useItem(state, heroId, decision.itemName ?? "", decision.targetId, rng);
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
