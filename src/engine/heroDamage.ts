/**
 * Hero damage application helpers — extracted from heroAbilityEngine.ts
 * for structural decomposition. Pure functions with no circular dependencies.
 */

import type { GameState } from "../types/gameState";
import type { HeroState } from "../types/heroes";
import type { MatchResult } from "../types/combat";
import { emitEvent } from "./eventLog";
import { getLivingHeroes, getHeroById, selectTargetByPriority } from "./rulesEngine";
import {
  calculateDamage,
  applyDamage,
  applyHealing,
  addToken,
} from "./combatEngine";
import { createDebuffStatus, createShieldToken } from "../data/tokens";
import { weaponHasTag } from "../utils/tagMatchers";

export function applyHeroDamage(
  state: GameState,
  hero: HeroState,
  baseDamage: number,
  matches: MatchResult[],
  targetId: string,
  isDouble: boolean = false,
  _modifiedRoll: number = 0
): { state: GameState; killed: boolean } {
  // Multi-hit/reroll actions must consume buffs from the updated hero state.
  hero = getHeroById(state, hero.id) ?? hero;
  let newState = state;
  const matchBonus = matches[0]?.bonusDamage || 0;
  const enchantment = hero.enchantment;
  const modifiedRoll = newState.combat?.currentHeroRoll ?? 0;
  const targetTokens = newState.combat!.summons.find(s => s.id === targetId)?.tokens ?? newState.combat!.monster.tokens;
  const targetToken = targetTokens.find(t => t.type === "target");
  const tokenBonus = targetToken ? 1 : 0;

  // Weapon bonus
  let weaponBonus = 0;
  if (hero.perTurnFlags["powerScrollActive"]) {
    weaponBonus += 3;
    newState = { ...newState, party: { ...newState.party,
      heroes: newState.party.heroes.map(h => h.id === hero.id
        ? { ...h, perTurnFlags: { ...h.perTurnFlags, powerScrollActive: false } } : h),
    } };
  }
  const weaponDisabled = hero.perTurnFlags["weaponDisabled"] === true;

  if (!weaponDisabled) {
  // Voidcutter: phase through shields (handled in calculateDamage)
  // Sharp Dagger: +1 damage on rolls 5-6
  if (weaponHasTag(hero, "sharp_dagger") && modifiedRoll >= 5) {
    weaponBonus += 1;
  }
  // Starforged Blade: +1 damage to all attacks
  if (weaponHasTag(hero, "starforged_blade")) {
    weaponBonus += 1;
  }
  // Hunter's Bow: +1 damage versus Target enemies (tokenBonus already handles this, but add +1 more)
  if (weaponHasTag(hero, "hunters_bow") && targetToken) {
    weaponBonus += 1;
  }
  // Wild Bow: all pets gain +1 damage (handled in pet turn execution)
  // Tower Shield: start each combat with +1 HP (handled in startCombat)
  // Soldier's Sword: Rally heals +1 HP (handled in Guardian resolveGuardian)
  }

  // Enchantment: Mighty — +1 damage on rolls 4-6
  let enchantmentBonus = 0;
  if (enchantment?.name === "Mighty" && modifiedRoll >= 4) {
    enchantmentBonus += 1;
  }

  // Enchantment: Ethereal — attacks phase through shields
  const etherealActive = enchantment?.name === "Ethereal";

  // Might buff: +2 damage
  const might = hero.buffs.find(b => b.name === "Might");
  if (might) {
    weaponBonus += 2;
    // Decrement might uses
    const updatedHeroes = newState.party.heroes.map(h =>
      h.id === hero.id ? { ...h, buffs: h.buffs.map(b => b.name === "Might" ? { ...b, duration: b.duration - 1 } : b).filter(b => b.duration > 0) } : h
    );
    newState = { ...newState, party: { ...newState.party, heroes: updatedHeroes } };
  }

  // Bladedancer combo chain: +1 cumulative damage per consecutive hit this turn
  let comboBonus = 0;
  if (hero.className === "Bladedancer" && newState.combat?.heroComboCount) {
    comboBonus = newState.combat.heroComboCount;
  }
  // Increment combo count for next hit
  if (newState.combat) {
    newState = { ...newState, combat: { ...newState.combat, heroComboCount: (newState.combat.heroComboCount || 0) + 1 } };
  }

  const finalBase = isDouble ? baseDamage * 2 : baseDamage;

  // Edge of Eclipse: every 3rd attack deals double damage
  let edgeDouble = false;
  if (weaponHasTag(hero, "edge_of_eclipse") && newState.combat) {
    const count = (newState.combat.edgeOfEclipseCount ?? 0) + 1;
    newState = { ...newState, combat: { ...newState.combat, edgeOfEclipseCount: count } };
    if (count % 3 === 0) {
      edgeDouble = true;
    }
  }

  const breakdown = calculateDamage({
    base: edgeDouble ? finalBase * 2 : finalBase + comboBonus,
    matchBonus,
    tokenBonus,
    weaponBonus,
    enchantmentBonus,
    phaseThrough: (!weaponDisabled && weaponHasTag(hero, "voidcutter")) || etherealActive,
  });

  const isMonster = targetId === newState.combat!.monster.id || targetId === "monster";
  const isEnemy = isMonster || newState.combat!.summons.some(s => s.id === targetId && s.alive);
  const result = applyDamage(newState, isMonster ? newState.combat!.monster.id : targetId, hero.id, breakdown, isEnemy);
  newState = result.state;

  // Enchantment: Vampiric — heal 1 HP on rolls 5-6
  if (enchantment?.name === "Vampiric" && modifiedRoll >= 5 && isMonster) {
    newState = applyHealing(newState, hero.id, 1);
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Vampiric enchantment! Healed 1 HP.`, { actorId: hero.id, targetIds: [hero.id] });
  }

  // Enchantment: Toxic — apply Poison on rolls 5-6
  if (enchantment?.name === "Toxic" && modifiedRoll >= 5 && isMonster) {
    if (newState.combat!.monster.specialState["debuffImmune"]) {
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${newState.combat!.monster.name} is immune to debuffs!`, { actorId: hero.id, targetIds: [newState.combat!.monster.id] });
    } else {
      const combat = { ...newState.combat! };
      combat.monster = {
        ...combat.monster,
        debuffs: [...combat.monster.debuffs, createDebuffStatus("Poison", 99)],
      };
      newState = { ...newState, combat };
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Toxic enchantment! Monster poisoned!`, { actorId: hero.id, targetIds: [newState.combat!.monster.id] });
    }
  }

  // Enchantment: Explosive — on roll 6, deal half damage to all enemies (AoE)
  if (enchantment?.name === "Explosive" && modifiedRoll === 6 && isMonster) {
    const splashDamage = Math.floor(breakdown.finalDamage / 2);
    if (splashDamage > 0) {
      for (const summon of newState.combat!.summons.filter(s => s.alive)) {
        newState = applyDamage(newState, summon.id, hero.id, calculateDamage({ base: splashDamage }), true).state;
      }
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Explosive enchantment! ${splashDamage} splash damage to all enemies!`, { actorId: hero.id });
    }
  }

  // Weapon: Voidwatcher — attacks hit all enemies for half damage
  if (isMonster && weaponHasTag(hero, "voidwatcher")) {
    const splashDamage = Math.floor(breakdown.finalDamage / 2);
    if (splashDamage > 0) {
      for (const summon of newState.combat!.summons.filter(s => s.alive)) {
        newState = applyDamage(newState, summon.id, hero.id, calculateDamage({ base: splashDamage }), true).state;
      }
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Voidwatcher! ${splashDamage} splash damage to all enemies!`, { actorId: hero.id });
    }
  }

  // Enchantment: Divine — on roll 6, heal lowest HP ally 2 HP
  if (enchantment?.name === "Divine" && modifiedRoll === 6) {
    const livingHeroes = getLivingHeroes(newState).filter(h => h.id !== hero.id);
    if (livingHeroes.length > 0) {
      const lowest = selectTargetByPriority(livingHeroes, "lowest");
      if (lowest) {
        newState = applyHealing(newState, lowest.id, 2);
        newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Divine enchantment! Healed ${lowest.name} for 2 HP.`, { actorId: hero.id, targetIds: [lowest.id] });
      }
    }
  }

  // Ooze Trail reflect — only on hero rolls 1-2
  if (isMonster && newState.combat?.monster.specialState["oozeTrail"] && modifiedRoll <= 2) {
    newState = applyDamage(newState, hero.id, newState.combat.monster.id, calculateDamage({ base: 1 }), false).state;
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `Ooze Trail: reflect triggered on ${hero.name} (rolled ${modifiedRoll}).`, { targetIds: [hero.id] });
  }
  // Thorns reflect
  if (isMonster && newState.combat?.monster.specialState["thorns"]) {
    newState = applyDamage(newState, hero.id, newState.combat.monster.id, calculateDamage({ base: 1 }), false).state;
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `Thorns: reflect triggered on ${hero.name}.`, { targetIds: [hero.id] });
  }

  // Weapon: Longshot — all attacks generate +10g; critical hits on 6 give +30g
  if (isMonster && weaponHasTag(hero, "longshot")) {
    const goldGain = modifiedRoll === 6 ? 30 : 10;
    newState = { ...newState, party: { ...newState.party, gold: newState.party.gold + goldGain } };
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Longshot! Generated ${goldGain}g.`, { actorId: hero.id });
  }

  // Weapon: Fyrizul — all attacks heal party 1 HP
  if (isMonster && weaponHasTag(hero, "fyrizul")) {
    for (const h of getLivingHeroes(newState)) {
      newState = applyHealing(newState, h.id, 1);
    }
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Fyrizul! Party healed 1 HP.`, { actorId: hero.id });
  }

  return { state: newState, killed: result.killed };
}

export function applyBasicHeroDamage(
  state: GameState,
  hero: HeroState,
  desc: string,
  matches: MatchResult[],
  targetId: string
): GameState {
  let newState = state;
  const baseDamage = extractBaseDamage(desc);
  if (baseDamage > 0) {
    const result = applyHeroDamage(newState, hero, baseDamage, matches, targetId);
    newState = result.state;
  }

  // Basic healing
  if (desc.includes("heal")) {
    if (desc.includes("heal self") || desc.includes("heal 1 hp")) {
      newState = applyHealing(newState, hero.id, 1);
    } else if (desc.includes("heal all allies") || desc.includes("heal all heroes")) {
      for (const h of getLivingHeroes(newState)) {
        newState = applyHealing(newState, h.id, 1);
      }
    }
  }

  // Basic shields
  if (desc.includes("gain 1") && (desc.includes("shield") || desc.includes("🔵"))) {
    newState = addToken(newState, hero.id, createShieldToken(1), false);
  }

  return newState;
}

export function extractBaseDamage(desc: string): number {
  const match = desc.match(/deal (\d+) damage/);
  return match ? parseInt(match[1]) : 0;
}
