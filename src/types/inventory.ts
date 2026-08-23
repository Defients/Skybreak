export type TokenType = "shield" | "target" | "buff" | "debuff" | "counter" | "special";

export type TokenColor = "blue" | "red" | "black" | "yellow" | "green" | "white";

export type NamedBuff =
  | "Haste"
  | "Might"
  | "Focus"
  | "Regeneration";

export type NamedDebuff =
  | "Poison"
  | "Freeze"
  | "Fear"
  | "Slow"
  | "Petrify"
  | "Burn"
  | "Nanobot"
  | "Illusion"
  | "Stun";

export interface TokenInstance {
  id: string;
  type: TokenType;
  color: TokenColor;
  name: string;
  value: number;
  stackCount: number;
  maxStacks: number;
  duration: number;
  description: string;
}

export interface StatusInstance {
  id: string;
  name: string;
  type: "buff" | "debuff";
  duration: number;
  durationType: "turns" | "uses";
  value: number;
  description: string;
}

export type WeaponRarity = "Common" | "Rare" | "Epic" | "Legendary";

export interface WeaponData {
  id: string;
  name: string;
  className: string;
  rarity: WeaponRarity;
  baseCost: number;
  upgradeCost: number;
  effect: string;
  description: string;
  suit?: string;
  tags: string[];
}

export interface WeaponInstance {
  id: string;
  weaponId: string;
  name: string;
  rarity: WeaponRarity;
  className: string;
  effect: string;
  description: string;
  tags?: string[];
}

export type EnchantmentName =
  | "Swift"
  | "Mighty"
  | "Vampiric"
  | "Explosive"
  | "Precise"
  | "Defensive"
  | "Ethereal"
  | "Chaotic"
  | "Divine"
  | "Toxic";

export interface EnchantmentData {
  name: EnchantmentName;
  costs: { t1: number; t2: number; t3: number };
  effect: string;
  slotFree: boolean;
}

export interface EnchantmentInstance {
  id: string;
  name: EnchantmentName;
  effect: string;
  slotFree: boolean;
}

export type ItemType =
  | "Minor Potion"
  | "Major Potion"
  | "Guardian Angel"
  | "Lucky Charm"
  | "Mystic Rune"
  | "Ability Blocker"
  | "Smoke Bomb"
  | "Treasure Map"
  | "Power Scroll"
  | "Shield Charm"
  | "Speed Potion"
  | "Bomb";

export interface ItemData {
  name: ItemType;
  itemId: string;
  costs: { t1: number; t2: number; t3: number };
  effect: string;
  stackLimit: number;
  isJoker?: boolean;
  tags: string[];
}

export interface ItemInstance {
  id: string;
  name: string;
  itemId?: string;
  effect: string;
  stackLimit: number;
  quantity: number;
  isJoker?: boolean;
  tags?: string[];
}

export type UpgradeType =
  | "HP Increase"
  | "Lucky Dice"
  | "Extra Pocket"
  | "Party Fund";

export interface UpgradeData {
  name: UpgradeType;
  costs: { t1: number; t2: number; t3: number };
  effect: string;
  limit: string;
  limitType?: "perHero" | "perParty" | "perGame";
  limitCount?: number;
}

export interface UpgradeInstance {
  id: string;
  name: UpgradeType;
  effect: string;
  count: number;
}

export interface HealingServiceData {
  name: string;
  costs: { t1: number; t2: number; t3: number };
  effect: string;
}

export interface WeaponServiceData {
  name: string;
  cost: string;
  effect: string;
}
