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
  appearances: number;
  victories: number;
  winRate: number;
  avgScore: number;
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
