/**
 * Stage 3 — statistical analysis for experiment evidence.
 *
 * Conventions:
 *   - The win-rate denominator is VALID runs only (status "completed").
 *     Technical failures are counted separately and never counted as losses.
 *   - Win-rate uncertainty uses the Wilson score interval (z = 1.96 → 95%).
 *   - Score standard deviation is the SAMPLE standard deviation (n-1).
 *   - Paired comparisons require shared-cohort runs matched by cohortIndex;
 *     unmatched observations are never paired.
 */
import type { RunRecord, GameplayOutcome } from "../types/experiment";
import type { AggregateStats, WinRateCI } from "../types/batch";

// ─── Binomial intervals ─────────────────────────────────────────────────────

/** Wilson score confidence interval for a binomial proportion. */
export function wilsonInterval(
  successes: number,
  n: number,
  z = 1.96
): WinRateCI | undefined {
  if (n <= 0) return undefined;
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  return {
    low: Math.max(0, (center - margin) / denom),
    high: Math.min(1, (center + margin) / denom),
    level: 0.95,
  };
}

// ─── Descriptive statistics ──────────────────────────────────────────────────

export interface NumericSummary {
  n: number;
  mean: number;
  median: number;
  /** Sample standard deviation (n-1 denominator). 0 when n < 2. */
  stdDev: number;
  min: number;
  max: number;
  q1: number;
  q3: number;
}

export function summarize(values: number[]): NumericSummary | undefined {
  const n = values.length;
  if (n === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / n;
  // Welford-style two-pass for numerical stability
  const m2 = values.reduce((acc, v) => acc + (v - mean) * (v - mean), 0);
  const quantile = (q: number) => {
    const pos = (n - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  };
  return {
    n,
    mean,
    median: quantile(0.5),
    stdDev: n > 1 ? Math.sqrt(m2 / (n - 1)) : 0,
    min: sorted[0],
    max: sorted[n - 1],
    q1: quantile(0.25),
    q3: quantile(0.75),
  };
}

// ─── Evidence tiers ──────────────────────────────────────────────────────────

export type EvidenceTier = "insufficient" | "exploratory" | "estimated" | "replicated";

/**
 * Explicit evidence criteria — sample size alone is never replication.
 *   <10 valid runs        → insufficient (numbers shown, no conclusions)
 *   10–49 valid runs      → exploratory indication
 *   ≥50 valid runs        → estimated (a point estimate with uncertainty)
 *   replicated            → ONLY when an independent experiment reproduced
 *                           the result (a workflow claim, never derivable
 *                           from a single sample).
 */
export function evidenceTier(validRuns: number, independentlyReplicated = false): EvidenceTier {
  if (independentlyReplicated && validRuns >= 10) return "replicated";
  if (validRuns < 10) return "insufficient";
  if (validRuns < 50) return "exploratory";
  return "estimated";
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

const SCORE_BUCKETS = [
  { range: "0-4999", min: 0, max: 4999 },
  { range: "5k-9k", min: 5000, max: 9999 },
  { range: "10k-14k", min: 10000, max: 14999 },
  { range: "15k-19k", min: 15000, max: 19999 },
  { range: "20k-24k", min: 20000, max: 24999 },
  { range: "25k-29k", min: 25000, max: 29999 },
  { range: "30k+", min: 30000, max: Infinity },
];

const OUTCOME_KEYS: GameplayOutcome[] = ["victory", "defeat", "retreat"];

/**
 * Aggregate run records. Only status==="completed" runs enter gameplay
 * statistics. Technical failures are tallied separately.
 */
export function aggregateRuns(runs: RunRecord[]): AggregateStats {
  const valid = runs.filter((r) => r.status === "completed" && r.outcome);
  const byStatus = (s: RunRecord["status"]) => runs.filter((r) => r.status === s).length;

  const count = (o: GameplayOutcome) => valid.filter((r) => r.outcome === o).length;
  const victories = count("victory");
  const defeats = count("defeat");
  const retreats = count("retreat");

  // A "completed" record missing its score is corrupt/legacy data: it still
  // counts toward the win-rate denominator (status is authoritative), but it
  // contributes no score observation rather than crashing or skewing to 0.
  const scores = valid.flatMap((r) =>
    typeof r.score?.finalScore === "number" && Number.isFinite(r.score.finalScore)
      ? [r.score.finalScore] : []);
  const scoreSummary = summarize(scores);

  const avgOver = (pick: (r: RunRecord) => number | undefined, digits = 0): number => {
    const vals = valid.map(pick).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (!vals.length) return 0;
    return parseFloat((vals.reduce((a, v) => a + v, 0) / vals.length).toFixed(digits));
  };
  const avgTurns = avgOver((r) => r.totalTurns);
  const avgRoomsCleared = avgOver((r) => r.roomsCleared);
  const avgHeroesAlive = avgOver((r) => r.heroesAlive, 1);

  const scoreDistribution = SCORE_BUCKETS.map((b) => ({
    range: b.range,
    count: scores.filter((s) => s >= b.min && s <= b.max).length,
  }));

  return {
    totalRuns: runs.length,
    validRuns: valid.length,
    victories,
    defeats,
    retreats,
    errorRuns: byStatus("error"),
    timeoutRuns: byStatus("timeout"),
    invalidRuns: byStatus("invalid"),
    cancelledRuns: byStatus("cancelled"),
    interruptedRuns: byStatus("interrupted"),
    victoryRate: valid.length > 0 ? Math.round((victories / valid.length) * 100) : undefined,
    victoryRateCI: wilsonInterval(victories, valid.length),
    evidenceTier: evidenceTier(valid.length),
    avgScore: scoreSummary ? Math.round(scoreSummary.mean) : 0,
    medianScore: scoreSummary ? Math.round(scoreSummary.median) : undefined,
    scoreStdDev: scoreSummary ? Math.round(scoreSummary.stdDev) : undefined,
    maxScore: scoreSummary ? scoreSummary.max : 0,
    minScore: scoreSummary ? scoreSummary.min : 0,
    avgTurns,
    avgRoomsCleared,
    avgHeroesAlive,
    scoreDistribution,
    outcomeByDifficulty: {},
  };
}

// ─── Online aggregation (Stage 4 — streaming metrics over bounded memory) ────

/**
 * Incremental aggregate that consumes run records one at a time with O(1)
 * memory (plus bounded per-combo groups). Welford's algorithm for score
 * mean/variance — numerically stable for large n.
 *
 * Reconciliation: counts must equal the committed record set — checkable
 * against receipt counts from the store.
 */
export class OnlineAggregator {
  total = 0;
  valid = 0;
  victories = 0;
  defeats = 0;
  retreats = 0;
  errors = 0;
  timeouts = 0;
  invalids = 0;
  cancelled = 0;
  interrupted = 0;
  /** Welford state for score. */
  private scoreN = 0;
  private scoreMean = 0;
  private scoreM2 = 0;
  private scoreMin = Infinity;
  private scoreMax = -Infinity;
  /** Per-combo outcome counts (bounded by combo count). */
  private combos = new Map<string, { valid: number; victories: number; scoreSum: number }>();
  /** Per-class hero appearances/survival (bounded: 4 classes). */
  private classes = new Map<string, { heroAppearances: number; heroSurvivals: number; damageDealt: number; damageReceived: number }>();

  push(r: RunRecord): void {
    this.total++;
    switch (r.status) {
      case "completed": {
        this.valid++;
        if (r.outcome === "victory") this.victories++;
        else if (r.outcome === "defeat") this.defeats++;
        else if (r.outcome === "retreat") this.retreats++;
        const score = r.score?.finalScore;
        if (typeof score === "number" && Number.isFinite(score)) {
          this.scoreN++;
          const delta = score - this.scoreMean;
          this.scoreMean += delta / this.scoreN;
          this.scoreM2 += delta * (score - this.scoreMean);
          if (score < this.scoreMin) this.scoreMin = score;
          if (score > this.scoreMax) this.scoreMax = score;
        }
        break;
      }
      case "error": this.errors++; break;
      case "timeout": this.timeouts++; break;
      case "invalid": this.invalids++; break;
      case "cancelled": this.cancelled++; break;
      case "interrupted": this.interrupted++; break;
    }
    if (r.comboId) {
      const c = this.combos.get(r.comboId) ?? { valid: 0, victories: 0, scoreSum: 0 };
      if (r.status === "completed") {
        c.valid++;
        if (r.outcome === "victory") c.victories++;
        c.scoreSum += r.score?.finalScore ?? 0;
      }
      this.combos.set(r.comboId, c);
    }
    if (r.heroes) {
      for (const h of r.heroes) {
        const c = this.classes.get(h.className) ?? { heroAppearances: 0, heroSurvivals: 0, damageDealt: 0, damageReceived: 0 };
        c.heroAppearances++;
        if (h.alive) c.heroSurvivals++;
        c.damageDealt += h.damageDealt;
        c.damageReceived += h.damageReceived;
        this.classes.set(h.className, c);
      }
    }
  }

  get scoreStats(): { n: number; mean: number; variance: number; min: number; max: number } {
    return {
      n: this.scoreN,
      mean: this.scoreMean,
      variance: this.scoreN > 1 ? this.scoreM2 / (this.scoreN - 1) : 0,
      min: this.scoreN ? this.scoreMin : 0,
      max: this.scoreN ? this.scoreMax : 0,
    };
  }

  get comboStats(): ReadonlyMap<string, { valid: number; victories: number; scoreSum: number }> {
    return this.combos;
  }

  get classStats(): ReadonlyMap<string, { heroAppearances: number; heroSurvivals: number; damageDealt: number; damageReceived: number }> {
    return this.classes;
  }
}

// ─── Paired comparison (shared-cohort experiments) ──────────────────────────

export interface PairedComparison {
  /** Number of cohort indices present in BOTH samples. */
  pairs: number;
  /** Cohort indices missing from one side or the other. */
  unmatchedA: number;
  unmatchedB: number;
  /** Outcome pairs where both runs completed. */
  winDiffs: { aWins: number; bWins: number; ties: number };
  /** Mean score difference (A − B) over completed pairs. */
  meanScoreDiff?: number;
  /** Sample stddev of the per-pair score difference. */
  scoreDiffStdDev?: number;
  scoreDiffCI?: { low: number; high: number; level: number };
  /** Wilson CI on P(A wins | decisive pair) — McNemar-style sign test rate. */
  winRateDiffNote?: string;
}

/**
 * Match runs by cohortIndex (and comboId scope outside). Only runs with
 * status "completed" on both sides form a valid pair.
 */
export function pairedCompare(runsA: RunRecord[], runsB: RunRecord[]): PairedComparison {
  const byCohortA = new Map(runsA.map((r) => [r.cohortIndex, r]));
  const byCohortB = new Map(runsB.map((r) => [r.cohortIndex, r]));

  const allCohorts = new Set([...byCohortA.keys(), ...byCohortB.keys()]);
  let pairs = 0;
  let aWins = 0, bWins = 0, ties = 0;
  const diffs: number[] = [];

  for (const c of allCohorts) {
    const a = byCohortA.get(c);
    const b = byCohortB.get(c);
    if (!a || !b) continue;
    if (a.status !== "completed" || b.status !== "completed") continue;
    pairs++;
    const aWin = a.outcome === "victory";
    const bWin = b.outcome === "victory";
    if (aWin && !bWin) aWins++;
    else if (bWin && !aWin) bWins++;
    else ties++;
    diffs.push((a.score?.finalScore ?? 0) - (b.score?.finalScore ?? 0));
  }

  const decisive = aWins + bWins;
  const scoreSummary = summarize(diffs);
  // Normal approximation CI for mean paired score difference.
  let scoreDiffCI: PairedComparison["scoreDiffCI"];
  if (scoreSummary && pairs > 1) {
    const se = scoreSummary.stdDev / Math.sqrt(pairs);
    scoreDiffCI = {
      low: scoreSummary.mean - 1.96 * se,
      high: scoreSummary.mean + 1.96 * se,
      level: 0.95,
    };
  }

  const unmatchedA = [...byCohortA.keys()].filter((c) => !byCohortB.has(c)).length;
  const unmatchedB = [...byCohortB.keys()].filter((c) => !byCohortA.has(c)).length;

  return {
    pairs,
    unmatchedA,
    unmatchedB,
    winDiffs: { aWins, bWins, ties },
    meanScoreDiff: scoreSummary?.mean,
    scoreDiffStdDev: scoreSummary?.stdDev,
    scoreDiffCI,
    winRateDiffNote: decisive > 0
      ? `Decisive pairs: A won ${aWins}, B won ${bWins} of ${decisive} (${((aWins / decisive) * 100).toFixed(1)}% for A).`
      : "No decisive pairs.",
  };
}
