import type { RoomNode, RoomType } from "../types/gameState";

interface RoomDef {
  type: RoomType;
  symbol: string;
  splitOptions?: { type: RoomType; symbol: string }[];
}

const TIER_1_ROOMS: RoomDef[] = [
  { type: "merchant", symbol: "♦️" },
  { type: "combat", symbol: "♣️" },
  { type: "combat", symbol: "♣️" },
  { type: "rest", symbol: "❤️" },
  { type: "split", symbol: "X/Y", splitOptions: [
    { type: "elite_combat", symbol: "♠️" },
    { type: "combat", symbol: "♣️" },
  ]},
  { type: "combat", symbol: "♣️" },
  { type: "merchant", symbol: "♦️" },
  { type: "combat", symbol: "♣️" },
  { type: "elite_combat", symbol: "♠️" },
  { type: "rest", symbol: "❤️" },
];

const TIER_2_ROOMS: RoomDef[] = [
  { type: "combat", symbol: "♣️" },
  { type: "elite_combat", symbol: "♠️" },
  { type: "merchant", symbol: "♦️" },
  { type: "combat", symbol: "♣️" },
  { type: "rest", symbol: "❤️" },
  { type: "combat", symbol: "♣️" },
  { type: "split", symbol: "X/Y", splitOptions: [
    { type: "elite_combat", symbol: "♠️" },
    { type: "combat", symbol: "♣️" },
  ]},
  { type: "merchant", symbol: "♦️" },
  { type: "combat", symbol: "♣️" },
  { type: "mini_boss", symbol: "♠️🌟" },
  { type: "rest", symbol: "❤️" },
  { type: "merchant", symbol: "♦️" },
];

const TIER_3_ROOMS: RoomDef[] = [
  { type: "elite_combat", symbol: "♠️" },
  { type: "combat", symbol: "♣️" },
  { type: "rest", symbol: "❤️" },
  { type: "merchant", symbol: "♦️" },
  { type: "mini_boss", symbol: "♠️🌟" },
  { type: "combat", symbol: "♣️" },
  { type: "combat", symbol: "♣️" },
  { type: "split", symbol: "X/Y", splitOptions: [
    { type: "merchant", symbol: "♦️" },
    { type: "rest", symbol: "❤️" },
  ]},
  { type: "elite_combat", symbol: "♠️" },
  { type: "final_boss", symbol: "🏰" },
];

const TIER_MAP: Record<number, RoomDef[]> = {
  1: TIER_1_ROOMS,
  2: TIER_2_ROOMS,
  3: TIER_3_ROOMS,
};

export function getTierRoomCount(tier: number): number {
  return TIER_MAP[tier]?.length ?? 0;
}

export function createRoomsForTier(tier: 1 | 2 | 3): RoomNode[] {
  const defs = TIER_MAP[tier];
  if (!defs) return [];

  return defs.map((def, index) => {
    const room: RoomNode = {
      index,
      type: def.type,
      symbol: def.symbol,
      tier,
      resolved: false,
    };

    if (def.splitOptions) {
      room.splitOptions = def.splitOptions.map((opt, i) => ({
        index: i,
        type: opt.type,
        symbol: opt.symbol,
        tier,
        resolved: false,
      }));
    }

    return room;
  });
}

export function getTotalRooms(): number {
  return TIER_1_ROOMS.length + TIER_2_ROOMS.length + TIER_3_ROOMS.length;
}

export function isLastRoomInTier(tier: 1 | 2 | 3, roomIndex: number): boolean {
  return roomIndex >= getTierRoomCount(tier) - 1;
}

export function isFinalRoom(tier: 1 | 2 | 3, roomIndex: number): boolean {
  return tier === 3 && roomIndex >= TIER_3_ROOMS.length - 1;
}
