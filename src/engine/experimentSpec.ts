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
import { CLASS_DATA } from "../data/classes";
import { MONSTERS } from "../data/monsters";
import { ITEMS, PERMANENT_UPGRADES } from "../data/items";

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

// ─── Content fingerprint (Stage 4 provenance) ────────────────────────────────

let cachedContentFingerprint: string | null = null;

/**
 * Fingerprint of gameplay-relevant static content (class stats, monster
 * stats, item effects). Computed from the actual data tables — a change to
 * balance data changes the fingerprint without a manual version bump.
 * Lazily computed and cached; hashing happens once per session.
 */
export function contentFingerprint(): string {
  if (cachedContentFingerprint) return cachedContentFingerprint;
  const snapshot = {
    classes: Object.fromEntries(
      Object.entries(CLASS_DATA).map(([k, v]) => [k, { baseHp: v.baseHp, startingGold: v.startingGold }])
    ),
    monsters: MONSTERS.map((m) => ({ id: m.id, name: m.name, hp: m.baseHp, gold: m.baseGold })),
    items: Object.keys(ITEMS).sort(),
    upgrades: Object.keys(PERMANENT_UPGRADES).sort(),
  };
  cachedContentFingerprint = fnv1a(stableStringify(snapshot));
  return cachedContentFingerprint;
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
  const source = labTaskSource(config, combos, experimentId);
  const tasks: RunTask[] = [];
  for (let i = 0; i < source.total; i++) tasks.push(source.get(i));
  return tasks;
}

// ─── Lazy task sources (Stage 4) ─────────────────────────────────────────────

/**
 * Deterministic task generation by index — the coordinator can schedule
 * large experiments without materializing every RunTask up front.
 * Task identity (runId/seed/policy) depends only on the index and config.
 */
export interface TaskSource {
  total: number;
  get(index: number): RunTask;
}

export function batchTaskSource(
  config: BatchConfig,
  experimentId?: string,
  telemetryLevel?: TelemetryLevel
): TaskSource {
  const policy = batchPolicy(config);
  const level = telemetryLevel ?? config.telemetryLevel ?? "standard";
  return {
    total: config.runs,
    get: (i) => ({
      runId: `${experimentId ?? "batch"}:r${i}`,
      experimentId,
      comboIndex: -1,
      cohortIndex: i,
      runIndex: i,
      seed: deriveRunSeed(config.baseSeed, "batch", i),
      policy,
      telemetryLevel: level,
    }),
  };
}

export function labTaskSource(
  config: StrategyLabConfig,
  combos: StrategyCombo[],
  experimentId?: string
): TaskSource {
  const level = config.telemetryLevel ?? "standard";
  const comboIds = combos.map(comboToId);
  const policies = combos.map((c): SimRunPolicy => ({
    difficulty: config.difficulty,
    partyMode: config.partyMode,
    partyChoices: config.partyChoices,
    combatStrategy: c.combatStrategy,
    merchantStrategy: c.merchantStrategy,
    restStrategy: c.restStrategy,
    splitStrategy: c.splitStrategy,
    itemUsageStrategy: c.itemUsageStrategy,
    weaponUpgradeStrategy: c.weaponUpgradeStrategy,
  }));
  const scope = config.sharedCohort ? "cohort" : "ind";
  const runsPerCombo = config.runsPerCombo;
  return {
    total: combos.length * runsPerCombo,
    get: (index) => {
      const ci = Math.floor(index / runsPerCombo);
      const ri = index % runsPerCombo;
      const comboId = comboIds[ci];
      return {
        runId: `${experimentId ?? "lab"}:${fnv1a(comboId)}:r${ri}`,
        experimentId,
        comboIndex: ci,
        comboId,
        cohortIndex: ri,
        runIndex: ri,
        seed: deriveRunSeed(config.baseSeed, scope, ri, comboId),
        policy: policies[ci],
        telemetryLevel: level,
      };
    },
  };
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
