import type { Difficulty } from "./simulation";
import type { GameEvent } from "./events";
import type { RunStats, ScoreResult } from "./ui";
import type { HeroClassName } from "./heroes";
import type { Suit } from "./cards";
import type { PartySetupChoice } from "../engine/gameState";

export type CombatStrategy = "aggressive" | "defensive" | "balanced" | "survivalist" | "random-legal";
export type MerchantStrategy = "skip" | "heal-items" | "upgrades" | "balanced";
export type RestStrategy = "full-heal" | "revive" | "gold" | "max-hp" | "smart";
export type SplitStrategy = "combat" | "safe" | "random";
export type PartyMode = "fixed" | "random";
export type ItemUsageStrategy = "never" | "conservative" | "aggressive" | "always-if-hurt";
export type WeaponUpgradeStrategy = "never" | "when-affordable" | "prioritize";

export interface StrategyPreset {
  name: string;
  icon: string;
  combatStrategy: CombatStrategy;
  merchantStrategy: MerchantStrategy;
  restStrategy: RestStrategy;
  splitStrategy: SplitStrategy;
  itemUsageStrategy: ItemUsageStrategy;
  weaponUpgradeStrategy: WeaponUpgradeStrategy;
  builtIn?: boolean;
}

export interface BatchConfig {
  runs: number;
  difficulty: Difficulty;
  partyMode: PartyMode;
  partyChoices?: PartySetupChoice[];
  combatStrategy: CombatStrategy;
  merchantStrategy: MerchantStrategy;
  restStrategy: RestStrategy;
  splitStrategy: SplitStrategy;
  itemUsageStrategy: ItemUsageStrategy;
  weaponUpgradeStrategy: WeaponUpgradeStrategy;
  baseSeed: string;
}

export interface RunResult {
  runIndex: number;
  seed: string;
  outcome: "victory" | "defeat" | "retreat";
  defeatedBy?: string;
  score: ScoreResult;
  stats: RunStats;
  heroesAlive: number;
  totalTurns: number;
  roomsCleared: number;
  partyComposition: { className: HeroClassName; suit: Suit; specialization: string }[];
  combatLog: GameEvent[];
  runSummary: string;
}

export interface AggregateStats {
  totalRuns: number;
  victories: number;
  defeats: number;
  retreats: number;
  victoryRate: number;
  avgScore: number;
  maxScore: number;
  minScore: number;
  avgTurns: number;
  avgRoomsCleared: number;
  avgHeroesAlive: number;
  scoreDistribution: { range: string; count: number }[];
  outcomeByDifficulty: Record<string, { wins: number; losses: number }>;
}

export interface BatchResult {
  config: BatchConfig;
  runs: RunResult[];
  aggregateStats: AggregateStats;
  startedAt: string;
  completedAt: string;
}
