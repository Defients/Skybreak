import type { TokenInstance, StatusInstance } from "./inventory";
import type { WeaponInstance, EnchantmentInstance, ItemInstance, UpgradeInstance } from "./inventory";
import type { APCInstance } from "./combat";

export type HeroClassName = "Bladedancer" | "Manipulator" | "Tracker" | "Guardian";

export type Specialization =
  | "Shadowblade"
  | "Runeblade"
  | "Timebender"
  | "Illusionist"
  | "Huntmaster"
  | "Beastcaller"
  | "Sentinel"
  | "Warden";

export type HeroPosition = 1 | 2 | 3;

export type HeroId = 1 | 2 | 3;

export interface PetState {
  id: string;
  type: "wolf" | "bear";
  name: string;
  currentHp: number;
  maxHp: number;
  alive: boolean;
}

export interface HeroState {
  id: string;
  heroId: HeroId;
  name: string;
  className: HeroClassName;
  specialization: Specialization;
  position: HeroPosition;
  alive: boolean;
  currentHp: number;
  maxHp: number;
  baseMaxHp: number;
  apcs: APCInstance[];
  temporaryApcs: APCInstance[];
  permanentApcs: APCInstance[];
  tokens: TokenInstance[];
  buffs: StatusInstance[];
  debuffs: StatusInstance[];
  weapon: WeaponInstance;
  enchantment?: EnchantmentInstance;
  items: ItemInstance[];
  upgrades: UpgradeInstance[];
  oncePerCombat: Record<string, boolean>;
  perTurnFlags: Record<string, boolean>;
  pet?: PetState;
  secondPet?: PetState;
}

export interface RollTableEntry {
  roll: number | string;
  effect: string;
  description: string;
  effectKey?: string;
}

export interface ClassData {
  name: HeroClassName;
  /** Stable content identifier, independent of display name. */
  classId: string;
  baseHp: number;
  startingGold: number;
  startingItem: string;
  rank: string;
  role: string;
  specializations: {
    black: { name: Specialization; ability: string; desc: string };
    red: { name: Specialization; ability: string; desc: string };
  };
  rollTable: RollTableEntry[];
  uniqueMechanic: string;
  abilityTrigger: string;
}
