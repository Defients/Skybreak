import type { GameState } from "../types/gameState";
import type { ValidationWarning, ValidationResult } from "../types/ui";
import { getLivingHeroes, getAllHeroes } from "./rulesEngine";

export function validateState(state: GameState): ValidationResult {
  const warnings: ValidationWarning[] = [];

  for (const hero of state.party.heroes) {
    if (hero.alive && hero.currentHp > hero.maxHp) {
      warnings.push({
        id: `hp_exceed_${hero.id}`,
        category: "HP",
        message: `${hero.name} has ${hero.currentHp} HP exceeding max ${hero.maxHp}`,
        severity: "warning",
      });
    }

    if (hero.alive && hero.currentHp <= 0) {
      warnings.push({
        id: `hp_zero_alive_${hero.id}`,
        category: "HP",
        message: `${hero.name} is alive but has 0 HP`,
        severity: "error",
      });
    }

    if (!hero.alive && hero.currentHp > 0) {
      warnings.push({
        id: `hp_positive_dead_${hero.id}`,
        category: "HP",
        message: `${hero.name} is dead but has ${hero.currentHp} HP`,
        severity: "warning",
      });
    }

    for (const token of hero.tokens) {
      const sameType = hero.tokens.filter(t => t.type === token.type);
      if (sameType.length > token.maxStacks) {
        warnings.push({
          id: `token_stack_${hero.id}_${token.type}`,
          category: "Tokens",
          message: `${hero.name} has ${sameType.length} ${token.type} tokens, exceeding max ${token.maxStacks}`,
          severity: "warning",
        });
        break;
      }
    }

    if (hero.items.length > 3) {
      warnings.push({
        id: `inv_overflow_${hero.id}`,
        category: "Inventory",
        message: `${hero.name} has ${hero.items.length} items, exceeding 3 slots`,
        severity: "warning",
      });
    }

    if (!state.combat && hero.temporaryApcs.length > 0) {
      warnings.push({
        id: `temp_apc_persist_${hero.id}`,
        category: "APC",
        message: `${hero.name} has temporary APCs outside combat`,
        severity: "warning",
      });
    }
  }

  if (state.party.gold < 0) {
    warnings.push({
      id: "negative_gold",
      category: "Gold",
      message: `Party gold is negative: ${state.party.gold}`,
      severity: "error",
    });
  }

  const livingHeroIds = new Set(getLivingHeroes(state).map(h => h.id));
  for (const deadId of state.party.deadHeroIds) {
    if (livingHeroIds.has(deadId)) {
      warnings.push({
        id: `dead_listed_alive_${deadId}`,
        category: "Death",
        message: `Hero ${deadId} is in deadHeroIds but is alive`,
        severity: "error",
      });
    }
  }

  if (state.combat) {
    if (!state.combat.monster.alive && state.combat.combatResult === undefined) {
      warnings.push({
        id: "monster_dead_no_result",
        category: "Combat",
        message: "Monster is dead but combat result is not set",
        severity: "warning",
      });
    }

    if (state.combat.activeActorId) {
      const actor = getAllHeroes(state).find(h => h.id === state.combat!.activeActorId);
      if (actor && !actor.alive) {
        warnings.push({
          id: "dead_actor_active",
          category: "Combat",
          message: `Active actor ${actor.name} is dead`,
          severity: "error",
        });
      }
    }

    if (state.combat.round > 15) {
      warnings.push({
        id: "combat_too_long",
        category: "Combat",
        message: `Combat has lasted ${state.combat.round} rounds — stalemate check should trigger`,
        severity: "warning",
      });
    }
  }

  if (state.party.sharedInventory.length > state.party.sharedInventoryLimit) {
    warnings.push({
      id: "shared_inv_overflow",
      category: "Inventory",
      message: `Shared inventory has ${state.party.sharedInventory.length} items, exceeding ${state.party.sharedInventoryLimit} slots`,
      severity: "warning",
    });
  }

  return {
    valid: warnings.filter(w => w.severity === "error").length === 0,
    warnings,
  };
}
