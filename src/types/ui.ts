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
}
