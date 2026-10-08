import type { Difficulty } from "./simulation";
import type { PartySetupChoice } from "../engine/gameState";
import type { RunRecord, TelemetryLevel } from "./experiment";

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
  /** Telemetry collection level. Defaults to "standard". */
  telemetryLevel?: TelemetryLevel;
  /** Optional human-readable experiment name. */
  name?: string;
}

/**
 * A single simulated run. `status` is the execution status — only
 * "completed" runs carry a gameplay `outcome`, `score`, and finalized
 * `stats`. Technical failures (error/timeout/invalid/cancelled/interrupted)
 * are excluded from win-rate denominators by `aggregateRuns`.
 */
export type RunResult = RunRecord;

export interface WinRateCI {
  /** Lower bound of the confidence interval (0..1). */
  low: number;
  /** Upper bound of the confidence interval (0..1). */
  high: number;
  /** Confidence level, e.g. 0.95. */
  level: number;
}

export interface AggregateStats {
  /** All run records seen (valid + invalid). */
  totalRuns: number;
  /** Runs with status === "completed" — the only valid denominator. */
  validRuns: number;
  victories: number;
  defeats: number;
  retreats: number;
  /** Runs excluded from gameplay statistics, by execution status. */
  errorRuns: number;
  timeoutRuns: number;
  invalidRuns: number;
  cancelledRuns: number;
  interruptedRuns: number;
  /** victories / validRuns * 100 (0 when no valid runs). */
  victoryRate: number;
  /** Wilson score interval for the win rate (fraction, 0..1). */
  victoryRateCI?: WinRateCI;
  /** Evidence tier label driven by valid sample size. */
  evidenceTier: "insufficient" | "exploratory" | "replicated";
  avgScore: number;
  medianScore?: number;
  scoreStdDev?: number;
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
