import { create } from "zustand";
import type {
  StrategyLabConfig,
  StrategyLabResult,
  LabProgress,
} from "../types/strategyLab";
import type { GameEvent } from "../types/events";
import {
  runStrategyLab,
  downloadLabJSON,
  downloadLabCSV,
  defaultLabConfig,
} from "../engine/strategyLabEngine";
import { generateSeed } from "../utils/ids";

interface StrategyLabStore {
  config: StrategyLabConfig;
  result: StrategyLabResult | null;
  isRunning: boolean;
  progress: LabProgress | null;
  currentRunLog: GameEvent[];
  currentRunSummary: string;
  cancelRequested: boolean;

  setConfig: (partial: Partial<StrategyLabConfig>) => void;
  setAxes: (partial: Partial<StrategyLabConfig["axes"]>) => void;
  startLab: () => Promise<void>;
  cancelLab: () => void;
  resetLab: () => void;
  doDownloadJSON: () => void;
  doDownloadCSV: () => void;
}

export const useStrategyLabStore = create<StrategyLabStore>((set, get) => ({
  config: defaultLabConfig(),
  result: null,
  isRunning: false,
  progress: null,
  currentRunLog: [],
  currentRunSummary: "",
  cancelRequested: false,

  setConfig: (partial) => {
    set((s) => ({ config: { ...s.config, ...partial } }));
  },

  setAxes: (partial) => {
    set((s) => ({ config: { ...s.config, axes: { ...s.config.axes, ...partial } } }));
  },

  startLab: async () => {
    const config = get().config;
    set({
      isRunning: true,
      result: null,
      progress: null,
      currentRunLog: [],
      currentRunSummary: "",
      cancelRequested: false,
    });

    const labResult = await runStrategyLab(
      config,
      (prog, currentResult) => {
        if (currentResult) {
          set({
            progress: prog,
            currentRunLog: currentResult.combatLog.slice(-15),
            currentRunSummary: currentResult.runSummary,
          });
        } else {
          set({
            progress: prog,
            currentRunSummary: `Running combo ${prog.currentCombo + 1}/${prog.totalCombos}: ${prog.comboLabel} — run ${prog.currentRun + 1}/${prog.runsPerCombo}`,
            currentRunLog: [],
          });
        }
      },
      () => get().cancelRequested
    );

    set({
      isRunning: false,
      result: labResult,
      progress: null,
      currentRunLog: [],
      currentRunSummary: "",
    });
  },

  cancelLab: () => {
    set({ cancelRequested: true });
  },

  resetLab: () => {
    set({
      result: null,
      isRunning: false,
      progress: null,
      currentRunLog: [],
      currentRunSummary: "",
      cancelRequested: false,
      config: { ...defaultLabConfig(), baseSeed: generateSeed() },
    });
  },

  doDownloadJSON: () => {
    const { result } = get();
    if (result) downloadLabJSON(result);
  },

  doDownloadCSV: () => {
    const { result } = get();
    if (result) downloadLabCSV(result);
  },
}));
