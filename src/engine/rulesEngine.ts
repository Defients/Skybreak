import type { GameState, RoomNode, RoomType } from "../types/gameState";
import type { HeroState } from "../types/heroes";
import { RngEngine } from "../utils/random";
import { emitEvent } from "./eventLog";
import { isLastRoomInTier, createRoomsForTier } from "../data/rooms";
import { formatRoomType, formatTier } from "../utils/format";

export function advanceRoom(state: GameState): GameState {
  const { spire } = state;
  const nextIndex = spire.roomIndex + 1;

  if (isLastRoomInTier(spire.tier, spire.roomIndex)) {
    return transitionTier(state);
  }

  const newRooms = [...spire.rooms];
  const nextRoom = newRooms[nextIndex];

  if (!nextRoom) {
    return state;
  }

  const newState: GameState = {
    ...state,
    spire: {
      ...spire,
      roomIndex: nextIndex,
      currentRoom: nextRoom,
      splitChoicePending: nextRoom.type === "split",
    },
  };

  return emitEvent(newState, "ROOM_REVEALED", `Room ${nextIndex + 1} revealed: ${formatRoomType(nextRoom.type)} ${nextRoom.symbol}. Tier ${spire.tier} — ${formatTier(spire.tier)}.`, {
    details: { roomIndex: nextIndex, roomType: nextRoom.type, tier: spire.tier },
  });
}

export function transitionTier(state: GameState): GameState {
  const { spire } = state;
  const nextTier = Math.min(3, spire.tier + 1) as 1 | 2 | 3;

  if (nextTier === spire.tier) {
    return state;
  }

  const newRooms = createRoomsForTier(nextTier);

  let newHeroes = state.party.heroes.map((h) => ({
    ...h,
    currentHp: h.alive ? h.maxHp + 2 : h.currentHp,
    maxHp: h.maxHp + 2,
    baseMaxHp: h.baseMaxHp + 2,
  }));

  const newParty = {
    ...state.party,
    heroes: newHeroes,
  };

  const newState: GameState = {
    ...state,
    spire: {
      ...spire,
      tier: nextTier,
      roomIndex: 0,
      rooms: newRooms,
      currentRoom: newRooms[0],
      splitChoicePending: newRooms[0].type === "split",
      merchantPriceMultiplier: spire.merchantPriceMultiplier * 1.5,
    },
    party: newParty,
    phase: "tier_transition",
  };

  return emitEvent(newState, "TIER_ADVANCED", `Tier transition! Now entering Tier ${nextTier} — ${formatTier(nextTier)}. All Heroes fully healed and gain +2 max HP. Merchant prices +50%.`, {
    details: { newTier: nextTier, heroCount: newHeroes.length },
  });
}

export function resolveSplitChoice(
  state: GameState,
  choiceIndex: number,
  rng: RngEngine
): GameState {
  const { spire } = state;
  if (!spire.currentRoom || spire.currentRoom.type !== "split") return state;
  if (!spire.currentRoom.splitOptions) return state;

  const chosen = spire.currentRoom.splitOptions[choiceIndex];
  if (!chosen) return state;

  const newRooms = [...spire.rooms];
  const currentIdx = spire.roomIndex;
  newRooms[currentIdx] = {
    ...newRooms[currentIdx],
    chosenPath: choiceIndex,
    type: chosen.type,
    symbol: chosen.symbol,
  };

  const newState: GameState = {
    ...state,
    spire: {
      ...spire,
      rooms: newRooms,
      currentRoom: newRooms[currentIdx],
      splitChoicePending: false,
    },
  };

  return emitEvent(newState, "SPLIT_CHOICE", `Party chose path ${choiceIndex + 1}: ${formatRoomType(chosen.type)} ${chosen.symbol}`, {
    details: { choiceIndex, chosenType: chosen.type },
  });
}

export function getCurrentRoomType(state: GameState): RoomType | null {
  return state.spire.currentRoom?.type ?? null;
}

export function isRoomResolved(state: GameState): boolean {
  return state.spire.currentRoom?.resolved ?? false;
}

export function markRoomResolved(state: GameState): GameState {
  if (!state.spire.currentRoom) return state;

  const newRooms = [...state.spire.rooms];
  const idx = state.spire.roomIndex;
  newRooms[idx] = { ...newRooms[idx], resolved: true };

  return {
    ...state,
    spire: {
      ...state.spire,
      rooms: newRooms,
      currentRoom: newRooms[idx],
    },
    stats: {
      ...state.stats,
      roomsCleared: state.stats.roomsCleared + 1,
      tier3RoomsCleared: state.spire.tier === 3 ? state.stats.tier3RoomsCleared + 1 : state.stats.tier3RoomsCleared,
    },
  };
}

export function getLivingHeroes(state: GameState): HeroState[] {
  return state.party.heroes.filter((h) => h.alive);
}

export function getDeadHeroes(state: GameState): HeroState[] {
  return state.party.heroes.filter((h) => !h.alive);
}

export function getHeroById(state: GameState, heroId: string): HeroState | undefined {
  return state.party.heroes.find((h) => h.id === heroId);
}

export function getHeroByPosition(state: GameState, position: number): HeroState | undefined {
  return state.party.heroes.find((h) => h.position === position && h.alive);
}

export function getAllHeroes(state: GameState): HeroState[] {
  return state.party.heroes;
}

export function checkPartyDefeat(state: GameState): boolean {
  return getLivingHeroes(state).length === 0;
}

export function selectTargetByPriority(
  candidates: HeroState[],
  criteria: "lowest" | "highest",
  useTokens: boolean = false
): HeroState | undefined {
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];

  const sorted = [...candidates].sort((a, b) => {
    if (criteria === "lowest") {
      if (a.currentHp !== b.currentHp) return a.currentHp - b.currentHp;
    } else {
      if (a.currentHp !== b.currentHp) return b.currentHp - a.currentHp;
    }
    if (useTokens) {
      const aTokens = a.tokens.length;
      const bTokens = b.tokens.length;
      if (aTokens !== bTokens) return criteria === "lowest" ? aTokens - bTokens : bTokens - aTokens;
    }
    return a.heroId - b.heroId;
  });

  return sorted[0];
}

export function selectMonsterTarget(
  state: GameState,
  activeHeroId?: string
): HeroState | undefined {
  const living = getLivingHeroes(state);
  if (living.length === 0) return undefined;

  if (activeHeroId) {
    const active = living.find((h) => h.id === activeHeroId);
    if (active) return active;
  }

  return selectTargetByPriority(living, "lowest", true);
}

const HIGH_THREAT_CLASSES = ["Bladedancer", "Tracker", "Channeler", "Manipulator"];
const LOW_THREAT_CLASSES = ["Guardian", "Mender"];

export function selectNightmareTarget(
  state: GameState,
  activeHeroId?: string
): HeroState | undefined {
  const living = getLivingHeroes(state);
  if (living.length === 0) return undefined;
  if (living.length === 1) return living[0];

  // 1. Active hero is "exposed" — target them first
  if (activeHeroId) {
    const active = living.find((h) => h.id === activeHeroId);
    if (active) return active;
  }

  // 2. Kill priority: any hero at or below 3 HP
  const killable = living.filter((h) => h.currentHp <= 3);
  if (killable.length > 0) {
    return selectTargetByPriority(killable, "lowest", true);
  }

  // 3. Target token (🔴) focus: heroes with Target tokens take +1 damage
  const targeted = living.filter((h) =>
    h.tokens.some((t) => t.type === "target")
  );
  if (targeted.length > 0) {
    return selectTargetByPriority(targeted, "lowest", true);
  }

  // 4. Wounded focus: heroes below 50% HP — finish them off
  const wounded = living.filter((h) => h.currentHp / h.maxHp < 0.5);
  if (wounded.length > 0) {
    // Among wounded, prefer high-threat classes
    const woundedHighThreat = wounded.filter((h) =>
      HIGH_THREAT_CLASSES.includes(h.className)
    );
    if (woundedHighThreat.length > 0) {
      return selectTargetByPriority(woundedHighThreat, "lowest", true);
    }
    return selectTargetByPriority(wounded, "lowest", true);
  }

  // 5. Class threat: prefer attacking high-DPS classes over tanks
  const highThreat = living.filter((h) =>
    HIGH_THREAT_CLASSES.includes(h.className)
  );
  if (highThreat.length > 0) {
    return selectTargetByPriority(highThreat, "lowest", true);
  }

  // 6. Avoid Guardian (may redirect) if possible
  const nonGuardians = living.filter(
    (h) => !LOW_THREAT_CLASSES.includes(h.className)
  );
  if (nonGuardians.length > 0) {
    return selectTargetByPriority(nonGuardians, "lowest", true);
  }

  // 7. Fallback: standard lowest-HP targeting
  return selectTargetByPriority(living, "lowest", true);
}

export function applyDifficultyToMonsterHp(
  baseHp: number,
  tier: number,
  difficulty: string
): number {
  // Nightmare: monsters gain tier bonuses immediately (use tier 3 scaling)
  const effectiveTier = difficulty === "nightmare" ? 3 : tier;
  let hp = baseHp + 3 * effectiveTier;
  if (difficulty === "easy") hp -= 2;
  return Math.max(1, hp);
}

export function applyDifficultyToMonsterRoll(
  roll: number,
  difficulty: string
): number {
  if (difficulty === "hard") return roll + 1;
  return roll;
}
