import { create } from "zustand";
import type {
  BatchConfig,
  BatchResult,
  RunResult,
} from "../types/batch";
import type { GameEvent } from "../types/events";
import {
  runBatch,
  downloadJSON,
  downloadCSV,
} from "../engine/batchSimulationEngine";
import { generateSeed } from "../utils/ids";

interface BatchStore {
  config: BatchConfig;
  result: BatchResult | null;
  isRunning: boolean;
  progress: { completed: number; total: number };
  currentRunLog: GameEvent[];
  currentRunSummary: string;
  cancelRequested: boolean;

  setConfig: (partial: Partial<BatchConfig>) => void;
  startBatch: () => Promise<void>;
  cancelBatch: () => void;
  resetBatch: () => void;
  doDownloadJSON: () => void;
  doDownloadCSV: () => void;
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
};

export const useBatchStore = create<BatchStore>((set, get) => ({
  config: { ...defaultConfig },
  result: null,
  isRunning: false,
  progress: { completed: 0, total: 0 },
  currentRunLog: [],
  currentRunSummary: "",
  cancelRequested: false,

  setConfig: (partial) => {
    set((s) => ({ config: { ...s.config, ...partial } }));
  },

  startBatch: async () => {
    const config = get().config;
    set({
      isRunning: true,
      result: null,
      progress: { completed: 0, total: config.runs },
      currentRunLog: [],
      currentRunSummary: "",
      cancelRequested: false,
    });

    const batchResult = await runBatch(config, (completed, total, currentResult) => {
      if (currentResult) {
        set({
          progress: { completed, total },
          currentRunLog: currentResult.combatLog.slice(-15),
          currentRunSummary: currentResult.runSummary,
        });
      } else {
        // Pre-run callback: show "Running run N..."
        set({
          progress: { completed, total },
          currentRunSummary: `Running run ${completed + 1} of ${total}...`,
          currentRunLog: [],
        });
      }
    });

    set({
      isRunning: false,
      result: batchResult,
      progress: { completed: batchResult.runs.length, total: batchResult.config.runs },
      currentRunLog: [],
      currentRunSummary: "",
    });
  },

  cancelBatch: () => {
    set({ cancelRequested: true });
  },

  resetBatch: () => {
    set({
      result: null,
      isRunning: false,
      progress: { completed: 0, total: 0 },
      currentRunLog: [],
      currentRunSummary: "",
      cancelRequested: false,
      config: { ...defaultConfig, baseSeed: generateSeed() },
    });
  },

  doDownloadJSON: () => {
    const { result } = get();
    if (result) downloadJSON(result);
  },

  doDownloadCSV: () => {
    const { result } = get();
    if (result) downloadCSV(result);
  },
}));
