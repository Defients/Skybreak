/**
 * Monster helper functions — extracted from monsterAbilityEngine.ts
 * for structural decomposition. Leaf-level functions with no circular
 * dependencies on the main engine flow.
 */

import type { GameState } from "../types/gameState";
import type { MonsterState, MonsterRollEntry, MonsterMechanics } from "../types/monsters";
import type { HeroState } from "../types/heroes";
import type { NamedDebuff } from "../types/inventory";
import { RngEngine } from "../utils/random";
import { emitEvent } from "./eventLog";
import { getLivingHeroes, getHeroById, selectTargetByPriority, selectNightmareTarget } from "./rulesEngine";
import { calculateDamage, applyDamage } from "./combatEngine";
import { createDebuffStatus } from "../data/tokens";
import { getVyridianPhase, SUMMON_DATA } from "../data/monsters";
import { generateId, generateMonsterId } from "../utils/ids";
import { isBelowHalf } from "../utils/math";

export function findRollEntry(table: MonsterRollEntry[], roll: number): MonsterRollEntry | undefined {
  for (const entry of table) {
    if (typeof entry.roll === "number") { if (entry.roll === roll) return entry; }
    else if (typeof entry.roll === "string") {
      if (entry.roll.includes("-")) { const [min, max] = entry.roll.split("-").map(Number); if (roll >= min && roll <= max) return entry; }
      else if (Number(entry.roll) === roll) return entry;
    }
  }
  return undefined;
}

export function getMonsterRollModifier(state: GameState, monster: MonsterState): number {
  let mod = 0;
  if (monster.monsterId === 18) mod += 3; // Cyclops
  if (monster.monsterId === 19) mod += state.spire.tier; // Dragon
  if (monster.monsterId === 11 && isBelowHalf(monster.currentHp, monster.maxHp)) mod += 2; // Minotaur
  if (state.combat?.isFinalBoss && getVyridianPhase(monster.currentHp) === 2) mod += 2;
  if (state.settings.difficulty === "hard") mod += 1;
  if (state.settings.difficulty === "nightmare") mod += 1;
  if (monster.specialState["rollBonusNext2"] && (monster.specialState["rollBonusNext2"] as number) > 0) mod += 1;
  // Armory environment: Monster +1 to first 3 rolls
  const env = state.combat?.environment;
  if (env && env.suit === "hearts" && (state.combat!.monsterRollCount ?? 0) < 3) mod += 1;
  return mod;
}

export function getMonsterDamageModifier(state: GameState, monster: MonsterState): number {
  let mod = 0;
  if (monster.monsterId === 6 && isBelowHalf(monster.currentHp, monster.maxHp)) mod += 2; // Lunar Witch
  if (monster.monsterId === 11 && isBelowHalf(monster.currentHp, monster.maxHp)) mod += 1; // Minotaur
  if (state.combat?.isFinalBoss && getVyridianPhase(monster.currentHp) === 3) mod += 1;
  if (monster.specialState["chimeraDamageBonus"]) mod += monster.specialState["chimeraDamageBonus"] as number;
  // Behemoth Colossal: -2 damage
  if (monster.specialState["colossal"]) mod -= 2;
  // Cursed Knight copied weapon: +1 damage
  if (monster.specialState["copiedWeapon"]) mod += 1;
  // stolenWeapon: +1 damage
  if (monster.specialState["stolenWeapon"]) mod += 1;
  // Nightmare difficulty: +2 damage
  if (state.settings.difficulty === "nightmare") mod += 2;
  return mod;
}

export function getMonsterActionCount(state: GameState, monster: MonsterState): number {
  if (state.combat?.isFinalBoss && getVyridianPhase(monster.currentHp) === 3) return 2;
  return 1;
}

export function getActiveHero(state: GameState): HeroState | undefined {
  if (!state.combat) return undefined;
  for (let i = state.combat.completedHeroTurns.length - 1; i >= 0; i--) {
    const hero = getHeroById(state, state.combat.completedHeroTurns[i]);
    if (hero && hero.alive) return hero;
  }
  // Fallback: lowest HP hero per Priority Selection rules
  const living = getLivingHeroes(state);
  if (living.length === 0) return undefined;
  if (state.settings.difficulty === "nightmare") {
    return selectNightmareTarget(state);
  }
  return selectTargetByPriority(living, "lowest");
}

export function healMonster(state: GameState, amount: number): GameState {
  if (!state.combat) return state;
  const combat = { ...state.combat! };
  const m = { ...combat.monster };
  m.currentHp = Math.min(m.maxHp, m.currentHp + amount);
  combat.monster = m;
  let newState: GameState = { ...state, combat };
  newState = emitEvent(newState, "HEAL_APPLIED", `${m.name} healed ${amount} HP. HP: ${m.currentHp}/${m.maxHp}.`, { targetIds: [m.id], details: { amount, isMonster: true } });
  return newState;
}

export function applyDebuffToHero(state: GameState, heroId: string, debuff: NamedDebuff, duration: number): GameState {
  const debuffStatus = createDebuffStatus(debuff, duration);
  const hero = state.party.heroes.find(h => h.id === heroId);
  const updatedHeroes = state.party.heroes.map(h =>
    h.id === heroId && h.alive ? { ...h, debuffs: [...h.debuffs, debuffStatus] } : h
  );
  let newState = { ...state, party: { ...state.party, heroes: updatedHeroes } };
  newState = emitEvent(newState, "STATUS_ADDED", `${debuff} applied to ${hero?.name ?? heroId}.`, { targetIds: [heroId], details: { debuff, duration } });
  return newState;
}

export function applyDebuffToMonster(state: GameState, debuff: NamedDebuff, duration: number): GameState {
  if (!state.combat) return state;
  if (state.combat.monster.specialState["debuffImmune"]) {
    return emitEvent(state, "ABILITY_TRIGGERED", `${state.combat.monster.name} is immune to debuffs!`, { targetIds: [state.combat.monster.id] });
  }
  const debuffStatus = createDebuffStatus(debuff, duration);
  const combat = { ...state.combat };
  combat.monster = { ...combat.monster, debuffs: [...combat.monster.debuffs, debuffStatus] };
  let newState: GameState = { ...state, combat };
  newState = emitEvent(newState, "STATUS_ADDED", `${debuff} applied to ${combat.monster.name}.`, { details: { debuff, duration } });
  return newState;
}

export function createSummon(state: GameState, summonName: string): GameState {
  const data = SUMMON_DATA[summonName];
  if (!data || !state.combat) return state;
  const summon: MonsterState = {
    id: generateMonsterId(999),
    monsterId: 999,
    name: summonName,
    sourceCard: { id: generateId("summon_card"), suit: "joker", rank: "JOKER", display: summonName, deckType: "peon" },
    type: "summon",
    currentHp: data.hp,
    maxHp: data.hp,
    baseHp: data.hp,
    goldReward: 0,
    apcs: [],
    tokens: [],
    buffs: [],
    debuffs: [],
    specialState: {},
    alive: true,
    untargetable: false,
    immune: false,
    summons: [],
  };
  const combat = { ...state.combat! };
  combat.summons = [...combat.summons, summon];
  let newState: GameState = { ...state, combat };
  newState = emitEvent(newState, "ABILITY_TRIGGERED", `Summoned ${summonName} (${data.hp} HP, ${data.damage} dmg/turn)!`, { targetIds: [newState.combat!.monster.id], details: { summonName, hp: data.hp, damage: data.damage } });
  return newState;
}

export function executeSummonTurns(state: GameState, rng: RngEngine): GameState {
  if (!state.combat) return state;
  let newState = state;
  const summons = newState.combat!.summons;
  if (summons.length === 0) return newState;

  for (const summon of summons) {
    if (!summon.alive) continue;
    if (getLivingHeroes(newState).length === 0) break;
    const data = SUMMON_DATA[summon.name];
    if (!data || data.damage <= 0) continue;
    const target = newState.settings.difficulty === "nightmare"
      ? selectNightmareTarget(newState)
      : selectTargetByPriority(getLivingHeroes(newState), "lowest");
    if (target) {
      const r = applyDamage(newState, target.id, summon.id, calculateDamage({ base: data.damage }), false);
      newState = r.state;
    }
  }
  const combat = { ...newState.combat! };
  combat.summons = combat.summons.filter(s => s.alive);
  newState = { ...newState, combat };
  return newState;
}

export function applyDebuffsFromEffect(
  state: GameState,
  monster: MonsterState,
  desc: string,
  activeHero: HeroState | undefined,
  mech?: MonsterMechanics
): GameState {
  let newState = state;

  const applyToTarget = (hero: HeroState | undefined, debuff: NamedDebuff, duration: number) => {
    if (!hero || !hero.alive) return;
    newState = applyDebuffToHero(newState, hero.id, debuff, duration);
  };

  const applyToAll = (debuff: NamedDebuff, duration: number) => {
    for (const hero of getLivingHeroes(newState)) applyToTarget(hero, debuff, duration);
  };

  const debuffs = mech?.debuffs ?? [];
  const targetAll = mech?.target === "all" || desc.includes("all heroes");
  const primaryTarget = activeHero && activeHero.alive ? activeHero : getLivingHeroes(newState)[0];

  // Mechanics-based debuff dispatch
  for (const debuffName of debuffs) {
    switch (debuffName) {
      case "Poison": applyToTarget(primaryTarget, "Poison", 99); break;
      case "Fear": if (targetAll) applyToAll("Fear", 99); else applyToTarget(primaryTarget, "Fear", 99); break;
      case "Slow": applyToTarget(primaryTarget, "Slow", 99); break;
      case "Frozen": case "Freeze": if (targetAll) applyToAll("Freeze", 1); else applyToTarget(primaryTarget, "Freeze", 1); break;
      case "Petrify": applyToTarget(primaryTarget, "Petrify", 1); break;
      case "Burn": applyToTarget(primaryTarget, "Burn", 3); break;
      case "Nanobot": applyToTarget(primaryTarget, "Nanobot", 99); break;
      case "Stun": applyToTarget(primaryTarget, "Stun", 1); break;
      case "Blind": case "Illusion": applyToTarget(primaryTarget, "Illusion", 2); break;
    }
  }

  // Legacy desc-based fallback (only if no mechanics debuffs were specified)
  if (debuffs.length === 0) {
    if (desc.includes("🟡 poison") || desc.includes("apply poison")) {
      applyToTarget(activeHero && activeHero.alive ? activeHero : getLivingHeroes(newState)[0], "Poison", 99);
    }
    if (desc.includes("🟡 fear") || desc.includes("gain fear") || desc.includes("apply fear")) {
      if (desc.includes("all heroes")) applyToAll("Fear", 99);
      else applyToTarget(activeHero && activeHero.alive ? activeHero : getLivingHeroes(newState)[0], "Fear", 99);
    }
    if (desc.includes("🟡 slow") || desc.includes("apply slow")) {
      applyToTarget(activeHero && activeHero.alive ? activeHero : getLivingHeroes(newState)[0], "Slow", 99);
    }
    if (desc.includes("🟡 frozen") || desc.includes("apply frozen")) {
      if (desc.includes("to all")) applyToAll("Freeze", 1);
      else applyToTarget(activeHero && activeHero.alive ? activeHero : getLivingHeroes(newState)[0], "Freeze", 1);
    }
    if (desc.includes("🟡 petrify") || desc.includes("apply petrify")) {
      applyToTarget(activeHero && activeHero.alive ? activeHero : getLivingHeroes(newState)[0], "Petrify", 1);
    }
    if (desc.includes("🟡 burn") || desc.includes("apply burn")) {
      applyToTarget(activeHero && activeHero.alive ? activeHero : getLivingHeroes(newState)[0], "Burn", 3);
    }
    if (desc.includes("🟡 nanobot") || desc.includes("apply nanobot")) {
      applyToTarget(activeHero && activeHero.alive ? activeHero : getLivingHeroes(newState)[0], "Nanobot", 99);
    }
    if (desc.includes("🟡 stun") || desc.includes("apply stun")) {
      applyToTarget(activeHero && activeHero.alive ? activeHero : getLivingHeroes(newState)[0], "Stun", 1);
    }
    if (desc.includes("blind") && desc.includes("-2 to rolls")) {
      applyToTarget(activeHero && activeHero.alive ? activeHero : getLivingHeroes(newState)[0], "Illusion", 2);
    }
  }

  return newState;
}
