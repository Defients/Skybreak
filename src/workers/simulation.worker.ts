/**
 * Stage 3 — simulation worker.
 *
 * Executes canonical gameplay runs off the main thread. The worker is
 * stateless across runs: executeRun resets module-global counters, so
 * outcomes are identical regardless of which worker (or how many) ran
 * previous tasks.
 *
 * Protocol (WorkerInbound / WorkerOutbound in types/workerProtocol.ts):
 *   in:  init | run | cancel | shutdown
 *   out: ready | result | ack-cancel | error
 *
 * Cancellation: a run in progress polls the module-level flag at safe
 * boundaries (room boundaries, periodic combat steps) via executeRun's
 * isCancelled callback. executeRun yields on a wall-clock budget so this
 * message handler can actually run mid-run.
 */
import { executeRun } from "../engine/simRunner";
import type { WorkerInbound, WorkerOutbound } from "../types/workerProtocol";

let currentExperimentId: string | null = null;
let cancelRequested = false;
let running = false;

function post(msg: WorkerOutbound): void {
  (self as unknown as { postMessage(m: WorkerOutbound): void }).postMessage(msg);
}

self.onmessage = async (e: MessageEvent<WorkerInbound>) => {
  const msg = e.data;

  switch (msg.type) {
    case "init":
      currentExperimentId = msg.experimentId;
      cancelRequested = false;
      post({ type: "ready", experimentId: msg.experimentId });
      break;

    case "run": {
      // Stale-experiment guard: never execute tasks for an old experiment.
      if (currentExperimentId !== null && msg.experimentId !== currentExperimentId) {
        post({ type: "error", experimentId: msg.experimentId, taskId: msg.taskId, message: "stale experiment message" });
        return;
      }
      if (running) {
        post({ type: "error", experimentId: msg.experimentId, taskId: msg.taskId, message: "worker busy — duplicate dispatch" });
        return;
      }
      running = true;
      cancelRequested = false;
      try {
        const record = await executeRun(msg.task, {
          isCancelled: () => cancelRequested,
        });
        post({ type: "result", experimentId: msg.experimentId, taskId: msg.taskId, record });
      } catch (err) {
        // executeRun is designed not to throw, but defend the boundary.
        post({
          type: "error",
          experimentId: msg.experimentId,
          taskId: msg.taskId,
          message: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        });
      } finally {
        running = false;
      }
      break;
    }

    case "cancel":
      cancelRequested = true;
      break;

    case "shutdown":
      cancelRequested = true;
      // Acknowledge so the main thread can terminate immediately.
      post({ type: "ack-cancel", experimentId: msg.experimentId });
      self.close();
      break;
  }
};

export {};
