import type { Card, CardFlipEvent } from "./cards";
import type { MonsterState } from "./monsters";
import type { TokenInstance, StatusInstance } from "./inventory";

export interface APCInstance {
  id: string;
  rank: string;
  suit: string;
  source: Card;
  temporary: boolean;
  permanent: boolean;
  matched: boolean;
}

export type MatchType = "single" | "double" | "set" | "chain" | "none";

export interface MatchResult {
  type: MatchType;
  matchedApcs: APCInstance[];
  flippedCards: Card[];
  bonusDamage: number;
  rollBonus: number;
  description: string;
}

export interface EnvironmentState {
  suit: string;
  name: string;
  effect: string;
  description: string;
  card?: Card;
}

export interface DamageBreakdown {
  base: number;
  weaponBonus: number;
  enchantmentBonus: number;
  tokenBonus: number;
  environmentBonus: number;
  matchBonus: number;
  shieldReduction: number;
  armorReduction: number;
  defenseReduction: number;
  phaseThrough: boolean;
  finalDamage: number;
  notes: string[];
}

export interface DamageResult {
  targetId: string;
  attackerId: string;
  breakdown: DamageBreakdown;
  killed: boolean;
}

export interface DiceResult {
  label: string;
  rolls: number[];
  total: number;
  modifiedTotal: number;
  modifiers: string[];
  step: number;
}

export interface CombatState {
  id: string;
  round: number;
  turnCount: number;
  activeSide: "monster" | "heroes" | "summon";
  activeActorId?: string;
  monster: MonsterState;
  summons: MonsterState[];
  environment: EnvironmentState;
  heroTurnOrder: string[];
  completedHeroTurns: string[];
  cardFlips: CardFlipEvent[];
  damageEvents: DamageResult[];
  perfectCombatEligible: boolean;
  combatResult?: "victory" | "defeat" | "retreat";
  isElite: boolean;
  isMiniBoss: boolean;
  isFinalBoss: boolean;
  roundsWithoutProgress: number;
  lastHpSnapshot: { monsterHp: number; totalHeroHp: number };
  heroComboCount?: number;
  matchChainCount?: number;
  heroFirstRollDone?: Record<string, boolean>;
  currentHeroRoll?: number;
  edgeOfEclipseCount?: number;
  fortressGateUsed?: boolean;
  monsterRollCount?: number;
}

export interface CombatEndResult {
  result: "victory" | "defeat" | "retreat" | "ongoing";
  reason: string;
}
