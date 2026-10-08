import type {
  StrategyLabConfig,
  StrategyLabAxes,
  StrategyCombo,
  ComboResult,
  StrategyLabResult,
  ClassPerformance,
  ScoreBreakdown,
  LabProgress,
} from "../types/strategyLab";
import type { RunResult, AggregateStats } from "../types/batch";
import type { HeroClassName } from "../types/heroes";
import { ALL_CLASSES } from "../data/classes";
import { executeRun } from "./simRunner";
import { batchPolicy, deriveRunSeed, comboToId } from "./experimentSpec";
import { aggregateRuns, wilsonInterval } from "./statistics";
import { generateSeed } from "../utils/ids";

export function generateCrossProduct(axes: StrategyLabAxes): StrategyCombo[] {
  const results: StrategyCombo[] = [];

  for (const combat of axes.combat) {
    for (const merchant of axes.merchant) {
      for (const rest of axes.rest) {
        for (const split of axes.split) {
          for (const itemUsage of axes.itemUsage) {
            for (const weaponUpgrade of axes.weaponUpgrade) {
              results.push({
                combatStrategy: combat,
                merchantStrategy: merchant,
                restStrategy: rest,
                splitStrategy: split,
                itemUsageStrategy: itemUsage,
                weaponUpgradeStrategy: weaponUpgrade,
              });
            }
          }
        }
      }
    }
  }

  // Deduplicate — identical canonical identities must not produce two
  // "distinct" combos in one experiment.
  const seen = new Set<string>();
  return results.filter((c) => {
    const id = comboToId(c);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/**
 * Human-friendly label — omits default-valued axes. NOT a stable identity:
 * two different combos can produce identical labels. Use comboToId() as key.
 */
export function comboToLabel(combo: StrategyCombo): string {
  const parts: string[] = [];
  parts.push(combo.combatStrategy);
  if (combo.merchantStrategy !== "balanced") parts.push(combo.merchantStrategy);
  if (combo.restStrategy !== "smart") parts.push(combo.restStrategy);
  if (combo.splitStrategy !== "combat") parts.push(combo.splitStrategy);
  if (combo.itemUsageStrategy !== "conservative") parts.push(combo.itemUsageStrategy);
  if (combo.weaponUpgradeStrategy !== "when-affordable") parts.push(combo.weaponUpgradeStrategy);
  return parts.join(" + ");
}

/**
 * Class performance with GENUINE per-hero attribution.
 * Party-level win association AND individual hero survival/damage are
 * reported separately — never conflated.
 */
export function computeClassPerformance(runs: RunResult[]): ClassPerformance[] {
  const map = new Map<HeroClassName, {
    appearances: number;
    victories: number;
    totalScore: number;
    totalSurvival: number;
    heroAppearances: number;
    heroSurvivals: number;
    damageDealt: number;
    damageReceived: number;
  }>();

  for (const cls of ALL_CLASSES) {
    map.set(cls, { appearances: 0, victories: 0, totalScore: 0, totalSurvival: 0, heroAppearances: 0, heroSurvivals: 0, damageDealt: 0, damageReceived: 0 });
  }

  for (const run of runs) {
    if (run.status !== "completed") continue;
    const isVictory = run.outcome === "victory";
    for (const member of run.partyComposition) {
      const entry = map.get(member.className);
      if (!entry) continue;
      entry.appearances++;
      if (isVictory) entry.victories++;
      entry.totalScore += run.score?.finalScore ?? 0;
      entry.totalSurvival += run.heroesAlive ?? 0;
    }
    for (const hero of run.heroes ?? []) {
      const entry = map.get(hero.className as HeroClassName);
      if (!entry) continue;
      entry.heroAppearances++;
      if (hero.alive) entry.heroSurvivals++;
      entry.damageDealt += hero.damageDealt;
      entry.damageReceived += hero.damageReceived;
    }
  }

  return ALL_CLASSES.map((cls) => {
    const entry = map.get(cls)!;
    return {
      className: cls,
      appearances: entry.appearances,
      victories: entry.victories,
      winRate: entry.appearances > 0 ? Math.round((entry.victories / entry.appearances) * 100) : 0,
      winRateCI: wilsonInterval(entry.victories, entry.appearances),
      avgScore: entry.appearances > 0 ? Math.round(entry.totalScore / entry.appearances) : 0,
      individualSurvivalRate: entry.heroAppearances > 0
        ? parseFloat((entry.heroSurvivals / entry.heroAppearances).toFixed(3))
        : undefined,
      heroAppearances: entry.heroAppearances,
      heroSurvivals: entry.heroSurvivals,
      avgDamageDealt: entry.heroAppearances > 0 ? Math.round(entry.damageDealt / entry.heroAppearances) : undefined,
      avgDamageReceived: entry.heroAppearances > 0 ? Math.round(entry.damageReceived / entry.heroAppearances) : undefined,
      avgSurvival: entry.appearances > 0 ? parseFloat((entry.totalSurvival / entry.appearances).toFixed(1)) : 0,
    };
  });
}

function computeScoreBreakdown(runs: RunResult[]): ScoreBreakdown {
  const valid = runs.filter((r) => r.status === "completed" && r.score);
  if (valid.length === 0) {
    return {
      baseScore: 0,
      heroesAliveBonus: 0,
      goldBonus: 0,
      tier3Bonus: 0,
      turnPenalty: 0,
      itemBonus: 0,
      perfectCombatBonus: 0,
    };
  }

  const sum = valid.reduce(
    (acc, r) => ({
      baseScore: acc.baseScore + r.score!.baseScore,
      heroesAliveBonus: acc.heroesAliveBonus + r.score!.heroesAliveBonus,
      goldBonus: acc.goldBonus + r.score!.goldBonus,
      tier3Bonus: acc.tier3Bonus + r.score!.tier3Bonus,
      turnPenalty: acc.turnPenalty + r.score!.turnPenalty,
      itemBonus: acc.itemBonus + r.score!.itemBonus,
      perfectCombatBonus: acc.perfectCombatBonus + r.score!.perfectCombatBonus,
    }),
    { baseScore: 0, heroesAliveBonus: 0, goldBonus: 0, tier3Bonus: 0, turnPenalty: 0, itemBonus: 0, perfectCombatBonus: 0 }
  );

  const n = valid.length;
  return {
    baseScore: Math.round(sum.baseScore / n),
    heroesAliveBonus: Math.round(sum.heroesAliveBonus / n),
    goldBonus: Math.round(sum.goldBonus / n),
    tier3Bonus: Math.round(sum.tier3Bonus / n),
    turnPenalty: Math.round(sum.turnPenalty / n),
    itemBonus: Math.round(sum.itemBonus / n),
    perfectCombatBonus: Math.round(sum.perfectCombatBonus / n),
  };
}

function computeVariance(runs: RunResult[]): { variance: number; stdDev: number } {
  const valid = runs.filter((r) => r.status === "completed" && r.score);
  if (valid.length < 2) return { variance: 0, stdDev: 0 };
  const scores = valid.map((r) => r.score!.finalScore);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  // Sample variance (n-1)
  const variance = scores.reduce((acc, s) => acc + (s - mean) ** 2, 0) / (scores.length - 1);
  return { variance: Math.round(variance), stdDev: Math.round(Math.sqrt(variance)) };
}

/**
 * In-process sequential lab execution (no workers, no persistence).
 * New callers should use the ExperimentRunner coordinator.
 */
export async function runStrategyLab(
  config: StrategyLabConfig,
  onProgress?: (progress: LabProgress, currentResult?: RunResult) => void,
  isCancelled?: () => boolean
): Promise<StrategyLabResult> {
  const startedAt = new Date().toISOString();
  const combos = generateCrossProduct(config.axes);
  const comboResults: ComboResult[] = [];

  for (let ci = 0; ci < combos.length; ci++) {
    if (isCancelled?.()) break;

    const combo = combos[ci];
    const comboId = comboToId(combo);
    const comboLabel = comboToLabel(combo);
    const runs: RunResult[] = [];

    for (let ri = 0; ri < config.runsPerCombo; ri++) {
      if (isCancelled?.()) break;
      if (onProgress) {
        onProgress({
          currentCombo: ci,
          totalCombos: combos.length,
          currentRun: ri,
          runsPerCombo: config.runsPerCombo,
          comboLabel,
        });
      }

      const seed = deriveRunSeed(config.baseSeed, config.sharedCohort ? "cohort" : "ind", ri, comboId);
      const result = await executeRun(
        {
          runId: `lab:${comboId}:${ri}`,
          comboIndex: ci,
          comboId,
          cohortIndex: ri,
          runIndex: ri,
          seed,
          policy: {
            ...batchPolicy({
              runs: config.runsPerCombo,
              difficulty: config.difficulty,
              partyMode: config.partyMode,
              partyChoices: config.partyChoices,
              combatStrategy: combo.combatStrategy,
              merchantStrategy: combo.merchantStrategy,
              restStrategy: combo.restStrategy,
              splitStrategy: combo.splitStrategy,
              itemUsageStrategy: combo.itemUsageStrategy,
              weaponUpgradeStrategy: combo.weaponUpgradeStrategy,
              baseSeed: config.baseSeed,
            }),
          },
          telemetryLevel: config.telemetryLevel ?? "standard",
        },
        { isCancelled }
      );
      if (result.status === "cancelled") break;
      runs.push(result);

      if (onProgress) {
        onProgress(
          {
            currentCombo: ci,
            totalCombos: combos.length,
            currentRun: ri + 1,
            runsPerCombo: config.runsPerCombo,
            comboLabel,
          },
          result
        );
      }
    }

    comboResults.push({
      combo,
      comboId,
      comboLabel,
      runs,
      aggregate: aggregateRuns(runs),
      classPerformance: computeClassPerformance(runs),
      avgScoreBreakdown: computeScoreBreakdown(runs),
      scoreVariance: computeVariance(runs).variance,
      scoreStdDev: computeVariance(runs).stdDev,
    });
  }

  const completedAt = new Date().toISOString();

  let bestComboIndex = 0;
  let worstComboIndex = 0;
  let mostConsistentComboIndex = 0;
  let bestWinRate = -1;
  let worstWinRate = 101;
  let lowestStdDev = Infinity;

  for (let i = 0; i < comboResults.length; i++) {
    const cr = comboResults[i];
    const wr = cr.aggregate.victoryRate;
    if (wr !== undefined && wr > bestWinRate) {
      bestWinRate = wr;
      bestComboIndex = i;
    }
    if (wr !== undefined && wr < worstWinRate) {
      worstWinRate = wr;
      worstComboIndex = i;
    }
    if (cr.scoreStdDev < lowestStdDev) {
      lowestStdDev = cr.scoreStdDev;
      mostConsistentComboIndex = i;
    }
  }

  const totalRuns = comboResults.reduce((sum, cr) => sum + cr.runs.length, 0);

  return {
    config,
    combos: comboResults,
    totalRuns,
    startedAt,
    completedAt,
    bestComboIndex,
    worstComboIndex,
    mostConsistentComboIndex,
  };
}

export function downloadLabJSON(result: StrategyLabResult): void {
  const data = JSON.stringify(result, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `strategy_lab_${result.config.baseSeed}_${result.totalRuns}runs_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadLabCSV(result: StrategyLabResult): void {
  const headers = [
    "Combo",
    "Combo ID",
    "Combat",
    "Merchant",
    "Rest",
    "Split",
    "Item Usage",
    "Weapon Upgrade",
    "Valid Runs",
    "Excluded Runs",
    "Victory Rate",
    "Win Rate CI Low",
    "Win Rate CI High",
    "Avg Score",
    "Max Score",
    "Min Score",
    "Avg Turns",
    "Avg Rooms",
    "Avg Heroes Alive",
    "Score StdDev",
  ];
  const rows = result.combos.map((cr) => [
    cr.comboLabel,
    cr.comboId,
    cr.combo.combatStrategy,
    cr.combo.merchantStrategy,
    cr.combo.restStrategy,
    cr.combo.splitStrategy,
    cr.combo.itemUsageStrategy,
    cr.combo.weaponUpgradeStrategy,
    cr.aggregate.validRuns,
    cr.aggregate.totalRuns - cr.aggregate.validRuns,
    cr.aggregate.victoryRate ?? "N/A",
    cr.aggregate.victoryRateCI ? (cr.aggregate.victoryRateCI.low * 100).toFixed(1) : "",
    cr.aggregate.victoryRateCI ? (cr.aggregate.victoryRateCI.high * 100).toFixed(1) : "",
    cr.aggregate.avgScore,
    cr.aggregate.maxScore,
    cr.aggregate.minScore,
    cr.aggregate.avgTurns,
    cr.aggregate.avgRoomsCleared,
    cr.aggregate.avgHeroesAlive,
    cr.scoreStdDev,
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `strategy_lab_${result.config.baseSeed}_${result.totalRuns}runs_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function defaultLabConfig(): StrategyLabConfig {
  return {
    runsPerCombo: 3,
    difficulty: "normal",
    partyMode: "random",
    partyChoices: undefined,
    baseSeed: generateSeed(),
    telemetryLevel: "standard",
    axes: {
      combat: ["aggressive", "defensive", "balanced", "survivalist", "random-legal"],
      merchant: ["balanced"],
      rest: ["full-heal", "revive", "gold", "max-hp", "smart"],
      split: ["combat"],
      itemUsage: ["conservative"],
      weaponUpgrade: ["when-affordable"],
    },
  };
}
