/**
 * Stage 3 — experiment identity, seed derivation, and task expansion.
 *
 * Seed derivation protocol v2:
 *   batch:      `${baseSeed}|v2|batch|${runIndex}`
 *   lab cohort: `${baseSeed}|v2|cohort|${cohortIndex}`   (same seed across combos)
 *   lab indep:  `${baseSeed}|v2|ind|${comboId}|${cohortIndex}`
 *
 * Field separators are unambiguous ("|" cannot appear in generated segments;
 * user-supplied baseSeed may contain anything, which is safe because it is
 * always the FIRST field). Strategy order, array ordering, and display
 * labels never affect run identity — the canonical comboId does.
 *
 * Reproducibility contract: equivalent config + seed + ENGINE_FINGERPRINT
 * produce identical outcomes regardless of execution order, worker count,
 * or persistence resume. "Shared cohort" guarantees the same INITIAL seed
 * (hence the same initial scenario/party draw); it does NOT guarantee
 * identical realized randomness once strategies diverge in RNG consumption.
 */
import type { BatchConfig } from "../types/batch";
import type { StrategyCombo, StrategyLabConfig } from "../types/strategyLab";
import type { RunTask, SimRunPolicy, TelemetryLevel } from "../types/experiment";

/**
 * Behavior fingerprint. Bump whenever a change alters seeded outcomes
 * (RNG consumption order/count, sampling methods, policy behavior).
 * Persisted on every experiment; incompatible fingerprints block silent
 * resume under changed semantics.
 */
export const ENGINE_FINGERPRINT = "skybreak-sim/3.1.0";

export const SEED_PROTOCOL_VERSION = 2;

export const EXPERIMENT_SCHEMA_VERSION = 1;

// ─── Canonical strategy identity ─────────────────────────────────────────────

/**
 * Canonical combo identity covering ALL SIX axes in a fixed key order.
 * Display labels (comboToLabel) omit defaults and are NOT stable keys.
 */
export function comboToId(combo: StrategyCombo): string {
  return [
    `combat=${combo.combatStrategy}`,
    `itemUsage=${combo.itemUsageStrategy}`,
    `merchant=${combo.merchantStrategy}`,
    `rest=${combo.restStrategy}`,
    `split=${combo.splitStrategy}`,
    `weaponUpgrade=${combo.weaponUpgradeStrategy}`,
  ].join(";");
}

// ─── Stable hashing ──────────────────────────────────────────────────────────

/** FNV-1a 32-bit hash → 8-char hex. Deterministic across runs/platforms. */
export function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** JSON.stringify with recursively sorted object keys — stable across
 *  property insertion order. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/**
 * Fingerprint of experiment configuration. Used to detect config changes
 * on resume — a resumed experiment only continues when fingerprints match.
 */
export function configFingerprint(config: unknown): string {
  return fnv1a(stableStringify(config));
}

// ─── Seed derivation ─────────────────────────────────────────────────────────

export type SeedScope = "batch" | "cohort" | "ind";

export function deriveRunSeed(
  baseSeed: string,
  scope: SeedScope,
  cohortIndex: number,
  comboId?: string
): string {
  const v = `v${SEED_PROTOCOL_VERSION}`;
  if (scope === "batch") return `${baseSeed}|${v}|batch|${cohortIndex}`;
  if (scope === "cohort") return `${baseSeed}|${v}|cohort|${cohortIndex}`;
  return `${baseSeed}|${v}|ind|${comboId ?? "combo"}|${cohortIndex}`;
}

// ─── Task expansion ──────────────────────────────────────────────────────────

export function batchPolicy(config: BatchConfig): SimRunPolicy {
  return {
    difficulty: config.difficulty,
    partyMode: config.partyMode,
    partyChoices: config.partyChoices,
    combatStrategy: config.combatStrategy,
    merchantStrategy: config.merchantStrategy,
    restStrategy: config.restStrategy,
    splitStrategy: config.splitStrategy,
    itemUsageStrategy: config.itemUsageStrategy,
    weaponUpgradeStrategy: config.weaponUpgradeStrategy,
  };
}

export function expandBatchTasks(
  config: BatchConfig,
  experimentId?: string,
  telemetryLevel?: TelemetryLevel
): RunTask[] {
  const policy = batchPolicy(config);
  const level = telemetryLevel ?? config.telemetryLevel ?? "standard";
  const tasks: RunTask[] = [];
  for (let i = 0; i < config.runs; i++) {
    tasks.push({
      runId: `${experimentId ?? "batch"}:r${i}`,
      experimentId,
      comboIndex: -1,
      cohortIndex: i,
      runIndex: i,
      seed: deriveRunSeed(config.baseSeed, "batch", i),
      policy,
      telemetryLevel: level,
    });
  }
  return tasks;
}

export function expandLabTasks(
  config: StrategyLabConfig,
  combos: StrategyCombo[],
  experimentId?: string
): RunTask[] {
  const level = config.telemetryLevel ?? "standard";
  const tasks: RunTask[] = [];
  for (let ci = 0; ci < combos.length; ci++) {
    const comboId = comboToId(combos[ci]);
    const policy: SimRunPolicy = {
      difficulty: config.difficulty,
      partyMode: config.partyMode,
      partyChoices: config.partyChoices,
      combatStrategy: combos[ci].combatStrategy,
      merchantStrategy: combos[ci].merchantStrategy,
      restStrategy: combos[ci].restStrategy,
      splitStrategy: combos[ci].splitStrategy,
      itemUsageStrategy: combos[ci].itemUsageStrategy,
      weaponUpgradeStrategy: combos[ci].weaponUpgradeStrategy,
    };
    for (let ri = 0; ri < config.runsPerCombo; ri++) {
      tasks.push({
        runId: `${experimentId ?? "lab"}:${fnv1a(comboId)}:r${ri}`,
        experimentId,
        comboIndex: ci,
        comboId,
        cohortIndex: ri,
        runIndex: ri,
        seed: deriveRunSeed(
          config.baseSeed,
          config.sharedCohort ? "cohort" : "ind",
          ri,
          comboId
        ),
        policy,
        telemetryLevel: level,
      });
    }
  }
  return tasks;
}

// ─── Workload estimation ─────────────────────────────────────────────────────

export function countCombos(axes: StrategyLabConfig["axes"]): number {
  return (
    axes.combat.length *
    axes.merchant.length *
    axes.rest.length *
    axes.split.length *
    axes.itemUsage.length *
    axes.weaponUpgrade.length
  );
}

export function estimateLabRuns(config: StrategyLabConfig): number {
  return countCombos(config.axes) * config.runsPerCombo;
}

/** Generate a unique experiment ID. Not gameplay — Math.random is fine here. */
export function newExperimentId(kind: "batch" | "lab"): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `exp_${kind}_${Date.now().toString(36)}_${rand}`;
}
