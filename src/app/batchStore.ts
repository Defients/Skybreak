import { create } from "zustand";
import type {
  BatchConfig,
  BatchResult,
  RunResult,
} from "../types/batch";
import type { GameEvent } from "../types/events";
import type { ExperimentStatus } from "../types/experiment";
import {
  batchTaskSource,
  configFingerprint,
  newExperimentId,
} from "../engine/experimentSpec";
import {
  startExperiment,
  planResume,
  type ExecutionHandle,
} from "./experimentRunner";
import {
  getExperimentStore,
  type StoredExperiment,
} from "../persistence/experimentDb";
import { aggregateRuns } from "../engine/statistics";
import { buildEvidencePackage, downloadJson, runsToCsv, validateEvidencePackage, importEvidencePackage, packageSizeOk } from "../engine/evidenceExport";
import { downloadJSON, downloadCSV } from "../engine/batchSimulationEngine";
import { generateSeed } from "../utils/ids";

interface BatchStore {
  config: BatchConfig;
  result: BatchResult | null;
  isRunning: boolean;
  isPaused: boolean;
  progress: { completed: number; total: number; persisted: number };
  currentRunLog: GameEvent[];
  currentRunSummary: string;
  cancelRequested: boolean;
  experimentId: string | null;
  experimentStatus: ExperimentStatus | null;
  storageWarning: string | null;
  history: StoredExperiment[];
  historyLoaded: boolean;
  throughput?: number;

  setConfig: (partial: Partial<BatchConfig>) => void;
  startBatch: () => Promise<void>;
  cancelBatch: () => void;
  pauseBatch: () => void;
  resetBatch: () => void;
  loadHistory: () => Promise<void>;
  openExperiment: (id: string) => Promise<void>;
  resumeExperiment: (id: string) => Promise<void>;
  deleteExperiment: (id: string) => Promise<void>;
  doDownloadJSON: () => void;
  doDownloadCSV: () => void;
  exportEvidence: () => Promise<void>;
  /** Import a skybreak-evidence JSON package as a read-only experiment. */
  importEvidenceFile: (file: File) => Promise<void>;
}

const defaultConfig: BatchConfig = {
  runs: 10,
  difficulty: "normal",
  partyMode: "random",
  partyChoices: undefined,
  combatStrategy: "balanced",
  merchantStrategy: "balanced",
  restStrategy: "full-heal",
  splitStrategy: "combat",
  itemUsageStrategy: "conservative",
  weaponUpgradeStrategy: "when-affordable",
  baseSeed: generateSeed(),
  telemetryLevel: "standard",
};

let currentHandle: ExecutionHandle | null = null;
/** Incremented on every start — stale async callbacks from a previous
 *  session must not overwrite a newer experiment's UI state. */
let sessionToken = 0;

async function runExperimentForConfig(
  config: BatchConfig,
  set: (p: Partial<BatchStore>) => void,
  get: () => BatchStore,
  resumeId?: string
): Promise<void> {
  const experimentId = resumeId ?? newExperimentId("batch");
  const tasks = batchTaskSource(config, experimentId, config.telemetryLevel);
  const fp = configFingerprint({ ...config, name: undefined });
  const session = ++sessionToken;

  let resumePlan;
  if (resumeId) {
    resumePlan = (await planResume(resumeId)) ?? undefined;
    if (!resumePlan) {
      set({ isRunning: false, storageWarning: "Experiment is not resumable." });
      return;
    }
  }

  set({
    isRunning: true,
    isPaused: false,
    experimentId,
    experimentStatus: "running",
    result: null,
    progress: { completed: resumePlan?.reusable.size ?? 0, total: tasks.total, persisted: resumePlan?.committedCount ?? 0 },
    currentRunLog: [],
    currentRunSummary: resumeId ? "Resuming experiment…" : "",
    cancelRequested: false,
    storageWarning: null,
  });

  const handle = startExperiment({
    experimentId,
    kind: "batch",
    name: config.name,
    config,
    configFingerprint: fp,
    tasks,
    resume: !!resumeId,
    resumePlan,
    onProgress: (p) => {
      if (session !== sessionToken) return; // stale session callback
      set({
        progress: { completed: p.completed, total: p.total, persisted: p.persisted },
        currentRunLog: (p.lastRun?.combatLog ?? []).slice(-15),
        currentRunSummary: p.lastRun?.runSummary ?? "",
        throughput: p.throughput,
      });
    },
    onStatus: (s) => { if (session === sessionToken) set({ experimentStatus: s }); },
    onStorageError: (msg) => { if (session === sessionToken) set({ storageWarning: msg }); },
  });
  currentHandle = handle;

  const outcome = await handle.done;
  currentHandle = null;
  if (session !== sessionToken) return; // superseded

  // Load the committed record set for display (committed + session).
  let allRuns: RunResult[] = outcome.records;
  try {
    const store = await getExperimentStore();
    const storedRuns = await store.getRuns(experimentId);
    if (storedRuns.length > 0) {
      const byId = new Map(storedRuns.map((r) => [r.runId, r]));
      for (const r of outcome.records) byId.set(r.runId, r);
      allRuns = [...byId.values()].sort((a, b) => a.runIndex - b.runIndex);
    }
  } catch {
    // fall back to session records
  }

  const batchResult: BatchResult = {
    config,
    runs: allRuns,
    aggregateStats: aggregateRuns(allRuns),
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };

  set({
    isRunning: false,
    isPaused: outcome.status === "paused",
    result: batchResult,
    experimentStatus: outcome.status,
    progress: { completed: allRuns.length, total: tasks.total, persisted: outcome.committedTotal },
    currentRunLog: [],
    currentRunSummary: "",
    storageWarning: outcome.stored ? get().storageWarning : "Durable storage unavailable — results are in memory only. Export before closing the tab.",
  });
  void get().loadHistory();
}

export const useBatchStore = create<BatchStore>((set, get) => ({
  config: { ...defaultConfig },
  result: null,
  isRunning: false,
  isPaused: false,
  progress: { completed: 0, total: 0, persisted: 0 },
  currentRunLog: [],
  currentRunSummary: "",
  cancelRequested: false,
  experimentId: null,
  experimentStatus: null,
  storageWarning: null,
  history: [],
  historyLoaded: false,
  throughput: undefined,

  setConfig: (partial) => {
    set((s) => ({ config: { ...s.config, ...partial } }));
  },

  startBatch: async () => {
    if (get().isRunning) return; // no duplicate scheduling
    await runExperimentForConfig(get().config, set, get);
  },

  cancelBatch: () => {
    set({ cancelRequested: true });
    currentHandle?.cancel();
  },

  pauseBatch: () => {
    currentHandle?.pause();
  },

  resetBatch: () => {
    if (get().isRunning) {
      // Never discard in-flight work silently — cancel so committed
      // progress is preserved and the experiment can be resumed later.
      currentHandle?.cancel();
    }
    sessionToken++;
    set({
      result: null,
      isRunning: false,
      isPaused: false,
      progress: { completed: 0, total: 0, persisted: 0 },
      currentRunLog: [],
      currentRunSummary: "",
      cancelRequested: false,
      experimentId: null,
      experimentStatus: null,
      storageWarning: null,
      throughput: undefined,
      config: { ...defaultConfig, baseSeed: generateSeed() },
    });
  },

  loadHistory: async () => {
    try {
      const store = await getExperimentStore();
      const all = await store.listExperiments();
      set({ history: all.filter((e) => e.kind === "batch"), historyLoaded: true });
    } catch {
      set({ historyLoaded: true, history: [] });
    }
  },

  openExperiment: async (id) => {
    if (get().isRunning) return; // don't clobber an active session's view
    const store = await getExperimentStore();
    const meta = await store.getExperiment(id);
    if (!meta || meta.kind !== "batch") return;
    const runs = await store.getRuns(id);
    const config = meta.config as BatchConfig;
    runs.sort((a, b) => a.runIndex - b.runIndex);
    set({
      config,
      result: {
        config,
        runs,
        aggregateStats: aggregateRuns(runs),
        startedAt: meta.createdAt,
        completedAt: meta.updatedAt,
      },
      experimentId: id,
      experimentStatus: meta.status,
      isRunning: false,
      isPaused: false,
    });
  },

  resumeExperiment: async (id) => {
    if (get().isRunning) return;
    const store = await getExperimentStore();
    const meta = await store.getExperiment(id);
    if (!meta || meta.kind !== "batch") return;
    const config = meta.config as BatchConfig;
    set({ config });
    await runExperimentForConfig(config, set, get, id);
  },

  deleteExperiment: async (id) => {
    // Refuse to delete the experiment currently executing in this context.
    if (get().isRunning && get().experimentId === id) {
      set({ storageWarning: "Cannot delete an experiment while it is running." });
      return;
    }
    const store = await getExperimentStore();
    await store.deleteExperiment(id);
    await get().loadHistory();
  },

  doDownloadJSON: () => {
    const { result } = get();
    if (result) downloadJSON(result);
  },

  doDownloadCSV: () => {
    const { result } = get();
    if (result) downloadCSV(result);
  },

  exportEvidence: async () => {
    const { experimentId } = get();
    if (!experimentId) return;
    const store = await getExperimentStore();
    const meta = await store.getExperiment(experimentId);
    if (!meta) return;
    // Paged reads bound peak memory — don't double-buffer the whole set.
    const runs = await store.getRuns(experimentId);
    const pkg = buildEvidencePackage(meta, runs);
    downloadJson(`evidence_${experimentId}.json`, pkg);
    // Also emit a runs CSV alongside.
    const csv = runsToCsv(runs);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `evidence_${experimentId}_runs.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  importEvidenceFile: async (file) => {
    const sizeCheck = packageSizeOk(file.size);
    if (!sizeCheck.ok) {
      set({ storageWarning: `Import rejected: ${sizeCheck.error}` });
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      set({ storageWarning: "Import rejected: file is not valid JSON." });
      return;
    }
    const v = validateEvidencePackage(raw);
    if (!v.ok || !v.package) {
      set({ storageWarning: `Import rejected: ${v.errors.slice(0, 3).join("; ")}` });
      return;
    }
    const store = await getExperimentStore();
    const res = await importEvidencePackage(store, v.package, v.warnings);
    if (res.ok) {
      set({
        storageWarning: res.warnings.length
          ? `Imported ${res.imported} run(s) with warnings: ${res.warnings.slice(0, 2).join("; ")}`
          : `Imported ${res.imported} run(s) as read-only evidence.`,
      });
      await get().loadHistory();
      if (res.experimentId) await get().openExperiment(res.experimentId);
    } else {
      set({ storageWarning: res.errors.slice(0, 3).join("; ") });
    }
  },
}));
