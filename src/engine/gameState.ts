import type { GameState, PartyState, StartingHeroConfig } from "../types/gameState";
import type { RunStats } from "../types/ui";
import type { SimulationConfig, Difficulty } from "../types/simulation";
import type { HeroState, HeroClassName, Specialization, HeroPosition, HeroId } from "../types/heroes";
import type { WeaponInstance, ItemInstance } from "../types/inventory";
import type { Card, Suit } from "../types/cards";
import type { APCInstance } from "../types/combat";
import { CLASS_DATA, getSpecialization } from "../data/classes";
import { getCommonWeapon, getWeaponsByClassAndRarity } from "../data/weapons";
import { STARTING_ITEMS, ITEMS } from "../data/items";
import { createRoomsForTier } from "../data/rooms";
import { DEFAULT_RULINGS } from "../data/ruleAmbiguities";
import { RngEngine } from "../utils/random";
import { generateGameId, generateId, generateHeroId } from "../utils/ids";
import { emitEvent, resetEventSequence } from "./eventLog";
import { createDeckManager } from "./deckEngine";

export function createDefaultConfig(
  overrides: Partial<SimulationConfig> = {}
): SimulationConfig {
  return {
    mode: "playable",
    seed: "DEFAULT_SEED",
    difficulty: "normal",
    partyControl: "human",
    monsterControl: "rules",
    rngMode: "seeded",
    speed: "readable",
    logLevel: "normal",
    showDamageMath: false,
    showCardFlips: true,
    showDiceRolls: true,
    allowManualOverride: true,
    allowIllegalOverride: false,
    autoResolveTrivialChoices: false,
    combatStrategy: "balanced",
    itemUsageStrategy: "conservative",
    merchantStrategy: "balanced",
    ...overrides,
  };
}

export function applyModeDefaults(config: SimulationConfig): SimulationConfig {
  if (config.mode === "sandbox") {
    return {
      ...config,
      allowManualOverride: true,
      allowIllegalOverride: true,
    };
  }
  return config;
}

export function createDefaultStats(): RunStats {
  return {
    totalTurns: 0,
    roomsCleared: 0,
    tier3RoomsCleared: 0,
    perfectCombats: 0,
    deaths: 0,
    revivals: 0,
    goldEarned: 0,
    goldSpent: 0,
    itemsUsed: 0,
    biggestDamageEvent: 0,
    biggestDamageDescription: "",
  };
}

export interface PartySetupChoice {
  className: HeroClassName;
  suit: Suit;
  position: HeroPosition;
}

export function createHero(
  heroId: HeroId,
  className: HeroClassName,
  suit: Suit,
  position: HeroPosition,
  difficulty: Difficulty,
  rng: RngEngine
): HeroState {
  const classData = CLASS_DATA[className];
  const spec = getSpecialization(className, suit as "clubs" | "spades" | "diamonds" | "hearts") as Specialization;

  let maxHp = classData.baseHp;

  if (difficulty === "easy") maxHp += 2;

  const commonWeapon = getCommonWeapon(className);
  const weapon: WeaponInstance = {
    id: generateId("weapon"),
    weaponId: commonWeapon.id,
    name: commonWeapon.name,
    rarity: "Common",
    className,
    effect: commonWeapon.effect,
    description: commonWeapon.description,
    tags: commonWeapon.tags,
  };

  const startingItemName = STARTING_ITEMS[className];
  const startingItemData = ITEMS[startingItemName];
  const items: ItemInstance[] = [];
  if (startingItemData) {
    items.push({
      id: generateId("item"),
      name: startingItemData.name,
      itemId: startingItemData.itemId,
      effect: startingItemData.effect,
      stackLimit: startingItemData.stackLimit,
      quantity: 1,
      isJoker: startingItemData.isJoker,
      tags: startingItemData.tags,
    });
  }

  return {
    id: generateHeroId(position),
    heroId,
    name: `${spec} ${className}`,
    className,
    specialization: spec,
    position,
    alive: true,
    currentHp: maxHp,
    maxHp,
    baseMaxHp: maxHp,
    apcs: [],
    temporaryApcs: [],
    permanentApcs: [],
    tokens: [],
    buffs: [],
    debuffs: [],
    weapon,
    items,
    upgrades: [],
    oncePerCombat: {},
    perTurnFlags: {},
  };
}

export function getStartingGold(difficulty: Difficulty): number {
  switch (difficulty) {
    case "easy": return 150;
    case "normal": return 120;
    case "hard": return 80;
    case "nightmare": return 40;
  }
}

export function getUnusedClassRank(chosenClasses: HeroClassName[]): string {
  const allRanks = ["3", "5", "7", "9"];
  const chosenRanks = chosenClasses.map((c) => CLASS_DATA[c].rank);
  const unusedRank = allRanks.find((r) => !chosenRanks.includes(r));
  return unusedRank ?? "9";
}

export function initializeGame(
  config: SimulationConfig,
  partyChoices: PartySetupChoice[]
): GameState {
  resetEventSequence();
  const rng = new RngEngine(config.seed);

  const chosenClasses = partyChoices.map((c) => c.className);
  const unusedRank = getUnusedClassRank(chosenClasses);

  let heroes: HeroState[] = partyChoices.map((choice, index) => {
    const heroId = (index + 1) as HeroId;
    return createHero(heroId, choice.className, choice.suit, choice.position, config.difficulty, rng);
  });

  // Immutable record of the original party configuration. Unlike APC state
  // (which is consumed/transformed during play), this survives the whole run
  // so Ascent Capsules can report the true starting conditions.
  const startingParty: StartingHeroConfig[] = partyChoices.map((choice, index) => ({
    heroId: (index + 1) as HeroId,
    className: choice.className,
    suit: choice.suit,
    position: choice.position,
    specialization: heroes[index].specialization,
  }));

  const startingGold = getStartingGold(config.difficulty);

  const party: PartyState = {
    gold: startingGold,
    sharedInventory: [],
    sharedInventoryLimit: 2,
    heroes,
    turnOrder: heroes.map((h) => h.id),
    deadHeroIds: [],
  };

  const tier1Rooms = createRoomsForTier(1);

  const deckManager = createDeckManager(rng, unusedRank);

  const state: GameState = {
    meta: {
      gameId: generateGameId(),
      version: "0.1.0",
      seed: config.seed,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      mode: config.mode,
      difficulty: config.difficulty,
    },
    phase: "setup",
    rng: rng.serialize(),
    spire: {
      tier: 1,
      roomIndex: 0,
      rooms: tier1Rooms,
      currentRoom: tier1Rooms[0],
      splitChoicePending: false,
      merchantPriceMultiplier: 1,
    },
    party,
    startingParty,
    stats: createDefaultStats(),
    log: [],
    settings: config,
    rulings: [...DEFAULT_RULINGS],
    deckManager,
  };

  const eventState = emitEvent(state, "GAME_STARTED", `New run started. Seed: ${config.seed}. Difficulty: ${config.difficulty}. Mode: ${config.mode}.`, {
    details: { seed: config.seed, difficulty: config.difficulty, mode: config.mode },
  });

  const partyState = emitEvent(eventState, "PARTY_CREATED", `Party created: ${heroes.map((h) => h.name).join(", ")}. Starting gold: ${startingGold}g.`, {
    details: { heroes: heroes.map((h) => ({ name: h.name, class: h.className, spec: h.specialization, hp: h.maxHp })) },
  });

  let finalState = partyState;
  if (config.difficulty === "easy" || config.difficulty === "normal") {
    finalState = { ...partyState, welcomeBonusPending: true };
  }

  return finalState;
}

export interface WelcomeBonusRollResult {
  heroId: number;
  die1: number;
  die2: number;
  chosenWeaponId?: string;
}

/**
 * Roll the welcome bonus dice for each hero using the seeded RngEngine.
 * This is the shared entry point for the welcome bonus: the playable path
 * uses it via the interactive UI (which supplies its own dice values), while
 * the batch/simulation path calls this directly to auto-roll the bonus.
 * Returns the roll results that can be passed to applyWelcomeBonusResults.
 */
export function rollWelcomeBonus(state: GameState, rng: RngEngine): WelcomeBonusRollResult[] {
  return state.party.heroes.map((hero) => {
    const die1 = rng.rollD6(`wb_die1_${hero.name}`).total;
    const die2 = rng.rollD6(`wb_die2_${hero.name}`).total;
    return { heroId: hero.heroId, die1, die2 };
  });
}

export function applyWelcomeBonusResults(
  state: GameState,
  results: WelcomeBonusRollResult[],
  rng: RngEngine
): GameState {
  let newState = state;

  for (const result of results) {
    const hero = newState.party.heroes.find(h => h.heroId === result.heroId);
    if (!hero) continue;

    const total = result.die1 + result.die2;
    let reward: string;

    if (total >= 11) {
      reward = "Rare weapon for class";
      const rareWeapons = getWeaponsByClassAndRarity(hero.className, "Rare");
      if (rareWeapons.length > 0) {
        const chosen = result.chosenWeaponId
          ? rareWeapons.find(w => w.id === result.chosenWeaponId) ?? rareWeapons[rng.rollD6(`wb_rare_${hero.name}`).total % rareWeapons.length]
          : rareWeapons[rng.rollD6(`wb_rare_${hero.name}`).total % rareWeapons.length];
        const weapon: WeaponInstance = {
          id: generateId("weapon"),
          weaponId: chosen.id,
          name: chosen.name,
          rarity: "Rare",
          className: hero.className,
          effect: chosen.effect,
          description: chosen.description,
        };
        newState = {
          ...newState,
          party: {
            ...newState.party,
            heroes: newState.party.heroes.map(h => h.id === hero.id ? { ...h, weapon } : h),
          },
        };
      }
    } else if (total >= 9) {
      reward = "Common weapon + 20g";
      const commonWeapons = getWeaponsByClassAndRarity(hero.className, "Common");
      if (commonWeapons.length > 0) {
        const chosen = result.chosenWeaponId
          ? commonWeapons.find(w => w.id === result.chosenWeaponId) ?? commonWeapons[rng.rollD6(`wb_common_${hero.name}`).total % commonWeapons.length]
          : commonWeapons[rng.rollD6(`wb_common_${hero.name}`).total % commonWeapons.length];
        const weapon: WeaponInstance = {
          id: generateId("weapon"),
          weaponId: chosen.id,
          name: chosen.name,
          rarity: "Common",
          className: hero.className,
          effect: chosen.effect,
          description: chosen.description,
        };
        newState = {
          ...newState,
          party: {
            ...newState.party,
            gold: newState.party.gold + 20,
            heroes: newState.party.heroes.map(h => h.id === hero.id ? { ...h, weapon } : h),
          },
        };
      }
    } else if (total >= 6) {
      reward = "Common weapon for class";
      const commonWeapons = getWeaponsByClassAndRarity(hero.className, "Common");
      if (commonWeapons.length > 0) {
        const chosen = result.chosenWeaponId
          ? commonWeapons.find(w => w.id === result.chosenWeaponId) ?? commonWeapons[rng.rollD6(`wb_common2_${hero.name}`).total % commonWeapons.length]
          : commonWeapons[rng.rollD6(`wb_common2_${hero.name}`).total % commonWeapons.length];
        const weapon: WeaponInstance = {
          id: generateId("weapon"),
          weaponId: chosen.id,
          name: chosen.name,
          rarity: "Common",
          className: hero.className,
          effect: chosen.effect,
          description: chosen.description,
        };
        newState = {
          ...newState,
          party: {
            ...newState.party,
            heroes: newState.party.heroes.map(h => h.id === hero.id ? { ...h, weapon } : h),
          },
        };
      }
    } else {
      reward = "20g";
      newState = {
        ...newState,
        party: { ...newState.party, gold: newState.party.gold + 20 },
      };
    }

    newState = emitEvent(newState, "DICE_ROLLED", `${hero.name} rolled ${total} for Welcome Bonus: ${reward}`, {
      actorId: hero.id,
      details: { roll: total, reward, die1: result.die1, die2: result.die2 },
    });
  }

  return newState;
}
