/**
 * Pet turn execution — extracted from heroAbilityEngine.ts
 * for structural decomposition. Self-contained, no circular dependencies.
 */

import type { GameState } from "../types/gameState";
import type { HeroState } from "../types/heroes";
import { RngEngine } from "../utils/random";
import { emitEvent } from "./eventLog";
import { getLivingHeroes } from "./rulesEngine";
import {
  calculateDamage,
  applyDamage,
  applyHealing,
  addToken,
  checkCombatEnd,
} from "./combatEngine";
import { createShieldToken } from "../data/tokens";
import { WOLF_TABLE, BEAR_TABLE } from "../data/monsters";
import { weaponHasTag } from "../utils/tagMatchers";

export function executePetTurn(
  state: GameState,
  rng: RngEngine,
  hero: HeroState,
  targetId?: string
): GameState {
  if (!hero.pet || !hero.pet.alive) return state;
  if (!targetId) return state;

  let newState = state;
  const pet = hero.pet;
  const petRoll = rng.rollD6(`pet_${pet.type}_${hero.name}`);
  const table = pet.type === "wolf" ? WOLF_TABLE : BEAR_TABLE;
  const entry = findPetRollEntry(table, petRoll.total);

  if (!entry) return newState;

  newState = emitEvent(newState, "DICE_ROLLED", `${pet.name} (pet) rolled ${petRoll.total}. Action: ${entry.name}.`, {
    actorId: hero.id,
    details: { pet: pet.type, roll: petRoll.total, action: entry.name, description: entry.description },
  });

  const desc = entry.description.toLowerCase();
  const isMonster = targetId === newState.combat!.monster.id || targetId === "monster";

  const damageMatch = desc.match(/deal (\d+) damage/);
  const baseDamage = damageMatch ? parseInt(damageMatch[1]) : 0;

  if (baseDamage > 0 && isMonster) {
    // Wild Bow: all pets gain +1 damage
    const petDamageBonus = weaponHasTag(hero, "wild_bow") ? 1 : 0;
    // Twin Claws: pets inherit weapon enchantments
    let enchantBonus = 0;
    if (weaponHasTag(hero, "twin_claws") && hero.enchantment) {
      if (hero.enchantment.name === "Mighty") enchantBonus += 1;
      if (hero.enchantment.name === "Precise") enchantBonus += 0; // roll bonus, not damage
    }
    let totalPetDamage = baseDamage + petDamageBonus + enchantBonus;
    // Twin Claws: pets can critical hit on natural 6
    if (weaponHasTag(hero, "twin_claws") && petRoll.total === 6) {
      totalPetDamage *= 2;
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${pet.name}: Twin Claws critical hit! Double damage!`, { actorId: hero.id });
    }
    const breakdown = calculateDamage({ base: totalPetDamage });
    const result = applyDamage(newState, newState.combat!.monster.id, hero.id, breakdown, true);
    newState = result.state;
    newState = emitEvent(newState, "DAMAGE_APPLIED", `${pet.name}: ${entry.name} — ${totalPetDamage} damage!`, {
      targetIds: [newState.combat!.monster.id],
      details: { pet: pet.type, action: entry.name },
    });
  }

  if (pet.type === "wolf" && entry.name === "Alpha Strike") {
    newState = applyHealing(newState, hero.id, 2);
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${pet.name}: Alpha Strike! Healed ${hero.name} for 2 HP!`, { actorId: hero.id });
  }

  if (pet.type === "bear" && entry.name === "Swipe") {
    const hero1 = getLivingHeroes(newState).find(h => h.position === 1);
    if (hero1) {
      newState = addToken(newState, hero1.id, createShieldToken(1), false);
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${pet.name}: Swipe! ${hero1.name} gains 1 shield!`, { actorId: hero.id });
    }
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
    }
  }

  return newState;
}

export function findPetRollEntry(
  table: { roll: number | string; name: string; effect: string; description: string }[],
  roll: number
): { roll: number | string; name: string; effect: string; description: string } | undefined {
  for (const entry of table) {
    if (typeof entry.roll === "number") {
      if (entry.roll === roll) return entry;
    } else if (typeof entry.roll === "string") {
      if (entry.roll.includes("-")) {
        const [min, max] = entry.roll.split("-").map(Number);
        if (roll >= min && roll <= max) return entry;
      } else if (Number(entry.roll) === roll) return entry;
    }
  }
  return undefined;
}
