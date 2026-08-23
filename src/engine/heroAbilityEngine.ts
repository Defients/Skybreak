import type { GameState } from "../types/gameState";
import type { HeroState, PetState } from "../types/heroes";
import type { MatchResult } from "../types/combat";
import type { Card } from "../types/cards";
import { RngEngine } from "../utils/random";
import { emitEvent } from "./eventLog";
import { getLivingHeroes, getHeroById, selectTargetByPriority } from "./rulesEngine";
import {
  calculateDamage,
  applyDamage,
  applyHealing,
  addToken,
  checkCombatEnd,
  flipPeonCards,
  detectMatches,
} from "./combatEngine";
import { createShieldToken, createDebuffStatus, createBuffStatus, createTargetToken } from "../data/tokens";
import { CLASS_DATA } from "../data/classes";
import { WOLF_TABLE, BEAR_TABLE } from "../data/monsters";
import { generateId } from "../utils/ids";
import { weaponHasTag, itemHasTag, findItemByTag } from "../utils/tagMatchers";

export interface HeroActionResult {
  state: GameState;
  cards: Card[];
  matches: MatchResult[];
}

export function executeHeroAction(
  state: GameState,
  rng: RngEngine,
  heroId: string,
  targetId?: string
): HeroActionResult {
  if (!state.combat) return { state, cards: [], matches: [] };

  let newState = state;
  const hero = getHeroById(newState, heroId);
  if (!hero || !hero.alive) return { state: newState, cards: [], matches: [] };

  newState = emitEvent(newState, "TURN_STARTED", `${hero.name}'s turn begins.`, {
    actorId: heroId,
    details: { heroName: hero.name, round: newState.combat!.round },
  });

  // Apply start-of-turn effects (Poison, Burn, Regeneration) per rules Section 11.2 steps 1-2
  const startHero = getHeroById(newState, heroId);
  if (startHero && startHero.alive) {
    if (startHero.debuffs.some(d => d.name === "Poison")) {
      const r = applyDamage(newState, heroId, "poison", calculateDamage({ base: 1 }), false);
      newState = r.state;
      newState = emitEvent(newState, "DAMAGE_APPLIED", `${startHero.name} takes 1 Poison damage!`, { targetIds: [heroId], details: { poison: true } });
    }
    const burn = startHero.debuffs.find(d => d.name === "Burn");
    if (burn) {
      const r = applyDamage(newState, heroId, "burn", calculateDamage({ base: 1 }), false);
      newState = r.state;
      newState = emitEvent(newState, "DAMAGE_APPLIED", `${startHero.name} takes 1 Burn damage!`, { targetIds: [heroId], details: { burn: true } });
    }
    if (startHero.buffs.some(b => b.name === "Regeneration")) {
      newState = applyHealing(newState, heroId, 1);
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${startHero.name} regenerates 1 HP!`, { targetIds: [heroId], details: { regen: true } });
    }
    const updatedHero = getHeroById(newState, heroId);
    if (!updatedHero || !updatedHero.alive) {
      return { state: newState, cards: [], matches: [] };
    }
  }

  // Skip next turn check (from monster abilities)
  if (hero.perTurnFlags["skipNextTurn"]) {
    const skipTwo = hero.perTurnFlags["skipTwoTurns"];
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name} skips this turn!`, {
      actorId: heroId,
      details: { skipped: true },
    });
    const clearedHeroes = newState.party.heroes.map(h => {
      if (h.id !== heroId) return h;
      const flags: Record<string, boolean> = { ...h.perTurnFlags, skipNextTurn: false };
      if (skipTwo) {
        flags.skipNextTurn = true;
        flags.skipTwoTurns = false;
      }
      return { ...h, perTurnFlags: flags };
    });
    newState = { ...newState, party: { ...newState.party, heroes: clearedHeroes } };
    return { state: newState, cards: [], matches: [] };
  }

  // Freeze check: must roll 4+ to act
  const frozen = hero.debuffs.find(d => d.name === "Freeze");
  if (frozen) {
    const freezeRoll = rng.rollD6(`freeze_check_${hero.name}`);
    if (freezeRoll.total < 4) {
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name} is frozen and cannot act! (rolled ${freezeRoll.total})`, {
        actorId: heroId,
        details: { frozen: true, roll: freezeRoll.total },
      });
      return { state: newState, cards: [], matches: [] };
    } else {
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name} breaks free from Freeze! (rolled ${freezeRoll.total})`, {
        actorId: heroId,
        details: { frozen: false, roll: freezeRoll.total },
      });
    }
  }

  // Stun check: skip action
  const stunned = hero.debuffs.find(d => d.name === "Stun");
  if (stunned) {
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name} is stunned and skips this action!`, {
      actorId: heroId,
      details: { stunned: true },
    });
    return { state: newState, cards: [], matches: [] };
  }

  // Petrify check: skip action
  const petrified = hero.debuffs.find(d => d.name === "Petrify");
  if (petrified) {
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name} is petrified and skips this action!`, {
      actorId: heroId,
      details: { petrified: true },
    });
    return { state: newState, cards: [], matches: [] };
  }

  // Trap check (Minotaur Labyrinth): must roll 5+ to escape
  if (hero.perTurnFlags["trapped"]) {
    const trapRoll = rng.rollD6(`trap_escape_${hero.name}`);
    if (trapRoll.total < 5) {
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name} is trapped and cannot act! (rolled ${trapRoll.total}, need 5+)`, {
        actorId: heroId,
        details: { trapped: true, roll: trapRoll.total },
      });
      return { state: newState, cards: [], matches: [] };
    } else {
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name} escapes the trap! (rolled ${trapRoll.total})`, {
        actorId: heroId,
        details: { trapped: false, roll: trapRoll.total },
      });
      const clearedHeroes = newState.party.heroes.map(h =>
        h.id === heroId ? { ...h, perTurnFlags: { ...h.perTurnFlags, trapped: false } } : h
      );
      newState = { ...newState, party: { ...newState.party, heroes: clearedHeroes } };
    }
  }

  // Reset Bladedancer combo counter at start of hero action (per-turn combo)
  if (newState.combat) {
    newState = { ...newState, combat: { ...newState.combat, heroComboCount: 0 } };
  }

  // Flip peon cards
  const { state: flipState, cards } = flipPeonCards(newState, heroId, rng);
  newState = flipState;

  const matches = detectMatches(hero.apcs, cards);
  if (matches[0].type !== "none") {
    // Chain Match: increment match chain counter (persists across turns), grant +2 to next roll at 3+ consecutive matches
    if (newState.combat) {
      const chain = (newState.combat.matchChainCount ?? 0) + 1;
      newState = { ...newState, combat: { ...newState.combat, matchChainCount: chain } };
      if (chain >= 3) {
        matches[0] = { ...matches[0], rollBonus: matches[0].rollBonus + 2, description: `${matches[0].description} [CHAIN x${chain}! +2 to roll]` };
        newState = emitEvent(newState, "ABILITY_TRIGGERED", `Chain Match x${chain}! +2 to roll!`, { actorId: heroId });
      }
    }
    newState = emitEvent(newState, "MATCH_DETECTED", matches[0].description, {
      actorId: heroId,
      details: { matchType: matches[0].type, matchedApcs: matches[0].matchedApcs.map(a => a.rank) },
    });
    // Trigger specialization ability on class-card match (once per combat)
    newState = triggerSpecializationAbility(newState, rng, hero, targetId);
  } else {
    // No match — reset match chain counter
    if (newState.combat) {
      newState = { ...newState, combat: { ...newState.combat, matchChainCount: 0 } };
    }
  }

  // Roll and resolve
  newState = resolveHeroRoll(newState, rng, hero, matches, targetId, 0);

  // Pet turn: if hero is a Tracker with a living pet, pet acts immediately after
  const updatedHero = getHeroById(newState, heroId);
  if (updatedHero?.pet?.alive && updatedHero.className === "Tracker") {
    newState = executePetTurn(newState, rng, updatedHero, targetId);
  }
  // Beastmaster's Pride: second pet also acts
  const updatedHero2 = getHeroById(newState, heroId);
  if (updatedHero2?.secondPet?.alive && weaponHasTag(updatedHero2, "beastmasters_pride")) {
    const secondPetHero = { ...updatedHero2, pet: updatedHero2.secondPet };
    newState = executePetTurn(newState, rng, secondPetHero, targetId);
  }

  // Clear per-turn flags
  const clearedHeroes = newState.party.heroes.map(h =>
    h.id === heroId ? { ...h, perTurnFlags: { ...h.perTurnFlags, minusOneNextRoll: false } } : h
  );
  newState = { ...newState, party: { ...newState.party, heroes: clearedHeroes } };

  return { state: newState, cards, matches };
}

function resolveHeroRoll(
  state: GameState,
  rng: RngEngine,
  hero: HeroState,
  matches: MatchResult[],
  targetId: string | undefined,
  rerollCount: number
): GameState {
  let newState = state;
  const classData = CLASS_DATA[hero.className];

  const roll = rng.rollD6(`hero_action_${hero.name}${rerollCount > 0 ? `_reroll${rerollCount}` : ""}`);
  const rollEntry = classData.rollTable.find(r => r.roll === roll.total);
  const actionName = rollEntry?.effect ?? "Unknown";
  const actionDesc = rollEntry?.description ?? "";

  // Calculate roll modifiers
  let rollMods = 0;
  const fear = hero.debuffs.find(d => d.name === "Fear");
  if (fear) rollMods -= 1;
  const haste = hero.buffs.find(b => b.name === "Haste");
  if (haste) {
    rollMods += 1;
    const updatedHeroes = newState.party.heroes.map(h =>
      h.id === hero.id ? { ...h, buffs: h.buffs.map(b => b.name === "Haste" ? { ...b, duration: b.duration - 1 } : b).filter(b => b.duration > 0) } : h
    );
    newState = { ...newState, party: { ...newState.party, heroes: updatedHeroes } };
  }
  const illusion = hero.debuffs.find(d => d.name === "Illusion");
  if (illusion) rollMods -= 2;
  if (newState.combat?.monster.specialState["pixieSwarm"]) {
    const pixiesAlive = newState.combat.summons.some(s => s.name === "Pixie" && s.alive);
    if (pixiesAlive) rollMods -= 1;
  }
  if (hero.perTurnFlags["minusOneNextRoll"]) rollMods -= 1;
  if (hero.debuffs.some(d => d.name === "Slow")) rollMods -= 2;

  // Enchantment: Precise — +1 to all attack rolls
  if (hero.enchantment?.name === "Precise") rollMods += 1;

  // Upgrade: Lucky Dice — +1 to all rolls
  if (hero.upgrades.some(u => u.name === "Lucky Dice")) rollMods += 1;

  // Focus buff: +2 to rolls (decrement uses)
  const focus = hero.buffs.find(b => b.name === "Focus");
  if (focus) {
    rollMods += 2;
    const updatedHeroes = newState.party.heroes.map(h =>
      h.id === hero.id ? { ...h, buffs: h.buffs.map(b => b.name === "Focus" ? { ...b, duration: b.duration - 1 } : b).filter(b => b.duration > 0) } : h
    );
    newState = { ...newState, party: { ...newState.party, heroes: updatedHeroes } };
  }

  // Match roll bonus (set matches give +1 to roll)
  const matchRollBonus = matches[0]?.rollBonus || 0;
  rollMods += matchRollBonus;

  // Environment bonuses
  const env = newState.combat?.environment;
  if (env) {
    if (env.suit === "hearts" && !(newState.combat?.heroFirstRollDone?.[hero.id])) {
      rollMods += 2;
      // Mark that this hero has used their first roll bonus
      if (newState.combat) {
        newState = { ...newState, combat: { ...newState.combat, heroFirstRollDone: { ...newState.combat.heroFirstRollDone, [hero.id]: true } } };
      }
    }
    if (env.suit === "spades") {
      const isBlackSpec = hero.specialization === "Shadowblade" || hero.specialization === "Timebender" ||
        hero.specialization === "Huntmaster" || hero.specialization === "Sentinel";
      if (isBlackSpec) rollMods += 1;
    }
  }

  const modifiedRoll = Math.max(1, Math.min(6, roll.total + rollMods));

  // Swift enchantment: mark that hero can reroll this turn (UI checks this flag)
  if (hero.enchantment?.name === "Swift" && rerollCount === 0) {
    newState = {
      ...newState,
      party: {
        ...newState.party,
        heroes: newState.party.heroes.map(h =>
          h.id === hero.id ? { ...h, perTurnFlags: { ...h.perTurnFlags, swiftRerollAvailable: true } } : h
        ),
      },
    };
  }

  // Swift Blade weapon: reroll any result of 1 (flag for UI)
  if (weaponHasTag(hero, "swift_blade") && rerollCount === 0 && roll.total === 1) {
    newState = {
      ...newState,
      party: {
        ...newState.party,
        heroes: newState.party.heroes.map(h =>
          h.id === hero.id ? { ...h, perTurnFlags: { ...h.perTurnFlags, swiftBladeRerollAvailable: true } } : h
        ),
      },
    };
  }

  newState = emitEvent(newState, "DICE_ROLLED", `${hero.name} rolled ${roll.total}${rollMods !== 0 ? ` (modified: ${modifiedRoll})` : ""}. Action: ${actionName}.`, {
    actorId: hero.id,
    details: { rawRoll: roll.total, modifiedRoll, action: actionName, description: actionDesc, reroll: rerollCount },
  });

  const modifiedEntry = classData.rollTable.find(r => r.roll === modifiedRoll) ?? rollEntry;
  if (!modifiedEntry || !targetId) return newState;

  const desc = modifiedEntry.description.toLowerCase();
  const effectName = modifiedEntry.effect.toLowerCase();
  const effectKey = modifiedEntry.effectKey ?? "";

  // Store current roll for enchantment effects in applyHeroDamage
  if (newState.combat) {
    newState = { ...newState, combat: { ...newState.combat, currentHeroRoll: modifiedRoll } };
  }

  // Enchantment: Defensive — gain 1 shield on rolls 1-2
  if (hero.enchantment?.name === "Defensive" && modifiedRoll <= 2) {
    newState = addToken(newState, hero.id, createShieldToken(1), false);
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Defensive enchantment! Gained 1 shield.`, { actorId: hero.id, targetIds: [hero.id] });
  }

  // Enchantment: Chaotic — roll d6 for random effect
  if (hero.enchantment?.name === "Chaotic") {
    const chaoticRoll = rng.rollD6(`chaotic_${hero.name}`);
    switch (chaoticRoll.total) {
      case 1: // +2 damage
        newState = { ...newState, combat: { ...newState.combat!, currentHeroRoll: modifiedRoll } };
        // Temporarily boost damage by adding a Might-like buff for 1 use
        const chaoticMight = newState.party.heroes.map(h =>
          h.id === hero.id ? { ...h, buffs: [...h.buffs, createBuffStatus("Might", 1)] } : h
        );
        newState = { ...newState, party: { ...newState.party, heroes: chaoticMight } };
        newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Chaotic! +2 damage!`, { actorId: hero.id, targetIds: [hero.id] });
        break;
      case 2: // Heal self 2 HP
        newState = applyHealing(newState, hero.id, 2);
        newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Chaotic! Healed 2 HP!`, { actorId: hero.id, targetIds: [hero.id] });
        break;
      case 3: // Enemy loses 1 APC
        if (newState.combat?.monster.apcs && newState.combat.monster.apcs.length > 0) {
          const combat = { ...newState.combat! };
          combat.monster = { ...combat.monster, apcs: combat.monster.apcs.slice(0, -1) };
          newState = { ...newState, combat };
        }
        newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Chaotic! Enemy loses 1 APC!`, { actorId: hero.id, targetIds: [newState.combat!.monster.id] });
        break;
      case 4: // Gain 1 shield
        newState = addToken(newState, hero.id, createShieldToken(1), false);
        newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Chaotic! Gained 1 shield!`, { actorId: hero.id, targetIds: [hero.id] });
        break;
      case 5: // Deal damage twice — set flag for double damage
        newState = { ...newState, combat: { ...newState.combat!, currentHeroRoll: modifiedRoll } };
        // We'll handle this by adding a temporary Might buff to simulate extra hit
        const chaoticDouble = newState.party.heroes.map(h =>
          h.id === hero.id ? { ...h, buffs: [...h.buffs, createBuffStatus("Might", 1)] } : h
        );
        newState = { ...newState, party: { ...newState.party, heroes: chaoticDouble } };
        newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Chaotic! Double damage!`, { actorId: hero.id, targetIds: [hero.id] });
        break;
      case 6: // All allies gain Haste
        const hasted = newState.party.heroes.map(h =>
          h.alive ? { ...h, buffs: [...h.buffs, createBuffStatus("Haste", 2)] } : h
        );
        newState = { ...newState, party: { ...newState.party, heroes: hasted } };
        newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Chaotic! All allies gain Haste!`, { actorId: hero.id });
        break;
    }
  }

  // Dispatch to class-specific handlers
  switch (hero.className) {
    case "Bladedancer":
      newState = resolveBladedancer(newState, rng, hero, desc, effectName, effectKey, matches, targetId, modifiedRoll, rerollCount);
      break;
    case "Manipulator":
      newState = resolveManipulator(newState, rng, hero, desc, effectName, effectKey, matches, targetId, modifiedRoll, rerollCount);
      break;
    case "Tracker":
      newState = resolveTracker(newState, rng, hero, desc, effectName, effectKey, matches, targetId, modifiedRoll, rerollCount);
      break;
    case "Guardian":
      newState = resolveGuardian(newState, rng, hero, desc, effectName, effectKey, matches, targetId, modifiedRoll, rerollCount);
      break;
    default:
      newState = applyBasicHeroDamage(newState, hero, desc, matches, targetId);
      break;
  }

  // Post-action: check combat end
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

// ─── Damage Application Helper ──────────────────────────────────────────────

function applyHeroDamage(
  state: GameState,
  hero: HeroState,
  baseDamage: number,
  matches: MatchResult[],
  targetId: string,
  isDouble: boolean = false,
  _modifiedRoll: number = 0
): { state: GameState; killed: boolean } {
  let newState = state;
  const matchBonus = matches[0]?.bonusDamage || 0;
  const enchantment = hero.enchantment;
  const modifiedRoll = newState.combat?.currentHeroRoll ?? 0;
  const targetTokens = newState.combat!.monster.tokens;
  const targetToken = targetTokens.find(t => t.type === "target");
  const tokenBonus = targetToken ? 1 : 0;

  // Weapon bonus
  let weaponBonus = 0;
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
  const result = applyDamage(newState, isMonster ? newState.combat!.monster.id : targetId, hero.id, breakdown, isMonster);
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
    newState = emitEvent(newState, "DAMAGE_APPLIED", `Ooze Trail: ${hero.name} takes 1 reflect damage! (rolled ${modifiedRoll})`, { targetIds: [hero.id] });
  }
  // Thorns reflect
  if (isMonster && newState.combat?.monster.specialState["thorns"]) {
    newState = applyDamage(newState, hero.id, newState.combat.monster.id, calculateDamage({ base: 1 }), false).state;
    newState = emitEvent(newState, "DAMAGE_APPLIED", `Thorns: ${hero.name} takes 1 thorn damage!`, { targetIds: [hero.id] });
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

function applyBasicHeroDamage(
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

function extractBaseDamage(desc: string): number {
  const match = desc.match(/deal (\d+) damage/);
  return match ? parseInt(match[1]) : 0;
}

// ─── Bladedancer ────────────────────────────────────────────────────────────

function resolveBladedancer(
  state: GameState,
  rng: RngEngine,
  hero: HeroState,
  desc: string,
  effectName: string,
  effectKey: string,
  matches: MatchResult[],
  targetId: string,
  modifiedRoll: number,
  rerollCount: number
): GameState {
  let newState = state;

  // Moonshadow Shiv: on 1-4, gain stealth (1 shield + untargetable); on 5-6, break stealth for +3 damage
  const hasMoonshadow = weaponHasTag(hero, "moonshadow_shiv");
  if (hasMoonshadow) {
    if (modifiedRoll <= 4) {
      newState = addToken(newState, hero.id, createShieldToken(1), false);
      newState = {
        ...newState,
        party: {
          ...newState.party,
          heroes: newState.party.heroes.map(h =>
            h.id === hero.id ? { ...h, perTurnFlags: { ...h.perTurnFlags, moonshadowStealth: true } } : h
          ),
        },
      };
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Moonshadow Shiv! Stealth active (shield + untargetable).`, { actorId: hero.id, targetIds: [hero.id] });
    } else {
      // Roll 5-6: break stealth for +3 damage
      const hasStealth = hero.perTurnFlags["moonshadowStealth"];
      if (hasStealth) {
        newState = {
          ...newState,
          party: {
            ...newState.party,
            heroes: newState.party.heroes.map(h =>
              h.id === hero.id ? { ...h, perTurnFlags: { ...h.perTurnFlags, moonshadowStealth: false } } : h
            ),
          },
        };
        newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Moonshadow Shiv! Breaking stealth for +3 damage!`, { actorId: hero.id, targetIds: [newState.combat!.monster.id] });
        newState = applyHeroDamage(newState, hero, 3, matches, targetId).state;
      }
    }
  }

  if (effectKey === "quick_strike") {
    newState = applyBasicHeroDamage(newState, hero, desc, matches, targetId);
  } else if (effectKey === "dodge") {
    newState = addToken(newState, hero.id, createShieldToken(1), false);
    newState = applyBasicHeroDamage(newState, hero, desc, matches, targetId);
  } else if (effectKey === "precision") {
    // Deal 3 damage, or 4 if any ⚫ Buff is active
    const hasBuff = hero.buffs.length > 0 || hero.tokens.some(t => t.type === "buff");
    const dmg = hasBuff ? 4 : 3;
    newState = applyHeroDamage(newState, hero, dmg, matches, targetId).state;
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Precision — ${dmg} damage${hasBuff ? " (buff active)" : ""}`, { actorId: hero.id });
  } else if (effectKey === "eviscerate") {
    // Deal 3 damage; roll again. On 5–6, crit for double damage
    const result = applyHeroDamage(newState, hero, 3, matches, targetId);
    newState = result.state;
    const critRoll = rng.rollD6(`eviscerate_crit_${hero.name}`);
    if (critRoll.total >= 5) {
      newState = applyHeroDamage(newState, hero, 3, matches, targetId, true).state;
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Eviscerate crit! Double damage! (rolled ${critRoll.total})`, { actorId: hero.id });
    } else {
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Eviscerate — no crit (rolled ${critRoll.total})`, { actorId: hero.id });
    }
  } else if (effectKey === "execute") {
    // Deal 4 damage; instant kill if target has ≤5 HP (≤7 HP with Fyrizul)
    const executeThreshold = weaponHasTag(hero, "fyrizul") ? 7 : 5;
    const isMonster = targetId === newState.combat!.monster.id || targetId === "monster";
    if (isMonster) {
      const monsterHp = newState.combat!.monster.currentHp;
      if (monsterHp <= executeThreshold) {
        // Instant kill
        const combat = { ...newState.combat! };
        combat.monster = { ...combat.monster, currentHp: 0, alive: false };
        newState = { ...newState, combat };
        newState = emitEvent(newState, "MONSTER_DEFEATED", `${hero.name}: Execute! Instant kill on ${combat.monster.name} (≤${executeThreshold} HP)!`, {
          actorId: hero.id,
          targetIds: [combat.monster.id],
          details: { execute: true, monsterHp },
        });
      } else {
        newState = applyHeroDamage(newState, hero, 4, matches, targetId).state;
        newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Execute — target above 5 HP, dealing 4 damage`, { actorId: hero.id });
      }
    } else {
      newState = applyHeroDamage(newState, hero, 4, matches, targetId).state;
    }
  } else if (effectKey === "blade_dance") {
    // Deal 3 damage, then roll again, maximum 2 total rerolls
    newState = applyHeroDamage(newState, hero, 3, matches, targetId).state;
    if (rerollCount < 2) {
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Blade Dance! Rerolling (reroll ${rerollCount + 1}/2)`, { actorId: hero.id });
      const updatedHero = getHeroById(newState, hero.id);
      if (updatedHero) {
        newState = resolveHeroRoll(newState, rng, updatedHero, matches, targetId, rerollCount + 1);
      }
    }
  } else {
    newState = applyBasicHeroDamage(newState, hero, desc, matches, targetId);
  }

  // Frostbite Dagger: on rolls 1-3, apply Freeze (max 3 stacks); on rolls 1-2, roll again
  if (weaponHasTag(hero, "frostbite_dagger") && rerollCount < 2) {
    const isMonster = targetId === newState.combat!.monster.id || targetId === "monster";
    if (isMonster && modifiedRoll <= 3) {
      const combat = { ...newState.combat! };
      const freezeStacks = combat.monster.debuffs.filter(d => d.name === "Freeze").length;
      if (freezeStacks < 3 && !newState.combat!.monster.specialState["debuffImmune"]) {
        combat.monster = { ...combat.monster, debuffs: [...combat.monster.debuffs, createDebuffStatus("Freeze", 99)] };
        newState = { ...newState, combat };
        newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Frostbite Dagger! Freeze applied (${freezeStacks + 1}/3 stacks).`, { actorId: hero.id });
      }
      if (modifiedRoll <= 2) {
        newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Frostbite Dagger! Rerolling (roll was ${modifiedRoll}).`, { actorId: hero.id });
        const updatedHero = getHeroById(newState, hero.id);
        if (updatedHero) {
          newState = resolveHeroRoll(newState, rng, updatedHero, matches, targetId, rerollCount + 1);
        }
      }
    }
  }

  return newState;
}

// ─── Manipulator ────────────────────────────────────────────────────────────

function resolveManipulator(
  state: GameState,
  rng: RngEngine,
  hero: HeroState,
  desc: string,
  effectName: string,
  effectKey: string,
  matches: MatchResult[],
  targetId: string,
  modifiedRoll: number,
  rerollCount: number
): GameState {
  let newState = state;

  if (effectKey === "mind_spike") {
    // Crystal Wand: Mind Spike improves to 3 damage
    if (weaponHasTag(hero, "crystal_wand")) {
      newState = applyHeroDamage(newState, hero, 3, matches, targetId).state;
    } else {
      newState = applyBasicHeroDamage(newState, hero, desc, matches, targetId);
    }
  } else if (effectKey === "mind_flay") {
    // Deal 1 damage; keep rolling while result is even, dealing +1 damage each time
    let totalDamage = 1;
    let flayRoll = rng.rollD6(`mindflay_${hero.name}_0`);
    let flayCount = 0;
    while (flayRoll.total % 2 === 0 && flayCount < 10) {
      totalDamage += 1;
      flayCount++;
      flayRoll = rng.rollD6(`mindflay_${hero.name}_${flayCount}`);
    }
    newState = applyHeroDamage(newState, hero, totalDamage, matches, targetId).state;
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Mind Flay — ${totalDamage} total damage (${flayCount} even rolls)`, { actorId: hero.id });
  } else if (effectKey === "psychic_drain") {
    // Deal 3 damage and heal self (1 HP, or 3 HP with Celestial Scepter)
    const drainHeal = weaponHasTag(hero, "celestial_scepter") ? 3 : 1;
    newState = applyHeroDamage(newState, hero, 3, matches, targetId).state;
    newState = applyHealing(newState, hero.id, drainHeal);
  } else if (effectKey === "telekinesis") {
    // Roll d6. On 1–3, deal 2 damage. On 4–6, deal 4 damage
    // Astril Rod: 1-2=3, 3-4=4, 5-6=5
    const tkRoll = rng.rollD6(`telekinesis_${hero.name}`);
    let tkDamage: number;
    if (weaponHasTag(hero, "astril_rod")) {
      tkDamage = tkRoll.total <= 2 ? 3 : tkRoll.total <= 4 ? 4 : 5;
    } else {
      tkDamage = tkRoll.total <= 3 ? 2 : 4;
    }
    newState = applyHeroDamage(newState, hero, tkDamage, matches, targetId).state;
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Telekinesis — ${tkDamage} damage (rolled ${tkRoll.total})`, { actorId: hero.id });
  } else if (effectKey === "mind_control") {
    // Force monster to damage itself for 4
    const isMonster = targetId === newState.combat!.monster.id || targetId === "monster";
    if (isMonster) {
      const result = applyDamage(newState, newState.combat!.monster.id, newState.combat!.monster.id, calculateDamage({ base: 4 }), true);
      newState = result.state;
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Mind Control! Monster damages itself for 4!`, { actorId: hero.id });
      // Void Staff: Mind Control affects all enemies with debuffs (extra 2 damage to debuffed summons)
      if (weaponHasTag(hero, "void_staff")) {
        for (const summon of newState.combat!.summons.filter(s => s.alive && s.debuffs.length > 0)) {
          newState = applyDamage(newState, summon.id, hero.id, calculateDamage({ base: 2 }), true).state;
        }
        newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Void Staff! Extra 2 damage to all debuffed enemies!`, { actorId: hero.id });
      }
    } else {
      newState = applyHeroDamage(newState, hero, 4, matches, targetId).state;
    }
  } else if (effectKey === "psionic_storm") {
    // Deal 5 damage and heal all allies (1 HP, or 3 HP with Eternal Starweaver)
    const stormHeal = weaponHasTag(hero, "eternal_starweaver") ? 3 : 1;
    newState = applyHeroDamage(newState, hero, 5, matches, targetId).state;
    for (const h of getLivingHeroes(newState)) {
      newState = applyHealing(newState, h.id, stormHeal);
    }
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Psionic Storm! 5 damage and all allies heal ${stormHeal} HP`, { actorId: hero.id });
  } else {
    newState = applyBasicHeroDamage(newState, hero, desc, matches, targetId);
  }

  return newState;
}

// ─── Tracker ────────────────────────────────────────────────────────────────

function resolveTracker(
  state: GameState,
  rng: RngEngine,
  hero: HeroState,
  desc: string,
  effectName: string,
  effectKey: string,
  matches: MatchResult[],
  targetId: string,
  modifiedRoll: number,
  rerollCount: number
): GameState {
  let newState = state;

  // Sturdy Crossbow: Aimed Shot triggers on 3+ (rolls 1-2 become Aimed Shot instead)
  const hasSturdyCrossbow = weaponHasTag(hero, "sturdy_crossbow");
  if (hasSturdyCrossbow && (effectKey === "quick_shot" || effectKey === "between_the_eyes")) {
    newState = applyHeroDamage(newState, hero, 4, matches, targetId).state;
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Sturdy Crossbow — Aimed Shot (4 damage)!`, { actorId: hero.id });
    return newState;
  }

  if (effectKey === "quick_shot") {
    newState = applyBasicHeroDamage(newState, hero, desc, matches, targetId);
  } else if (effectKey === "between_the_eyes") {
    // Deal 2 damage, or 3 if target is below 50% HP
    const isMonster = targetId === newState.combat!.monster.id || targetId === "monster";
    let targetHp = 0;
    let targetMaxHp = 0;
    if (isMonster) {
      targetHp = newState.combat!.monster.currentHp;
      targetMaxHp = newState.combat!.monster.maxHp;
    } else {
      const target = getHeroById(newState, targetId);
      if (target) { targetHp = target.currentHp; targetMaxHp = target.maxHp; }
    }
    const isBelowHalf = targetMaxHp > 0 && targetHp <= Math.floor(targetMaxHp / 2);
    const dmg = isBelowHalf ? 3 : 2;
    newState = applyHeroDamage(newState, hero, dmg, matches, targetId).state;
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Between the Eyes — ${dmg} damage${isBelowHalf ? " (target below 50% HP)" : ""}`, { actorId: hero.id });
  } else if (effectKey === "aimed_shot") {
    newState = applyHeroDamage(newState, hero, 4, matches, targetId).state;
    // Thunderstrike: even roll = Stun, odd roll = +30g
    if (weaponHasTag(hero, "thunderstrike")) {
      const isMonster = targetId === newState.combat!.monster.id || targetId === "monster";
      if (isMonster) {
        if (modifiedRoll % 2 === 0) {
          if (newState.combat!.monster.specialState["debuffImmune"]) {
            newState = emitEvent(newState, "ABILITY_TRIGGERED", `${newState.combat!.monster.name} is immune to debuffs!`, { actorId: hero.id });
          } else {
            const combat = { ...newState.combat! };
            combat.monster = { ...combat.monster, debuffs: [...combat.monster.debuffs, createDebuffStatus("Stun", 1)] };
            newState = { ...newState, combat };
            newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Thunderstrike! Aimed Shot stuns!`, { actorId: hero.id });
          }
        } else {
          newState = { ...newState, party: { ...newState.party, gold: newState.party.gold + 30 } };
          newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Thunderstrike! Aimed Shot generates +30g!`, { actorId: hero.id });
        }
      }
    }
  } else if (effectKey === "trap") {
    // Deal 3 damage and apply Slow / skip next turn
    newState = applyHeroDamage(newState, hero, 3, matches, targetId).state;
    const isMonster = targetId === newState.combat!.monster.id || targetId === "monster";
    if (isMonster) {
      // Apply Slow debuff to monster — represented as a debuff on monster
      if (newState.combat!.monster.specialState["debuffImmune"]) {
        newState = emitEvent(newState, "ABILITY_TRIGGERED", `${newState.combat!.monster.name} is immune to debuffs!`, { actorId: hero.id });
      } else {
        const combat = { ...newState.combat! };
        combat.monster = {
          ...combat.monster,
          debuffs: [...combat.monster.debuffs, createDebuffStatus("Slow", 99)],
          specialState: { ...combat.monster.specialState, skipNextTurn: true },
        };
        newState = { ...newState, combat };
        newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Trap! Monster slowed and skips next turn!`, { actorId: hero.id });
      }
    }
  } else if (effectKey === "power_shot") {
    newState = applyHeroDamage(newState, hero, 5, matches, targetId).state;
  } else if (effectKey === "rapid_fire") {
    // Deal 2 damage twice, same or split target
    newState = applyHeroDamage(newState, hero, 2, matches, targetId).state;
    // Second hit to same target (UI could allow split, but default to same)
    const stillAlive = newState.combat?.monster.alive;
    if (stillAlive || targetId !== newState.combat?.monster.id) {
      newState = applyHeroDamage(newState, hero, 2, matches, targetId).state;
    }
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Rapid Fire! Two hits for 2 damage each`, { actorId: hero.id });
  } else {
    newState = applyBasicHeroDamage(newState, hero, desc, matches, targetId);
  }

  return newState;
}

// ─── Guardian ───────────────────────────────────────────────────────────────

function resolveGuardian(
  state: GameState,
  rng: RngEngine,
  hero: HeroState,
  desc: string,
  effectName: string,
  effectKey: string,
  matches: MatchResult[],
  targetId: string,
  modifiedRoll: number,
  rerollCount: number
): GameState {
  let newState = state;

  if (effectKey === "shield_bash") {
    // Deal 1 damage and gain 1 shield
    newState = applyHeroDamage(newState, hero, 1, matches, targetId).state;
    newState = addToken(newState, hero.id, createShieldToken(1), false);
  } else if (effectKey === "defensive_stance") {
    // Deal 1 damage and all allies gain 1 shield
    newState = applyHeroDamage(newState, hero, 1, matches, targetId).state;
    for (const h of getLivingHeroes(newState)) {
      newState = addToken(newState, h.id, createShieldToken(1), false);
    }
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Defensive Stance! All allies gain 1 shield`, { actorId: hero.id });
  } else if (effectKey === "heavy_strike") {
    newState = applyHeroDamage(newState, hero, 3, matches, targetId).state;
  } else if (effectKey === "rally") {
    // All allies heal 2 HP (3 with Soldier's Sword), then roll again
    const rallyHeal = weaponHasTag(hero, "soldiers_sword") ? 3 : 2;
    for (const h of getLivingHeroes(newState)) {
      newState = applyHealing(newState, h.id, rallyHeal);
    }
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Rally! All allies heal ${rallyHeal} HP. Rerolling!`, { actorId: hero.id });
    if (rerollCount < 2) {
      const updatedHero = getHeroById(newState, hero.id);
      if (updatedHero) {
        newState = resolveHeroRoll(newState, rng, updatedHero, matches, targetId, rerollCount + 1);
      }
    }
  } else if (effectKey === "retribution") {
    // Deal 4 damage and heal lowest HP ally 3 HP
    newState = applyHeroDamage(newState, hero, 4, matches, targetId).state;
    const livingHeroes = getLivingHeroes(newState);
    if (livingHeroes.length > 0) {
      const lowest = selectTargetByPriority(livingHeroes, "lowest");
      if (lowest) {
        newState = applyHealing(newState, lowest.id, 3);
        newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Retribution! Healed ${lowest.name} for 3 HP`, { actorId: hero.id });
      }
    }
  } else if (effectKey === "fortress") {
    // Deal 5 damage and become immune next turn
    newState = applyHeroDamage(newState, hero, 5, matches, targetId).state;
    const hasFortressGate = weaponHasTag(hero, "fortress_gate");
    if (hasFortressGate) {
      // Fortress Gate: Fortress makes entire party immune
      const updatedHeroes = newState.party.heroes.map(h =>
        h.alive ? { ...h, perTurnFlags: { ...h.perTurnFlags, immuneNextTurn: true } } : h
      );
      newState = { ...newState, party: { ...newState.party, heroes: updatedHeroes } };
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Fortress! Entire party immune next turn! (Fortress Gate)`, { actorId: hero.id });
    } else {
      const updatedHeroes = newState.party.heroes.map(h =>
        h.id === hero.id ? { ...h, perTurnFlags: { ...h.perTurnFlags, immuneNextTurn: true } } : h
      );
      newState = { ...newState, party: { ...newState.party, heroes: updatedHeroes } };
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Fortress! Immune next turn!`, { actorId: hero.id });
    }
  } else {
    newState = applyBasicHeroDamage(newState, hero, desc, matches, targetId);
  }

  return newState;
}

// ─── Specialization Ability Triggers ────────────────────────────────────────

function triggerSpecializationAbility(
  state: GameState,
  rng: RngEngine,
  hero: HeroState,
  targetId?: string
): GameState {
  let newState = state;
  const unlockBothSpecs = weaponHasTag(hero, "dual_spec");

  const triggerKey = `spec_${hero.className}_${hero.specialization}`;
  if (hero.oncePerCombat[triggerKey]) return newState;

  // Determine alternate specialization for dual-spec weapons
  const altSpecMap: Record<string, string> = {
    Shadowblade: "Runeblade", Runeblade: "Shadowblade",
    Timebender: "Illusionist", Illusionist: "Timebender",
    Huntmaster: "Beastcaller", Beastcaller: "Huntmaster",
    Sentinel: "Warden", Warden: "Sentinel",
  };
  const altSpec = unlockBothSpecs ? altSpecMap[hero.specialization] : undefined;
  const altTriggerKey = altSpec ? `spec_${hero.className}_${altSpec}` : undefined;
  const altAlreadyUsed = altTriggerKey ? hero.oncePerCombat[altTriggerKey] : false;

  newState = executeSpecAbility(newState, rng, hero, hero.specialization, targetId);

  // Mark primary spec as used
  const primaryMarked = newState.party.heroes.map(h =>
    h.id === hero.id ? { ...h, oncePerCombat: { ...h.oncePerCombat, [triggerKey]: true } } : h
  );
  newState = { ...newState, party: { ...newState.party, heroes: primaryMarked } };

  // Trigger alternate specialization if dual-spec weapon and not yet used
  if (altSpec && !altAlreadyUsed) {
    const updatedHero = getHeroById(newState, hero.id);
    if (updatedHero) {
      newState = executeSpecAbility(newState, rng, updatedHero, altSpec, targetId);
      const altMarked = newState.party.heroes.map(h =>
        h.id === hero.id ? { ...h, oncePerCombat: { ...h.oncePerCombat, [altTriggerKey!]: true } } : h
      );
      newState = { ...newState, party: { ...newState.party, heroes: altMarked } };
    }
  }

  return newState;
}

function executeSpecAbility(
  state: GameState,
  rng: RngEngine,
  hero: HeroState,
  spec: string,
  targetId?: string
): GameState {
  let newState = state;

  switch (hero.className) {
    case "Bladedancer":
      if (spec === "Shadowblade") {
        // Shadowblade: Steal target's APC permanently and gain 2 shields (each reducing 2 damage)
        if (newState.combat && targetId) {
          const isMonster = targetId === newState.combat.monster.id || targetId === "monster";
          if (isMonster && newState.combat.monster.apcs.length > 0) {
            const stolenApc = newState.combat.monster.apcs[0];
            const combat = { ...newState.combat! };
            combat.monster = { ...combat.monster, apcs: combat.monster.apcs.slice(1) };
            newState = { ...newState, combat };
            const updatedHeroes = newState.party.heroes.map(h =>
              h.id === hero.id ? { ...h, apcs: [...h.apcs, { ...stolenApc, permanent: true }] } : h
            );
            newState = { ...newState, party: { ...newState.party, heroes: updatedHeroes } };
          }
        }
        for (let i = 0; i < 2; i++) {
          newState = addToken(newState, hero.id, createShieldToken(2), false);
        }
        newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Shadowblade specialization! APC stolen and 2 shields gained!`, { actorId: hero.id, details: { description: CLASS_DATA[hero.className].specializations.black.ability } });
      } else if (spec === "Runeblade") {
        // Runeblade: Next 3 attacks deal +2 damage; gain Might for 3 uses
        const updatedHeroes = newState.party.heroes.map(h =>
          h.id === hero.id ? { ...h, buffs: [...h.buffs, createBuffStatus("Might", 3)] } : h
        );
        newState = { ...newState, party: { ...newState.party, heroes: updatedHeroes } };
        newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Runeblade specialization! Might for 3 uses (+2 damage)!`, { actorId: hero.id, details: { description: CLASS_DATA[hero.className].specializations.red.ability } });
      }
      break;

    case "Manipulator":
      if (spec === "Timebender") {
        newState = applyHealing(newState, hero.id, 3);
        newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Timebender specialization! Heal 3 HP and extra turn!`, { actorId: hero.id, details: { description: CLASS_DATA[hero.className].specializations.black.ability } });
        const updatedHero = getHeroById(newState, hero.id);
        if (updatedHero) {
          newState = resolveHeroRoll(newState, rng, updatedHero, [], targetId, 0);
        }
      } else if (spec === "Illusionist") {
        if (newState.combat) {
          if (newState.combat.monster.specialState["debuffImmune"]) {
            newState = emitEvent(newState, "ABILITY_TRIGGERED", `${newState.combat.monster.name} is immune to debuffs!`, { actorId: hero.id });
          } else {
            const combat = { ...newState.combat! };
            combat.monster = {
              ...combat.monster,
              debuffs: [...combat.monster.debuffs, createDebuffStatus("Illusion", 2)],
            };
            newState = { ...newState, combat };
            newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Illusionist specialization! Monster Illusion for 2 turns!`, { actorId: hero.id, details: { description: CLASS_DATA[hero.className].specializations.red.ability } });
          }
        }
      }
      break;

    case "Tracker":
      if (spec === "Huntmaster") {
        if (newState.combat && targetId) {
          const isMonster = targetId === newState.combat.monster.id || targetId === "monster";
          if (isMonster) {
            const combat = { ...newState.combat! };
            combat.monster = {
              ...combat.monster,
              tokens: [...combat.monster.tokens, createTargetToken()],
            };
            newState = { ...newState, combat };
          }
        }
        const wolf: PetState = {
          id: generateId("pet_wolf"),
          type: "wolf",
          name: "Wolf",
          currentHp: 7,
          maxHp: 7,
          alive: true,
        };
        const updatedHeroes = newState.party.heroes.map(h =>
          h.id === hero.id ? { ...h, pet: wolf } : h
        );
        newState = { ...newState, party: { ...newState.party, heroes: updatedHeroes } };
        newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Huntmaster specialization! Target applied and Wolf summoned!`, { actorId: hero.id, details: { description: CLASS_DATA[hero.className].specializations.black.ability } });
      } else if (spec === "Beastcaller") {
        const bear: PetState = {
          id: generateId("pet_bear"),
          type: "bear",
          name: "Bear",
          currentHp: 5,
          maxHp: 5,
          alive: true,
        };
        const updatedHeroes = newState.party.heroes.map(h =>
          h.id === hero.id ? { ...h, pet: bear, buffs: [...h.buffs, createBuffStatus("Focus", 2)] } : h
        );
        newState = { ...newState, party: { ...newState.party, heroes: updatedHeroes } };
        newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Beastcaller specialization! Bear summoned and Focus gained!`, { actorId: hero.id, details: { description: CLASS_DATA[hero.className].specializations.red.ability } });
      }
      break;

    case "Guardian":
      if (spec === "Sentinel") {
        // +4 max HP is temporary (this combat only) — do NOT modify baseMaxHp
        const updatedHeroes = newState.party.heroes.map(h =>
          h.id === hero.id ? {
            ...h,
            maxHp: h.maxHp + 4,
            currentHp: h.currentHp + 4,
          } : h
        );
        newState = { ...newState, party: { ...newState.party, heroes: updatedHeroes } };
        for (let i = 0; i < 3; i++) {
          newState = addToken(newState, hero.id, createShieldToken(3), false);
        }
        newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Sentinel specialization! +4 max HP (this combat) and 3 shields!`, { actorId: hero.id, details: { description: CLASS_DATA[hero.className].specializations.black.ability } });
      } else if (spec === "Warden") {
        for (const h of getLivingHeroes(newState)) {
          for (let i = 0; i < 2; i++) {
            const shield = createShieldToken(2);
            shield.duration = 3;
            newState = addToken(newState, h.id, shield, false);
          }
        }
        newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Warden specialization! All allies gain 2 shields (lasting 3 turns)!`, { actorId: hero.id, details: { description: CLASS_DATA[hero.className].specializations.red.ability } });
      }
      break;
  }

  return newState;
}

// ─── Pet Turn Execution ─────────────────────────────────────────────────────

function executePetTurn(
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

function findPetRollEntry(
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

// ─── Item Usage ──────────────────────────────────────────────────────────────

export function useItem(
  state: GameState,
  heroId: string,
  itemName: string,
  targetId?: string,
  rng?: RngEngine
): GameState {
  let newState = state;
  const hero = getHeroById(newState, heroId);
  if (!hero || !hero.alive) return state;

  // Check if items are disabled for combat (Phoenix Storm) or for this hero (Void Touch)
  if (hero.perTurnFlags["itemsDisabled"]) {
    return emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name} cannot use items — items disabled for combat!`, { actorId: heroId });
  }
  if (hero.perTurnFlags["itemDisabled"]) {
    return emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name} cannot use items — item disabled!`, { actorId: heroId });
  }

  const item = hero.items.find(i => (i.itemId && i.itemId === itemName) || (i.name === itemName && i.quantity > 0));
  if (!item || item.quantity <= 0) return state;

  const itemId = item.id;

  // Helper: consume the item from the hero (decrement quantity, remove if 0)
  function consumeItem(s: GameState): GameState {
    const heroes = s.party.heroes.map(h =>
      h.id === heroId
        ? { ...h, items: h.items.map(i => i.id === itemId ? { ...i, quantity: i.quantity - 1 } : i).filter(i => i.quantity > 0) }
        : h
    );
    return { ...s, party: { ...s.party, heroes } };
  }

  if (itemHasTag(item, "minor_potion")) {
    newState = applyHealing(newState, heroId, 8);
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name} used Minor Potion! Healed 8 HP.`, { actorId: heroId });
    newState = consumeItem(newState);
  } else if (itemHasTag(item, "major_potion")) {
    newState = applyHealing(newState, heroId, hero.maxHp - hero.currentHp);
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name} used Major Potion! Healed to full.`, { actorId: heroId });
    newState = consumeItem(newState);
  } else if (itemHasTag(item, "guardian_angel")) {
    newState = consumeItem(newState);
    newState = {
      ...newState,
      party: {
        ...newState.party,
        heroes: newState.party.heroes.map(h =>
          h.id === heroId ? { ...h, perTurnFlags: { ...h.perTurnFlags, guardianAngelActive: true } } : h
        ),
      },
    };
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name} activated Guardian Angel! Will auto-revive at 50% HP.`, { actorId: heroId });
  } else if (itemHasTag(item, "shield_charm")) {
    newState = consumeItem(newState);
    newState = addToken(newState, heroId, createShieldToken(1), false);
    newState = addToken(newState, heroId, createShieldToken(1), false);
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name} used Shield Charm! Gained 2 shields.`, { actorId: heroId });
  } else if (itemHasTag(item, "power_scroll")) {
    newState = consumeItem(newState);
    newState = {
      ...newState,
      party: {
        ...newState.party,
        heroes: newState.party.heroes.map(h =>
          h.id === heroId ? { ...h, buffs: [...h.buffs, createBuffStatus("Might", 1), createBuffStatus("Focus", 1)] } : h
        ),
      },
    };
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name} used Power Scroll! +2 damage and +2 to next roll.`, { actorId: heroId });
  } else if (itemHasTag(item, "bomb")) {
    if (newState.combat) {
      newState = consumeItem(newState);
      const bombDamage = calculateDamage({ base: 5 });
      newState = applyDamage(newState, newState.combat!.monster.id, heroId, bombDamage, true).state;
      for (const summon of newState.combat!.summons.filter(s => s.alive)) {
        newState = applyDamage(newState, summon.id, heroId, calculateDamage({ base: 5 }), true).state;
      }
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name} used Bomb! 5 damage to all enemies!`, { actorId: heroId });
    }
  } else if (itemHasTag(item, "ability_blocker")) {
    if (newState.combat) {
      newState = consumeItem(newState);
      const combat = { ...newState.combat! };
      combat.monster = { ...combat.monster, specialState: {} };
      newState = { ...newState, combat };
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name} used Ability Blocker! Monster specials negated!`, { actorId: heroId });
    }
  } else if (itemHasTag(item, "speed_potion")) {
    if (newState.combat) {
      newState = consumeItem(newState);
      const combat = { ...newState.combat! };
      combat.completedHeroTurns = combat.completedHeroTurns.filter(id => id !== heroId);
      newState = { ...newState, combat };
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name} used Speed Potion! Extra turn granted!`, { actorId: heroId });
    }
  } else if (itemHasTag(item, "mystic_rune")) {
    if (!hero.oncePerCombat["specializationTriggered"]) {
      newState = consumeItem(newState);
      newState = triggerSpecializationAbility(newState, rng ?? new RngEngine(`${heroId}_item`), hero, targetId ?? newState.combat?.monster.id);
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name} used Mystic Rune! Specialization activated!`, { actorId: heroId });
    }
  } else if (itemHasTag(item, "lucky_charm")) {
    newState = consumeItem(newState);
    newState = {
      ...newState,
      party: {
        ...newState.party,
        heroes: newState.party.heroes.map(h =>
          h.id === heroId ? { ...h, perTurnFlags: { ...h.perTurnFlags, luckyCharmActive: true } } : h
        ),
      },
    };
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name} used Lucky Charm! Next roll can be rerolled.`, { actorId: heroId });
  } else if (itemHasTag(item, "smoke_bomb")) {
    newState = consumeItem(newState);
    newState = {
      ...newState,
      party: {
        ...newState.party,
        heroes: newState.party.heroes.map(h => h.alive ? { ...h, perTurnFlags: { ...h.perTurnFlags, smokeBombActive: true } } : h),
      },
    };
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name} used Smoke Bomb! Party can skip next combat room.`, { actorId: heroId });
  } else if (itemHasTag(item, "treasure_map")) {
    newState = consumeItem(newState);
    newState = {
      ...newState,
      party: {
        ...newState.party,
        heroes: newState.party.heroes.map(h => h.alive ? { ...h, perTurnFlags: { ...h.perTurnFlags, treasureMapActive: true } } : h),
      },
    };
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name} used Treasure Map! Next room's gold reward doubled.`, { actorId: heroId });
  } else {
    return state;
  }

  return newState;
}
