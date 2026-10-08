/**
 * Stage 3 — versioned evidence packages for export/import.
 *
 * An evidence package is a self-describing, versioned document. It states
 * exactly what was run (config + fingerprints), what happened (run records
 * with honest status), and what the aggregates claim — including what was
 * EXCLUDED. It never fabricates completeness.
 */
import type { RunRecord, ExperimentKind } from "../types/experiment";
import type { StoredExperiment, ExperimentStore } from "../persistence/experimentDb";
import { ENGINE_FINGERPRINT, EXPERIMENT_SCHEMA_VERSION } from "./experimentSpec";

export const EVIDENCE_SCHEMA_VERSION = 1;

export interface EvidencePackage {
  schema: "skybreak-evidence";
  schemaVersion: number;
  experimentSchemaVersion: number;
  experimentId: string;
  kind: ExperimentKind;
  name?: string;
  engineFingerprint: string;
  configFingerprint: string;
  config: unknown;
  createdAt: string;
  exportedAt: string;
  status: string;
  totals: {
    tasks: number;
    recorded: number;
    validRuns: number;
    victories: number;
    defeats: number;
    technicalFailures: number;
  };
  runs: RunRecord[];
  /** Reproducibility disclosure — never claims more than is guaranteed. */
  reproducibility: {
    seedProtocol: number;
    statement: string;
  };
}

export function buildEvidencePackage(
  meta: StoredExperiment,
  runs: RunRecord[]
): EvidencePackage {
  const valid = runs.filter((r) => r.status === "completed");
  const failures = runs.filter((r) => r.status !== "completed" && r.status !== "cancelled");
  return {
    schema: "skybreak-evidence",
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    experimentSchemaVersion: meta.schemaVersion,
    experimentId: meta.id,
    kind: meta.kind,
    name: meta.name,
    engineFingerprint: meta.engineFingerprint,
    configFingerprint: meta.configFingerprint,
    config: meta.config,
    createdAt: meta.createdAt,
    exportedAt: new Date().toISOString(),
    status: meta.status,
    totals: {
      tasks: meta.totalTasks,
      recorded: runs.length,
      validRuns: valid.length,
      victories: valid.filter((r) => r.outcome === "victory").length,
      defeats: valid.filter((r) => r.outcome === "defeat").length,
      technicalFailures: failures.length,
    },
    runs,
    reproducibility: {
      seedProtocol: 2,
      statement:
        "Runs are reproducible under the recorded engineFingerprint with the " +
        "same seed protocol. 'Shared cohort' runs share initial seeds and " +
        "starting conditions only; realized randomness diverges once " +
        "strategies consume RNG differently.",
    },
  };
}

export interface EvidenceValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  package?: EvidencePackage;
}

const MAX_PACKAGE_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_PACKAGE_RUNS = 200_000;
const LEGAL_STATUSES = new Set(["completed", "error", "timeout", "invalid", "cancelled", "interrupted"]);
const LEGAL_OUTCOMES = new Set(["victory", "defeat", "retreat"]);

/** Validate an imported evidence package. Never executes anything.
 *  Treats the input as untrusted: checks structure, legal status/outcome
 *  combinations, duplicates, numeric sanity, and size limits. */
export function validateEvidencePackage(raw: unknown): EvidenceValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (raw === null || typeof raw !== "object") {
    return { ok: false, errors: ["Not a JSON object"], warnings };
  }
  const p = raw as Partial<EvidencePackage>;
  if (p.schema !== "skybreak-evidence") errors.push(`Unknown schema: ${String(p.schema)}`);
  if (typeof p.schemaVersion !== "number") errors.push("Missing schemaVersion");
  else if (p.schemaVersion > EVIDENCE_SCHEMA_VERSION)
    errors.push(`Unsupported schema version ${p.schemaVersion} (max ${EVIDENCE_SCHEMA_VERSION})`);
  if (typeof p.experimentId !== "string" || !p.experimentId) errors.push("Missing experimentId");
  else if (p.experimentId.length > 200) errors.push("experimentId too long");
  if (p.kind !== "batch" && p.kind !== "strategy-lab") errors.push(`Unknown kind: ${String(p.kind)}`);
  if (!Array.isArray(p.runs)) errors.push("Missing runs array");
  else {
    if (p.runs.length > MAX_PACKAGE_RUNS) {
      errors.push(`Package too large: ${p.runs.length} runs (max ${MAX_PACKAGE_RUNS})`);
    }
    const ids = new Set<string>();
    const cohortCombo = new Set<string>();
    let schemaErrors = 0;
    let statusOutcomeErrors = 0;
    let numericErrors = 0;
    for (const [i, r] of p.runs.entries()) {
      if (errors.length > 12) break; // don't flood the report
      if (typeof r?.runId !== "string" || !r.runId) { errors.push(`Run ${i}: missing runId`); continue; }
      if (ids.has(r.runId)) { errors.push(`Duplicate runId: ${r.runId}`); continue; }
      ids.add(r.runId);
      if (!LEGAL_STATUSES.has(r.status)) { schemaErrors++; continue; }
      // Legal status/outcome combinations: only completed carries an outcome.
      if (r.status === "completed" && !LEGAL_OUTCOMES.has(r.outcome ?? "")) {
        statusOutcomeErrors++;
      }
      if (r.status !== "completed" && r.outcome !== undefined) {
        statusOutcomeErrors++;
      }
      if (typeof r.runIndex !== "number" || !Number.isFinite(r.runIndex)) numericErrors++;
      if (typeof r.cohortIndex === "number" && r.comboId) {
        const ck = `${r.comboId}#${r.cohortIndex}`;
        if (cohortCombo.has(ck)) {
          warnings.push(`Duplicate cohort entry: ${ck}`);
        }
        cohortCombo.add(ck);
      }
      if (r.score && (!Number.isFinite(r.score.finalScore))) numericErrors++;
      if (r.traceStats && typeof r.traceStats.emitted === "number" &&
          typeof r.traceStats.retained === "number" &&
          r.traceStats.retained > r.traceStats.emitted) {
        warnings.push(`Run ${r.runId}: trace retained > emitted (suspicious completeness claim)`);
      }
    }
    if (schemaErrors) errors.push(`${schemaErrors} run(s) with unknown status values`);
    if (statusOutcomeErrors) errors.push(`${statusOutcomeErrors} run(s) with illegal status/outcome combinations`);
    if (numericErrors) errors.push(`${numericErrors} run(s) with non-finite numeric fields`);
  }
  // Totals consistency (advisory)
  if (p.totals && Array.isArray(p.runs)) {
    const completed = p.runs.filter((r) => r?.status === "completed").length;
    if (typeof p.totals.validRuns === "number" && p.totals.validRuns !== completed) {
      warnings.push(`Declared validRuns (${p.totals.validRuns}) differs from counted completed runs (${completed})`);
    }
  }
  if (p.engineFingerprint && p.engineFingerprint !== ENGINE_FINGERPRINT) {
    warnings.push(
      `Package engine fingerprint (${p.engineFingerprint}) differs from current ` +
      `(${ENGINE_FINGERPRINT}) — results may not reproduce under this build.`
    );
  }
  return errors.length
    ? { ok: false, errors, warnings }
    : { ok: true, errors, warnings, package: p as EvidencePackage };
}

/** Text-size guard for file imports — call before JSON.parse. */
export function packageSizeOk(byteLength: number): { ok: boolean; error?: string } {
  if (byteLength > MAX_PACKAGE_BYTES) {
    return { ok: false, error: `Package exceeds ${MAX_PACKAGE_BYTES / 1024 / 1024}MB limit (${(byteLength / 1024 / 1024).toFixed(1)}MB)` };
  }
  return { ok: true };
}

// ─── Import ──────────────────────────────────────────────────────────────────

export interface ImportResult {
  ok: boolean;
  experimentId?: string;
  imported: number;
  skippedDuplicates: number;
  errors: string[];
  warnings: string[];
}

/**
 * Import a validated evidence package into the experiment store as a
 * read-only "imported" experiment. Deterministic target id (`imp_<pkgId>`)
 * makes re-import idempotent — duplicate runIds are skipped, never merged.
 */
export async function importEvidencePackage(
  store: ExperimentStore,
  pkg: EvidencePackage,
  warnings: string[] = []
): Promise<ImportResult> {
  const targetId = `imp_${pkg.experimentId}`.slice(0, 200);
  const existing = await store.getExperiment(targetId).catch(() => undefined);
  const existingIds = existing ? await store.getRunIds(targetId) : new Set<string>();
  const newRuns = pkg.runs
    .filter((r) => !existingIds.has(r.runId))
    .map((r) => ({ ...r, experimentId: targetId }));
  const skipped = pkg.runs.length - newRuns.length;

  const now = new Date().toISOString();
  const meta: StoredExperiment = {
    id: targetId,
    kind: pkg.kind,
    name: `${pkg.name ?? pkg.experimentId} (imported)`,
    status: "imported",
    createdAt: pkg.createdAt ?? now,
    updatedAt: now,
    schemaVersion: pkg.experimentSchemaVersion ?? EXPERIMENT_SCHEMA_VERSION,
    engineFingerprint: pkg.engineFingerprint ?? "unknown",
    configFingerprint: pkg.configFingerprint ?? "unknown",
    config: pkg.config,
    totalTasks: pkg.totals?.tasks ?? pkg.runs.length,
    completedTasks: pkg.runs.length,
    persistedTasks: pkg.runs.length,
    importedFrom: pkg.experimentId,
    summary: {
      validRuns: pkg.totals?.validRuns ?? pkg.runs.filter((r) => r.status === "completed").length,
      victories: pkg.totals?.victories ?? 0,
      defeats: pkg.totals?.defeats ?? 0,
      errorRuns: pkg.runs.filter((r) => r.status === "error" || r.status === "invalid").length,
      timeoutRuns: pkg.runs.filter((r) => r.status === "timeout").length,
      avgScore: 0,
    },
  };
  try {
    if (!existing) await store.createExperiment(meta);
    else await store.updateExperiment(targetId, meta);
    if (newRuns.length) await store.putRuns(newRuns);
    return {
      ok: true,
      experimentId: targetId,
      imported: newRuns.length,
      skippedDuplicates: skipped,
      errors: [],
      warnings: [
        ...warnings,
        ...(skipped ? [`${skipped} duplicate run(s) already imported — skipped`] : []),
      ],
    };
  } catch (err) {
    return {
      ok: false,
      imported: 0,
      skippedDuplicates: 0,
      errors: [`Import failed: ${err instanceof Error ? err.message : String(err)}`],
      warnings,
    };
  }
}

/** Download a JSON document (browser only — never called from workers). */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** CSV of individual run rows. */
export function runsToCsv(runs: RunRecord[]): string {
  const headers = [
    "runId", "runIndex", "comboId", "cohortIndex", "seed",
    "status", "outcome", "defeatedBy", "score", "turns", "roomsCleared",
    "heroesAlive", "party", "errorCategory",
  ];
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = runs.map((r) =>
    [
      r.runId, r.runIndex, r.comboId ?? "", r.cohortIndex, r.seed,
      r.status, r.outcome ?? "", r.defeatedBy ?? "", r.score?.finalScore ?? "",
      r.totalTurns ?? "", r.roomsCleared ?? "", r.heroesAlive ?? "",
      r.partyComposition.map((p) => `${p.className}/${p.specialization}`).join(" + "),
      r.diagnostics?.errorCategory ?? "",
    ].map(esc).join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}
