import { create } from "zustand";
import type {
  StrategyLabConfig,
  StrategyLabResult,
  LabProgress,
  ComboResult,
} from "../types/strategyLab";
import type { GameEvent } from "../types/events";
import type { ExperimentStatus } from "../types/experiment";
import {
  generateCrossProduct,
  comboToLabel,
  computeClassPerformance,
  defaultLabConfig,
  downloadLabJSON,
  downloadLabCSV,
} from "../engine/strategyLabEngine";
import {
  expandLabTasks,
  configFingerprint,
  newExperimentId,
  comboToId,
} from "../engine/experimentSpec";
import { aggregateRuns, summarize } from "../engine/statistics";
import {
  startExperiment,
  getResumableRunIds,
  type ExecutionHandle,
} from "./experimentRunner";
import {
  getExperimentStore,
  type StoredExperiment,
} from "../persistence/experimentDb";
import { buildEvidencePackage, downloadJson, runsToCsv } from "../engine/evidenceExport";
import { generateSeed } from "../utils/ids";

interface StrategyLabStore {
  config: StrategyLabConfig;
  result: StrategyLabResult | null;
  isRunning: boolean;
  isPaused: boolean;
  progress: LabProgress | null;
  progressCounts: { completed: number; total: number; persisted: number };
  currentRunLog: GameEvent[];
  currentRunSummary: string;
  cancelRequested: boolean;
  experimentId: string | null;
  experimentStatus: ExperimentStatus | null;
  storageWarning: string | null;
  history: StoredExperiment[];
  historyLoaded: boolean;
  throughput?: number;

  setConfig: (partial: Partial<StrategyLabConfig>) => void;
  setAxes: (partial: Partial<StrategyLabConfig["axes"]>) => void;
  startLab: (resumeId?: string) => Promise<void>;
  cancelLab: () => void;
  pauseLab: () => void;
  resetLab: () => void;
  loadHistory: () => Promise<void>;
  openExperiment: (id: string) => Promise<void>;
  resumeExperiment: (id: string) => Promise<void>;
  deleteExperiment: (id: string) => Promise<void>;
  doDownloadJSON: () => void;
  doDownloadCSV: () => void;
  exportEvidence: () => Promise<void>;
}

let currentHandle: ExecutionHandle | null = null;

function buildLabResult(
  config: StrategyLabConfig,
  runs: import("../types/experiment").RunRecord[],
  startedAt: string,
  completedAt: string
): StrategyLabResult {
  const combos = generateCrossProduct(config.axes);
  const comboResults: ComboResult[] = combos.map((combo, ci) => {
    const comboRuns = runs
      .filter((r) => r.comboIndex === ci)
      .sort((a, b) => a.cohortIndex - b.cohortIndex);
    const validScores = comboRuns
      .filter((r) => r.status === "completed" && r.score)
      .map((r) => r.score!.finalScore);
    const s = summarize(validScores);
    return {
      combo,
      comboId: comboToId(combo),
      comboLabel: comboToLabel(combo),
      runs: comboRuns,
      aggregate: aggregateRuns(comboRuns),
      classPerformance: computeClassPerformance(comboRuns),
      avgScoreBreakdown: comboRuns.length
        ? computeScoreBreakdownShim(comboRuns)
        : computeScoreBreakdownShim([]),
      scoreVariance: s ? Math.round(s.stdDev * s.stdDev) : 0,
      scoreStdDev: s ? Math.round(s.stdDev) : 0,
    };
  });

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

  return {
    config,
    combos: comboResults,
    totalRuns: runs.length,
    startedAt,
    completedAt,
    bestComboIndex,
    worstComboIndex,
    mostConsistentComboIndex,
  };
}

// Local re-implementation kept tiny — average of score components over valid runs.
function computeScoreBreakdownShim(runs: import("../types/experiment").RunRecord[]) {
  const valid = runs.filter((r) => r.status === "completed" && r.score);
  const zero = { baseScore: 0, heroesAliveBonus: 0, goldBonus: 0, tier3Bonus: 0, turnPenalty: 0, itemBonus: 0, perfectCombatBonus: 0 };
  if (valid.length === 0) return zero;
  const keys = Object.keys(zero) as (keyof typeof zero)[];
  const out = { ...zero };
  for (const k of keys) {
    out[k] = Math.round(valid.reduce((a, r) => a + (r.score![k] as number), 0) / valid.length);
  }
  return out;
}

export const useStrategyLabStore = create<StrategyLabStore>((set, get) => ({
  config: defaultLabConfig(),
  result: null,
  isRunning: false,
  isPaused: false,
  progress: null,
  progressCounts: { completed: 0, total: 0, persisted: 0 },
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

  setAxes: (partial) => {
    set((s) => ({ config: { ...s.config, axes: { ...s.config.axes, ...partial } } }));
  },

  startLab: async (resumeId?: string) => {
    if (get().isRunning) return;
    const config = get().config;
    const experimentId = resumeId ?? newExperimentId("lab");
    const combos = generateCrossProduct(config.axes);
    const tasks = expandLabTasks(config, combos, experimentId);
    const fp = configFingerprint({ ...config, name: undefined });

    let skipRunIds: Set<string> | undefined;
    let priorSummary;
    if (resumeId) {
      const resumable = await getResumableRunIds(resumeId);
      if (!resumable) {
        set({ isRunning: false, storageWarning: "Experiment is not resumable." });
        return;
      }
      skipRunIds = resumable.runIds;
      priorSummary = resumable.priorSummary;
    }

    set({
      isRunning: true,
      isPaused: false,
      experimentId,
      experimentStatus: "running",
      result: null,
      progress: null,
      progressCounts: { completed: skipRunIds?.size ?? 0, total: tasks.length, persisted: skipRunIds?.size ?? 0 },
      currentRunLog: [],
      currentRunSummary: "",
      cancelRequested: false,
      storageWarning: null,
    });

    const handle = startExperiment({
      experimentId,
      kind: "strategy-lab",
      name: config.name,
      config,
      configFingerprint: fp,
      tasks,
      resume: !!resumeId,
      skipRunIds,
      priorSummary,
      onProgress: (p) => {
        const lastRun = p.lastRun;
        const comboIdx = lastRun?.comboIndex ?? 0;
        set({
          progress: {
            currentCombo: Math.max(0, comboIdx),
            totalCombos: combos.length,
            currentRun: (lastRun?.cohortIndex ?? 0) + 1,
            runsPerCombo: config.runsPerCombo,
            comboLabel: combos[comboIdx] ? comboToLabel(combos[comboIdx]) : "",
          },
          progressCounts: { completed: p.completed, total: p.total, persisted: p.persisted },
          currentRunLog: (lastRun?.combatLog ?? []).slice(-15),
          currentRunSummary: lastRun?.runSummary ?? "",
          throughput: p.throughput,
        });
      },
      onStatus: (s) => set({ experimentStatus: s }),
      onStorageError: (msg) => set({ storageWarning: msg }),
    });
    currentHandle = handle;

    const outcome = await handle.done;
    currentHandle = null;

    let allRuns = outcome.records;
    try {
      const store = await getExperimentStore();
      const storedRuns = await store.getRuns(experimentId);
      if (storedRuns.length > 0) {
        const byId = new Map(storedRuns.map((r) => [r.runId, r]));
        for (const r of outcome.records) byId.set(r.runId, r);
        allRuns = [...byId.values()];
      }
    } catch { /* session records only */ }

    set({
      isRunning: false,
      isPaused: outcome.status === "paused",
      result: buildLabResult(config, allRuns, new Date().toISOString(), new Date().toISOString()),
      experimentStatus: outcome.status,
      progress: null,
      progressCounts: { completed: allRuns.length, total: tasks.length, persisted: outcome.persisted + (skipRunIds?.size ?? 0) },
      currentRunLog: [],
      currentRunSummary: "",
      storageWarning: outcome.stored ? get().storageWarning : "Durable storage unavailable — results are in memory only. Export before closing the tab.",
    });
    void get().loadHistory();
  },

  cancelLab: () => {
    set({ cancelRequested: true });
    currentHandle?.cancel();
  },

  pauseLab: () => {
    currentHandle?.pause();
  },

  resetLab: () => {
    set({
      result: null,
      isRunning: false,
      isPaused: false,
      progress: null,
      progressCounts: { completed: 0, total: 0, persisted: 0 },
      currentRunLog: [],
      currentRunSummary: "",
      cancelRequested: false,
      experimentId: null,
      experimentStatus: null,
      storageWarning: null,
      throughput: undefined,
      config: { ...defaultLabConfig(), baseSeed: generateSeed() },
    });
  },

  loadHistory: async () => {
    try {
      const store = await getExperimentStore();
      const all = await store.listExperiments();
      set({ history: all.filter((e) => e.kind === "strategy-lab"), historyLoaded: true });
    } catch {
      set({ historyLoaded: true, history: [] });
    }
  },

  openExperiment: async (id) => {
    const store = await getExperimentStore();
    const meta = await store.getExperiment(id);
    if (!meta || meta.kind !== "strategy-lab") return;
    const config = meta.config as StrategyLabConfig;
    const runs = await store.getRuns(id);
    set({
      config,
      result: buildLabResult(config, runs, meta.createdAt, meta.updatedAt),
      experimentId: id,
      experimentStatus: meta.status,
      isRunning: false,
      isPaused: false,
    });
  },

  resumeExperiment: async (id) => {
    const store = await getExperimentStore();
    const meta = await store.getExperiment(id);
    if (!meta || meta.kind !== "strategy-lab") return;
    set({ config: meta.config as StrategyLabConfig });
    await get().startLab(id);
  },

  deleteExperiment: async (id) => {
    const store = await getExperimentStore();
    await store.deleteExperiment(id);
    await get().loadHistory();
  },

  doDownloadJSON: () => {
    const { result } = get();
    if (result) downloadLabJSON(result);
  },

  doDownloadCSV: () => {
    const { result } = get();
    if (result) downloadLabCSV(result);
  },

  exportEvidence: async () => {
    const { experimentId } = get();
    if (!experimentId) return;
    const store = await getExperimentStore();
    const meta = await store.getExperiment(experimentId);
    const runs = await store.getRuns(experimentId);
    if (!meta) return;
    downloadJson(`evidence_${experimentId}.json`, buildEvidencePackage(meta, runs));
    const csv = runsToCsv(runs);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `evidence_${experimentId}_runs.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },
}));
