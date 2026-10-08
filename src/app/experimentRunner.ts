/**
 * Stage 3/4 — shared experiment coordinator.
 *
 * One execution foundation for Batch Simulation and Strategy Lab:
 * task scheduling, worker execution, cooperative cancellation, serialized
 * durable checkpoints, status-aware resume, and cross-tab ownership.
 *
 * Determinism contract: tasks carry their own derived seed. Completion
 * order never affects run results or identity.
 *
 * Durability contract: a run counts as "persisted" only after its
 * checkpoint transaction commits. Finalization drains the write queue —
 * an experiment never reports completion while writes are pending.
 *
 * Ownership contract: the coordinator acquires a Web Lock when available
 * AND an IndexedDB lease with a fencing token. Checkpoint commits carry
 * the ownerToken; a stale owner that lost its lease cannot write.
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
import { ENGINE_FINGERPRINT, type TaskSource } from "../engine/experimentSpec";

export interface ResumePlan {
  meta: StoredExperiment;
  /** Committed records reused as-is — never re-executed, never overwritten
   *  by a weaker-status record. */
  reusable: Set<string>;
  /** Committed records eligible for re-execution (interrupted, cancelled,
   *  retrySafe errors, corrupt). */
  retryable: Set<string>;
  priorSummary?: ExperimentSummary;
  committedCount: number;
}

export interface ExperimentStartOptions {
  experimentId: string;
  kind: ExperimentKind;
  name?: string;
  /** Canonical serializable config (BatchConfig | StrategyLabConfig). */
  config: unknown;
  configFingerprint: string;
  /** Materialized tasks or a lazy source — identical identity either way. */
  tasks: RunTask[] | TaskSource;
  /** Desired worker count. "auto" (default) → conservative bounded value. */
  workerCount?: number;
  /** Force executor: "auto" picks workers when available. */
  executor?: "auto" | "worker" | "inline";
  /** Resume classification from planResume(). */
  resumePlan?: ResumePlan;
  /** runIds to skip outright (merged into the resume plan's reusable set). */
  skipRunIds?: Set<string>;
  /** Prior persisted summary to merge into meta (resume). */
  priorSummary?: ExperimentSummary;
  /** Override the generated cross-tab owner token (tests). */
  ownerToken?: string;
  /** Allow large experiments when durable storage is unavailable. */
  allowVolatileLarge?: boolean;
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
  /**
   * Bounded session records — the most recent results plus ALL technical
   * failure records this session. NOT guaranteed to contain every run;
   * durable storage is the complete record. See MAX_RECENT_RECORDS.
   */
  records: RunRecord[];
  /** Distinct records durably committed this session. */
  persisted: number;
  /** False when durable storage was unavailable — disclosed, not hidden. */
  stored: boolean;
  /** Committed record count total (resume + session). */
  committedTotal: number;
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
const WORKER_INIT_TIMEOUT_MS = 5000;
const TASK_TIMEOUT_MS = 120_000;
const CANCEL_DRAIN_MS = 2000;
const MAX_RESPAWNS = 10;
/** Backpressure: pause dispatch when uncommitted records exceed this. */
const PENDING_HIGH_WATER = 300;
/** Resume dispatch when the write queue drains below this. */
const PENDING_LOW_WATER = 100;
/** Consecutive checkpoint failures before persistence is declared dead. */
const MAX_COMMIT_FAILURES = 4;
/** Large-experiment volatile gate (durable storage unavailable). */
const VOLATILE_TASK_LIMIT = 500;
const LEASE_TTL_MS = 15_000;
const LEASE_RENEW_MS = 5_000;
const MAX_RECENT_RECORDS = 300;
const MAX_FAILURE_RECORDS = 1000;

function defaultWorkerCount(): number {
  const hw = typeof navigator !== "undefined" ? navigator.hardwareConcurrency ?? 2 : 2;
  return Math.max(1, Math.min(4, hw - 1));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function newOwnerToken(): string {
  return `own_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Serialized checkpoint writer ────────────────────────────────────────────

/**
 * Promise-chain checkpoint writer. At most one checkpoint commit is in
 * flight; every queued record is eventually committed or the writer dies
 * (surfaced via deadError). Committed counts are updated only on success.
 */
class CheckpointWriter {
  private buffer: RunRecord[] = [];
  private tail: Promise<void> = Promise.resolve();
  private consecutiveFailures = 0;
  private deadError: Error | null = null;
  private capacityWaiters: Array<() => void> = [];
  /** Records durably committed through this writer. */
  committed = 0;

  constructor(
    private commit: (runs: RunRecord[]) => Promise<void>,
    private onError: (err: Error) => void
  ) {}

  enqueue(rec: RunRecord): void {
    this.buffer.push(rec);
    this.schedule();
  }

  get pending(): number {
    return this.buffer.length;
  }

  get dead(): Error | null {
    return this.deadError;
  }

  /** Queue a flush on the serialized chain. Safe to call frequently. */
  schedule(): void {
    this.tail = this.tail.then(() => this.flushOnce());
  }

  private async flushOnce(): Promise<void> {
    if (this.deadError || this.buffer.length === 0) return;
    const chunk = this.buffer.slice(0, Math.max(FLUSH_EVERY, this.buffer.length));
    try {
      await this.commit(chunk);
      this.buffer.splice(0, chunk.length);
      this.committed += chunk.length;
      this.consecutiveFailures = 0;
      this.notifyCapacity();
    } catch (err) {
      this.consecutiveFailures++;
      const e = err instanceof Error ? err : new Error(String(err));
      this.onError(e);
      if (this.consecutiveFailures >= MAX_COMMIT_FAILURES) {
        this.deadError = e;
        this.notifyCapacity();
      } else {
        // Bounded backoff; records stay queued — never dropped.
        await sleep(150 * this.consecutiveFailures);
        this.tail = this.tail.then(() => this.flushOnce());
      }
    }
  }

  private notifyCapacity(): void {
    const w = this.capacityWaiters;
    this.capacityWaiters = [];
    for (const fn of w) fn();
  }

  /** Resolve when pending records fall under the low-water mark or the
   *  writer dies. Used for dispatch backpressure. */
  waitForCapacity(): Promise<void> {
    if (this.buffer.length <= PENDING_LOW_WATER || this.deadError) return Promise.resolve();
    return new Promise((resolve) => this.capacityWaiters.push(resolve));
  }

  /** Await every queued write. Throws if the writer is dead. */
  async drain(): Promise<void> {
    this.schedule();
    await this.tail;
    if (this.deadError) throw this.deadError;
  }
}

// ─── Worker pool ─────────────────────────────────────────────────────────────

interface PoolCallbacks {
  onResult(record: RunRecord): void;
  onTaskLost(taskId: string, reason: string): void;
  onAnomaly?(description: string): void;
}

class WorkerPool {
  private workers: (Worker | undefined)[] = [];
  private idle = new Set<Worker>();
  private inFlight = new Map<Worker, { taskId: string; timer: ReturnType<typeof setTimeout> }>();
  private ready = new Map<Worker, (ok: boolean) => void>();
  private taskAttempts = new Map<string, number>();
  private queue: number[] = [];
  private respawns = 0;
  private closed = false;
  private dispatchEnabled = true;

  constructor(
    private experimentId: string,
    private count: number,
    private cb: PoolCallbacks
  ) {}

  async start(): Promise<void> {
    const results = await Promise.allSettled(
      Array.from({ length: this.count }, (_, i) => this.spawn(i))
    );
    const alive = this.workers.filter(Boolean).length;
    if (alive === 0) {
      const firstErr = results.find((r) => r.status === "rejected") as
        | PromiseRejectedResult
        | undefined;
      throw new Error(`No workers could start: ${firstErr?.reason ?? "unknown"}`);
    }
    // Partial startup is acceptable — fewer workers, same correctness.
    this.pump();
  }

  private makeWorker(idx: number): Worker {
    const w = new SimulationWorker();
    w.onmessage = (e: MessageEvent<WorkerOutbound>) => this.handleMessage(w, idx, e.data);
    w.onerror = (e) => this.handleCrash(w, idx, e.message ?? "worker error");
    w.postMessage({ type: "init", experimentId: this.experimentId } satisfies WorkerInbound);
    return w;
  }

  /** Spawn a worker and require a real init handshake before it is usable. */
  private spawn(idx: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let w: Worker;
      try {
        w = this.makeWorker(idx);
      } catch (err) {
        reject(err);
        return;
      }
      const timer = setTimeout(() => {
        this.ready.delete(w);
        try { w.terminate(); } catch { /* ignore */ }
        reject(new Error(`worker ${idx} init handshake timed out`));
      }, WORKER_INIT_TIMEOUT_MS);
      this.ready.set(w, (ok) => {
        clearTimeout(timer);
        this.ready.delete(w);
        if (!ok) {
          try { w.terminate(); } catch { /* ignore */ }
          reject(new Error(`worker ${idx} rejected init`));
          return;
        }
        this.workers[idx] = w;
        this.idle.add(w);
        resolve();
      });
    });
  }

  private respawn(idx: number, dead: Worker): void {
    try { dead.terminate(); } catch { /* ignore */ }
    this.workers[idx] = undefined;
    this.idle.delete(dead);
    const flight = this.inFlight.get(dead);
    if (flight) {
      clearTimeout(flight.timer);
      this.inFlight.delete(dead);
    }
    if (this.closed || this.respawns >= MAX_RESPAWNS) return;
    this.respawns++;
    void this.spawn(idx)
      .then(() => this.pump())
      .catch(() => {
        // Respawn failed — the pool shrinks; correctness is preserved.
      });
  }

  private handleCrash(w: Worker, idx: number, message: string): void {
    const flight = this.inFlight.get(w);
    if (flight) {
      clearTimeout(flight.timer);
      this.inFlight.delete(w);
      this.cb.onTaskLost(flight.taskId, message);
    }
    this.respawn(idx, w);
  }

  private handleMessage(w: Worker, _idx: number, msg: WorkerOutbound): void {
    if (msg.experimentId !== this.experimentId) return; // stale → ignore

    if (msg.type === "ready") {
      const resolveReady = this.ready.get(w);
      if (resolveReady) resolveReady(true);
      else this.cb.onAnomaly?.("ready from initialized worker — ignored");
      return;
    }
    if (msg.type === "ack-cancel") return; // shutdown acknowledgment, not a task

    if (msg.type === "result" || msg.type === "error") {
      const flight = this.inFlight.get(w);
      // Validate BEFORE freeing: a mismatched/unknown result must not free
      // the worker, complete a different task, or count toward progress.
      if (!flight) {
        this.cb.onAnomaly?.(`late result for unassigned task ${msg.taskId ?? "?"} — ignored`);
        return;
      }
      if (flight.taskId !== msg.taskId) {
        this.cb.onAnomaly?.(
          `taskId mismatch (expected ${flight.taskId}, got ${msg.taskId ?? "?"}) — ignored`
        );
        return; // worker stays in-flight; task timeout will recover it
      }
      clearTimeout(flight.timer);
      this.inFlight.delete(w);
      this.idle.add(w);
      if (msg.type === "result") {
        this.cb.onResult(msg.record);
      } else {
        this.cb.onTaskLost(msg.taskId!, msg.message);
      }
      this.pump();
    }
  }

  setQueue(indexes: number[]): void {
    this.queue = indexes;
  }

  pushFront(index: number): void {
    this.queue.unshift(index);
  }

  /** Stop pulling new tasks; in-flight runs still complete. */
  stopDispatching(): void {
    this.dispatchEnabled = false;
    this.queue = [];
  }

  pauseDispatching(): void {
    this.dispatchEnabled = false;
  }

  resumeDispatching(): void {
    if (this.closed) return;
    this.dispatchEnabled = true;
    this.pump();
  }

  /** Dispatch pending tasks to idle workers (bounded by queue length). */
  pump(): void {
    if (this.closed || !this.dispatchEnabled) return;
    for (const w of this.idle) {
      if (this.queue.length === 0) break;
      this.idle.delete(w);
      const index = this.queue.shift()!;
      this.dispatchIndex(index, w);
    }
  }

  private dispatchIndex(index: number, w: Worker): void {
    // The task body is supplied by the coordinator via taskProvider.
    const task = this.taskProvider(index);
    const timer = setTimeout(() => {
      this.handleCrash(w, this.workers.indexOf(w), "task timeout — worker unresponsive");
    }, TASK_TIMEOUT_MS);
    this.inFlight.set(w, { taskId: task.runId, timer });
    try {
      w.postMessage({ type: "run", experimentId: this.experimentId, taskId: task.runId, task } satisfies WorkerInbound);
    } catch (err) {
      clearTimeout(timer);
      this.inFlight.delete(w);
      this.cb.onTaskLost(task.runId, `dispatch failed: ${String(err)}`);
      this.respawn(this.workers.indexOf(w), w);
    }
  }

  /** Injected by the coordinator: index → RunTask. */
  taskProvider: (index: number) => RunTask = () => {
    throw new Error("taskProvider not set");
  };

  pendingCount(): number {
    return this.queue.length;
  }

  inFlightCount(): number {
    return this.inFlight.size;
  }

  /** Requeue a crashed task index with bounded attempts. */
  requeue(index: number, taskId: string): boolean {
    const n = (this.taskAttempts.get(taskId) ?? 0) + 1;
    this.taskAttempts.set(taskId, n);
    if (n > WORKER_RETRY_LIMIT) return false;
    this.queue.unshift(index);
    return true;
  }

  /**
   * Cooperative cancel: stop dispatching, ask in-flight workers to abort
   * at safe points, then terminate after a bounded drain deadline.
   */
  async cancel(): Promise<void> {
    this.queue = [];
    this.dispatchEnabled = false;
    for (const [w] of this.inFlight) {
      try { w.postMessage({ type: "cancel", experimentId: this.experimentId } satisfies WorkerInbound); } catch { /* ignore */ }
    }
    const deadline = Date.now() + CANCEL_DRAIN_MS;
    while (this.inFlight.size > 0 && Date.now() < deadline) {
      await sleep(20);
    }
    await this.shutdown();
  }

  async shutdown(): Promise<void> {
    this.closed = true;
    for (const w of this.workers) {
      if (!w) continue;
      try { w.postMessage({ type: "shutdown", experimentId: this.experimentId } satisfies WorkerInbound); } catch { /* ignore */ }
      try { w.terminate(); } catch { /* ignore */ }
    }
    for (const { timer } of this.inFlight.values()) clearTimeout(timer);
    this.workers = [];
    this.idle.clear();
    this.inFlight.clear();
  }
}

// ─── Resume planning ─────────────────────────────────────────────────────────

/**
 * Status-aware recovery planner. A committed runId does NOT automatically
 * mean the task is done — interrupted/cancelled/retrySafe records are
 * eligible for re-execution.
 */
export async function planResume(
  experimentId: string
): Promise<ResumePlan | null> {
  const store = await getExperimentStore();
  const meta = await store.getExperiment(experimentId);
  if (!meta) return null;
  if (!["interrupted", "paused", "cancelled", "failed", "running", "cancel-requested", "completed-with-errors"].includes(meta.status)) {
    return null;
  }
  const receipts = await store.listRunReceipts(experimentId);
  const reusable = new Set<string>();
  const retryable = new Set<string>();
  for (const r of receipts) {
    switch (r.status) {
      case "completed":
      case "invalid":      // definitive config verdict — not retried
      case "timeout":      // deterministic safety limit — not retried
        reusable.add(r.runId);
        break;
      case "error":
        if (r.retrySafe) retryable.add(r.runId);
        else reusable.add(r.runId); // non-retryable definitive failure
        break;
      case "interrupted":
      case "cancelled":
      default:
        retryable.add(r.runId); // worker crash / pre-commit cancel / unknown
        break;
    }
  }
  return { meta, reusable, retryable, priorSummary: meta.summary, committedCount: receipts.length };
}

/**
 * Back-compat wrapper: committed runIds that may be skipped on resume.
 * Prefer planResume() for status-aware decisions.
 */
export async function getResumableRunIds(
  experimentId: string
): Promise<{ runIds: Set<string>; meta: StoredExperiment; priorSummary?: ExperimentSummary } | null> {
  const plan = await planResume(experimentId);
  if (!plan) return null;
  return { runIds: plan.reusable, meta: plan.meta, priorSummary: plan.priorSummary };
}

// ─── Cross-tab ownership ─────────────────────────────────────────────────────

interface NavigatorLocks {
  request<T>(name: string, opts: { mode?: string; ifAvailable?: boolean }, cb: (lock: { name: string; mode: string } | null) => Promise<T> | T): Promise<T>;
}

function webLocks(): NavigatorLocks | undefined {
  const nav = typeof navigator !== "undefined" ? (navigator as unknown as { locks?: NavigatorLocks }) : undefined;
  return nav?.locks;
}

// ─── Coordinator ─────────────────────────────────────────────────────────────

let activeExecution: { id: string; ownerToken: string } | null = null;

export function isExperimentRunning(): boolean {
  return activeExecution !== null;
}

/** Bounded record sink: keeps recent + failure records; never grows with N. */
class BoundedRecordSink {
  private recent: RunRecord[] = [];
  private failures: RunRecord[] = [];
  count = 0;

  push(rec: RunRecord): void {
    this.count++;
    if (rec.status !== "completed") {
      if (this.failures.length < MAX_FAILURE_RECORDS) this.failures.push(rec);
    }
    this.recent.push(rec);
    if (this.recent.length > MAX_RECENT_RECORDS) this.recent.shift();
  }

  /** recent ∪ failures (failures may already appear in recent — dedupe). */
  all(): RunRecord[] {
    const seen = new Set<string>();
    const out: RunRecord[] = [];
    for (const r of [...this.recent, ...this.failures]) {
      if (seen.has(r.runId)) continue;
      seen.add(r.runId);
      out.push(r);
    }
    return out;
  }
}

/**
 * Start (or resume) an experiment. Returns a handle whose `done` promise
 * resolves when the experiment reaches a terminal state.
 */
export function startExperiment(opts: ExperimentStartOptions): ExecutionHandle {
  if (activeExecution) {
    throw new Error(`An experiment is already running: ${activeExecution.id}`);
  }
  const ownerToken = opts.ownerToken ?? newOwnerToken();
  activeExecution = { id: opts.experimentId, ownerToken };

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

  const taskSource: TaskSource = Array.isArray(opts.tasks)
    ? { total: opts.tasks.length, get: (i) => (opts.tasks as RunTask[])[i] }
    : opts.tasks;

  void (async () => {
    let store: ExperimentStore | undefined;
    let stored = false;
    const sink = new BoundedRecordSink();
    let persisted = 0;
    const sessionAcc = { valid: 0, victories: 0, defeats: 0, errors: 0, timeouts: 0, scoreSum: 0 };
    const startedAt = Date.now();
    let lastProgressAt = 0;
    let throughputWindow: { t: number; n: number } = { t: startedAt, n: 0 };
    let lockRelease: (() => void) | null = null;
    let leaseTimer: ReturnType<typeof setInterval> | null = null;
    let ownershipLost = false;

    const plan = opts.resumePlan ?? null;
    const reusable = new Set<string>([...(plan?.reusable ?? []), ...(opts.skipRunIds ?? [])]);
    const priorSummary = opts.priorSummary ?? plan?.priorSummary;
    const priorCommitted = plan?.committedCount ?? (opts.skipRunIds?.size ?? 0);
    // Retryable committed records will be re-executed — count prior reusable
    // only for "completed" progress baseline.
    const baselineDone = reusable.size;

    const meta: StoredExperiment = newExperimentMeta(
      opts.experimentId,
      opts.kind,
      opts.config,
      taskSource.total,
      opts.name,
      { engine: ENGINE_FINGERPRINT, config: opts.configFingerprint }
    );

    const emitProgress = (lastRun?: RunRecord, currentLabel?: string, force = false) => {
      if (!opts.onProgress) return;
      const now = Date.now();
      if (!force && now - lastProgressAt < PROGRESS_THROTTLE_MS) return;
      lastProgressAt = now;
      const elapsed = now - startedAt;
      const winN = throughputWindow.n;
      const winT = now - throughputWindow.t;
      if (winT > 3000) throughputWindow = { t: now, n: 0 };
      opts.onProgress({
        completed: baselineDone + sink.count,
        total: taskSource.total,
        persisted: priorCommitted + persisted,
        validRuns: sessionAcc.valid + (priorSummary?.validRuns ?? 0),
        victories: sessionAcc.victories + (priorSummary?.victories ?? 0),
        pendingWrites: writer.pending,
        lastRun,
        currentLabel,
        throughput: winT > 0 ? (winN / (winT / 1000)) : undefined,
        elapsedMs: elapsed,
      });
    };

    const buildSummary = (): ExperimentSummary => {
      const valid = sessionAcc.valid + (priorSummary?.validRuns ?? 0);
      return {
        validRuns: valid,
        victories: sessionAcc.victories + (priorSummary?.victories ?? 0),
        defeats: sessionAcc.defeats + (priorSummary?.defeats ?? 0),
        errorRuns: sessionAcc.errors + (priorSummary?.errorRuns ?? 0),
        timeoutRuns: sessionAcc.timeouts + (priorSummary?.timeoutRuns ?? 0),
        avgScore: valid > 0
          ? Math.round((sessionAcc.scoreSum + (priorSummary ? priorSummary.avgScore * priorSummary.validRuns : 0)) / valid)
          : 0,
      };
    };

    // Serialized writer — single in-flight checkpoint.
    const writer = new CheckpointWriter(
      async (runs) => {
        if (!store) return;
        await store.commitCheckpoint(
          opts.experimentId,
          runs,
          {
            completedTasks: baselineDone + sink.count,
            persistedTasks: priorCommitted + persisted + runs.length,
            summary: buildSummary(),
          },
          ownerToken
        );
      },
      (err) => {
        opts.onStorageError?.(`Checkpoint write failed: ${err.message}`);
      }
    );

    const recordOf = (rec: RunRecord) => {
      sink.push(rec);
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
      if (rec.status !== "cancelled") writer.enqueue(rec);
      throughputWindow.n++;
      opts.onRecord?.(rec);
    };

    const releaseResources = async () => {
      if (leaseTimer) { clearInterval(leaseTimer); leaseTimer = null; }
      lockRelease?.();
      lockRelease = null;
      if (store) {
        try { await store.releaseLease(opts.experimentId, ownerToken); } catch { /* ignore */ }
      }
    };

    try {
      // ── Storage setup (durable when available) ──
      store = await getExperimentStore();
      stored = store.durable;
      if (!stored && taskSource.total > VOLATILE_TASK_LIMIT && !opts.allowVolatileLarge) {
        opts.onStorageError?.(
          `Durable storage is unavailable and this experiment has ${taskSource.total} tasks ` +
          `(>${VOLATILE_TASK_LIMIT}). Refusing to risk unsaved results — export-capable volatile ` +
          `runs must opt in.`
        );
        opts.onStatus?.("failed");
        resolveDone({ status: "failed", records: [], persisted: 0, stored: false, committedTotal: 0 });
        return;
      }
      try {
        if (opts.resume) {
          const existing = await store.getExperiment(opts.experimentId);
          if (!existing) throw new Error("experiment not found");
          if (existing.engineFingerprint !== ENGINE_FINGERPRINT ||
              existing.configFingerprint !== opts.configFingerprint) {
            await store.updateExperiment(opts.experimentId, { status: "incompatible" });
            opts.onStatus?.("incompatible");
            resolveDone({ status: "incompatible", records: [], persisted: 0, stored, committedTotal: priorCommitted });
            return;
          }
        } else {
          await store.createExperiment(meta);
        }
      } catch (err) {
        opts.onStorageError?.(`Storage unavailable: ${err instanceof Error ? err.message : String(err)} — results will be kept in memory only.`);
        store = undefined;
        stored = false;
      }

      // ── Cross-tab ownership (Web Lock + IDB lease fencing) ──
      if (store) {
        const locks = webLocks();
        if (locks) {
          // Hold the lock for the entire execution: the request callback
          // returns a promise resolved only by lockRelease.
          let release!: () => void;
          const held = new Promise<void>((r) => { release = r; });
          lockRelease = release;
          const acquired = await new Promise<boolean>((res) => {
            void locks.request(
              `skybreak-exp:${opts.experimentId}`,
              { mode: "exclusive", ifAvailable: true },
              (lock): Promise<void> => {
                if (!lock) { res(false); return Promise.resolve(); }
                res(true);
                return held;
              }
            );
          });
          if (!acquired) {
            opts.onStorageError?.(
              `Experiment ${opts.experimentId} is owned by another tab. ` +
              `Open it there, or wait for its lease to expire and resume.`
            );
            opts.onStatus?.("failed");
            resolveDone({ status: "failed", records: [], persisted: 0, stored, committedTotal: priorCommitted });
            return;
          }
        }
        // Lease provides fencing even where Web Locks are absent, and marks
        // ownership discoverably for other tabs' history views.
        const lease = await store.acquireLease(opts.experimentId, ownerToken, LEASE_TTL_MS).catch(() => null);
        if (lease && !lease.ok) {
          opts.onStorageError?.(
            `Experiment is owned by another tab (lease active until ` +
            `${lease.heldBy ? "another owner" : "expiry"}). Refusing to run concurrently.`
          );
          opts.onStatus?.("failed");
          await releaseResources();
          resolveDone({ status: "failed", records: [], persisted: 0, stored, committedTotal: priorCommitted });
          return;
        }
        leaseTimer = setInterval(() => {
          if (!store) return;
          void store.renewLease(opts.experimentId, ownerToken, LEASE_TTL_MS).then((ok) => {
            if (!ok) {
              ownershipLost = true;
              opts.onStorageError?.("Ownership lost — another tab took over this experiment. Stopping.");
              cancelRequested = true;
            }
          }).catch(() => { ownershipLost = true; });
        }, LEASE_RENEW_MS);
      }

      if (store) await store.updateExperiment(opts.experimentId, { status: "running" }).catch(() => undefined);
      opts.onStatus?.("running");

      // ── Schedule indexes: skip reusable, re-execute retryable+new ──
      const schedulable: number[] = [];
      const taskIdToIndex = new Map<string, number>();
      for (let i = 0; i < taskSource.total; i++) {
        const t = taskSource.get(i);
        taskIdToIndex.set(t.runId, i);
        if (!reusable.has(t.runId)) schedulable.push(i);
      }

      const useWorkers =
        (opts.executor ?? "auto") !== "inline" &&
        typeof Worker !== "undefined";

      // Internal scheduler result — "all-attempted" is a scheduler signal,
      // never a persisted ExperimentStatus.
      type SchedulerResult = "all-attempted" | "cancelled" | "paused" | "failed";
      const status: SchedulerResult = await (async () => {
        if (useWorkers) return runWithWorkers();
        return runInline();

        async function runInline(): Promise<SchedulerResult> {
          for (const i of schedulable) {
            if (cancelRequested) return "cancelled";
            if (pauseRequested) return "paused";
            if (writer.dead) return "failed";
            const task = taskSource.get(i);
            const rec = await executeRun(task, { isCancelled: () => cancelRequested });
            if (rec.status === "cancelled") return "cancelled";
            recordOf(rec);
            emitProgress(rec, task.comboId);
            if (writer.pending >= FLUSH_EVERY) writer.schedule();
            if (writer.pending > PENDING_HIGH_WATER) await writer.waitForCapacity();
          }
          return "all-attempted";
        }

        function runWithWorkers(): Promise<SchedulerResult> {
          return new Promise<SchedulerResult>((resolvePool) => {
            const workerCount = Math.max(1, Math.min(opts.workerCount ?? defaultWorkerCount(), 8));
            const anomalies: string[] = [];
            const pool = new WorkerPool(opts.experimentId, workerCount, {
              onResult: (rec) => {
                if (rec.status === "cancelled") {
                  // In-flight cancel — not committed; the task stays
                  // unattempted and a later run may retry it.
                  checkDone();
                  return;
                }
                recordOf(rec);
                emitProgress(rec, rec.comboId);
                if (writer.pending >= FLUSH_EVERY) writer.schedule();
                // Backpressure: stop dispatch while the write queue drains,
                // resume when capacity returns.
                if (writer.pending > PENDING_HIGH_WATER) {
                  pool.pauseDispatching();
                  void writer.waitForCapacity().then(() => {
                    if (!settled) pool.resumeDispatching();
                  });
                }
                checkDone();
              },
              onTaskLost: (taskId, reason) => {
                const index = taskIdToIndex.get(taskId);
                if (index !== undefined && pool.requeue(index, taskId)) {
                  pool.pump();
                } else if (index !== undefined) {
                  // Retries exhausted → interrupted record (retry-safe for
                  // a later resume).
                  const task = taskSource.get(index);
                  recordOf({
                    runId: task.runId,
                    experimentId: opts.experimentId,
                    comboId: task.comboId,
                    comboIndex: task.comboIndex,
                    cohortIndex: task.cohortIndex,
                    runIndex: task.runIndex,
                    seed: task.seed,
                    status: "interrupted",
                    partyComposition: [],
                    runSummary: `Run ${task.runIndex + 1}: INTERRUPTED — ${reason}`,
                    diagnostics: {
                      phase: "unknown", roomIndex: -1, tier: -1,
                      roomIterations: 0, combatIterations: 0,
                      errorCategory: "worker-crash", errorMessage: reason,
                      retrySafe: true,
                    },
                    telemetryLevel: task.telemetryLevel,
                    telemetryCompleteness: "invalid",
                    engineFingerprint: ENGINE_FINGERPRINT,
                  });
                  emitProgress();
                }
                checkDone();
              },
              onAnomaly: (d) => { anomalies.push(d); if (anomalies.length <= 10) opts.onStorageError?.(`Worker anomaly: ${d}`); },
            });
            pool.taskProvider = (i) => taskSource.get(i);

            let settled = false;
            const checkDone = () => {
              if (settled) return;
              if (cancelRequested) {
                settled = true;
                void pool.cancel().then(() => resolvePool("cancelled"));
                return;
              }
              if (pauseRequested) {
                pool.pauseDispatching();
                if (pool.inFlightCount() === 0) {
                  settled = true;
                  void pool.shutdown().then(() => resolvePool("paused"));
                }
                return;
              }
              if (writer.dead) {
                settled = true;
                void pool.shutdown().then(() => resolvePool("failed"));
                return;
              }
              if (pool.pendingCount() === 0 && pool.inFlightCount() === 0) {
                settled = true;
                void pool.shutdown().then(() => resolvePool("all-attempted"));
              }
            };

            void (async () => {
              try {
                pool.setQueue(schedulable);
                await pool.start();
              } catch (err) {
                // Worker startup failed → inline fallback after cleanup.
                await pool.shutdown();
                opts.onStorageError?.(`Workers unavailable (${err instanceof Error ? err.message : String(err)}) — running inline.`);
                resolvePool(await runInline());
                return;
              }
              const tick = setInterval(() => {
                if (cancelRequested || writer.dead ||
                    (pauseRequested && pool.inFlightCount() === 0) ||
                    (pool.pendingCount() === 0 && pool.inFlightCount() === 0)) {
                  clearInterval(tick);
                  checkDone();
                }
              }, 100);
            })();
          });
        }
      })();

      // ── Finalize: EVERY outstanding write must commit first ──
      let finalStatus: ExperimentStatus;
      let drainError: Error | null = null;
      try {
        await writer.drain();
      } catch (err) {
        drainError = err instanceof Error ? err : new Error(String(err));
      }
      persisted = writer.committed;
      if (drainError) {
        finalStatus = "failed";
        opts.onStorageError?.(`Final checkpoint failed — ${sink.count - persisted} records unsaved: ${drainError.message}`);
      } else if (status === "cancelled") {
        finalStatus = "cancelled";
      } else if (status === "paused") {
        finalStatus = "paused";
      } else if (status === "failed") {
        finalStatus = "failed";
      } else {
        // All tasks attempted — but technical failures mean the experiment
        // is not a clean research result.
        const failures = sessionAcc.errors + sessionAcc.timeouts +
          sink.all().filter((r) => r.status === "interrupted").length;
        finalStatus = failures > 0 ? "completed-with-errors" : "completed";
      }
      if (ownershipLost && finalStatus === "completed") finalStatus = "completed-with-errors";
      if (store) {
        try {
          await store.updateExperiment(opts.experimentId, {
            status: finalStatus,
            completedTasks: baselineDone + sink.count,
            persistedTasks: priorCommitted + persisted,
            summary: buildSummary(),
            ...(drainError ? { error: drainError.message } : {}),
          });
        } catch (err) {
          opts.onStorageError?.(`Final status write failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      opts.onStatus?.(finalStatus);
      emitProgress(undefined, undefined, true);
      await releaseResources();
      resolveDone({
        status: finalStatus,
        records: sink.all(),
        persisted,
        stored,
        committedTotal: priorCommitted + persisted,
      });
    } catch (err) {
      if (store) {
        try { await store.updateExperiment(opts.experimentId, { status: "failed", error: String(err) }); } catch { /* ignore */ }
      }
      opts.onStatus?.("failed");
      await releaseResources();
      resolveDone({ status: "failed", records: sink.all(), persisted: writer.committed, stored, committedTotal: priorCommitted + writer.committed });
    } finally {
      activeExecution = null;
    }
  })();

  return handle;
}
