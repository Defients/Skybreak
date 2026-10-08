/**
 * Stage 3 — shared experiment coordinator.
 *
 * One execution foundation for Batch Simulation and Strategy Lab:
 * task scheduling, worker execution, cooperative cancellation, incremental
 * persistence, and resume. UI stores subscribe via callbacks; gameplay runs
 * happen in workers (or inline when workers are unavailable — results are
 * identical because run identity comes from the task, not the executor).
 *
 * Determinism contract: tasks carry their own derived seed. Completion
 * order never affects run results or identity.
 */
import type { RunTask, RunRecord, ExperimentKind, ExperimentStatus } from "../types/experiment";
import type { WorkerInbound, WorkerOutbound, ExperimentProgress } from "../types/workerProtocol";
import { executeRun } from "../engine/simRunner";
// `?worker` produces a fully-bundled worker chunk (iife) — `new Worker(new
// URL(...))` was previously inlined as an unbundled data: URL because the URL
// was hoisted into a variable, which breaks import resolution at runtime.
import SimulationWorker from "../workers/simulation.worker.ts?worker";
import {
  getExperimentStore,
  newExperimentMeta,
  type ExperimentStore,
  type StoredExperiment,
  type ExperimentSummary,
} from "../persistence/experimentDb";
import { ENGINE_FINGERPRINT } from "../engine/experimentSpec";

export interface ExperimentStartOptions {
  experimentId: string;
  kind: ExperimentKind;
  name?: string;
  /** Canonical serializable config (BatchConfig | StrategyLabConfig). */
  config: unknown;
  configFingerprint: string;
  tasks: RunTask[];
  /** Desired worker count. "auto" (default) → conservative bounded value. */
  workerCount?: number;
  /** Force executor: "auto" picks workers when available. */
  executor?: "auto" | "worker" | "inline";
  /** runIds already committed (resume) — these tasks are skipped. */
  skipRunIds?: Set<string>;
  /** Prior persisted summary to merge into meta (resume). */
  priorSummary?: ExperimentSummary;
  onProgress?: (p: ExperimentProgress) => void;
  /** Unthrottled per-record callback (tests, streaming consumers). */
  onRecord?: (r: RunRecord) => void;
  onStatus?: (s: ExperimentStatus) => void;
  onStorageError?: (message: string) => void;
  /** Existing meta id → resume instead of create. */
  resume?: boolean;
}

export interface ExecutionOutcome {
  status: ExperimentStatus;
  /** Records produced THIS session (excludes already-committed resume runs). */
  records: RunRecord[];
  persisted: number;
  /** False when durable storage was unavailable — disclosed, not hidden. */
  stored: boolean;
}

export interface ExecutionHandle {
  experimentId: string;
  done: Promise<ExecutionOutcome>;
  cancel(): void;
  pause(): void;
}

const FLUSH_EVERY = 25;
const PROGRESS_THROTTLE_MS = 150;
const WORKER_RETRY_LIMIT = 1;

function defaultWorkerCount(): number {
  const hw = typeof navigator !== "undefined" ? navigator.hardwareConcurrency ?? 2 : 2;
  return Math.max(1, Math.min(4, hw - 1));
}

function setStatus(meta: StoredExperiment, s: ExperimentStatus): void {
  meta.status = s;
}

// ─── Worker pool ─────────────────────────────────────────────────────────────

interface PoolCallbacks {
  onResult(record: RunRecord): void;
  onWorkerError(workerIdx: number, taskId: string | undefined, message: string): void;
}

class WorkerPool {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private inFlight = new Map<Worker, string>();
  private taskRetries = new Map<string, number>();
  private queue: RunTask[] = [];
  private closed = false;
  private dispatchEnabled = true;

  constructor(
    private experimentId: string,
    private count: number,
    private cb: PoolCallbacks
  ) {}

  async start(): Promise<void> {
    await Promise.all(
      Array.from({ length: this.count }, (_, i) => this.spawn(i))
    );
  }

  private makeWorker(idx: number): Worker {
    const w = new SimulationWorker();
    w.onmessage = (e: MessageEvent<WorkerOutbound>) => this.handleMessage(w, idx, e.data);
    w.onerror = (e) => {
      this.cb.onWorkerError(idx, this.inFlight.get(w), e.message ?? "worker error");
      this.respawn(idx, w);
    };
    w.postMessage({ type: "init", experimentId: this.experimentId } satisfies WorkerInbound);
    return w;
  }

  private spawn(idx: number): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const w = this.makeWorker(idx);
        // "ready" resolves start; resolve immediately to avoid deadlock — the
        // worker buffers messages anyway.
        this.workers[idx] = w;
        this.idle.push(w);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  private respawn(idx: number, dead: Worker): void {
    try { dead.terminate(); } catch { /* ignore */ }
    this.workers[idx] = undefined as unknown as Worker;
    this.idle = this.idle.filter((w) => w !== dead);
    this.inFlight.delete(dead);
    if (this.closed) return;
    try {
      const w = this.makeWorker(idx);
      this.workers[idx] = w;
      this.idle.push(w);
      this.pump();
    } catch {
      // Respawn failed — continue with remaining workers.
    }
  }

  private handleMessage(w: Worker, _idx: number, msg: WorkerOutbound): void {
    if (msg.experimentId !== this.experimentId) return; // stale → ignore
    if (msg.type === "result") {
      const taskId = this.inFlight.get(w);
      this.inFlight.delete(w);
      this.idle.push(w);
      if (taskId !== undefined && taskId === msg.taskId) {
        this.cb.onResult(msg.record);
      }
      this.pump();
    } else if (msg.type === "error") {
      const taskId = this.inFlight.get(w);
      this.inFlight.delete(w);
      this.idle.push(w);
      if (taskId !== undefined) {
        this.cb.onWorkerError(_idx, taskId, msg.message);
      }
      this.pump();
    }
  }

  setQueue(tasks: RunTask[]): void {
    this.queue = tasks;
  }

  /** Stop pulling new tasks; in-flight runs still complete. */
  stopDispatching(): void {
    this.dispatchEnabled = false;
    this.queue = [];
  }

  /** Dispatch pending tasks to idle workers. */
  pump(): void {
    if (this.closed || !this.dispatchEnabled) return;
    while (this.idle.length > 0 && this.queue.length > 0) {
      const w = this.idle.pop()!;
      const task = this.queue.shift()!;
      this.inFlight.set(w, task.runId);
      w.postMessage({ type: "run", experimentId: this.experimentId, taskId: task.runId, task } satisfies WorkerInbound);
    }
  }

  pendingCount(): number {
    return this.queue.length;
  }

  inFlightCount(): number {
    return this.inFlight.size;
  }

  /** Soft cancel: workers abort in-flight runs cooperatively. */
  cancel(): void {
    this.queue = [];
    for (const w of this.workers) {
      if (!w) continue;
      try { w.postMessage({ type: "cancel", experimentId: this.experimentId } satisfies WorkerInbound); } catch { /* ignore */ }
    }
  }

  /** Requeue a task (worker crash) with bounded retries. */
  requeue(task: RunTask): boolean {
    const n = (this.taskRetries.get(task.runId) ?? 0) + 1;
    this.taskRetries.set(task.runId, n);
    if (n > WORKER_RETRY_LIMIT) return false;
    this.queue.unshift(task);
    return true;
  }

  async shutdown(): Promise<void> {
    this.closed = true;
    for (const w of this.workers) {
      if (!w) continue;
      try { w.postMessage({ type: "shutdown", experimentId: this.experimentId } satisfies WorkerInbound); } catch { /* ignore */ }
      try { w.terminate(); } catch { /* ignore */ }
    }
    this.workers = [];
    this.idle = [];
    this.inFlight.clear();
  }
}

// ─── Coordinator ─────────────────────────────────────────────────────────────

let activeExecution: { id: string } | null = null;

export function isExperimentRunning(): boolean {
  return activeExecution !== null;
}

/**
 * Start (or resume) an experiment. Returns a handle whose `done` promise
 * resolves when the experiment reaches a terminal state.
 */
export function startExperiment(opts: ExperimentStartOptions): ExecutionHandle {
  if (activeExecution) {
    throw new Error(`An experiment is already running: ${activeExecution.id}`);
  }
  activeExecution = { id: opts.experimentId };

  let cancelRequested = false;
  let pauseRequested = false;
  let resolveDone!: (o: ExecutionOutcome) => void;
  const done = new Promise<ExecutionOutcome>((r) => { resolveDone = r; });

  const handle: ExecutionHandle = {
    experimentId: opts.experimentId,
    done,
    cancel: () => { cancelRequested = true; },
    pause: () => { pauseRequested = true; },
  };

  void (async () => {
    let store: ExperimentStore | undefined;
    let stored = false;
    const records: RunRecord[] = [];
    const buffer: RunRecord[] = [];
    let persisted = 0;
    let storageErrors = 0;
    const sessionAcc = { valid: 0, victories: 0, defeats: 0, errors: 0, timeouts: 0, scoreSum: 0 };
    const startedAt = Date.now();
    let lastProgressAt = 0;
    let throughputWindow: { t: number; n: number } = { t: startedAt, n: 0 };

    const meta: StoredExperiment = newExperimentMeta(
      opts.experimentId,
      opts.kind,
      opts.config,
      opts.tasks.length,
      opts.name,
      { engine: ENGINE_FINGERPRINT, config: opts.configFingerprint }
    );

    const emitProgress = (lastRun?: RunRecord, currentLabel?: string, force = false) => {
      if (!opts.onProgress) return;
      const now = Date.now();
      if (!force && now - lastProgressAt < PROGRESS_THROTTLE_MS) return;
      lastProgressAt = now;
      const completed = (opts.skipRunIds?.size ?? 0) + records.length;
      const elapsed = now - startedAt;
      const winN = throughputWindow.n;
      const winT = now - throughputWindow.t;
      if (winT > 3000) throughputWindow = { t: now, n: 0 };
      opts.onProgress({
        completed,
        total: opts.tasks.length,
        persisted,
        validRuns: sessionAcc.valid + (opts.priorSummary?.validRuns ?? 0),
        victories: sessionAcc.victories + (opts.priorSummary?.victories ?? 0),
        lastRun,
        currentLabel,
        throughput: winT > 0 ? (winN / (winT / 1000)) : undefined,
        elapsedMs: elapsed,
      });
    };

    const flush = async () => {
      if (!store || buffer.length === 0) return;
      const chunk = buffer.splice(0, buffer.length);
      try {
        await store.putRuns(chunk);
        persisted += chunk.length;
        const prior = opts.priorSummary;
        const summary: ExperimentSummary = {
          validRuns: sessionAcc.valid + (prior?.validRuns ?? 0),
          victories: sessionAcc.victories + (prior?.victories ?? 0),
          defeats: sessionAcc.defeats + (prior?.defeats ?? 0),
          errorRuns: sessionAcc.errors + (prior?.errorRuns ?? 0),
          timeoutRuns: sessionAcc.timeouts + (prior?.timeoutRuns ?? 0),
          avgScore: sessionAcc.valid + (prior?.validRuns ?? 0) > 0
            ? Math.round((sessionAcc.scoreSum + (prior ? prior.avgScore * prior.validRuns : 0)) / (sessionAcc.valid + (prior?.validRuns ?? 0)))
            : 0,
          lastRunSummary: chunk[chunk.length - 1]?.runSummary,
        };
        await store.updateExperiment(opts.experimentId, {
          completedTasks: (opts.skipRunIds?.size ?? 0) + records.length,
          persistedTasks: persisted + (opts.skipRunIds?.size ?? 0),
          summary,
        });
      } catch (err) {
        storageErrors++;
        buffer.unshift(...chunk); // retry on next flush
        opts.onStorageError?.(
          `Storage write failed (${storageErrors}): ${err instanceof Error ? err.message : String(err)}`
        );
      }
    };

    const recordOf = (rec: RunRecord) => {
      records.push(rec);
      if (rec.status === "completed") {
        sessionAcc.valid++;
        if (rec.outcome === "victory") sessionAcc.victories++;
        else sessionAcc.defeats++;
        sessionAcc.scoreSum += rec.score?.finalScore ?? 0;
      } else if (rec.status === "error" || rec.status === "invalid") {
        sessionAcc.errors++;
      } else if (rec.status === "timeout") {
        sessionAcc.timeouts++;
      }
      if (rec.status !== "cancelled") buffer.push(rec);
      throughputWindow.n++;
      opts.onRecord?.(rec);
    };

    try {
      // ── Storage setup (durable when available) ──
      store = await getExperimentStore();
      stored = store.durable;
      try {
        if (opts.resume) {
          const existing = await store.getExperiment(opts.experimentId);
          if (!existing) throw new Error("experiment not found");
          if (existing.engineFingerprint !== ENGINE_FINGERPRINT ||
              existing.configFingerprint !== opts.configFingerprint) {
            await store.updateExperiment(opts.experimentId, { status: "incompatible" });
            opts.onStatus?.("incompatible");
            resolveDone({ status: "incompatible", records: [], persisted: 0, stored });
            activeExecution = null;
            return;
          }
          await store.updateExperiment(opts.experimentId, { status: "running" });
        } else {
          await store.createExperiment(meta);
          await store.updateExperiment(opts.experimentId, { status: "running" });
        }
      } catch (err) {
        storageErrors++;
        opts.onStorageError?.(`Storage unavailable: ${err instanceof Error ? err.message : String(err)} — results will be kept in memory only.`);
        store = undefined;
        stored = false;
      }
      setStatus(meta, "running");
      opts.onStatus?.("running");

      // ── Task selection (resume skips committed runs) ──
      const pending = opts.skipRunIds
        ? opts.tasks.filter((t) => !opts.skipRunIds!.has(t.runId))
        : opts.tasks;

      const useWorkers =
        (opts.executor ?? "auto") !== "inline" &&
        typeof Worker !== "undefined" &&
        (opts.executor === "worker" || (opts.executor ?? "auto") === "auto");

      const status: ExperimentStatus = await (async () => {
        if (useWorkers) {
          return runWithWorkers();
        }
        return runInline();

        async function runInline(): Promise<ExperimentStatus> {
          for (const task of pending) {
            if (cancelRequested) return "cancelled";
            if (pauseRequested) return "paused";
            const rec = await executeRun(task, { isCancelled: () => cancelRequested });
            if (rec.status === "cancelled") return "cancelled";
            recordOf(rec);
            emitProgress(rec, task.comboId);
            if (buffer.length >= FLUSH_EVERY) await flush();
          }
          return "completed";
        }

        function runWithWorkers(): Promise<ExperimentStatus> {
          return new Promise<ExperimentStatus>((resolvePool) => {
            const workerCount = Math.max(1, Math.min(opts.workerCount ?? defaultWorkerCount(), 8));
            const pool = new WorkerPool(opts.experimentId, workerCount, {
              onResult: (rec) => {
                // stale-experiment records filtered inside pool
                if (rec.status === "cancelled") {
                  // cancelled in-flight task — requeue for resume? No:
                  // the run wasn't committed; drop it so a later run retries.
                  checkDone();
                  return;
                }
                recordOf(rec);
                emitProgress(rec, rec.comboId);
                if (buffer.length >= FLUSH_EVERY) void flush();
                checkDone();
              },
              onWorkerError: (_idx, taskId, message) => {
                const task = taskId ? pending.find((t) => t.runId === taskId) : undefined;
                if (task && pool.requeue(task)) {
                  pool.pump();
                } else if (task) {
                  // Retries exhausted → interrupted record.
                  const rec: RunRecord = {
                    runId: task.runId,
                    experimentId: opts.experimentId,
                    comboId: task.comboId,
                    comboIndex: task.comboIndex,
                    cohortIndex: task.cohortIndex,
                    runIndex: task.runIndex,
                    seed: task.seed,
                    status: "interrupted",
                    partyComposition: [],
                    runSummary: `Run ${task.runIndex + 1}: INTERRUPTED — worker crash (${message})`,
                    diagnostics: {
                      phase: "unknown", roomIndex: -1, tier: -1,
                      roomIterations: 0, combatIterations: 0,
                      errorCategory: "worker-crash", errorMessage: message,
                      retrySafe: true,
                    },
                    telemetryLevel: task.telemetryLevel,
                    telemetryCompleteness: "invalid",
                    engineFingerprint: ENGINE_FINGERPRINT,
                  };
                  recordOf(rec);
                  emitProgress(rec);
                }
                checkDone();
              },
            });

            let settled = false;
            const checkDone = () => {
              if (settled) return;
              if (cancelRequested) {
                settled = true;
                pool.cancel();
                // In-flight runs will report cancelled; give them a tick then stop.
                void pool.shutdown().then(() => resolvePool("cancelled"));
                return;
              }
              if (pauseRequested) {
                pool.stopDispatching();
                if (pool.inFlightCount() === 0) {
                  settled = true;
                  void pool.shutdown().then(() => resolvePool("paused"));
                }
                return;
              }
              if (pool.pendingCount() === 0 && pool.inFlightCount() === 0) {
                settled = true;
                void pool.shutdown().then(() => resolvePool("completed"));
              }
            };

            void (async () => {
              try {
                await pool.start();
              } catch {
                // Worker spawn failed → fall back to inline execution.
                resolvePool(await runInline());
                return;
              }
              pool.setQueue(pending);
              pool.pump();
              // Watchdog for cancel/pause when no messages arrive.
              const tick = setInterval(() => {
                if (cancelRequested || (pauseRequested && pool.inFlightCount() === 0) || (pool.pendingCount() === 0 && pool.inFlightCount() === 0)) {
                  clearInterval(tick);
                  checkDone();
                }
              }, 100);
            })();
          });
        }
      })();

      // ── Finalize ──
      await flush();
      const finalStatus: ExperimentStatus =
        status === "completed" ? "completed"
        : status === "cancelled" ? "cancelled"
        : status === "paused" ? "paused"
        : status;
      if (store) {
        try {
          await store.updateExperiment(opts.experimentId, { status: finalStatus });
        } catch { /* disclosed via onStorageError already */ }
      }
      opts.onStatus?.(finalStatus);
      emitProgress(undefined, undefined, true);
      resolveDone({ status: finalStatus, records, persisted, stored });
    } catch (err) {
      if (store) {
        try { await store.updateExperiment(opts.experimentId, { status: "failed", error: String(err) }); } catch { /* ignore */ }
      }
      opts.onStatus?.("failed");
      resolveDone({ status: "failed", records, persisted, stored });
    } finally {
      activeExecution = null;
    }
  })();

  return handle;
}

/**
 * Load an interrupted/paused experiment's committed runIds for resume.
 * Returns null when the experiment can't be resumed.
 */
export async function getResumableRunIds(
  experimentId: string
): Promise<{ runIds: Set<string>; meta: StoredExperiment; priorSummary?: ExperimentSummary } | null> {
  const store = await getExperimentStore();
  const meta = await store.getExperiment(experimentId);
  if (!meta) return null;
  if (!["interrupted", "paused", "cancelled", "failed", "running", "cancel-requested"].includes(meta.status)) {
    return null;
  }
  const runIds = await store.getRunIds(experimentId);
  return { runIds, meta, priorSummary: meta.summary };
}
