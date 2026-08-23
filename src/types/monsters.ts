import type { Card } from "./cards";
import type { TokenInstance, StatusInstance } from "./inventory";
import type { APCInstance } from "./combat";

export type MonsterType =
  | "common"
  | "uncommon"
  | "rare"
  | "elite"
  | "miniboss"
  | "finalBoss"
  | "summon";

export interface MonsterMechanics {
  damage?: number;
  target?: "active" | "all" | "lowest" | "highest" | "fewest_shields" | "most_apcs" | "most_debuffs" | "frozen" | "random" | "two_random" | "two_different" | "position";
  positionRange?: [number, number];
  phaseThrough?: boolean;
  selfDamage?: number;
  heal?: number;
  stealGold?: number;
  stealItem?: boolean;
  stealWeapon?: boolean;
  destroyItem?: "random" | "all";
  disableWeapon?: boolean;
  disableEnchantment?: boolean;
  disableItems?: boolean;
  disableItem?: boolean;
  disableApcs?: boolean;
  apcDamage?: number;
  discardApc?: boolean;
  eachLoseApc?: boolean;
  swapApc?: boolean;
  gainShields?: number;
  gainCounters?: number;
  gainApc?: boolean;
  gainMight?: boolean;
  rollBonusNext2?: boolean;
  overcharge?: boolean;
  focusGaze?: boolean;
  untargetable?: boolean;
  untargetableNextTurn?: boolean;
  fadeSkipTurn?: boolean;
  skipNextTurn?: boolean;
  skip2Turns?: boolean;
  allLoseNextTurn?: boolean;
  removeShields?: boolean;
  shuffleApcs?: boolean;
  createHazard?: boolean;
  trapHero?: boolean;
  throwPosition1?: boolean;
  disableFor2Turns?: boolean;
  summon?: { type: string; count: number };
  allMinus1Roll?: boolean;
  instantKillBelowHp?: number;
  dodgeThreshold?: number;
  dodgeExact?: boolean;
  dodgeRollAll?: boolean;
  healPerHeroHit?: number;
  healPerBot?: boolean;
  nanobotDamage?: number;
  beamSweep?: { primary: number; secondary: number };
  pulseLaserTwice?: boolean;
  restoreHp?: number;
  debuffs?: string[];
  targetToken?: boolean;
  blindActive?: boolean;
}

export interface MonsterRollEntry {
  roll: number | string;
  name: string;
  effect: string;
  description: string;
  effectKey?: string;
  mechanics?: MonsterMechanics;
}

export interface MonsterData {
  id: number;
  name: string;
  cardRank: string;
  cardSuit: string;
  type: MonsterType;
  baseHp: number;
  baseGold: number;
  specialName: string;
  specialDescription: string;
  rollTable: MonsterRollEntry[];
  phases?: MonsterPhaseData[];
}

export interface MonsterPhaseData {
  name: string;
  hpRange: string;
  effects: string[];
  rollOverrides?: MonsterRollEntry[];
}

export interface MonsterState {
  id: string;
  monsterId: number;
  name: string;
  sourceCard: Card;
  type: MonsterType;
  currentHp: number;
  maxHp: number;
  baseHp: number;
  goldReward: number;
  apcs: APCInstance[];
  tokens: TokenInstance[];
  buffs: StatusInstance[];
  debuffs: StatusInstance[];
  specialState: Record<string, unknown>;
  phase?: string;
  alive: boolean;
  untargetable: boolean;
  immune: boolean;
  summons: MonsterState[];
}
