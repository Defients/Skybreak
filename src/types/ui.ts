export interface ValidationWarning {
  id: string;
  category: string;
  message: string;
  severity: "warning" | "error";
  context?: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  warnings: ValidationWarning[];
}

export interface AppliedRuling {
  id: string;
  rule: string;
  issue: string;
  defaultRuling: string;
  overrideable: boolean;
  overridden?: boolean;
  customRuling?: string;
}

export interface RuleSection {
  id: string;
  title: string;
  section: string;
  content: string;
  keywords: string[];
}

export interface ScoreResult {
  baseScore: number;
  heroesAlive: number;
  heroesAliveBonus: number;
  goldRemaining: number;
  goldBonus: number;
  tier3RoomsCleared: number;
  tier3Bonus: number;
  totalTurns: number;
  turnPenalty: number;
  itemsRetained: number;
  itemBonus: number;
  perfectCombats: number;
  perfectCombatBonus: number;
  finalScore: number;
  title?: string;
}

export interface RunStats {
  totalTurns: number;
  roomsCleared: number;
  tier3RoomsCleared: number;
  perfectCombats: number;
  deaths: number;
  revivals: number;
  goldEarned: number;
  goldSpent: number;
  itemsUsed: number;
  biggestDamageEvent: number;
  biggestDamageDescription: string;
  mvpHeroId?: string;
  deadliestMonster?: string;
  bossPhaseReached?: string;
  /** Persisted totals survive the bounded display log. */
  damageByHero?: Record<string, number>;
  damageByMonster?: Record<string, number>;
  /** Stage 3 telemetry: applied damage received per hero id. */
  damageReceivedByHero?: Record<string, number>;
  /** Stage 4 telemetry: EFFECTIVE healing restored per hero id (post-clamp
   *  HP delta; includes revive restoration). Older records accumulated the
   *  pre-clamp requested amount — treat legacy values as approximate. */
  healingByHero?: Record<string, number>;
  /** Stage 3 telemetry: item uses per hero id. */
  itemsUsedByHero?: Record<string, number>;
  /** Stage 4 telemetry: cumulative deaths per hero id. Survives bounded-log
   *  pruning; absent in pre-Stage-4 stats (fall back to log counting). */
  deathsByHero?: Record<string, number>;
}
