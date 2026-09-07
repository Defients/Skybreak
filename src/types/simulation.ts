export type GameMode = "simulation" | "playable" | "companion" | "hybrid" | "sandbox";

export type Difficulty = "easy" | "normal" | "hard" | "nightmare";

import type { CombatStrategy, ItemUsageStrategy, MerchantStrategy } from "./batch";

export type SimSpeed = "cinematic" | "readable" | "fast" | "instant" | "batch";

export type LogLevel = "minimal" | "normal" | "verbose" | "debug";

export type PartyControl = "human" | "ai" | "hybrid";

export type MonsterControl = "rules" | "manual";

export type RngMode = "seeded" | "manual" | "physical";

export interface BatchConfig {
  enabled: boolean;
  runs: number;
  aggregateStats: boolean;
}

export interface SimulationConfig {
  mode: GameMode;
  seed: string;
  difficulty: Difficulty;
  partyControl: PartyControl;
  monsterControl: MonsterControl;
  rngMode: RngMode;
  speed: SimSpeed;
  logLevel: LogLevel;
  showDamageMath: boolean;
  showCardFlips: boolean;
  showDiceRolls: boolean;
  allowManualOverride: boolean;
  allowIllegalOverride: boolean;
  autoResolveTrivialChoices: boolean;
  /** AI combat strategy for sim/hybrid modes. Defaults to "balanced". */
  combatStrategy?: CombatStrategy;
  /** AI item usage policy for sim/hybrid modes. Defaults to "conservative". */
  itemUsageStrategy?: ItemUsageStrategy;
  /** AI merchant strategy for sim/hybrid modes. Defaults to "balanced". */
  merchantStrategy?: MerchantStrategy;
  batch?: BatchConfig;
}
