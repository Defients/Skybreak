import type { Difficulty } from "./simulation";
import type { GameEvent } from "./events";
import type { RunStats, ScoreResult } from "./ui";
import type { HeroClassName } from "./heroes";
import type { Suit } from "./cards";
import type { PartySetupChoice } from "../engine/gameState";
import type {
  CombatStrategy,
  MerchantStrategy,
  RestStrategy,
  SplitStrategy,
  ItemUsageStrategy,
  WeaponUpgradeStrategy,
} from "./batch";
import type { RunResult, AggregateStats } from "./batch";
import type { TelemetryLevel } from "./experiment";

export interface StrategyLabAxes {
  combat: CombatStrategy[];
  merchant: MerchantStrategy[];
  rest: RestStrategy[];
  split: SplitStrategy[];
  itemUsage: ItemUsageStrategy[];
  weaponUpgrade: WeaponUpgradeStrategy[];
}

export interface StrategyLabConfig {
  runsPerCombo: number;
  difficulty: Difficulty;
  partyMode: "fixed" | "random";
  partyChoices?: PartySetupChoice[];
  baseSeed: string;
  axes: StrategyLabAxes;
  /** When true, all combos replay the same scenario per run index
   *  (same seed) so differences are attributable to strategy, not RNG.
   *  When false (default), each combo gets its own derived seed. */
  sharedCohort?: boolean;
  /** Telemetry collection level. Defaults to "standard". */
  telemetryLevel?: TelemetryLevel;
  /** Optional human-readable experiment name. */
  name?: string;
}

export interface StrategyCombo {
  combatStrategy: CombatStrategy;
  merchantStrategy: MerchantStrategy;
  restStrategy: RestStrategy;
  splitStrategy: SplitStrategy;
  itemUsageStrategy: ItemUsageStrategy;
  weaponUpgradeStrategy: WeaponUpgradeStrategy;
}

export interface ClassPerformance {
  className: HeroClassName;
  /** Runs containing at least one hero of this class (party-level exposure). */
  appearances: number;
  /** Party victories in those runs — association, NOT causation. */
  victories: number;
  winRate: number;
  /** Wilson 95% CI for the party-association win rate (0..1 fractions). */
  winRateCI?: { low: number; high: number };
  avgScore: number;
  /**
   * Individual hero survival: fraction of hero-appearances where THAT hero
   * finished alive. Replaces the old party-level avgSurvival misattribution.
   */
  individualSurvivalRate?: number;
  heroAppearances?: number;
  heroSurvivals?: number;
  avgDamageDealt?: number;
  avgDamageReceived?: number;
  /** @deprecated party-level heroesAlive average; kept for compatibility. */
  avgSurvival: number;
}

export interface ScoreBreakdown {
  baseScore: number;
  heroesAliveBonus: number;
  goldBonus: number;
  tier3Bonus: number;
  turnPenalty: number;
  itemBonus: number;
  perfectCombatBonus: number;
}

export interface ComboResult {
  combo: StrategyCombo;
  /** Canonical identity over all six axes — stable primary key. */
  comboId: string;
  /** Human-friendly label (may omit defaults — NOT a key). */
  comboLabel: string;
  runs: RunResult[];
  aggregate: AggregateStats;
  classPerformance: ClassPerformance[];
  avgScoreBreakdown: ScoreBreakdown;
  scoreVariance: number;
  scoreStdDev: number;
}

export interface StrategyLabResult {
  config: StrategyLabConfig;
  combos: ComboResult[];
  totalRuns: number;
  startedAt: string;
  completedAt: string;
  bestComboIndex: number;
  worstComboIndex: number;
  mostConsistentComboIndex: number;
}

export interface LabProgress {
  currentCombo: number;
  totalCombos: number;
  currentRun: number;
  runsPerCombo: number;
  comboLabel: string;
}
