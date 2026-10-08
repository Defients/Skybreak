import type { GameState } from "../types/gameState";
import type { CombatState, APCInstance, MatchResult, MatchType, DamageBreakdown, DamageResult, EnvironmentState } from "../types/combat";
import type { CardFlipEvent } from "../types/cards";
import type { MonsterState } from "../types/monsters";
import type { Card } from "../types/cards";
import type { TokenInstance } from "../types/inventory";
import { getMonsterByCard, getMonsterById, getFinalBoss, getMiniBosses, getVyridianPhase, getVyridianPhaseData, SUMMON_DATA } from "../data/monsters";
import type { MonsterData } from "../types/monsters";
import { CLASS_DATA } from "../data/classes";
import { scaleGold } from "../utils/math";
import { RngEngine } from "../utils/random";
import { generateId, generateCombatId, generateMonsterId } from "../utils/ids";
import { emitEvent, resetEventSequence } from "./eventLog";
import { getLivingHeroes, getHeroById, selectMonsterTarget, selectTargetByPriority, applyDifficultyToMonsterHp } from "./rulesEngine";
import { createShieldToken, createTargetToken, createDebuffToken, createBuffToken, createCounterToken } from "../data/tokens";
import { rankToNumber, suitSymbol } from "../types/cards";
import { resolveActorName, resolveTargetName } from "../utils/nameResolver";
import { drawFromDeck, drawWithoutDiscard, drawMultipleWithoutDiscard, returnToDrawPile, reshuffleDeck } from "./deckEngine";
import { weaponHasTag } from "../utils/tagMatchers";

export function startCombat(
  state: GameState,
  rng: RngEngine,
  options: { isElite?: boolean; isMiniBoss?: boolean; isFinalBoss?: boolean; forcedMonsterId?: number } = {}
): GameState {
  const { isElite = false, isMiniBoss = false, isFinalBoss = false, forcedMonsterId } = options;

  let monsterData: MonsterData | undefined;
  let drawnRoyaltyCard: Card | undefined;

  if (isFinalBoss) {
    monsterData = getFinalBoss();
  } else if (isMiniBoss) {
    const allMiniBosses = getMiniBosses();
    const mbRoll = rng.rollD6("miniboss_select");
    const mbIdx = Math.min(allMiniBosses.length - 1, Math.floor((mbRoll.total - 1) / 6 * allMiniBosses.length));
    const chosenId = forcedMonsterId ?? allMiniBosses[mbIdx].id;
    monsterData = getMonsterById(chosenId);
  } else if (forcedMonsterId) {
    monsterData = getMonsterById(forcedMonsterId);
  } else {
    const deckManager = state.deckManager;
    if (deckManager) {
      drawnRoyaltyCard = drawFromDeck(deckManager.royalty);
      if (drawnRoyaltyCard) {
        monsterData = getMonsterByCard(drawnRoyaltyCard.rank, drawnRoyaltyCard.suit);
      }
    }
    if (!monsterData) {
      const royaltyDraw = rng.rollD6("monster_royalty_select");
      const ranks = ["J", "Q", "K", "A"];
      const rank = isElite ? "A" : ranks[Math.min(3, Math.floor(royaltyDraw.total / 2))];
      const suitRoll = rng.rollD6("monster_suit_select");
      const suits = ["clubs", "diamonds", "hearts", "spades"];
      const suit = suits[Math.min(3, Math.floor((suitRoll.total - 1) / 2))];
      monsterData = getMonsterByCard(rank, suit);
    }
  }

  if (!monsterData) {
    monsterData = getMonsterById(1)!;
  }

  const tier = state.spire.tier;
  let monsterHp = isFinalBoss ? monsterData.baseHp : applyDifficultyToMonsterHp(monsterData.baseHp, tier, state.settings.difficulty);

  if (isElite) monsterHp += 5;
  if (state.settings.difficulty === "nightmare") monsterHp += 2 * tier;

  let monsterGold = isFinalBoss ? 0 : scaleGold(monsterData.baseGold, tier);
  if (isElite) monsterGold = Math.floor(monsterGold * 1.5);
  if (isMiniBoss) monsterGold = scaleGold(monsterData.baseGold, tier);

  const sourceCard: Card = drawnRoyaltyCard ?? {
    id: generateId("monster_card"),
    suit: monsterData.cardSuit as any || "joker",
    rank: monsterData.cardRank as any,
    display: `${monsterData.cardRank}${monsterData.cardSuit !== "none" ? suitSymbol(monsterData.cardSuit as any) : ""}`,
    deckType: "royalty",
  };

  const monster: MonsterState = {
    id: generateMonsterId(monsterData.id),
    monsterId: monsterData.id,
    name: monsterData.name,
    sourceCard,
    type: monsterData.type,
    currentHp: monsterHp,
    maxHp: monsterHp,
    baseHp: monsterData.baseHp,
    goldReward: monsterGold,
    apcs: [],
    tokens: [],
    buffs: [],
    debuffs: [],
    specialState: {},
    phase: isFinalBoss ? "Phase 1 — The Measure" : undefined,
    alive: true,
    untargetable: false,
    immune: false,
    summons: [],
  };

  const livingHeroes = getLivingHeroes(state);
  const heroTurnOrder = livingHeroes.map((h) => h.id);

  const combat: CombatState = {
    id: generateCombatId(),
    round: 1,
    turnCount: 0,
    activeSide: "monster",
    monster,
    summons: [],
    environment: { suit: "", name: "", effect: "", description: "" },
    heroTurnOrder,
    completedHeroTurns: [],
    cardFlips: [],
    damageEvents: [],
    perfectCombatEligible: true,
    isElite,
    isMiniBoss,
    isFinalBoss,
    roundsWithoutProgress: 0,
    lastHpSnapshot: { monsterHp: monster.currentHp, totalHeroHp: livingHeroes.reduce((s, h) => s + h.currentHp, 0) },
  };

  resetEventSequence();

  const newState: GameState = {
    ...state,
    phase: "combat_setup",
    combat,
    // Preserve the run-level event log (welcome bonus, room events, etc.)
    // rather than clearing it at combat start. Combat events are appended.
  };

  const eventState = emitEvent(newState, "COMBAT_STARTED", `Combat started! ${isElite ? "Elite " : ""}${isMiniBoss ? "Mini-Boss " : ""}${isFinalBoss ? "Final Boss " : ""}${monster.name} appears! HP: ${monsterHp}. Gold reward: ${monsterGold}g.`, {
    details: { monsterName: monster.name, monsterHp, monsterGold, isElite, isMiniBoss, isFinalBoss },
  });

  let setupState = assignAPCs(eventState, rng, 0);
  setupState = applyEnvironment(setupState, rng);

  return setupState;
}

export function assignAPCs(state: GameState, rng: RngEngine, attempts: number = 0): GameState {
  if (!state.combat) return state;

  const combat = { ...state.combat! };
  const livingHeroes = getLivingHeroes(state);

  const totalHeroApcs = livingHeroes.length;
  const monsterApcCount = combat.isFinalBoss ? 4 : (combat.isElite ? 3 : 2);
  const totalApcsNeeded = totalHeroApcs + monsterApcCount;

  const deckManager = state.deckManager;
  const useDeck = !!deckManager;

  if (useDeck && deckManager) {
    reshuffleDeck(deckManager.peon, rng);
  }

  const peonRanks = ["2", "3", "4", "5", "6", "7", "8", "9", "10"];
  const suits = ["clubs", "diamonds", "hearts", "spades"];

  const drawApcsFromDeck = (count: number): APCInstance[] => {
    if (!deckManager) return [];
    const cards = drawMultipleWithoutDiscard(deckManager.peon, count);
    const apcs: APCInstance[] = cards.map((card) => ({
      id: generateId("apc"),
      rank: card.rank,
      suit: card.suit,
      source: card,
      temporary: false,
      permanent: false,
      matched: false,
    }));
    while (apcs.length < count) {
      const rank = peonRanks[Math.floor(rng.rollD6("apc_rank_fallback").total / 2) - 1] || "5";
      const suit = suits[rng.rollD6("apc_suit_fallback").total - 1];
      apcs.push({
        id: generateId("apc"),
        rank,
        suit,
        source: {
          id: generateId("apc_card_fallback"),
          suit: suit as any,
          rank: rank as any,
          display: `${rank}${suitSymbol(suit as any)}`,
          deckType: "peon",
        },
        temporary: false,
        permanent: false,
        matched: false,
      });
    }
    return apcs;
  };

  const generateApcsRandom = (count: number): APCInstance[] => {
    const apcs: APCInstance[] = [];
    for (let i = 0; i < count; i++) {
      const rank = peonRanks[Math.floor(rng.rollD6("apc_rank").total / 2) - 1] || "5";
      const suit = suits[rng.rollD6("apc_suit").total - 1];
      apcs.push({
        id: generateId("apc"),
        rank,
        suit,
        source: {
          id: generateId("apc_card"),
          suit: suit as any,
          rank: rank as any,
          display: `${rank}${suitSymbol(suit as any)}`,
          deckType: "peon",
        },
        temporary: false,
        permanent: false,
        matched: false,
      });
    }
    return apcs;
  };

  let allApcs: APCInstance[];

  if (useDeck && deckManager) {
    allApcs = drawApcsFromDeck(totalApcsNeeded);

    const checkFourOfRank = (apcs: APCInstance[]): boolean => {
      const counts: Record<string, number> = {};
      for (const apc of apcs) {
        counts[apc.rank] = (counts[apc.rank] || 0) + 1;
        if (counts[apc.rank] >= 4) return true;
      }
      return false;
    };

    let apcIndex = 0;
    let newHeroes = state.party.heroes.map((h) => {
      if (!h.alive) return h;
      const apc = allApcs[apcIndex++];
      return { ...h, apcs: [apc] };
    });
    let monsterApcs = allApcs.slice(apcIndex);

    let attempts = 0;
    while (attempts < 10) {
      const monsterHasFour = checkFourOfRank(monsterApcs);
      const heroHasFour = newHeroes.some(h => h.alive && h.apcs.length > 0 && checkFourOfRank(h.apcs));

      if (!monsterHasFour && !heroHasFour) break;

      returnToDrawPile(deckManager.peon, allApcs.map(a => a.source));
      reshuffleDeck(deckManager.peon, rng);
      allApcs = drawApcsFromDeck(totalApcsNeeded);
      apcIndex = 0;
      newHeroes = state.party.heroes.map((h) => {
        if (!h.alive) return h;
        const apc = allApcs[apcIndex++];
        return { ...h, apcs: [apc] };
      });
      monsterApcs = allApcs.slice(apcIndex);
      attempts++;
    }

    combat.monster = { ...combat.monster, apcs: monsterApcs };

    let newState: GameState = {
      ...state,
      party: { ...state.party, heroes: newHeroes },
      combat,
    };

    newState = emitEvent(newState, "APC_ASSIGNED", `APCs assigned. Heroes: ${newHeroes.filter(h => h.alive).map(h => `${h.name}=${h.apcs[0]?.rank}`).join(", ")}. Monster: ${monsterApcs.map(a => a.rank).join(", ")}.`, {
      details: { heroApcs: newHeroes.filter(h => h.alive).map(h => ({ hero: h.name, rank: h.apcs[0]?.rank })), monsterApcs: monsterApcs.map(a => a.rank) },
    });

    return applyWeaponStartEffects(newState);
  }

  // Fallback: random generation (no deckManager)
  allApcs = generateApcsRandom(totalApcsNeeded);

  let apcIndex = 0;
  const newHeroes = state.party.heroes.map((h) => {
    if (!h.alive) return h;
    const apc = allApcs[apcIndex++];
    return { ...h, apcs: [apc] };
  });

  const monsterApcs = allApcs.slice(apcIndex);

  const checkFourOfRank = (apcs: APCInstance[]): boolean => {
    const counts: Record<string, number> = {};
    for (const apc of apcs) {
      counts[apc.rank] = (counts[apc.rank] || 0) + 1;
      if (counts[apc.rank] >= 4) return true;
    }
    return false;
  };

  const monsterHasFour = checkFourOfRank(monsterApcs);
  const heroHasFour = newHeroes.some(h => h.alive && h.apcs.length > 0 && checkFourOfRank(h.apcs));

  if ((monsterHasFour || heroHasFour) && attempts < 10) {
    return assignAPCs(state, rng, attempts + 1);
  }

  combat.monster = { ...combat.monster, apcs: monsterApcs };

  let newState: GameState = {
    ...state,
    party: { ...state.party, heroes: newHeroes },
    combat,
  };

  newState = emitEvent(newState, "APC_ASSIGNED", `APCs assigned. Heroes: ${newHeroes.filter(h => h.alive).map(h => `${h.name}=${h.apcs[0]?.rank}`).join(", ")}. Monster: ${monsterApcs.map(a => a.rank).join(", ")}.`, {
    details: { heroApcs: newHeroes.filter(h => h.alive).map(h => ({ hero: h.name, rank: h.apcs[0]?.rank })), monsterApcs: monsterApcs.map(a => a.rank) },
  });

  return applyWeaponStartEffects(newState);
}

function applyWeaponStartEffects(state: GameState): GameState {
  let newState = state;
  const scholarHeroes = newState.party.heroes.filter(h => h.alive && weaponHasTag(h, "scholars_staff"));
  if (scholarHeroes.length > 0) {
    const tempApc: APCInstance = {
      id: generateId("apc_temp"),
      rank: "5",
      suit: "hearts",
      source: { id: generateId("apc_card_temp"), suit: "hearts", rank: "5", display: "5♥", deckType: "peon" },
      temporary: true,
      permanent: false,
      matched: false,
    };
    newState = {
      ...newState,
      party: {
        ...newState.party,
        heroes: newState.party.heroes.map(h =>
          h.alive && weaponHasTag(h, "scholars_staff")
            ? { ...h, apcs: [...h.apcs, tempApc] }
            : h
        ),
      },
    };
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${scholarHeroes.map(h => h.name).join(", ")}: Scholar's Staff — gained +1 temporary APC!`, {});
  }

  // Weapon: Tower Shield — start each combat with +1 HP (temporary, resets each combat)
  const towerHeroes = newState.party.heroes.filter(h => h.alive && weaponHasTag(h, "tower_shield"));
  if (towerHeroes.length > 0) {
    newState = {
      ...newState,
      party: {
        ...newState.party,
        heroes: newState.party.heroes.map(h =>
          h.alive && weaponHasTag(h, "tower_shield")
            ? { ...h, maxHp: h.baseMaxHp + 1, currentHp: Math.min(h.baseMaxHp + 1, h.currentHp + 1) }
            : h
        ),
      },
    };
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${towerHeroes.map(h => h.name).join(", ")}: Tower Shield — +1 HP at combat start!`, {});
  }

  // Weapon: Serpent's Kiss — start combat with Toxic enchantment (slot-free)
  const serpentHeroes = newState.party.heroes.filter(h => h.alive && weaponHasTag(h, "serpents_kiss"));
  if (serpentHeroes.length > 0) {
    newState = {
      ...newState,
      party: {
        ...newState.party,
        heroes: newState.party.heroes.map(h =>
          h.alive && weaponHasTag(h, "serpents_kiss") && !h.enchantment
            ? { ...h, enchantment: { id: generateId("enchant"), name: "Toxic", effect: "Applies Poison on successful damage rolls of 5–6", slotFree: true } }
            : h
        ),
      },
    };
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${serpentHeroes.map(h => h.name).join(", ")}: Serpent's Kiss — Toxic enchantment active!`, {});
  }

  // Weapon: Eternal Vigil — start combat with 3 shields
  const eternalVigilHeroes = newState.party.heroes.filter(h => h.alive && weaponHasTag(h, "eternal_vigil"));
  for (const h of eternalVigilHeroes) {
    for (let i = 0; i < 3; i++) {
      newState = addToken(newState, h.id, createShieldToken(1), false);
    }
  }
  if (eternalVigilHeroes.length > 0) {
    newState = emitEvent(newState, "ABILITY_TRIGGERED", `${eternalVigilHeroes.map(h => h.name).join(", ")}: Eternal Vigil — 3 shields at combat start!`, {});
  }

  return newState;
}

export function applyEnvironment(state: GameState, rng: RngEngine): GameState {
  if (!state.combat) return state;

  const suits = ["clubs", "diamonds", "hearts", "spades"];

  let suit: string;
  const deckManager = state.deckManager;
  if (deckManager) {
    const envCard = drawFromDeck(deckManager.environment);
    if (envCard) {
      suit = envCard.suit;
    } else {
      const suitRoll = rng.rollD6("environment_suit");
      suit = suits[Math.min(3, Math.floor((suitRoll.total - 1) / 2))];
    }
  } else {
    const suitRoll = rng.rollD6("environment_suit");
    suit = suits[Math.min(3, Math.floor((suitRoll.total - 1) / 2))];
  }

  const envData: Record<string, { name: string; effect: string; description: string }> = {
    clubs: { name: "Training Ground", effect: "No effect", description: "No environmental effect" },
    diamonds: { name: "Library", effect: "All entities gain +1 APC for combat", description: "All entities gain +1 temporary APC" },
    hearts: { name: "Armory", effect: "Heroes +2 to first roll; Monster +1 to first 3 rolls", description: "Heroes gain +2 to first roll, Monster gains +1 to first 3 rolls" },
    spades: { name: "Elemental Chamber", effect: "Black specs +1 to all rolls; Red specs +1 APC", description: "Black specs gain +1 to all rolls, Red specs gain +1 APC" },
  };

  const env = envData[suit];
  const environment: EnvironmentState = {
    suit,
    name: env.name,
    effect: env.effect,
    description: env.description,
  };

  let combat = { ...state.combat!, environment };
  let newHeroes = [...state.party.heroes];

  if (suit === "diamonds") {
    newHeroes = newHeroes.map((h) => {
      if (!h.alive) return h;
      const tempApc: APCInstance = {
        id: generateId("temp_apc"),
        rank: "5",
        suit: "clubs",
        source: { id: generateId("env_apc_card"), suit: "clubs", rank: "5", display: "5♣️", deckType: "peon" },
        temporary: true,
        permanent: false,
        matched: false,
      };
      return { ...h, apcs: [...h.apcs, tempApc], temporaryApcs: [...h.temporaryApcs, tempApc] };
    });
    combat.monster = {
      ...combat.monster,
      apcs: [...combat.monster.apcs, {
        id: generateId("temp_apc_m"),
        rank: "5",
        suit: "clubs",
        source: { id: generateId("env_apc_card_m"), suit: "clubs", rank: "5", display: "5♣️", deckType: "peon" },
        temporary: true,
        permanent: false,
        matched: false,
      }],
    };
  }

  if (suit === "spades") {
    newHeroes = newHeroes.map((h) => {
      if (!h.alive) return h;
      const isRedSpec = h.specialization === "Runeblade" || h.specialization === "Illusionist" || h.specialization === "Beastcaller" || h.specialization === "Warden";
      if (isRedSpec) {
        const tempApc: APCInstance = {
          id: generateId("temp_apc_red"),
          rank: "7",
          suit: "diamonds",
          source: { id: generateId("env_apc_card_red"), suit: "diamonds", rank: "7", display: "7♦️", deckType: "peon" },
          temporary: true,
          permanent: false,
          matched: false,
        };
        return { ...h, apcs: [...h.apcs, tempApc], temporaryApcs: [...h.temporaryApcs, tempApc] };
      }
      return h;
    });
  }

  const newState: GameState = {
    ...state,
    party: { ...state.party, heroes: newHeroes },
    combat,
    phase: "combat",
  };

  return emitEvent(newState, "ENVIRONMENT_REVEALED", `Environment: ${env.name} (${suitSymbol(suit as any)}). ${env.effect}`, {
    details: { suit, name: env.name, effect: env.effect },
  });
}

export function flipPeonCards(
  state: GameState,
  actorId: string,
  rng: RngEngine,
  forcedCards?: Card[]
): { state: GameState; cards: Card[] } {
  if (!state.combat) return { state, cards: [] };

  const cards: Card[] = [];
  if (forcedCards) {
    cards.push(...forcedCards);
  } else {
    // Physical Table Bridge: check for physical cards override on the RNG
    const physicalCards = rng.consumePhysicalCards();
    if (physicalCards && physicalCards.length >= 2) {
      cards.push(...physicalCards.slice(0, 2));
    } else {
    const deckManager = state.deckManager;
    if (deckManager) {
      for (let i = 0; i < 2; i++) {
        const card = drawFromDeck(deckManager.peon);
        if (card) cards.push(card);
      }
    }
    if (cards.length < 2) {
      cards.length = 0;
      for (let i = 0; i < 2; i++) {
        const rank = String(Math.floor(rng.rollD6("flip_rank").total / 2) + 2);
        const suitRoll = rng.rollD6("flip_suit");
        const suits = ["clubs", "diamonds", "hearts", "spades"];
        const suit = suits[Math.min(3, Math.floor((suitRoll.total - 1) / 2))];
        cards.push({
          id: generateId("flipped_card"),
          suit: suit as any,
          rank: rank as any,
          display: `${rank}${suitSymbol(suit as any)}`,
          deckType: "peon",
        });
      }
    }
    } // end physicalCards else
  }

  const flipEvent: CardFlipEvent = {
    id: generateId("flip"),
    actorId,
    cards,
    timestamp: Date.now(),
    sequence: state.log.length,
  };

  const combat = { ...state.combat! };
  combat.cardFlips = [...combat.cardFlips, flipEvent];

  const newState = {
    ...state,
    combat,
  };

  const eventState = emitEvent(newState, "CARD_FLIPPED", `${resolveActorName(newState, actorId)} flipped: ${cards.map(c => c.display).join(", ")}`, {
    actorId,
    details: { cards: cards.map(c => c.display) },
  });

  return { state: eventState, cards };
}

export function detectMatches(
  actorApcs: APCInstance[],
  flippedCards: Card[]
): MatchResult[] {
  const results: MatchResult[] = [];
  const usedApcIds = new Set<string>();

  for (const card of flippedCards) {
    let matched = false;
    for (const apc of actorApcs) {
      if (usedApcIds.has(apc.id)) continue;
      if (card.rank === apc.rank) {
        results.push({
          type: "single",
          matchedApcs: [apc],
          flippedCards: [card],
          bonusDamage: 0,
          rollBonus: 0,
          description: `Match: ${card.display} matches APC ${apc.rank}`,
        });
        usedApcIds.add(apc.id);
        matched = true;
        break;
      }
    }
  }

  if (results.length === 0) {
    if (flippedCards.length === 2 && flippedCards[0].rank === flippedCards[1].rank) {
      const matchRank = flippedCards[0].rank;
      const hasMatchingApc = actorApcs.some(apc => apc.rank === matchRank);
      if (hasMatchingApc) {
        const matchingApc = actorApcs.find(apc => apc.rank === matchRank)!;
        return [{
          type: "set",
          matchedApcs: [matchingApc],
          flippedCards,
          bonusDamage: 0,
          rollBonus: 1,
          description: `Set Match: both cards match APC rank ${matchRank}. +1 to next roll.`,
        }];
      }
    }
    return [{ type: "none", matchedApcs: [], flippedCards, bonusDamage: 0, rollBonus: 0, description: "No match" }];
  }

  if (results.length === 2) {
    const sameRank = results[0].matchedApcs[0].rank === results[1].matchedApcs[0].rank;
    if (sameRank) {
      return [{
        type: "set",
        matchedApcs: [results[0].matchedApcs[0], results[1].matchedApcs[0]],
        flippedCards,
        bonusDamage: 0,
        rollBonus: 1,
        description: `Set Match: both cards match APC rank ${results[0].matchedApcs[0].rank}. +1 to next roll.`,
      }];
    } else {
      return [{
        type: "double",
        matchedApcs: [results[0].matchedApcs[0], results[1].matchedApcs[0]],
        flippedCards,
        bonusDamage: 1,
        rollBonus: 0,
        description: `Double Match: ${results[0].matchedApcs[0].rank} and ${results[1].matchedApcs[0].rank}. +1 damage.`,
      }];
    }
  }

  if (results.length === 1 && flippedCards.length === 2 && flippedCards[0].rank === flippedCards[1].rank) {
    const matchRank = flippedCards[0].rank;
    const hasMatchingApc = actorApcs.some(apc => apc.rank === matchRank);
    if (hasMatchingApc) {
      const matchingApc = results[0].matchedApcs[0];
      return [{
        type: "set",
        matchedApcs: [matchingApc],
        flippedCards,
        bonusDamage: 0,
        rollBonus: 1,
        description: `Set Match: both cards match APC rank ${matchRank}. +1 to next roll.`,
      }];
    }
  }

  return results;
}

export function calculateDamage(input: {
  base: number;
  weaponBonus?: number;
  enchantmentBonus?: number;
  tokenBonus?: number;
  environmentBonus?: number;
  matchBonus?: number;
  shieldReduction?: number;
  armorReduction?: number;
  defenseReduction?: number;
  phaseThrough?: boolean;
  targetTokens?: TokenInstance[];
}): DamageBreakdown {
  const base = input.base;
  const weaponBonus = input.weaponBonus ?? 0;
  const enchantmentBonus = input.enchantmentBonus ?? 0;
  const tokenBonus = input.tokenBonus ?? 0;
  const environmentBonus = input.environmentBonus ?? 0;
  const matchBonus = input.matchBonus ?? 0;
  const phaseThrough = input.phaseThrough ?? false;

  let shieldReduction = input.shieldReduction ?? 0;
  let armorReduction = input.armorReduction ?? 0;
  let defenseReduction = input.defenseReduction ?? 0;

  if (phaseThrough) {
    shieldReduction = 0;
    armorReduction = 0;
    defenseReduction = 0;
  }

  if (input.targetTokens) {
    const targetToken = input.targetTokens.find(t => t.type === "target");
    if (targetToken) {
      // +1 damage from target token is already in tokenBonus
    }
  }

  const grossDamage = base + weaponBonus + enchantmentBonus + tokenBonus + environmentBonus + matchBonus;
  const totalReduction = shieldReduction + armorReduction + defenseReduction;
  const finalDamage = Math.max(0, grossDamage - totalReduction);

  const notes: string[] = [];
  if (phaseThrough) notes.push("Phase through: ignoring shields, armor, and damage reduction");
  if (shieldReduction > 0 && !phaseThrough) notes.push(`Shield absorbed ${shieldReduction}`);
  if (armorReduction > 0 && !phaseThrough) notes.push(`Armor reduced ${armorReduction}`);

  return {
    base,
    weaponBonus,
    enchantmentBonus,
    tokenBonus,
    environmentBonus,
    matchBonus,
    shieldReduction: phaseThrough ? 0 : shieldReduction,
    armorReduction: phaseThrough ? 0 : armorReduction,
    defenseReduction: phaseThrough ? 0 : defenseReduction,
    phaseThrough,
    finalDamage,
    notes,
  };
}

function absorbShields(tokens: TokenInstance[], damage: number, bonus = 0): { tokens: TokenInstance[]; absorbed: number } {
  let remaining = damage;
  const kept = tokens.filter(token => {
    if (token.type !== "shield" || remaining <= 0) return true;
    remaining -= Math.min(remaining, token.value + bonus);
    return false;
  });
  return { tokens: kept, absorbed: damage - remaining };
}

export function applyDamage(
  state: GameState,
  targetId: string,
  attackerId: string,
  breakdown: DamageBreakdown,
  isMonsterTarget: boolean
): { state: GameState; killed: boolean } {
  if (!state.combat || state.combat.combatResult) return { state, killed: false };

  if (isMonsterTarget && targetId !== state.combat.monster.id && targetId !== "monster") {
    const target = state.combat.summons.find(s => s.id === targetId && s.alive);
    if (!target) return { state, killed: false };
    const hp = Math.max(0, target.currentHp - breakdown.finalDamage);
    let next: GameState = { ...state, combat: { ...state.combat,
      summons: state.combat.summons.map(s => s.id === targetId ? { ...s, currentHp: hp, alive: hp > 0 } : s),
    } };
    next = emitEvent(next, "DAMAGE_APPLIED", `${resolveActorName(state, attackerId)} dealt ${breakdown.finalDamage} damage to ${target.name}. HP: ${hp}/${target.maxHp}.`, {
      actorId: attackerId, targetIds: [targetId],
      details: { damage: breakdown.finalDamage, remainingHp: hp, breakdown, targetName: target.name, attackerName: resolveActorName(state, attackerId) },
    });
    if (hp === 0) next = emitEvent(next, "MONSTER_DEFEATED", `${target.name} defeated!`, { targetIds: [targetId], details: { summon: true } });
    return { state: next, killed: hp === 0 };
  }
  if (isMonsterTarget && !state.combat.monster.alive) return { state, killed: false };
  if (!isMonsterTarget && !state.party.heroes.some(h => h.id === targetId && h.alive)) return { state, killed: false };

  let killed = false;
  let newState = { ...state };

  if (isMonsterTarget) {
    const combat = { ...newState.combat! };
    let monster = { ...combat.monster, specialState: { ...combat.monster.specialState } };

    if (monster.untargetable) {
      const eventState = emitEvent(newState, "DAMAGE_APPLIED", `${monster.name} is untargetable! Attack missed.`, {
        targetIds: [targetId],
        details: { untargetable: true },
      });
      return { state: eventState, killed: false };
    }

    if (monster.immune) {
      const eventState = emitEvent(newState, "DAMAGE_APPLIED", `${monster.name} is immune! No damage taken.`, {
        targetIds: [targetId],
        details: { immune: true },
      });
      return { state: eventState, killed: false };
    }

    let damage = breakdown.finalDamage;
    const resolvedBreakdown = { ...breakdown, notes: [...breakdown.notes] };

    if (monster.specialState["colossal"] && !breakdown.phaseThrough) {
      const reduction = Math.min(damage, 2);
      damage = Math.max(0, damage - 2);
      resolvedBreakdown.defenseReduction += reduction;
      resolvedBreakdown.notes.push(`Colossal reduced ${reduction}`);
    }

    // Gargoyle Stone Form: immune to next N damage sources
    if (monster.specialState["stoneFormCharges"] && (monster.specialState["stoneFormCharges"] as number) > 0) {
      const charges = monster.specialState["stoneFormCharges"] as number;
      monster.specialState = { ...monster.specialState, stoneFormCharges: charges - 1 };
      newState = emitEvent(newState, "ABILITY_TRIGGERED", `${monster.name}: Stone Form absorbs damage! (${charges - 1} charges left)`, {
        targetIds: [targetId],
        details: { stoneForm: true, chargesLeft: charges - 1 },
      });
      resolvedBreakdown.defenseReduction += damage;
      damage = 0;
      resolvedBreakdown.notes.push("Stone Form absorbed this attack");
    }

    if (damage > 0 && !breakdown.phaseThrough) {
      const shields = absorbShields(monster.tokens, damage);
      monster.tokens = shields.tokens;
      damage -= shields.absorbed;
      resolvedBreakdown.shieldReduction += shields.absorbed;
    }
    resolvedBreakdown.finalDamage = damage;

    monster.currentHp = Math.max(0, monster.currentHp - damage);

    if (monster.currentHp === 0) {
      if (monster.monsterId === 8 && !monster.specialState["rebirthUsed"]) {
        const counters = monster.tokens.filter(t => t.type === "counter");
        monster.currentHp = 8 + counters.reduce((s, t) => s + t.value * 2, 0);
        monster.specialState["rebirthUsed"] = true;
        newState = emitEvent(newState, "DAMAGE_APPLIED", `${monster.name} rebirths! Resurrected with ${monster.currentHp} HP.`, {
          targetIds: [targetId],
          details: { rebirth: true, newHp: monster.currentHp },
        });
      } else {
        monster.alive = false;
        killed = true;
      }
    }

    if (isFinalBossPhase(newState) && monster.currentHp > 0) {
      const phaseNum = getVyridianPhase(monster.currentHp);
      const phaseData = getVyridianPhaseData(monster.currentHp);
      if (phaseData && monster.phase !== phaseData.name) {
        monster.phase = phaseData.name;
        newState = { ...newState, stats: { ...newState.stats, bossPhaseReached: phaseData.name } };
        newState = emitEvent(newState, "ABILITY_TRIGGERED", `${monster.name} enters ${phaseData.name}!`, {
          details: { phase: phaseData.name },
        });
      }
    }

    combat.monster = monster;
    newState = { ...newState, combat };

    {
      const attackerName = resolveActorName(newState, attackerId);
      newState = emitEvent(newState, "DAMAGE_APPLIED", `${attackerName} dealt ${damage} damage to ${monster.name}. HP: ${monster.currentHp}/${monster.maxHp}.`, {
        actorId: attackerId,
        targetIds: [targetId],
        details: { damage, remainingHp: monster.currentHp, breakdown: resolvedBreakdown, attackerName, targetName: monster.name },
      });

      if (damage > newState.stats.biggestDamageEvent) {
        newState = {
          ...newState,
          stats: {
            ...newState.stats,
            biggestDamageEvent: damage,
            biggestDamageDescription: `${attackerName} → ${monster.name} for ${damage}`,
          },
        };
      }
    }

    if (killed) {
      newState = emitEvent(newState, "MONSTER_DEFEATED", `${monster.name} defeated!`, {
        targetIds: [targetId],
        details: { monsterName: monster.name, goldReward: monster.goldReward },
      });
    }
  } else {
    let appliedDamage = 0;
    const resolvedBreakdown = { ...breakdown, notes: [...breakdown.notes] };
    const newHeroes = newState.party.heroes.map((h) => {
      if (h.id !== targetId) return h;
      if (!h.alive) return h;

      let damage = breakdown.finalDamage;
      let hero = { ...h };

      // Fortress Gate: immune to first damage each combat
      if (damage > 0 && weaponHasTag(hero, "fortress_gate") && !newState.combat?.fortressGateUsed) {
        damage = 0;
        newState = { ...newState, combat: { ...newState.combat!, fortressGateUsed: true } };
        newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Fortress Gate! Immune to first damage!`, {
          targetIds: [hero.id],
          details: { fortressGate: true },
        });
      }

      if (hero.perTurnFlags["immuneNextTurn"]) {
        damage = 0;
      }
      if (damage === 0 && breakdown.finalDamage > 0) {
        resolvedBreakdown.defenseReduction += breakdown.finalDamage;
        resolvedBreakdown.notes.push("Protection prevented this damage");
      }

      // Shield consumption: each shield token absorbs damage equal to its value (Aegis Wall adds +1)
      if (damage > 0 && !breakdown.phaseThrough) {
        const shieldTokens = hero.tokens.filter(t => t.type === "shield");
        if (shieldTokens.length > 0) {
          const aegisWall = weaponHasTag(hero, "aegis_wall");
          const aegisBonus = aegisWall ? 1 : 0;
          let remainingDamage = damage;
          const updatedTokens: TokenInstance[] = [];
          let totalAbsorb = 0;
          for (const st of hero.tokens) {
            if (st.type !== "shield" || remainingDamage <= 0) {
              updatedTokens.push(st);
              continue;
            }
            const absorbAmount = Math.min(remainingDamage, st.value + aegisBonus);
            remainingDamage -= absorbAmount;
            totalAbsorb += absorbAmount;
          }
          damage -= totalAbsorb;
          resolvedBreakdown.shieldReduction += totalAbsorb;
          hero.tokens = updatedTokens;
          if (totalAbsorb > 0) {
            newState = emitEvent(newState, "TOKEN_REMOVED", `Shields absorbed ${totalAbsorb} damage for ${hero.name}!`, {
              targetIds: [hero.id],
              details: { shieldsUsed: shieldTokens.length - updatedTokens.filter(t => t.type === "shield").length, absorbed: totalAbsorb },
            });
          }
        }
      }

      appliedDamage = damage;
      resolvedBreakdown.finalDamage = damage;
      hero.currentHp = Math.max(0, hero.currentHp - damage);

      if (hero.currentHp === 0) {
        // Guardian Angel auto-revive at 50% HP
        if (hero.perTurnFlags["guardianAngelActive"]) {
          hero.alive = true;
          hero.currentHp = Math.floor(hero.maxHp * 0.5);
          hero.perTurnFlags = { ...hero.perTurnFlags, guardianAngelActive: false };
          newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Guardian Angel! Auto-revived at ${hero.currentHp} HP!`, {
            targetIds: [hero.id],
            details: { guardianAngel: true, revivedHp: hero.currentHp },
          });
        } else {
          hero.alive = false;
          hero.tokens = hero.tokens.filter(t => t.type === "counter");
          hero.buffs = [];
          hero.debuffs = [];
          killed = true;
          // Nightmare: lose 25% gold on death
          if (newState.settings.difficulty === "nightmare") {
            const goldLoss = Math.floor(newState.party.gold * 0.25);
            newState = {
              ...newState,
              party: { ...newState.party, gold: newState.party.gold - goldLoss },
            };
            newState = emitEvent(newState, "ABILITY_TRIGGERED", `Nightmare: ${hero.name} died! Party loses ${goldLoss}g (25%).`, {
              targetIds: [hero.id],
              details: { goldLoss, nightmare: true },
            });
          }
        }
      }

      return hero;
    });

    const newParty = {
      ...newState.party,
      heroes: newHeroes,
      deadHeroIds: newHeroes.filter(h => !h.alive).map(h => h.id),
    };

    newState = { ...newState, party: newParty };

    {
      const hero = newHeroes.find(h => h.id === targetId);
      newState = emitEvent(newState, "DAMAGE_APPLIED", `${resolveActorName(newState, attackerId)} dealt ${appliedDamage} damage to ${hero?.name ?? targetId}. HP: ${hero?.currentHp}/${hero?.maxHp}.`, {
        actorId: attackerId,
        targetIds: [targetId],
        details: { damage: appliedDamage, remainingHp: hero?.currentHp, breakdown: resolvedBreakdown, targetName: hero?.name ?? targetId, attackerName: resolveActorName(newState, attackerId) },
      });

      if (appliedDamage > newState.stats.biggestDamageEvent) {
        const attackerName = resolveActorName(newState, attackerId);
        newState = {
          ...newState,
          stats: {
            ...newState.stats,
            biggestDamageEvent: appliedDamage,
            biggestDamageDescription: `${attackerName} → ${hero?.name ?? targetId} for ${appliedDamage}`,
          },
        };
      }

      // Retributor: deal 1 damage back to attacker when damaged
      if (appliedDamage > 0 && hero?.alive && weaponHasTag(hero, "retributor") && attackerId !== "hazard" && attackerId !== "poison" && attackerId !== "burn") {
        const isMonsterAttacker = newState.combat?.monster.id === attackerId;
        if (isMonsterAttacker) {
          const retaliation = applyDamage(newState, newState.combat!.monster.id, hero.id, calculateDamage({ base: 1 }), true);
          newState = retaliation.state;
          newState = emitEvent(newState, "ABILITY_TRIGGERED", `${hero.name}: Retributor! 1 damage back to attacker!`, { actorId: hero.id });
        }
      }
    }

    if (killed) {
      const hero = newHeroes.find(h => h.id === targetId);
      newState = emitEvent(newState, "HERO_DIED", `${hero?.name ?? targetId} has fallen!`, {
        targetIds: [targetId],
        details: { heroName: hero?.name },
      });
      newState = {
        ...newState,
        stats: { ...newState.stats, deaths: newState.stats.deaths + 1 },
      };
    }
  }

  return { state: newState, killed };
}

function isFinalBossPhase(state: GameState): boolean {
  return state.combat?.isFinalBoss ?? false;
}

export function applyHealing(
  state: GameState,
  targetId: string,
  amount: number,
  isRevive: boolean = false
): GameState {
  let newState = { ...state };
  const newHeroes = newState.party.heroes.map((h) => {
    if (h.id !== targetId) return h;

    if (!h.alive && !isRevive) return h;

    if (!h.alive && isRevive) {
      const revived = { ...h };
      revived.alive = true;
      revived.currentHp = Math.min(h.maxHp, Math.floor(h.maxHp * (amount / 100)));
      return revived;
    }

    const healed = { ...h };
    let healAmount = amount;

    const nanobot = healed.debuffs.find(d => d.name === "Nanobot");
    if (nanobot) {
      healed.currentHp = Math.max(0, healed.currentHp - 1);
    }

    healed.currentHp = Math.min(healed.maxHp, healed.currentHp + healAmount);
    return healed;
  });

  const newParty = {
    ...newState.party,
    heroes: newHeroes,
    deadHeroIds: newHeroes.filter(h => !h.alive).map(h => h.id),
  };

  newState = { ...newState, party: newParty };

  const hero = newHeroes.find(h => h.id === targetId);
  const heroBefore = state.party.heroes.find(h => h.id === targetId);
  if (hero) {
    // Effective = actual HP restored (post-clamp delta, floor at 0).
    const effectiveAmount = Math.max(0, hero.currentHp - Math.max(0, heroBefore?.currentHp ?? 0));
    newState = emitEvent(newState, "HEAL_APPLIED", `${hero.name} healed for ${effectiveAmount} HP. HP: ${hero.currentHp}/${hero.maxHp}.`, {
      targetIds: [targetId],
      details: { amount, effectiveAmount, isRevive, currentHp: hero.currentHp },
    });

    if (isRevive) {
      newState = emitEvent(newState, "HERO_REVIVED", `${hero.name} has been revived!`, {
        targetIds: [targetId],
        details: { heroName: hero.name, currentHp: hero.currentHp },
      });
      newState = {
        ...newState,
        stats: { ...newState.stats, revivals: newState.stats.revivals + 1 },
      };
    }
  }

  // Eternal Vigil: gain 1 shield when any ally heals
  const eternalVigilHolder = newState.party.heroes.find(h => h.alive && weaponHasTag(h, "eternal_vigil"));
  if (eternalVigilHolder && eternalVigilHolder.id !== targetId) {
    newState = addToken(newState, eternalVigilHolder.id, createShieldToken(1), false);
  }

  return newState;
}

export function addToken(
  state: GameState,
  targetId: string,
  token: TokenInstance,
  isMonsterTarget: boolean
): GameState {
  let newState = { ...state };

  if (isMonsterTarget && state.combat) {
    const combat = { ...newState.combat! };
    const summon = combat.summons.find(s => s.id === targetId && s.alive);
    if (targetId !== combat.monster.id && targetId !== "monster") {
      if (!summon || summon.tokens.filter(t => t.type === token.type).length >= token.maxStacks) return state;
      combat.summons = combat.summons.map(s => s.id === targetId ? { ...s, tokens: [...s.tokens, token] } : s);
      return emitEvent({ ...newState, combat }, "TOKEN_ADDED", `${token.name} added to ${summon.name}.`, { targetIds: [targetId], details: { tokenType: token.type, tokenName: token.name } });
    }
    let monster = { ...combat.monster };
    const existing = monster.tokens.filter(t => t.type === token.type);
    if (existing.length < token.maxStacks) {
      monster.tokens = [...monster.tokens, token];
    }
    combat.monster = monster;
    newState = { ...newState, combat };
  } else {
    const newHeroes = newState.party.heroes.map((h) => {
      if (h.id !== targetId) return h;
      const existing = h.tokens.filter(t => t.type === token.type);
      if (existing.length >= token.maxStacks) return h;
      return { ...h, tokens: [...h.tokens, token] };
    });
    newState = { ...newState, party: { ...newState.party, heroes: newHeroes } };
  }

  const tokenSymbol = token.type === "shield" ? "🔵" : token.type === "target" ? "🔴" : token.type === "buff" ? "⚫" : token.type === "debuff" ? "🟡" : token.type === "counter" ? "🟢" : "⚪";
  newState = emitEvent(newState, "TOKEN_ADDED", `${tokenSymbol} ${token.name} added to ${resolveTargetName(newState, targetId, isMonsterTarget)}.`, {
    targetIds: [targetId],
    details: { tokenType: token.type, tokenName: token.name },
  });

  return newState;
}

export const STALEMATE_ROUNDS_WITHOUT_PROGRESS = 5;

export function checkCombatEnd(state: GameState): { result: "victory" | "defeat" | "retreat" | "ongoing"; reason: string } {
  if (!state.combat) return { result: "ongoing", reason: "No combat active" };

  const monsterDead = !state.combat.monster.alive;
  const allHeroesDead = getLivingHeroes(state).length === 0;

  if (monsterDead && allHeroesDead) {
    if (state.combat.isFinalBoss) {
      return { result: "defeat", reason: "Party wiped even though boss fell — need at least one survivor" };
    }
    return { result: "victory", reason: "Monster defeated" };
  }

  if (monsterDead) {
    return { result: "victory", reason: "Monster defeated" };
  }

  if (allHeroesDead) {
    return { result: "defeat", reason: "All Heroes have fallen" };
  }

  // Nightmare: must defeat Vyridian within 40 turns
  if (state.settings.difficulty === "nightmare" && state.combat.isFinalBoss && state.combat.turnCount >= 40) {
    return { result: "defeat", reason: "Nightmare: 40-turn limit exceeded against Vyridian" };
  }

  if (state.combat.round > 10) {
    const snapshot = state.combat.lastHpSnapshot;
    const currentMonsterHp = state.combat.monster.currentHp;
    const currentHeroHp = getLivingHeroes(state).reduce((s, h) => s + h.currentHp, 0);

    if (currentMonsterHp === snapshot.monsterHp && currentHeroHp === snapshot.totalHeroHp) {
      if (state.combat.roundsWithoutProgress >= STALEMATE_ROUNDS_WITHOUT_PROGRESS) {
        return { result: "retreat", reason: `Stalemate: ${STALEMATE_ROUNDS_WITHOUT_PROGRESS} rounds with no progress. Heroes retreat.` };
      }
    }
  }

  return { result: "ongoing", reason: "Combat continues" };
}

export function cleanupCombat(state: GameState): GameState {
  if (!state.combat) return state;

  const newHeroes = state.party.heroes.map((h) => ({
    ...h,
    apcs: h.apcs.filter(a => a.permanent),
    temporaryApcs: [],
    oncePerCombat: {},
    perTurnFlags: {},
    buffs: h.buffs.filter(b => b.durationType === "uses" && b.duration > 0),
    debuffs: h.debuffs.filter(d => d.duration > 0 && d.durationType === "turns" && d.duration < 100),
    pet: undefined,
    // Reset temporary max HP boosts (e.g. Sentinel's +4) back to baseMaxHp
    maxHp: h.baseMaxHp,
    currentHp: Math.min(h.baseMaxHp, h.currentHp),
  }));

  let newState: GameState = {
    ...state,
    phase: "exploration",
    party: {
      ...state.party,
      heroes: newHeroes,
      turnOrder: newHeroes.filter(h => h.alive).map(h => h.id),
      deadHeroIds: newHeroes.filter(h => !h.alive).map(h => h.id),
    },
    combat: undefined,
  };

  if (state.deckManager) {
    const returnedCards: Card[] = [];
    for (const hero of state.party.heroes) {
      for (const apc of hero.apcs) {
        if (!apc.permanent && apc.source.deckType === "peon") {
          returnedCards.push(apc.source);
        }
      }
    }
    for (const apc of state.combat.monster.apcs) {
      if (apc.source.deckType === "peon") {
        returnedCards.push(apc.source);
      }
    }
    if (returnedCards.length > 0) {
      newState = {
        ...newState,
        deckManager: {
          ...state.deckManager,
          peon: {
            ...state.deckManager.peon,
            discardPile: [...state.deckManager.peon.discardPile, ...returnedCards],
          },
        },
      };
    }
  }

  if (state.combat.combatResult === "victory" && state.combat.perfectCombatEligible) {
    const allHeroesAlive = newHeroes.every(h => h.alive);
    if (allHeroesAlive) {
      newState = {
        ...newState,
        stats: { ...newState.stats, perfectCombats: newState.stats.perfectCombats + 1 },
      };
    }
  }

  return newState;
}

export function grantRewards(state: GameState): GameState {
  if (!state.combat || state.combat.combatResult !== "victory") return state;

  const monster = state.combat.monster;
  let goldReward = monster.goldReward;

  // Treasure Map: double gold reward
  const hasTreasureMap = state.party.heroes.some(h => h.alive && h.perTurnFlags["treasureMapActive"]);
  if (hasTreasureMap) {
    goldReward = goldReward * 2;
  }

  let newState: GameState = {
    ...state,
    party: {
      ...state.party,
      gold: state.party.gold + goldReward,
    },
    stats: {
      ...state.stats,
      goldEarned: state.stats.goldEarned + goldReward,
    },
  };

  // Consume Treasure Map flag
  if (hasTreasureMap) {
    newState = {
      ...newState,
      party: {
        ...newState.party,
        heroes: newState.party.heroes.map(h =>
          h.alive ? { ...h, perTurnFlags: { ...h.perTurnFlags, treasureMapActive: false } } : h
        ),
      },
    };
    newState = emitEvent(newState, "ABILITY_TRIGGERED", "Treasure Map! Gold reward doubled!", {});
  }

  newState = emitEvent(newState, "REWARD_GRANTED", `Rewards: ${goldReward}g gold.`, {
    details: { gold: goldReward },
  });

  if (state.combat.isMiniBoss) {
    let bonusGold = scaleGold(100, state.spire.tier);
    if (hasTreasureMap) bonusGold = bonusGold * 2;
    newState = {
      ...newState,
      party: { ...newState.party, gold: newState.party.gold + bonusGold },
      stats: { ...newState.stats, goldEarned: newState.stats.goldEarned + bonusGold },
    };
    newState = emitEvent(newState, "REWARD_GRANTED", `Mini-Boss bonus: ${bonusGold}g. Guaranteed Rare+ weapon drop.`, {
      details: { bonusGold, weaponDrop: true },
    });
  }

  return newState;
}
