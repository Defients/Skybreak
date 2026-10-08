/**
 * Stage 3 — versioned evidence packages for export/import.
 *
 * An evidence package is a self-describing, versioned document. It states
 * exactly what was run (config + fingerprints), what happened (run records
 * with honest status), and what the aggregates claim — including what was
 * EXCLUDED. It never fabricates completeness.
 */
import type { RunRecord, ExperimentKind } from "../types/experiment";
import type { StoredExperiment } from "../persistence/experimentDb";
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

/** Validate an imported evidence package. Never executes anything. */
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
  if (p.kind !== "batch" && p.kind !== "strategy-lab") errors.push(`Unknown kind: ${String(p.kind)}`);
  if (!Array.isArray(p.runs)) errors.push("Missing runs array");
  else {
    const ids = new Set<string>();
    const badStatus = new Set<string>();
    for (const r of p.runs) {
      if (typeof r?.runId !== "string") { errors.push("Run missing runId"); break; }
      if (ids.has(r.runId)) { errors.push(`Duplicate runId: ${r.runId}`); break; }
      ids.add(r.runId);
      if (!["completed", "error", "timeout", "invalid", "cancelled", "interrupted"].includes(r.status)) {
        badStatus.add(String(r.status));
      }
    }
    if (badStatus.size) errors.push(`Unknown run statuses: ${[...badStatus].join(", ")}`);
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
