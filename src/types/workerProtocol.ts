import type { RunTask, RunRecord, ExperimentStatus } from "./experiment";

/**
 * Typed worker protocol for simulation execution.
 *
 * Every message carries experimentId; receivers MUST ignore messages whose
 * experimentId doesn't match the active experiment. taskId is the runId of
 * the RunTask being executed.
 */
export type WorkerInbound =
  | { type: "init"; experimentId: string }
  | { type: "run"; experimentId: string; taskId: string; task: RunTask }
  | { type: "cancel"; experimentId: string }
  | { type: "shutdown"; experimentId: string };

export type WorkerOutbound =
  | { type: "ready"; experimentId: string }
  | { type: "result"; experimentId: string; taskId: string; record: RunRecord }
  | { type: "ack-cancel"; experimentId: string }
  | { type: "error"; experimentId: string; taskId?: string; message: string };

/** Progress reported by the coordinator to the UI store. */
export interface ExperimentProgress {
  /** Tasks that produced a record (any status). */
  completed: number;
  /** Total tasks in the experiment. */
  total: number;
  /** Records durably persisted (subset of completed). */
  persisted: number;
  /** Valid (completed-status) gameplay results so far. */
  validRuns: number;
  victories: number;
  currentLabel?: string;
  lastRun?: RunRecord;
  /** Runs/second over a trailing window, when measurable. */
  throughput?: number;
  /** Milliseconds since execution started. */
  elapsedMs?: number;
}

export interface ExperimentHandle {
  experimentId: string;
  /** Resolves when the experiment reaches a terminal lifecycle state. */
  done: Promise<{ status: ExperimentStatus; stored: boolean }>;
}
