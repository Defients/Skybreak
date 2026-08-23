import type { GameState } from "../types/gameState";
import type { APCInstance } from "../types/combat";
import type { MonsterState, MonsterRollEntry, MonsterMechanics } from "../types/monsters";
import type { HeroState } from "../types/heroes";
import type { NamedDebuff } from "../types/inventory";
import { RngEngine } from "../utils/random";
import { emitEvent } from "./eventLog";
import { getLivingHeroes, getHeroById, getHeroByPosition, selectTargetByPriority, selectNightmareTarget } from "./rulesEngine";
import { calculateDamage, applyDamage, applyHealing, addToken, flipPeonCards, detectMatches, checkCombatEnd } from "./combatEngine";
import { createShieldToken, createTargetToken, createCounterToken, createDebuffStatus, createBuffStatus } from "../data/tokens";
import { getMonsterById, getVyridianPhase, getVyridianPhaseData, SUMMON_DATA } from "../data/monsters";
import { generateId, generateMonsterId } from "../utils/ids";
import { isBelowHalf } from "../utils/math";
import { weaponHasTag } from "../utils/tagMatchers";

// ─── Attack Redirect Logic (Guardian & Manipulator unique mechanics) ─────────

function maybeRedirectAttack(
  state: GameState,
  originalTargetId: string,
  baseDamage: number,
  isMonsterTarget: boolean
): { state: GameState; targetId: string; redirectedToMonster: boolean } {
  let newState = state;

  // Don't redirect if target is already the monster
  if (isMonsterTarget) return { state: newState, targetId: originalTargetId, redirectedToMonster: false };

  // Manipulator redirect: once per combat, redirect attack to monster itself
  const manipulator = getLivingHeroes(newState).find(h => h.className === "Manipulator" && !h.oncePerCombat["manipulatorRedirect"]);
  if (manipulator && newState.combat?.monster.alive && baseDamage > 0) {
    // Redirect: monster takes the damage instead
    const breakdown = calculateDamage({ base: baseDamage });
    const result = applyDamage(newState, newState.combat!.monster.id, manipulator.id, breakdown, true);
    newState = result.state;
    // Mark as used
    const updatedHeroes = newState.party.heroes.map(h =>
      h.id === manipulator.id ? { ...h, oncePerCombat: { ...h.oncePerCombat, manipulatorRedirect: true } } : h
    );
    newState = { ...newState, party: { ...newState.party, heroes: updatedHeroes } };
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${manipulator.name}: Redirected attack! Monster takes ${baseDamage} damage!`, { actorId: manipulator.id, targetIds: [newState.combat!.monster.id] });
    return { state: newState, targetId: originalTargetId, redirectedToMonster: true };
  }

  // Guardian redirect: once per turn, redirect attack to self
  const guardian = getLivingHeroes(newState).find(h =>
    h.className === "Guardian" && !h.perTurnFlags["guardianRedirect"] && h.id !== originalTargetId
  );
  if (guardian) {
    // Redirect to Guardian
    const breakdown = calculateDamage({ base: baseDamage });
    const result = applyDamage(newState, guardian.id, newState.combat!.monster.id, breakdown, false);
    newState = result.state;
    // Mark as used this turn
    const updatedHeroes = newState.party.heroes.map(h =>
      h.id === guardian.id ? { ...h, perTurnFlags: { ...h.perTurnFlags, guardianRedirect: true } } : h
    );
    newState = { ...newState, party: { ...newState.party, heroes: updatedHeroes } };
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${guardian.name}: Redirected attack to self!`, { actorId: guardian.id, targetIds: [guardian.id] });
    return { state: newState, targetId: guardian.id, redirectedToMonster: false };
  }

  return { state: newState, targetId: originalTargetId, redirectedToMonster: false };
}

export function executeMonsterTurn(state: GameState, rng: RngEngine): GameState {
  if (!state.combat) return state;
  let newState = state;
  const monster = newState.combat!.monster;

  newState = emitEvent(newState, "TURN_STARTED", `Round ${newState.combat!.round}: ${monster.name}'s turn.`, {
    details: { round: newState.combat!.round, monsterName: monster.name },
  });

  // Update Vyridian phase based on current HP
  if (newState.combat!.isFinalBoss) {
    const phaseData = getVyridianPhaseData(newState.combat!.monster.currentHp);
    if (phaseData && newState.combat!.monster.phase !== phaseData.name) {
      const combat = { ...newState.combat! };
      const m = { ...combat.monster };
      const oldPhase = m.phase;
      m.phase = phaseData.name;
      const phaseNum = getVyridianPhase(m.currentHp);
      if (phaseNum === 2) {
        m.specialState = { ...m.specialState, debuffImmune: true };
      }
      combat.monster = m;
      newState = { ...newState, combat, stats: { ...newState.stats, bossPhaseReached: phaseData.name } };
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${m.name} enters ${phaseData.name}!${phaseNum === 2 ? " Immune to debuffs!" : ""}`, { targetIds: [m.id], details: { phase: phaseData.name, oldPhase, debuffImmune: phaseNum === 2 } });
    }
  }

  newState = applyStartOfTurnEffects(newState, rng);
  if (!newState.combat?.monster.alive || getLivingHeroes(newState).length === 0) return finishMonsterTurn(newState);

  // Reset Guardian's per-turn redirect flag and weaponDisabled
  const resetHeroes = newState.party.heroes.map(h =>
    h.className === "Guardian" || h.perTurnFlags["weaponDisabled"]
      ? { ...h, perTurnFlags: { ...h.perTurnFlags, guardianRedirect: false, weaponDisabled: false } }
      : h
  );
  newState = { ...newState, party: { ...newState.party, heroes: resetHeroes } };

  // Skip turn if skipNextTurn is set (Lunar Witch's Twilight Burst)
  if (newState.combat!.monster.specialState["skipNextTurn"]) {
    const combat = { ...newState.combat! };
    const m = { ...combat.monster };
    m.specialState = { ...m.specialState, skipNextTurn: false };
    combat.monster = m;
    newState = { ...newState, combat };
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${m.name} skips this turn (faded).`, { targetIds: [m.id] });
    return finishMonsterTurn(newState);
  }

  const { state: flipState, cards } = flipPeonCards(newState, newState.combat!.monster.id, rng);
  newState = flipState;
  const matches = detectMatches(newState.combat!.monster.apcs, cards);
  if (matches[0].type !== "none") {
    newState = emitEvent(newState, "MATCH_DETECTED", `${newState.combat!.monster.name} ${matches[0].description}`, {});
    newState = triggerMonsterSpecial(newState, rng);
  }

  const actionCount = getMonsterActionCount(newState, newState.combat!.monster);
  for (let i = 0; i < actionCount; i++) {
    if (!newState.combat?.monster.alive || getLivingHeroes(newState).length === 0) break;
    newState = executeMonsterRoll(newState, rng, i > 0 ? " (2nd action)" : "");
  }

  newState = executeSummonTurns(newState, rng);
  return finishMonsterTurn(newState);
}

function finishMonsterTurn(state: GameState): GameState {
  let newState = state;

  // Stalemate detection: compare current HP vs lastHpSnapshot
  const combat = newState.combat!;
  const currentMonsterHp = combat.monster.currentHp;
  const currentHeroHp = getLivingHeroes(newState).reduce((s, h) => s + h.currentHp, 0);
  const snapshot = combat.lastHpSnapshot;
  const progressMade = currentMonsterHp !== snapshot.monsterHp || currentHeroHp !== snapshot.totalHeroHp;
  const roundsWithoutProgress = progressMade ? 0 : combat.roundsWithoutProgress + 1;
  newState = {
    ...newState,
    combat: {
      ...combat,
      roundsWithoutProgress,
      lastHpSnapshot: { monsterHp: currentMonsterHp, totalHeroHp: currentHeroHp },
    },
  };

  const endCheck = checkCombatEnd(newState);
  if (endCheck.result !== "ongoing") {
    newState = { ...newState, combat: { ...newState.combat!, combatResult: endCheck.result as any } };
    newState = emitEvent(newState, "COMBAT_ENDED", `Combat ended: ${endCheck.result}. ${endCheck.reason}`, { details: { result: endCheck.result, reason: endCheck.reason } });
  } else {
    const livingHeroIds = getLivingHeroes(newState).map(h => h.id);
    newState = { ...newState, combat: { ...newState.combat!, activeSide: "heroes" as const, completedHeroTurns: [], heroTurnOrder: livingHeroIds } };
    newState = emitEvent(newState, "TURN_STARTED", `Heroes' turn begins. Round ${newState.combat!.round}.`, { details: { round: newState.combat!.round } });
  }
  return newState;
}

function applyStartOfTurnEffects(state: GameState, rng: RngEngine): GameState {
  let newState = state;
  const monster = newState.combat!.monster;

  // Clear temporary untargetable (Dragon's Fly — one turn only)
  if (monster.specialState["untargetableNextTurn"]) {
    const combat = { ...newState.combat! };
    const m = { ...combat.monster };
    m.untargetable = false;
    m.specialState = { ...m.specialState, untargetableNextTurn: false };
    combat.monster = m;
    newState = { ...newState, combat };
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${m.name} is no longer untargetable.`, { targetIds: [m.id] });
  }

  // Clear Illusion Dance (Glimmering Sprite) — untargetable only until next monster turn
  if (monster.specialState["illusionDance"] && !monster.specialState["untargetableNextTurn"]) {
    const combat = { ...newState.combat! };
    const m = { ...combat.monster };
    m.untargetable = false;
    m.specialState = { ...m.specialState, illusionDance: false };
    combat.monster = m;
    newState = { ...newState, combat };
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${m.name} is no longer untargetable (Illusion Dance faded).`, { targetIds: [m.id] });
  }

  // Clear Vanish (Shadowy Assassin) — untargetable until next monster turn
  if (monster.specialState["vanishActive"] && !monster.specialState["untargetableNextTurn"]) {
    const combat = { ...newState.combat! };
    const m = { ...combat.monster };
    m.untargetable = false;
    m.specialState = { ...m.specialState, vanishActive: false };
    combat.monster = m;
    newState = { ...newState, combat };
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${m.name} is no longer untargetable (Vanish faded).`, { targetIds: [m.id] });
  }

  // Hazard damage (Ember Drake's Lava Pool — 1 damage/turn to all heroes)
  if (monster.specialState["hazardActive"]) {
    for (const hero of getLivingHeroes(newState)) {
      const r = applyDamage(newState, hero.id, "hazard", calculateDamage({ base: 1 }), false);
      newState = r.state;
    }
    newState = emitEvent(newState, "DAMAGE_APPLIED", `Hazard deals 1 damage to all Heroes!`, { targetIds: getLivingHeroes(newState).map(h => h.id) });
  }

  // Titan: Below 50% HP, heal 2 at turn start
  if (monster.monsterId === 20 && isBelowHalf(monster.currentHp, monster.maxHp) && monster.alive) {
    newState = healMonster(newState, 2);
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${monster.name} heals 2 HP (Unyielding).`, { targetIds: [monster.id], details: { ability: "Unyielding" } });
  }

  // Aetherpulse: Illusion-affected enemies take 1 damage per turn
  const aetherpulseHeroes = newState.party.heroes.filter(h => h.alive && weaponHasTag(h, "aetherpulse"));
  if (aetherpulseHeroes.length > 0 && monster.debuffs.some(d => d.name === "Illusion")) {
    const r = applyDamage(newState, newState.combat!.monster.id, "aetherpulse", calculateDamage({ base: 1 }), true);
    newState = r.state;
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `Aetherpulse: Confused ${monster.name} takes 1 damage!`, { targetIds: [newState.combat!.monster.id] });
  }

  // Decrement hero debuff durations
  const updatedHeroes = newState.party.heroes.map(h => h.alive ? {
    ...h,
    debuffs: h.debuffs.map(d => ({ ...d, duration: d.duration - 1 })).filter(d => d.duration !== 0),
    // Decrement shield token durations (Warden shields last 3 turns)
    tokens: h.tokens.map(t => t.duration > 0 ? { ...t, duration: t.duration - 1 } : t).filter(t => t.duration !== 0),
  } : h);
  newState = { ...newState, party: { ...newState.party, heroes: updatedHeroes } };

  // Decrement monster debuff durations
  if (newState.combat?.monster.alive) {
    const combat = { ...newState.combat! };
    combat.monster = {
      ...combat.monster,
      debuffs: combat.monster.debuffs.map(d => ({ ...d, duration: d.duration - 1 })).filter(d => d.duration !== 0),
      tokens: combat.monster.tokens.map(t => t.duration > 0 ? { ...t, duration: t.duration - 1 } : t).filter(t => t.duration !== 0),
    };
    newState = { ...newState, combat };
  }
  return newState;
}

function executeMonsterRoll(state: GameState, rng: RngEngine, suffix: string): GameState {
  if (!state.combat) return state;
  let newState = state;
  const monster = newState.combat!.monster;

  // Increment monster roll count (for Armory environment bonus tracking)
  newState = { ...newState, combat: { ...newState.combat!, monsterRollCount: (newState.combat!.monsterRollCount ?? 0) + 1 } };

  const roll = rng.rollD6(`monster_action_${monster.name}${suffix}`);
  let rollTotal = roll.total + getMonsterRollModifier(newState, monster);
  rollTotal = Math.max(1, Math.min(6, rollTotal));

  // Decrement rollBonusNext2 counter (Nano Prototype Overclock)
  if (newState.combat!.monster.specialState["rollBonusNext2"] && (newState.combat!.monster.specialState["rollBonusNext2"] as number) > 0) {
    const combat = { ...newState.combat! };
    const m = { ...combat.monster };
    m.specialState = { ...m.specialState, rollBonusNext2: (m.specialState["rollBonusNext2"] as number) - 1 };
    combat.monster = m;
    newState = { ...newState, combat };
  }

  const monsterData = getMonsterById(monster.monsterId);
  if (!monsterData) return newState;

  let rollEntry = findRollEntry(monsterData.rollTable, rollTotal);

  // Vyridian phase overrides
  if (newState.combat!.isFinalBoss) {
    const phaseData = getVyridianPhaseData(monster.currentHp);
    if (phaseData?.rollOverrides) {
      const override = phaseData.rollOverrides.find(r => r.roll === rollTotal);
      if (override) rollEntry = override;
    }
  }

  if (!rollEntry) {
    newState = emitEvent(newState, "DICE_ROLLED", `${monster.name} rolled ${roll.total}. No action.`, { details: { rawRoll: roll.total } });
    return newState;
  }

  newState = emitEvent(newState, "DICE_ROLLED", `${monster.name} rolled ${roll.total}. Action: ${rollEntry.name}.`, { details: { rawRoll: roll.total, action: rollEntry.name, description: rollEntry.description } });
  const activeHero = getActiveHero(newState);
  return applyMonsterEffect(newState, rng, monster, rollEntry, activeHero, rollTotal);
}

function findRollEntry(table: MonsterRollEntry[], roll: number): MonsterRollEntry | undefined {
  for (const entry of table) {
    if (typeof entry.roll === "number") { if (entry.roll === roll) return entry; }
    else if (typeof entry.roll === "string") {
      if (entry.roll.includes("-")) { const [min, max] = entry.roll.split("-").map(Number); if (roll >= min && roll <= max) return entry; }
      else if (Number(entry.roll) === roll) return entry;
    }
  }
  return undefined;
}

function getMonsterRollModifier(state: GameState, monster: MonsterState): number {
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

function getMonsterDamageModifier(state: GameState, monster: MonsterState): number {
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

function getMonsterActionCount(state: GameState, monster: MonsterState): number {
  if (state.combat?.isFinalBoss && getVyridianPhase(monster.currentHp) === 3) return 2;
  return 1;
}

function getActiveHero(state: GameState): HeroState | undefined {
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

function healMonster(state: GameState, amount: number): GameState {
  if (!state.combat) return state;
  const combat = { ...state.combat! };
  const m = { ...combat.monster };
  m.currentHp = Math.min(m.maxHp, m.currentHp + amount);
  combat.monster = m;
  let newState: GameState = { ...state, combat };
  newState = emitEvent(newState, "HEAL_APPLIED", `${m.name} healed ${amount} HP. HP: ${m.currentHp}/${m.maxHp}.`, { targetIds: [m.id], details: { amount, isMonster: true } });
  return newState;
}

function applyDebuffToHero(state: GameState, heroId: string, debuff: NamedDebuff, duration: number): GameState {
  const debuffStatus = createDebuffStatus(debuff, duration);
  const hero = state.party.heroes.find(h => h.id === heroId);
  const updatedHeroes = state.party.heroes.map(h =>
    h.id === heroId && h.alive ? { ...h, debuffs: [...h.debuffs, debuffStatus] } : h
  );
  let newState = { ...state, party: { ...state.party, heroes: updatedHeroes } };
  newState = emitEvent(newState, "STATUS_ADDED", `${debuff} applied to ${hero?.name ?? heroId}.`, { targetIds: [heroId], details: { debuff, duration } });
  return newState;
}

function applyDebuffToMonster(state: GameState, debuff: NamedDebuff, duration: number): GameState {
  if (!state.combat) return state;
  if (state.combat.monster.specialState["debuffImmune"]) {
    return emitEvent(state, "ABILITY_TRIGGERED", `${state.combat.monster.name} is immune to debuffs!`, { targetIds: [state.combat.monster.id] });
  }
  const combat = { ...state.combat };
  combat.monster = { ...combat.monster, debuffs: [...combat.monster.debuffs, createDebuffStatus(debuff, duration)] };
  let newState: GameState = { ...state, combat };
  newState = emitEvent(newState, "STATUS_ADDED", `${debuff} applied to ${combat.monster.name}.`, { details: { debuff, duration } });
  return newState;
}

function createSummon(state: GameState, summonName: string): GameState {
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

// ─── Special Abilities (on match) ────────────────────────────────────────────

function triggerMonsterSpecial(state: GameState, rng: RngEngine): GameState {
  if (!state.combat) return state;
  let newState = state;
  const monster = newState.combat!.monster;
  const mid = monster.monsterId;
  const monsterData = getMonsterById(mid);
  const specialDesc = monsterData?.specialDescription ?? "";

  const setMonster = (m: MonsterState): GameState => {
    const combat = { ...newState.combat! };
    combat.monster = m;
    return { ...newState, combat };
  };

  switch (mid) {
    case 1: { // Abyssal Ooze: Ooze Trail
      newState = setMonster({ ...monster, specialState: { ...monster.specialState, oozeTrail: true } });
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${monster.name}: Ooze Trail active.`, { targetIds: [monster.id], details: { description: specialDesc } });
      break;
    }
    case 2: { // Treant: thorns
      newState = setMonster({ ...monster, specialState: { ...monster.specialState, thorns: true } });
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${monster.name}: Nature's Guard — thorns active.`, { targetIds: [monster.id], details: { description: specialDesc } });
      break;
    }
    case 3: { // Glimmering Sprite: untargetable
      newState = setMonster({ ...monster, untargetable: true, specialState: { ...monster.specialState, illusionDance: true } });
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${monster.name}: Illusion Dance — untargetable!`, { targetIds: [monster.id], details: { description: specialDesc } });
      break;
    }
    case 4: { // Shadowy Assassin: Vanish
      newState = setMonster({ ...monster, untargetable: true, specialState: { ...monster.specialState, vanishActive: true } });
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${monster.name}: Vanish — untargetable!`, { targetIds: [monster.id], details: { description: specialDesc } });
      break;
    }
    case 5: { // Banshee: Wail — 2 unblockable to all
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${monster.name}: Wail — 2 unblockable damage to all!`, { targetIds: getLivingHeroes(newState).map(h => h.id), details: { description: specialDesc } });
      for (const hero of getLivingHeroes(newState)) {
        const r = applyDamage(newState, hero.id, monster.id, calculateDamage({ base: 2, phaseThrough: true }), false);
        newState = r.state;
      }
      break;
    }
    case 6: { // Lunar Witch: passive (handled in modifier)
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${monster.name}: Moonlight — below 50% HP, +2 damage.`, { targetIds: [monster.id], details: { description: specialDesc } });
      break;
    }
    case 7: { // Arcane Elemental: Surge
      newState = setMonster({ ...monster, specialState: { ...monster.specialState, surgeActive: true } });
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${monster.name}: Surge — next attack hits all!`, { targetIds: [monster.id], details: { description: specialDesc } });
      break;
    }
    case 8: { // Phoenix: Rebirth (passive)
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${monster.name}: Rebirth — will resurrect once.`, { targetIds: [monster.id], details: { description: specialDesc } });
      break;
    }
    case 9: { // Gargoyle: Stone Form
      newState = setMonster({ ...monster, specialState: { ...monster.specialState, stoneFormCharges: 2 } });
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${monster.name}: Stone Form — immune to next 2 damage.`, { targetIds: [monster.id], details: { description: specialDesc } });
      break;
    }
    case 10: { // Cursed Knight: copy weapon
      const ah = getActiveHero(newState);
      if (ah?.weapon) {
        newState = setMonster({ ...monster, specialState: { ...monster.specialState, copiedWeapon: ah.weapon.name } });
        newState = emitEvent(newState, "ABILITY_TRIGGERED", `${monster.name}: Dark Blessing — copied ${ah.weapon.name}!`, { targetIds: [monster.id], details: { description: specialDesc } });
      }
      break;
    }
    case 11: { // Minotaur: passive (handled in modifiers)
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${monster.name}: Maze Runner — below 50%, +2 rolls +1 dmg.`, { targetIds: [monster.id], details: { description: specialDesc } });
      break;
    }
    case 12: { // Chimera: Triple Threat
      const currentHead = (monster.specialState["chimeraHead"] as number) ?? 0;
      const nextHead = (currentHead + 1) % 3;
      const heads = ["Lion: +2 damage", "Goat: heal 3 HP", "Snake: all Heroes Poison"];
      if (nextHead === 0) {
        newState = setMonster({ ...monster, specialState: { ...monster.specialState, chimeraHead: nextHead, chimeraDamageBonus: 2 } });
      } else if (nextHead === 1) {
        newState = setMonster({ ...monster, specialState: { ...monster.specialState, chimeraHead: nextHead } });
        newState = healMonster(newState, 3);
      } else {
        newState = setMonster({ ...monster, specialState: { ...monster.specialState, chimeraHead: nextHead } });
        for (const hero of getLivingHeroes(newState)) {
          newState = applyDebuffToHero(newState, hero.id, "Poison", 99);
        }
      }
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${monster.name}: Triple Threat — ${heads[nextHead]}!`, { targetIds: [monster.id], details: { description: specialDesc } });
      break;
    }
    case 13: { // Ember Drake: Ignite
      newState = setMonster({ ...monster, specialState: { ...monster.specialState, igniteActive: true } });
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${monster.name}: Ignite — attacks apply Burn!`, { targetIds: [monster.id], details: { description: specialDesc } });
      break;
    }
    case 14: { // Frost Wyrm: Permafrost
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${monster.name}: Permafrost — all Heroes Frozen!`, { targetIds: getLivingHeroes(newState).map(h => h.id), details: { description: specialDesc } });
      for (const hero of getLivingHeroes(newState)) {
        newState = applyDebuffToHero(newState, hero.id, "Freeze", 1);
      }
      break;
    }
    case 15: { // Nano Prototype: Assimilate
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${monster.name}: Assimilate — all Heroes Nanobot!`, { targetIds: getLivingHeroes(newState).map(h => h.id), details: { description: specialDesc } });
      for (const hero of getLivingHeroes(newState)) {
        newState = applyDebuffToHero(newState, hero.id, "Nanobot", 99);
      }
      break;
    }
    case 16: { // Laser Turret: Target Lock
      const target = getActiveHero(newState) ?? getLivingHeroes(newState)[0];
      if (target) {
        newState = addToken(newState, target.id, createTargetToken(), false);
        newState = setMonster({ ...monster, specialState: { ...monster.specialState, targetLock: target.id } });
        newState = emitEvent(newState, "ABILITY_TRIGGERED", `${monster.name}: Target Lock — ${target.name} marked!`, { targetIds: [target.id], details: { description: specialDesc } });
      }
      break;
    }
    case 17: { // Behemoth: Colossal
      newState = setMonster({ ...monster, specialState: { ...monster.specialState, colossal: true, debuffImmune: true } });
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${monster.name}: Colossal — -2 damage, immune to debuffs.`, { targetIds: [monster.id], details: { description: specialDesc } });
      break;
    }
    case 18: { // Cyclops: passive (handled in modifiers)
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${monster.name}: One Eye — +3 to rolls, dodge on 6.`, { targetIds: [monster.id], details: { description: specialDesc } });
      break;
    }
    case 19: { // Dragon: passive (handled in modifiers)
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${monster.name}: Ancient — +1 per tier to rolls.`, { targetIds: [monster.id], details: { description: specialDesc } });
      break;
    }
    case 20: { // Titan: passive (handled in start-of-turn)
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${monster.name}: Unyielding — below 50%, heal 2/turn.`, { targetIds: [monster.id], details: { description: specialDesc } });
      break;
    }
    case 21: { // Vyridian
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${monster.name}: Astril Conductor — the judgment begins.`, { targetIds: [monster.id], details: { description: specialDesc } });
      break;
    }
  }
  return newState;
}

// ─── Summon Turns ────────────────────────────────────────────────────────────

function executeSummonTurns(state: GameState, rng: RngEngine): GameState {
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
      newState = emitEvent(newState, "DAMAGE_APPLIED", `${summon.name} dealt ${data.damage} to ${target.name}.`, { targetIds: [target.id], details: { damage: data.damage } });
    }
  }
  const combat = { ...newState.combat! };
  combat.summons = combat.summons.filter(s => s.alive);
  newState = { ...newState, combat };
  return newState;
}

// ─── Effect Application ──────────────────────────────────────────────────────

function applyMonsterEffect(
  state: GameState,
  rng: RngEngine,
  monster: MonsterState,
  entry: MonsterRollEntry,
  activeHero: HeroState | undefined,
  rollResult: number
): GameState {
  let newState = state;
  const desc = entry.description.toLowerCase();
  const mech = entry.mechanics;
  const dmgMod = getMonsterDamageModifier(newState, monster);

  // Consume overchargeActive: double next attack's damage
  let overchargeMultiplier = 1;
  if (monster.specialState["overchargeActive"]) {
    overchargeMultiplier = 2;
    const combat = { ...newState.combat! };
    const m = { ...combat.monster };
    m.specialState = { ...m.specialState, overchargeActive: false };
    combat.monster = m;
    newState = { ...newState, combat };
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${m.name}: Overcharge consumed — double damage!`, {});
  }

  // Consume focusGaze: next attack cannot be dodged
  const focusGazeActive = monster.specialState["focusGaze"] === true;
  if (focusGazeActive) {
    const combat = { ...newState.combat! };
    const m = { ...combat.monster };
    m.specialState = { ...m.specialState, focusGaze: false };
    combat.monster = m;
    newState = { ...newState, combat };
  }

  // Target Lock: all attacks hit the locked target
  const lockedTargetId = monster.specialState["targetLock"] as string | undefined;

  // Prefer mechanics-based dispatch, fall back to desc parsing
  const damageMatch = desc.match(/deal (\d+) damage/);
  const baseDamage = mech?.damage ?? (damageMatch ? parseInt(damageMatch[1]) : 0);
  const phaseThrough = mech?.phaseThrough ?? (desc.includes("phase through shields") || desc.includes("unblockable"));
  const surgeActive = monster.specialState["surgeActive"] === true;
  const targetsAll = surgeActive || mech?.target === "all" || desc.includes("to all heroes") || desc.includes("to all,") || desc.includes("damage to all");
  const targetsAllAndSelf = (mech?.selfDamage !== undefined) || desc.includes("including self");
  const targetsLowest = mech?.target === "lowest" || desc.includes("lowest hp");
  const targetsHighest = mech?.target === "highest" || desc.includes("most hp") || desc.includes("highest hp");
  const targetsFewestShields = mech?.target === "fewest_shields" || (desc.includes("fewest") && desc.includes("shield"));
  const targetsMostApcs = mech?.target === "most_apcs" || desc.includes("most apcs");
  const targetsMostDebuffs = mech?.target === "most_debuffs" || desc.includes("most debuffs");
  const targetsFrozen = mech?.target === "frozen" || desc.includes("frozen heroes");
  const mechPositionRange = mech?.target === "position" ? mech.positionRange : undefined;
  const targetsPosition = mechPositionRange ? [`${mechPositionRange[0]}`, `${mechPositionRange[1]}`] as RegExpMatchArray : desc.match(/position[s]?\s+(\d)(?:[–-](\d))?/);
  const targetsRandom = mech?.target === "random" || desc.includes("random hero");
  const targetsTwoRandom = mech?.target === "two_random" || desc.includes("two random heroes");
  const targetsTwoDifferent = mech?.target === "two_different" || desc.includes("two different heroes");

  if (surgeActive && baseDamage > 0) {
    const combat = { ...newState.combat! };
    const m = { ...combat.monster };
    m.specialState = { ...m.specialState, surgeActive: false };
    combat.monster = m;
    newState = { ...newState, combat };
  }

  if (baseDamage > 0) {
    const finalDamage = (baseDamage + dmgMod) * overchargeMultiplier;
    if (targetsAll) {
      for (const hero of getLivingHeroes(newState)) {
        if (!hero.alive) continue;
        if ((mech?.dodgeThreshold !== undefined && mech.dodgeRollAll) || (desc.includes("heroes roll d6") && desc.includes("4+ avoids"))) {
          const dodgeThreshold = mech?.dodgeThreshold ?? 4;
          if (focusGazeActive) {
            newState = emitEvent(newState, "ABILITY_TRIGGERED", `Focus Gaze: ${hero.name} cannot dodge!`, {});
          } else {
            const dodgeRoll = rng.rollD6(`dodge_${hero.name}`);
            if (dodgeRoll.total >= dodgeThreshold) {
              newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name} dodged! (rolled ${dodgeRoll.total})`, {});
              continue;
            }
          }
        }
        const r = applyDamage(newState, hero.id, monster.id, calculateDamage({ base: finalDamage, phaseThrough }), false);
        newState = r.state;
        if (monster.specialState["igniteActive"]) newState = applyDebuffToHero(newState, hero.id, "Burn", 3);
        // Pet takes 1 splash damage from AoE attacks
        const updatedHero = getHeroById(newState, hero.id);
        if (updatedHero?.pet?.alive) {
          const petHp = Math.max(0, updatedHero.pet.currentHp - 1);
          const petAlive = petHp > 0;
          const petHeroes = newState.party.heroes.map(h =>
            h.id === hero.id ? { ...h, pet: { ...h.pet!, currentHp: petHp, alive: petAlive } } : h
          );
          newState = { ...newState, party: { ...newState.party, heroes: petHeroes } };
          if (!petAlive) {
            newState = emitEvent(newState, "ABILITY_TRIGGERED", `${updatedHero.pet.name} (pet) was killed by AoE damage!`, { actorId: hero.id });
          }
        }
      }
      if (targetsAllAndSelf) {
        const selfDmg = mech?.selfDamage ?? 8;
        const combat = { ...newState.combat! };
        const m = { ...combat.monster };
        m.currentHp = Math.max(0, m.currentHp - selfDmg);
        combat.monster = m;
        newState = { ...newState, combat };
        newState = emitEvent(newState, "DAMAGE_APPLIED", `${m.name} took ${selfDmg} self-damage. HP: ${m.currentHp}/${m.maxHp}.`, { targetIds: [m.id] });
      }
      if (mech?.healPerHeroHit || desc.includes("heal 1 hp per hero hit")) {
        const healAmt = mech?.healPerHeroHit ?? 1;
        newState = healMonster(newState, getLivingHeroes(newState).length * healAmt);
      }
      if (mech?.restoreHp !== undefined || desc.toLowerCase().includes("restores 3 hp")) {
        const restoreAmt = mech?.restoreHp ?? 3;
        newState = healMonster(newState, restoreAmt);
      }
      if (mech?.removeShields || desc.includes("remove all shields") || desc.includes("remove all 🔵")) {
        const updatedHeroes = newState.party.heroes.map(h => ({ ...h, tokens: h.tokens.filter(t => t.type !== "shield") }));
        newState = { ...newState, party: { ...newState.party, heroes: updatedHeroes } };
        newState = emitEvent(newState, "TOKEN_REMOVED", `All hero shields removed!`, {});
      }
      if (mech?.shuffleApcs || desc.includes("shuffle all apcs")) {
        const allApcs: APCInstance[] = [];
        const updatedHeroes = newState.party.heroes.map(h => { if (h.alive) allApcs.push(...h.apcs); return { ...h, apcs: [] as APCInstance[] }; });
        const combat = { ...newState.combat! };
        const m = { ...combat.monster };
        allApcs.push(...m.apcs);
        m.apcs = [];
        combat.monster = m;
        newState = { ...newState, combat, party: { ...newState.party, heroes: updatedHeroes } };
        const shuffled = rng.shuffleDeck(allApcs, "apc_shuffle");
        const livingHeroList = updatedHeroes.filter(h => h.alive);
        let idx = 0;
        const redistributed = updatedHeroes.map(h => {
          if (!h.alive) return h;
          const apc = shuffled[idx++];
          return { ...h, apcs: apc ? [apc] : [] };
        });
        const remaining = shuffled.slice(idx);
        const combat2 = { ...newState.combat! };
        combat2.monster = { ...combat2.monster, apcs: remaining };
        newState = { ...newState, combat: combat2, party: { ...newState.party, heroes: redistributed } };
        newState = emitEvent(newState, "ABILITY_TRIGGERED", `Reality Break: All APCs shuffled!`, {});
      }
    } else if (targetsTwoRandom || targetsTwoDifferent) {
      const shuffled = rng.shuffleDeck(getLivingHeroes(newState), "monster_target_shuffle");
      for (const hero of shuffled.slice(0, 2)) {
        if (!hero.alive) continue;
        const r = applyDamage(newState, hero.id, monster.id, calculateDamage({ base: finalDamage, phaseThrough }), false);
        newState = r.state;
      }
    } else if (targetsPosition) {
      const posStart = parseInt(targetsPosition[1]);
      const posEnd = targetsPosition[2] ? parseInt(targetsPosition[2]) : posStart;
      for (let pos = posStart; pos <= posEnd; pos++) {
        const hero = getHeroByPosition(newState, pos);
        if (hero && hero.alive) {
          const r = applyDamage(newState, hero.id, monster.id, calculateDamage({ base: finalDamage, phaseThrough }), false);
          newState = r.state;
        }
      }
    } else if (targetsLowest) {
      const target = newState.settings.difficulty === "nightmare"
        ? selectNightmareTarget(newState)
        : selectTargetByPriority(getLivingHeroes(newState), "lowest");
      if (target) {
        if (mech?.instantKillBelowHp !== undefined || (desc.includes("instant kill") && desc.includes("below"))) {
          const threshold = mech?.instantKillBelowHp ?? (desc.match(/below (\d+) hp/)?.[1] ? parseInt(desc.match(/below (\d+) hp/)![1]) : 8);
          const dmg = target.currentHp < threshold ? target.currentHp : finalDamage;
          const r = applyDamage(newState, target.id, monster.id, calculateDamage({ base: dmg, phaseThrough: true }), false);
          newState = r.state;
        } else {
          const r = applyDamage(newState, target.id, monster.id, calculateDamage({ base: finalDamage, phaseThrough }), false);
          newState = r.state;
        }
      }
    } else if (targetsHighest) {
      const target = selectTargetByPriority(getLivingHeroes(newState), "highest");
      if (target) {
        const r = applyDamage(newState, target.id, monster.id, calculateDamage({ base: finalDamage, phaseThrough }), false);
        newState = r.state;
      }
    } else if (targetsFewestShields) {
      const livingHeroes = getLivingHeroes(newState);
      const target = livingHeroes.sort((a, b) => {
        const aS = a.tokens.filter(t => t.type === "shield").length;
        const bS = b.tokens.filter(t => t.type === "shield").length;
        return aS - bS || a.heroId - b.heroId;
      })[0];
      if (target) {
        const r = applyDamage(newState, target.id, monster.id, calculateDamage({ base: finalDamage, phaseThrough }), false);
        newState = r.state;
      }
    } else if (targetsMostApcs) {
      const target = getLivingHeroes(newState).sort((a, b) => b.apcs.length - a.apcs.length)[0];
      if (target) {
        const r = applyDamage(newState, target.id, monster.id, calculateDamage({ base: finalDamage, phaseThrough }), false);
        newState = r.state;
      }
    } else if (targetsMostDebuffs) {
      const target = getLivingHeroes(newState).sort((a, b) => b.debuffs.length - a.debuffs.length)[0];
      if (target) {
        const r = applyDamage(newState, target.id, monster.id, calculateDamage({ base: finalDamage, phaseThrough }), false);
        newState = r.state;
      }
    } else if (targetsFrozen) {
      for (const hero of getLivingHeroes(newState).filter(h => h.debuffs.some(d => d.name === "Freeze" || d.name === "Frozen"))) {
        const r = applyDamage(newState, hero.id, monster.id, calculateDamage({ base: finalDamage, phaseThrough }), false);
        newState = r.state;
      }
    } else if (targetsRandom) {
      const livingHeroes = getLivingHeroes(newState);
      if (livingHeroes.length > 0) {
        const target = rng.chooseRandom(livingHeroes, "monster_random_target");
        const redirect = maybeRedirectAttack(newState, target.id, finalDamage, false);
        newState = redirect.state;
        if (!redirect.redirectedToMonster) {
          const actualTarget = redirect.targetId !== target.id ? redirect.targetId : target.id;
          const r = applyDamage(newState, actualTarget, monster.id, calculateDamage({ base: finalDamage, phaseThrough }), false);
          newState = r.state;
        }
      }
    } else {
      let target: HeroState | undefined = activeHero && activeHero.alive ? activeHero : undefined;
      if (!target) {
        target = newState.settings.difficulty === "nightmare"
          ? selectNightmareTarget(newState)
          : getLivingHeroes(newState)[0];
      }
      // Target Lock overrides default targeting
      if (lockedTargetId) {
        const locked = getHeroById(newState, lockedTargetId);
        if (locked && locked.alive) target = locked;
      }
      if (target) {
        // Check for Manipulator/Guardian redirect before applying damage
        const redirect = maybeRedirectAttack(newState, target.id, finalDamage, false);
        newState = redirect.state;
        if (redirect.redirectedToMonster) {
          // Attack was redirected to monster — skip hero damage entirely
          target = undefined;
        } else if (redirect.targetId !== target.id) {
          // Guardian redirected to self — use Guardian as target
          target = getHeroById(newState, redirect.targetId);
        }
      }
      if (target) {
        if (focusGazeActive) {
          const r = applyDamage(newState, target.id, monster.id, calculateDamage({ base: finalDamage, phaseThrough }), false);
          newState = r.state;
          if (monster.specialState["igniteActive"]) newState = applyDebuffToHero(newState, target.id, "Burn", 3);
          newState = emitEvent(newState, "ABILITY_TRIGGERED", `Focus Gaze: ${target.name} cannot dodge!`, {});
        } else if (mech?.dodgeThreshold !== undefined || desc.includes("dodges on d6 roll of") || desc.includes("dodges only on d6 roll of 6")) {
          const threshold = mech?.dodgeThreshold ?? (desc.match(/dodges (?:only )?on d6 roll of (\d+)/)?.[1] ? parseInt(desc.match(/dodges (?:only )?on d6 roll of (\d+)/)![1]) : 6);
          const isExact = mech?.dodgeExact ?? desc.includes("dodges only on");
          const dodgeRoll = rng.rollD6(`dodge_${target.name}`);
          const dodged = isExact ? dodgeRoll.total === threshold : dodgeRoll.total >= threshold;
          if (dodged) {
            newState = emitEvent(newState, "ABILITY_TRIGGERED", `${target.name} dodged! (rolled ${dodgeRoll.total})`, {});
          } else {
            const r = applyDamage(newState, target.id, monster.id, calculateDamage({ base: finalDamage, phaseThrough }), false);
            newState = r.state;
            if (monster.specialState["igniteActive"]) newState = applyDebuffToHero(newState, target.id, "Burn", 3);
          }
        } else {
          // Cyclops One Eye: Heroes can dodge on natural 6 for all attacks
          let cyclopsDodged = false;
          if (monster.monsterId === 18 && !focusGazeActive) {
            const dodgeRoll = rng.rollD6(`dodge_${target.name}`);
            if (dodgeRoll.total === 6) {
              newState = emitEvent(newState, "ABILITY_TRIGGERED", `${target.name} dodged Cyclops attack! (rolled 6)`, {});
              cyclopsDodged = true;
            }
          }
          if (!cyclopsDodged) {
            const r = applyDamage(newState, target.id, monster.id, calculateDamage({ base: finalDamage, phaseThrough }), false);
            newState = r.state;
            if (monster.specialState["igniteActive"]) newState = applyDebuffToHero(newState, target.id, "Burn", 3);
          }
        }
      }
    }
  }

  // Pulse Laser: if roll was even, hits twice
  if ((mech?.pulseLaserTwice || (desc.includes("hits twice") && desc.includes("roll was even"))) && rollResult % 2 === 0 && baseDamage > 0) {
    const target = activeHero && activeHero.alive ? activeHero : getLivingHeroes(newState)[0];
    if (target) {
      const secondHitDamage = (baseDamage + dmgMod) * overchargeMultiplier;
      const r = applyDamage(newState, target.id, monster.id, calculateDamage({ base: secondHitDamage, phaseThrough }), false);
      newState = r.state;
      newState = emitEvent(newState, "DAMAGE_APPLIED", `${monster.name} hits twice! ${secondHitDamage} additional damage to ${target.name}.`, { targetIds: [target.id] });
    }
  }

  // Virus Upload: only damage heroes with Nanobot
  if (mech?.nanobotDamage !== undefined || (desc.includes("nanobot") && desc.includes("take 3 damage"))) {
    const nanobotDmg = mech?.nanobotDamage ?? 3;
    const nanobotHeroes = getLivingHeroes(newState).filter(h => h.debuffs.some(d => d.name === "Nanobot"));
    for (const hero of nanobotHeroes) {
      const r = applyDamage(newState, hero.id, monster.id, calculateDamage({ base: nanobotDmg + dmgMod }), false);
      newState = r.state;
    }
    if (nanobotHeroes.length > 0) {
      newState = emitEvent(newState, "DAMAGE_APPLIED", `Virus Upload: ${nanobotHeroes.length} Hero(es) with Nanobot took ${nanobotDmg + dmgMod} damage!`, { targetIds: nanobotHeroes.map(h => h.id) });
    } else {
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `Virus Upload: No Heroes have Nanobot!`, {});
    }
  }

  // Beam Sweep: 5 to target, 2 to others
  if (mech?.beamSweep || desc.includes("deal 5 damage to target and 2 to others")) {
    const primaryDmg = mech?.beamSweep?.primary ?? 5;
    const secondaryDmg = mech?.beamSweep?.secondary ?? 2;
    const livingHeroes = getLivingHeroes(newState);
    const target = selectTargetByPriority(livingHeroes, "highest");
    if (target) {
      newState = applyDamage(newState, target.id, monster.id, calculateDamage({ base: primaryDmg + dmgMod }), false).state;
      for (const hero of livingHeroes) {
        if (hero.id === target.id || !hero.alive) continue;
        newState = applyDamage(newState, hero.id, monster.id, calculateDamage({ base: secondaryDmg + dmgMod }), false).state;
      }
    }
  }

  // Triple Attack: positions 1, 2, and 3
  if ((mech?.target === "position" && mech.positionRange?.[0] === 1 && mech.positionRange?.[1] === 3) || desc.includes("positions 1, 2, and 3")) {
    for (let pos = 1; pos <= 3; pos++) {
      const hero = getHeroByPosition(newState, pos);
      if (hero && hero.alive) newState = applyDamage(newState, hero.id, monster.id, calculateDamage({ base: 2 + dmgMod }), false).state;
    }
  }

  // Disable all APCs and deal 3 per card
  if ((mech?.disableApcs && mech.apcDamage !== undefined) || (desc.includes("disable all apcs") && desc.includes("deal 3 damage per card"))) {
    const apcDmg = mech?.apcDamage ?? 3;
    for (const hero of getLivingHeroes(newState)) {
      const apcCount = hero.apcs.length;
      if (apcCount > 0) {
        newState = applyDamage(newState, hero.id, monster.id, calculateDamage({ base: apcDmg * apcCount }), false).state;
        const updatedHeroes = newState.party.heroes.map(h => h.id === hero.id ? { ...h, apcs: h.apcs.filter(a => a.permanent) } : h);
        newState = { ...newState, party: { ...newState.party, heroes: updatedHeroes } };
      }
    }
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `All APCs disabled! ${apcDmg} damage per card.`, {});
  }

  // Self healing
  const healMatch = desc.match(/heal (\d+) hp/);
  if (mech?.heal !== undefined) {
    newState = healMonster(newState, mech.heal);
  } else if (healMatch && !desc.includes("heal all") && !desc.includes("heal 1 hp per hero") && !desc.includes("heal 2 per bot") && !desc.toLowerCase().includes("restores 3 hp")) {
    newState = healMonster(newState, parseInt(healMatch[1]));
  }

  // Self Destruct: remove Nanobots, heal 2 per bot
  if (mech?.healPerBot || desc.includes("heal 2 per bot")) {
    const botCount = newState.party.heroes.reduce((sum, h) => sum + h.debuffs.filter(d => d.name === "Nanobot").length, 0);
    newState = healMonster(newState, botCount * 2);
    const updatedHeroes = newState.party.heroes.map(h => ({ ...h, debuffs: h.debuffs.filter(d => d.name !== "Nanobot") }));
    newState = { ...newState, party: { ...newState.party, heroes: updatedHeroes } };
    newState = emitEvent(newState, "STATUS_REMOVED", `All Nanobots removed. Healed ${botCount * 2}.`, {});
  }

  // Gain shields
  const shieldMatch = desc.match(/gain (\d+)🔵/);
  const shieldCount = mech?.gainShields ?? (shieldMatch ? parseInt(shieldMatch[1]) : 0);
  if (shieldCount > 0) {
    for (let i = 0; i < shieldCount; i++) newState = addToken(newState, monster.id, createShieldToken(1), true);
  }

  // Gain counters
  const counterMatch = desc.match(/gain (\d+)🟢/);
  const counterCount = mech?.gainCounters ?? (counterMatch ? parseInt(counterMatch[1]) : 0);
  if (counterCount > 0) {
    for (let i = 0; i < counterCount; i++) newState = addToken(newState, monster.id, createCounterToken(1), true);
  }

  // Apply debuffs
  newState = applyDebuffsFromEffect(newState, monster, desc, activeHero, mech);

  // Apply target token
  if (mech?.targetToken || desc.includes("🔴 target")) {
    const target = activeHero && activeHero.alive ? activeHero : getLivingHeroes(newState)[0];
    if (target) newState = addToken(newState, target.id, createTargetToken(), false);
  }

  // Gain APC
  if (mech?.gainApc || desc.includes("gain +1 apc") || desc.includes("gain +1 temporary apc")) {
    const combat = { ...newState.combat! };
    const m = { ...combat.monster };
    m.apcs = [...m.apcs, { id: generateId("temp_apc_m"), rank: "5", suit: "clubs", source: { id: generateId("apc_card_m"), suit: "clubs", rank: "5", display: "5♣️", deckType: "peon" }, temporary: true, permanent: false, matched: false }];
    combat.monster = m;
    newState = { ...newState, combat };
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${m.name} gained +1 APC.`, {});
  }

  // Gain Might
  if (mech?.gainMight || desc.includes("gain ⚫ might")) {
    const combat = { ...newState.combat! };
    const m = { ...combat.monster };
    m.buffs = [...m.buffs, createBuffStatus("Might", 1)];
    combat.monster = m;
    newState = { ...newState, combat };
    newState = emitEvent(newState, "STATUS_ADDED", `${m.name} gained Might.`, {});
  }

  // +1 to next 2 rolls
  if (mech?.rollBonusNext2 || desc.includes("gain +1 to next 2 rolls")) {
    const combat = { ...newState.combat! };
    const m = { ...combat.monster };
    m.specialState = { ...m.specialState, rollBonusNext2: 2 };
    combat.monster = m;
    newState = { ...newState, combat };
    newState = emitEvent(newState, "STATUS_ADDED", `${m.name} +1 to next 2 rolls.`, {});
  }

  // Next attack double damage
  if (mech?.overcharge || desc.includes("next attack deals double damage")) {
    const combat = { ...newState.combat! };
    const m = { ...combat.monster };
    m.specialState = { ...m.specialState, overchargeActive: true };
    combat.monster = m;
    newState = { ...newState, combat };
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${m.name}: Overcharge!`, {});
  }

  // Next attack cannot be dodged
  if (mech?.focusGaze || desc.includes("next attack cannot be dodged")) {
    const combat = { ...newState.combat! };
    const m = { ...combat.monster };
    m.specialState = { ...m.specialState, focusGaze: true };
    combat.monster = m;
    newState = { ...newState, combat };
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${m.name}: Focus Gaze!`, {});
  }

  // Become untargetable / Vanish
  if (mech?.untargetable || mech?.untargetableNextTurn || desc.includes("become untargetable") || (desc.includes("vanish") && !desc.includes("if this kills"))) {
    const combat = { ...newState.combat! };
    const m = { ...combat.monster };
    const isTemporary = mech?.untargetableNextTurn || desc.includes("next turn");
    m.untargetable = true;
    m.specialState = { ...m.specialState, vanishActive: true };
    if (isTemporary) m.specialState = { ...m.specialState, untargetableNextTurn: true };
    combat.monster = m;
    newState = { ...newState, combat };
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${m.name} ${isTemporary ? "flies up — untargetable next turn!" : "vanished!"}`, {});
  }

  // Fade and skip next turn
  if (mech?.fadeSkipTurn || desc.includes("fade and skip next turn")) {
    const combat = { ...newState.combat! };
    const m = { ...combat.monster };
    m.specialState = { ...m.specialState, skipNextTurn: true };
    combat.monster = m;
    newState = { ...newState, combat };
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${m.name} fades — skips next turn.`, {});
  }

  // Remove all shields (standalone)
  if ((mech?.removeShields && !mech.damage) || (desc.includes("remove all 🔵") && !desc.includes("deal"))) {
    const updatedHeroes = newState.party.heroes.map(h => ({ ...h, tokens: h.tokens.filter(t => t.type !== "shield") }));
    newState = { ...newState, party: { ...newState.party, heroes: updatedHeroes } };
    newState = emitEvent(newState, "TOKEN_REMOVED", `All hero shields removed!`, {});
  }

  // Steal gold
  const stealGoldMatch = desc.match(/steal (\d+)g/);
  const stealGoldAmt = mech?.stealGold ?? (stealGoldMatch ? parseInt(stealGoldMatch[1]) : 0);
  if (stealGoldAmt > 0) {
    const amt = Math.min(stealGoldAmt, newState.party.gold);
    newState = { ...newState, party: { ...newState.party, gold: newState.party.gold - amt } };
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${monster.name} stole ${amt}g!`, {});
  }

  // Steal item
  if (mech?.stealItem || desc.includes("steal highest-value item") || desc.includes("steal 1 item")) {
    const allItems = newState.party.heroes.flatMap(h => h.items.map(i => ({ heroId: h.id, item: i })));
    if (allItems.length > 0) {
      const stolen = allItems[0];
      const updatedHeroes = newState.party.heroes.map(h => h.id === stolen.heroId ? { ...h, items: h.items.filter(i => i.id !== stolen.item.id) } : h);
      newState = { ...newState, party: { ...newState.party, heroes: updatedHeroes } };
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${monster.name} stole ${stolen.item.name}!`, {});
    }
  }

  // Steal weapon for combat
  if (mech?.stealWeapon || desc.includes("steal weapon for combat")) {
    const target = activeHero && activeHero.alive ? activeHero : getLivingHeroes(newState)[0];
    if (target?.weapon) {
      const updatedHeroes = newState.party.heroes.map(h => h.id === target.id ? { ...h, weapon: { ...h.weapon, name: "Disarmed", effect: "Weapon stolen", description: "Weapon stolen" } } : h);
      newState = { ...newState, party: { ...newState.party, heroes: updatedHeroes } };
      const combat = { ...newState.combat! };
      combat.monster = { ...combat.monster, specialState: { ...combat.monster.specialState, stolenWeapon: target.weapon.name } };
      newState = { ...newState, combat };
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${monster.name} stole ${target.weapon.name}!`, {});
    }
  }

  // Destroy 1 random consumable
  if (mech?.destroyItem === "random" || desc.includes("destroy 1 random consumable")) {
    const heroItems = newState.party.heroes.flatMap(h => h.items.map(i => ({ heroId: h.id, item: i })));
    if (heroItems.length > 0) {
      const destroyed = rng.chooseRandom(heroItems, "destroy_consumable");
      const updatedHeroes = newState.party.heroes.map(h => h.id === destroyed.heroId ? { ...h, items: h.items.filter(i => i.id !== destroyed.item.id) } : h);
      newState = { ...newState, party: { ...newState.party, heroes: updatedHeroes } };
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${monster.name} destroyed ${destroyed.item.name}!`, {});
    }
  }

  // Destroy all items
  if (mech?.destroyItem === "all" || desc.includes("destroy all items")) {
    const updatedHeroes = newState.party.heroes.map(h => ({ ...h, items: [] }));
    newState = { ...newState, party: { ...newState.party, heroes: updatedHeroes } };
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${monster.name} destroyed all items!`, {});
  }

  // Disable items for combat
  if (mech?.disableItems || desc.includes("disable items for combat")) {
    const updatedHeroes = newState.party.heroes.map(h => ({ ...h, perTurnFlags: { ...h.perTurnFlags, itemsDisabled: true } }));
    newState = { ...newState, party: { ...newState.party, heroes: updatedHeroes } };
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `Items disabled for combat!`, {});
  }

  // Disable weapon for 1 turn
  if (mech?.disableWeapon || desc.includes("disable weapon for 1 turn")) {
    const target = activeHero && activeHero.alive ? activeHero : getLivingHeroes(newState)[0];
    if (target) {
      const updatedHeroes = newState.party.heroes.map(h => h.id === target.id ? { ...h, perTurnFlags: { ...h.perTurnFlags, weaponDisabled: true } } : h);
      newState = { ...newState, party: { ...newState.party, heroes: updatedHeroes } };
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${target.name}'s weapon disabled!`, {});
    }
  }

  // Disable enchantment
  if (mech?.disableEnchantment || desc.includes("disable enchantment")) {
    const target = activeHero && activeHero.alive ? activeHero : getLivingHeroes(newState)[0];
    if (target?.enchantment) {
      const updatedHeroes = newState.party.heroes.map(h => h.id === target.id ? { ...h, enchantment: undefined } : h);
      newState = { ...newState, party: { ...newState.party, heroes: updatedHeroes } };
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${target.name}'s enchantment disabled!`, {});
    }
  }

  // Skip / lose next turn
  if ((mech?.skipNextTurn || desc.includes("skip next turn") || desc.includes("loses next turn") || desc.includes("lose next turn")) && !mech?.skip2Turns && !mech?.disableFor2Turns) {
    const target = activeHero && activeHero.alive ? activeHero : getLivingHeroes(newState)[0];
    if (target) {
      const updatedHeroes = newState.party.heroes.map(h => h.id === target.id ? { ...h, perTurnFlags: { ...h.perTurnFlags, skipNextTurn: true } } : h);
      newState = { ...newState, party: { ...newState.party, heroes: updatedHeroes } };
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${target.name} loses next turn!`, {});
    }
  }

  // Skip 2 turns
  if (mech?.skip2Turns || desc.includes("skip 2 turns")) {
    const target = activeHero && activeHero.alive ? activeHero : getLivingHeroes(newState)[0];
    if (target) {
      const updatedHeroes = newState.party.heroes.map(h => h.id === target.id ? { ...h, perTurnFlags: { ...h.perTurnFlags, skipNextTurn: true, skipTwoTurns: true } } : h);
      newState = { ...newState, party: { ...newState.party, heroes: updatedHeroes } };
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${target.name} skips 2 turns!`, {});
    }
  }

  // All Heroes lose next turn
  if (mech?.allLoseNextTurn || desc.includes("all heroes lose next turn")) {
    const updatedHeroes = newState.party.heroes.map(h => h.alive ? { ...h, perTurnFlags: { ...h.perTurnFlags, skipNextTurn: true } } : h);
    newState = { ...newState, party: { ...newState.party, heroes: updatedHeroes } };
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `All Heroes lose next turn!`, {});
  }

  // Discard APC
  if (mech?.discardApc || desc.includes("discard 1 apc")) {
    const target = activeHero && activeHero.alive ? activeHero : getLivingHeroes(newState)[0];
    if (target && target.apcs.length > 0) {
      const updatedHeroes = newState.party.heroes.map(h => h.id === target.id ? { ...h, apcs: h.apcs.slice(0, -1) } : h);
      newState = { ...newState, party: { ...newState.party, heroes: updatedHeroes } };
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${target.name} discarded 1 APC!`, {});
    }
  }

  // Each Hero loses 1 APC
  if (mech?.eachLoseApc || desc.includes("each hero loses 1 apc")) {
    const updatedHeroes = newState.party.heroes.map(h => h.alive && h.apcs.length > 0 ? { ...h, apcs: h.apcs.slice(0, -1) } : h);
    newState = { ...newState, party: { ...newState.party, heroes: updatedHeroes } };
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `Each Hero loses 1 APC!`, {});
  }

  // Swap random APC
  if (mech?.swapApc || desc.includes("swap random apc")) {
    const livingHeroes = getLivingHeroes(newState);
    if (livingHeroes.length >= 2) {
      const shuffled = rng.shuffleDeck(livingHeroes, "swap_shuffle");
      const h1 = shuffled[0], h2 = shuffled[1];
      if (h1.apcs.length > 0 && h2.apcs.length > 0) {
        const apc1 = h1.apcs[0], apc2 = h2.apcs[0];
        const updatedHeroes = newState.party.heroes.map(h => {
          if (h.id === h1.id) return { ...h, apcs: [apc2, ...h.apcs.slice(1)] };
          if (h.id === h2.id) return { ...h, apcs: [apc1, ...h.apcs.slice(1)] };
          return h;
        });
        newState = { ...newState, party: { ...newState.party, heroes: updatedHeroes } };
        newState = emitEvent(newState, "ABILITY_TRIGGERED", `Swapped APCs between ${h1.name} and ${h2.name}!`, {});
      }
    }
  }

  // Create hazard
  if (mech?.createHazard || desc.includes("create hazard")) {
    const combat = { ...newState.combat! };
    combat.monster = { ...combat.monster, specialState: { ...combat.monster.specialState, hazardActive: true } };
    newState = { ...newState, combat };
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `Lava Pool hazard created!`, {});
  }

  // Trap Active Hero (Minotaur Labyrinth: trap and deal 5 damage)
  if (mech?.trapHero || desc.includes("trap active hero")) {
    const target = activeHero && activeHero.alive ? activeHero : getLivingHeroes(newState)[0];
    if (target) {
      newState = applyDamage(newState, target.id, monster.id, calculateDamage({ base: 5 }), false).state;
      const updatedHeroes = newState.party.heroes.map(h => h.id === target.id ? { ...h, perTurnFlags: { ...h.perTurnFlags, trapped: true } } : h);
      newState = { ...newState, party: { ...newState.party, heroes: updatedHeroes } };
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${target.name} trapped! 5 damage dealt. Roll 5+ to escape.`, {});
    }
  }

  // Throw target at position 1
  if (mech?.throwPosition1 || desc.includes("throw target at position 1")) {
    const pos1Hero = getHeroByPosition(newState, 1);
    if (pos1Hero && pos1Hero.alive) {
      newState = applyDamage(newState, pos1Hero.id, monster.id, calculateDamage({ base: 3 }), false).state;
    }
  }

  // Disable for 2 turns
  if (mech?.disableFor2Turns || desc.includes("disable for 2 turns")) {
    const target = activeHero && activeHero.alive ? activeHero : getLivingHeroes(newState)[0];
    if (target) {
      const updatedHeroes = newState.party.heroes.map(h => h.id === target.id ? { ...h, perTurnFlags: { ...h.perTurnFlags, skipNextTurn: true, skipTwoTurns: true } } : h);
      newState = { ...newState, party: { ...newState.party, heroes: updatedHeroes } };
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${target.name} disabled for 2 turns!`, {});
    }
  }

  // Disable item
  if (mech?.disableItem || (desc.includes("disable item") && !desc.includes("disable items for combat"))) {
    const target = activeHero && activeHero.alive ? activeHero : getLivingHeroes(newState)[0];
    if (target) {
      const updatedHeroes = newState.party.heroes.map(h => h.id === target.id ? { ...h, perTurnFlags: { ...h.perTurnFlags, itemDisabled: true } } : h);
      newState = { ...newState, party: { ...newState.party, heroes: updatedHeroes } };
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${target.name}'s item disabled!`, {});
    }
  }

  // Summons
  if (mech?.summon?.type === "Ooze Minion" || desc.includes("spawn ooze minion") || desc.includes("summon ooze minion")) {
    if (monster.currentHp > 6) newState = createSummon(newState, "Ooze Minion");
  }
  if (mech?.summon?.type === "Sapling" || desc.includes("summon 2 saplings")) {
    newState = createSummon(newState, "Sapling");
    newState = createSummon(newState, "Sapling");
  }
  if (mech?.summon?.type === "Pixie" || desc.includes("summon 3 pixies")) {
    newState = createSummon(newState, "Pixie");
    newState = createSummon(newState, "Pixie");
    newState = createSummon(newState, "Pixie");
    // Pixies give -1 to hero rolls while alive
    const combat = { ...newState.combat! };
    combat.monster = { ...combat.monster, specialState: { ...combat.monster.specialState, pixieSwarm: true } };
    newState = { ...newState, combat };
  }

  // All Heroes suffer -1 to next roll
  if (mech?.allMinus1Roll || desc.includes("all heroes suffer -1 to next roll") || desc.includes("all heroes suffer -1 to rolls")) {
    const updatedHeroes = newState.party.heroes.map(h => h.alive ? { ...h, perTurnFlags: { ...h.perTurnFlags, minusOneNextRoll: true } } : h);
    newState = { ...newState, party: { ...newState.party, heroes: updatedHeroes } };
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `All Heroes -1 to next roll!`, {});
  }

  return newState;
}

// ─── Debuff Application from Effect Description ──────────────────────────────

function applyDebuffsFromEffect(
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
