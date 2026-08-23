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
import type { BatchConfig, RunResult, AggregateStats } from "../types/batch";
import type { HeroClassName } from "../types/heroes";
import { ALL_CLASSES } from "../data/classes";
import { runSingleGame } from "./batchSimulationEngine";
import { generateSeed } from "../utils/ids";

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

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

  return results;
}

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

function comboToBatchConfig(combo: StrategyCombo, labConfig: StrategyLabConfig): BatchConfig {
  return {
    runs: labConfig.runsPerCombo,
    difficulty: labConfig.difficulty,
    partyMode: labConfig.partyMode,
    partyChoices: labConfig.partyChoices,
    combatStrategy: combo.combatStrategy,
    merchantStrategy: combo.merchantStrategy,
    restStrategy: combo.restStrategy,
    splitStrategy: combo.splitStrategy,
    itemUsageStrategy: combo.itemUsageStrategy,
    weaponUpgradeStrategy: combo.weaponUpgradeStrategy,
    baseSeed: labConfig.baseSeed,
  };
}

function aggregateCombo(runs: RunResult[]): AggregateStats {
  const totalRuns = runs.length;
  const victories = runs.filter((r) => r.outcome === "victory").length;
  const defeats = runs.filter((r) => r.outcome === "defeat").length;

  const scores = runs.map((r) => r.score.finalScore);
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const maxScore = scores.length > 0 ? Math.max(...scores) : 0;
  const minScore = scores.length > 0 ? Math.min(...scores) : 0;

  const avgTurns = runs.length > 0 ? Math.round(runs.reduce((a, r) => a + r.totalTurns, 0) / runs.length) : 0;
  const avgRoomsCleared = runs.length > 0 ? Math.round(runs.reduce((a, r) => a + r.roomsCleared, 0) / runs.length) : 0;
  const avgHeroesAlive = runs.length > 0 ? parseFloat((runs.reduce((a, r) => a + r.heroesAlive, 0) / runs.length).toFixed(1)) : 0;

  const buckets = [
    { range: "0-4999", min: 0, max: 4999 },
    { range: "5k-9k", min: 5000, max: 9999 },
    { range: "10k-14k", min: 10000, max: 14999 },
    { range: "15k-19k", min: 15000, max: 19999 },
    { range: "20k-24k", min: 20000, max: 24999 },
    { range: "25k-29k", min: 25000, max: 29999 },
    { range: "30k+", min: 30000, max: Infinity },
  ];
  const scoreDistribution = buckets.map((b) => ({
    range: b.range,
    count: scores.filter((s) => s >= b.min && s <= b.max).length,
  }));

  return {
    totalRuns,
    victories,
    defeats,
    retreats: 0,
    victoryRate: totalRuns > 0 ? Math.round((victories / totalRuns) * 100) : 0,
    avgScore,
    maxScore,
    minScore,
    avgTurns,
    avgRoomsCleared,
    avgHeroesAlive,
    scoreDistribution,
    outcomeByDifficulty: {},
  };
}

function computeClassPerformance(runs: RunResult[]): ClassPerformance[] {
  const classMap = new Map<HeroClassName, { appearances: number; victories: number; totalScore: number; totalSurvival: number }>();

  for (const cls of ALL_CLASSES) {
    classMap.set(cls, { appearances: 0, victories: 0, totalScore: 0, totalSurvival: 0 });
  }

  for (const run of runs) {
    const isVictory = run.outcome === "victory";
    for (const member of run.partyComposition) {
      const entry = classMap.get(member.className);
      if (!entry) continue;
      entry.appearances++;
      if (isVictory) entry.victories++;
      entry.totalScore += run.score.finalScore;
      entry.totalSurvival += run.heroesAlive;
    }
  }

  return ALL_CLASSES.map((cls) => {
    const entry = classMap.get(cls)!;
    return {
      className: cls,
      appearances: entry.appearances,
      victories: entry.victories,
      winRate: entry.appearances > 0 ? Math.round((entry.victories / entry.appearances) * 100) : 0,
      avgScore: entry.appearances > 0 ? Math.round(entry.totalScore / entry.appearances) : 0,
      avgSurvival: entry.appearances > 0 ? parseFloat((entry.totalSurvival / entry.appearances).toFixed(1)) : 0,
    };
  });
}

function computeScoreBreakdown(runs: RunResult[]): ScoreBreakdown {
  if (runs.length === 0) {
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

  const sum = runs.reduce(
    (acc, r) => ({
      baseScore: acc.baseScore + r.score.baseScore,
      heroesAliveBonus: acc.heroesAliveBonus + r.score.heroesAliveBonus,
      goldBonus: acc.goldBonus + r.score.goldBonus,
      tier3Bonus: acc.tier3Bonus + r.score.tier3Bonus,
      turnPenalty: acc.turnPenalty + r.score.turnPenalty,
      itemBonus: acc.itemBonus + r.score.itemBonus,
      perfectCombatBonus: acc.perfectCombatBonus + r.score.perfectCombatBonus,
    }),
    { baseScore: 0, heroesAliveBonus: 0, goldBonus: 0, tier3Bonus: 0, turnPenalty: 0, itemBonus: 0, perfectCombatBonus: 0 }
  );

  const n = runs.length;
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
  if (runs.length === 0) return { variance: 0, stdDev: 0 };
  const scores = runs.map((r) => r.score.finalScore);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((acc, s) => acc + (s - mean) ** 2, 0) / scores.length;
  return { variance: Math.round(variance), stdDev: Math.round(Math.sqrt(variance)) };
}

export async function runStrategyLab(
  config: StrategyLabConfig,
  onProgress?: (progress: LabProgress, currentResult?: RunResult) => void
): Promise<StrategyLabResult> {
  const startedAt = new Date().toISOString();
  const combos = generateCrossProduct(config.axes);
  const comboResults: ComboResult[] = [];

  await nextPaint();

  for (let ci = 0; ci < combos.length; ci++) {
    const combo = combos[ci];
    const comboLabel = comboToLabel(combo);
    const batchConfig = comboToBatchConfig(combo, config);
    const runs: RunResult[] = [];

    for (let ri = 0; ri < config.runsPerCombo; ri++) {
      if (onProgress) {
        onProgress({
          currentCombo: ci,
          totalCombos: combos.length,
          currentRun: ri,
          runsPerCombo: config.runsPerCombo,
          comboLabel,
        });
      }
      await nextPaint();

      const seed = `${config.baseSeed}_LAB_${ci}_R${ri}`;
      const result = await runSingleGame(ri, seed, batchConfig);
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

    const aggregate = aggregateCombo(runs);
    const classPerformance = computeClassPerformance(runs);
    const avgScoreBreakdown = computeScoreBreakdown(runs);
    const { variance: scoreVariance, stdDev: scoreStdDev } = computeVariance(runs);

    comboResults.push({
      combo,
      comboLabel,
      runs,
      aggregate,
      classPerformance,
      avgScoreBreakdown,
      scoreVariance,
      scoreStdDev,
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
    if (cr.aggregate.victoryRate > bestWinRate) {
      bestWinRate = cr.aggregate.victoryRate;
      bestComboIndex = i;
    }
    if (cr.aggregate.victoryRate < worstWinRate) {
      worstWinRate = cr.aggregate.victoryRate;
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
    "Combat",
    "Merchant",
    "Rest",
    "Split",
    "Item Usage",
    "Weapon Upgrade",
    "Runs",
    "Victory Rate",
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
    cr.combo.combatStrategy,
    cr.combo.merchantStrategy,
    cr.combo.restStrategy,
    cr.combo.splitStrategy,
    cr.combo.itemUsageStrategy,
    cr.combo.weaponUpgradeStrategy,
    cr.aggregate.totalRuns,
    cr.aggregate.victoryRate,
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
