/**
 * Stage 3/4 — durable experiment storage.
 *
 * IndexedDB-backed store with an in-memory fallback for environments
 * without IDB (tests, workers, locked-down browsers). The fallback sets
 * `durable: false` so the UI can disclose the limitation honestly —
 * it is never silently treated as durable.
 *
 * Schema v2:
 *   experiments: { id (pk), kind, name, status, createdAt, updatedAt,
 *                  schemaVersion, engineFingerprint, configFingerprint,
 *                  config, totalTasks, completedTasks, persistedTasks,
 *                  summary, error, checkpointSeq,
 *                  ownerToken, leaseUntil, fenceEpoch, importedFrom }
 *   runs:        { runId (pk), experimentId (index), runIndex, status,
 *                  comboId, record }
 *   receipts:    { [experimentId, runId] (pk), experimentId (index),
 *                  runIndex, status, retrySafe, comboId,
 *                  index byExpRunIndex [experimentId, runIndex] }
 *
 * Why receipts: reading a run row deserializes the full RunRecord
 * (potentially thousands of events). Receipts are small summaries that
 * make resume planning, counts, and paginated navigation O(page size)
 * rather than O(experiment size).
 *
 * Write boundary: `commitCheckpoint` writes run rows, receipt rows, and
 * the experiment metadata patch in ONE transaction — a crash can never
 * leave committed runs with stale counters. The durable receipt set is
 * the source of truth; persistedTasks is a cache reconciled from it.
 *
 * Ownership (cross-tab): `acquireLease`/`releaseLease`/`renewLease` set a
 * fencing pair (ownerToken + fenceEpoch + leaseUntil) on the experiment.
 * `commitCheckpoint` rejects writes whose ownerToken no longer matches —
 * a stale owner that lost its lease cannot commit after a takeover.
 */
import type { RunRecord, ExperimentKind, ExperimentStatus } from "../types/experiment";
import { EXPERIMENT_SCHEMA_VERSION } from "../engine/experimentSpec";

export interface ExperimentSummary {
  validRuns: number;
  victories: number;
  defeats: number;
  errorRuns: number;
  timeoutRuns: number;
  avgScore: number;
  lastRunSummary?: string;
}

export interface StoredExperiment {
  id: string;
  kind: ExperimentKind;
  name?: string;
  status: ExperimentStatus;
  createdAt: string;
  updatedAt: string;
  schemaVersion: number;
  engineFingerprint: string;
  configFingerprint: string;
  config: unknown;
  totalTasks: number;
  completedTasks: number;
  persistedTasks: number;
  summary?: ExperimentSummary;
  error?: string;
  /** Monotonic checkpoint counter — incremented per committed checkpoint. */
  checkpointSeq?: number;
  /** Cross-tab ownership: token of the coordinating context. */
  ownerToken?: string;
  /** Epoch ms when the lease expires; another owner may take over after. */
  leaseUntil?: number;
  /** Fencing epoch — incremented on each lease acquisition. */
  fenceEpoch?: number;
  /** Provenance for imported evidence. */
  importedFrom?: string;
}

/** Lightweight run summary — read without deserializing full records. */
export interface RunReceipt {
  experimentId: string;
  runId: string;
  runIndex: number;
  comboId?: string;
  status: RunRecord["status"];
  retrySafe?: boolean;
}

export interface RunPage {
  records: RunRecord[];
  /** Opaque cursor for the next page — undefined when exhausted. */
  cursor?: string;
}

export interface CheckpointMetaPatch {
  completedTasks?: number;
  persistedTasks?: number;
  summary?: ExperimentSummary;
  status?: ExperimentStatus;
  error?: string;
}

export interface LeaseResult {
  ok: boolean;
  /** Present when acquisition succeeded. */
  fenceEpoch?: number;
  /** Present when refused — the current owner's token. */
  heldBy?: string;
  reason?: string;
}

export interface ExperimentStore {
  /** True when backed by IndexedDB; false = volatile in-memory fallback. */
  readonly durable: boolean;
  init(): Promise<void>;
  createExperiment(meta: StoredExperiment): Promise<void>;
  updateExperiment(id: string, patch: Partial<StoredExperiment>): Promise<void>;
  /**
   * Atomically commit run records + experiment metadata in one write.
   * Duplicate/conflicting runIds resolve by status precedence — a
   * committed "completed" record is never overwritten by a weaker status.
   * `ownerToken`, when provided, enforces cross-tab fencing: the commit
   * fails if the stored lease belongs to a different owner.
   */
  commitCheckpoint(
    experimentId: string,
    runs: RunRecord[],
    metaPatch: CheckpointMetaPatch,
    ownerToken?: string
  ): Promise<{ committedRunIds: string[]; checkpointSeq: number }>;
  /** Legacy bulk write — same precedence rules, no meta update. */
  putRuns(records: RunRecord[]): Promise<void>;
  getRunIds(experimentId: string): Promise<Set<string>>;
  /** Light summaries for resume planning — does not load full records. */
  listRunReceipts(experimentId: string): Promise<RunReceipt[]>;
  getRun(experimentId: string, runId: string): Promise<RunRecord | undefined>;
  /** Paginated run retrieval ordered by runIndex. */
  getRunsPage(
    experimentId: string,
    opts?: { cursor?: string; limit?: number; status?: RunRecord["status"] }
  ): Promise<RunPage>;
  countRuns(experimentId: string, status?: RunRecord["status"]): Promise<number>;
  getRuns(experimentId: string): Promise<RunRecord[]>;
  getExperiment(id: string): Promise<StoredExperiment | undefined>;
  listExperiments(): Promise<StoredExperiment[]>;
  deleteExperiment(id: string): Promise<void>;
  /**
   * Cross-tab ownership. ttlMs is the lease duration; the holder must
   * renew before expiry. A live lease held by another token blocks
   * acquisition; an expired lease can be taken over.
   */
  acquireLease(id: string, ownerToken: string, ttlMs: number): Promise<LeaseResult>;
  renewLease(id: string, ownerToken: string, ttlMs: number): Promise<boolean>;
  releaseLease(id: string, ownerToken: string): Promise<void>;
}

// ─── Status precedence (dedupe/overwrite policy) ────────────────────────────

/**
 * Higher = stronger evidence. A committed record is replaced only by a
 * strictly stronger status or by a same-status refresh (newer diagnostics).
 * "completed" can never be overwritten by a technical-failure record.
 */
const STATUS_RANK: Record<RunRecord["status"], number> = {
  completed: 100,
  invalid: 60,
  timeout: 50,
  error: 40,
  interrupted: 10,
  cancelled: 5,
};

function shouldReplaceRecord(existing: RunRecord, incoming: RunRecord): boolean {
  const rankNew = STATUS_RANK[incoming.status] ?? 0;
  const rankOld = STATUS_RANK[existing.status] ?? 0;
  if (rankNew > rankOld) return true;
  if (rankNew === rankOld) return true; // same-status refresh keeps latest
  return false;
}

function receiptOf(r: RunRecord, experimentId: string): RunReceipt {
  return {
    experimentId,
    runId: r.runId,
    runIndex: r.runIndex,
    comboId: r.comboId,
    status: r.status,
    retrySafe: r.diagnostics?.retrySafe,
  };
}

// ─── IndexedDB implementation ────────────────────────────────────────────────

const DB_NAME = "skybreak-experiments";
const DB_VERSION = 2;

interface StoredRunRow {
  runId: string;
  experimentId: string;
  runIndex?: number;
  status?: string;
  comboId?: string;
  record: RunRecord;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("IndexedDB request failed"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export class IdbExperimentStore implements ExperimentStore {
  readonly durable = true;
  private db?: IDBDatabase;

  async init(): Promise<void> {
    if (this.db) return;
    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, DB_VERSION);
      open.onupgradeneeded = (ev) => {
        const db = open.result;
        const oldVersion = ev.oldVersion;
        if (!db.objectStoreNames.contains("experiments")) {
          db.createObjectStore("experiments", { keyPath: "id" });
        }
        let runs: IDBObjectStore;
        if (!db.objectStoreNames.contains("runs")) {
          runs = db.createObjectStore("runs", { keyPath: "runId" });
          runs.createIndex("byExperiment", "experimentId", { unique: false });
        } else {
          runs = (ev.target as IDBOpenDBRequest).transaction!.objectStore("runs");
        }
        if (!db.objectStoreNames.contains("receipts")) {
          const receipts = db.createObjectStore("receipts", { keyPath: ["experimentId", "runId"] });
          receipts.createIndex("byExperiment", "experimentId", { unique: false });
          receipts.createIndex("byExpRunIndex", ["experimentId", "runIndex"], { unique: false });
        }
        // v1→v2: enrich existing run rows and backfill receipts.
        if (oldVersion >= 1 && oldVersion < 2) {
          const receiptsStore = (ev.target as IDBOpenDBRequest).transaction!.objectStore("receipts");
          const cursorReq = runs.openCursor();
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (!cursor) return;
            const row = cursor.value as StoredRunRow;
            if (row.record) {
              row.runIndex = row.record.runIndex;
              row.status = row.record.status;
              row.comboId = row.record.comboId;
              cursor.update(row);
              receiptsStore.put(receiptOf(row.record, row.experimentId));
            }
            cursor.continue();
          };
        }
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error ?? new Error("Failed to open IndexedDB"));
      open.onblocked = () => reject(new Error("IndexedDB open blocked by another tab"));
    });
  }

  private tx<T>(stores: string[], mode: IDBTransactionMode, fn: (tx: IDBTransaction) => Promise<T>): Promise<T> {
    if (!this.db) return Promise.reject(new Error("Store not initialized"));
    const tx = this.db.transaction(stores, mode);
    return fn(tx);
  }

  async createExperiment(meta: StoredExperiment): Promise<void> {
    await this.tx(["experiments"], "readwrite", async (tx) => {
      tx.objectStore("experiments").put(meta);
      await txDone(tx);
    });
  }

  async updateExperiment(id: string, patch: Partial<StoredExperiment>): Promise<void> {
    await this.tx(["experiments"], "readwrite", async (tx) => {
      const store = tx.objectStore("experiments");
      const existing = await req<StoredExperiment | undefined>(store.get(id));
      if (!existing) throw new Error(`Experiment ${id} not found`);
      store.put({ ...existing, ...patch, id, updatedAt: new Date().toISOString() });
      await txDone(tx);
    });
  }

  async commitCheckpoint(
    experimentId: string,
    runs: RunRecord[],
    metaPatch: CheckpointMetaPatch,
    ownerToken?: string
  ): Promise<{ committedRunIds: string[]; checkpointSeq: number }> {
    return this.tx(["runs", "receipts", "experiments"], "readwrite", async (tx) => {
      const runStore = tx.objectStore("runs");
      const receiptStore = tx.objectStore("receipts");
      const expStore = tx.objectStore("experiments");

      const meta = await req<StoredExperiment | undefined>(expStore.get(experimentId));
      if (!meta) throw new Error(`Experiment ${experimentId} not found`);
      if (ownerToken && meta.ownerToken && meta.ownerToken !== ownerToken) {
        throw new Error(`Ownership lost: experiment ${experimentId} is owned by another context`);
      }

      const committedRunIds: string[] = [];
      for (const record of runs) {
        const existing = await req<StoredRunRow | undefined>(runStore.get(record.runId));
        if (existing?.record && !shouldReplaceRecord(existing.record, record)) continue;
        const row: StoredRunRow = {
          runId: record.runId,
          experimentId,
          runIndex: record.runIndex,
          status: record.status,
          comboId: record.comboId,
          record,
        };
        runStore.put(row);
        receiptStore.put(receiptOf(record, experimentId));
        committedRunIds.push(record.runId);
      }

      expStore.put({
        ...meta,
        ...metaPatch,
        id: experimentId,
        checkpointSeq: (meta.checkpointSeq ?? 0) + 1,
        updatedAt: new Date().toISOString(),
      });
      await txDone(tx);
      return { committedRunIds, checkpointSeq: (meta.checkpointSeq ?? 0) + 1 };
    });
  }

  async putRuns(records: RunRecord[]): Promise<void> {
    if (records.length === 0) return;
    await this.tx(["runs", "receipts"], "readwrite", async (tx) => {
      const runStore = tx.objectStore("runs");
      const receiptStore = tx.objectStore("receipts");
      for (const record of records) {
        const existing = await req<StoredRunRow | undefined>(runStore.get(record.runId));
        if (existing?.record && !shouldReplaceRecord(existing.record, record)) continue;
        runStore.put({
          runId: record.runId,
          experimentId: record.experimentId ?? "",
          runIndex: record.runIndex,
          status: record.status,
          comboId: record.comboId,
          record,
        });
        receiptStore.put(receiptOf(record, record.experimentId ?? ""));
      }
      await txDone(tx);
    });
  }

  async getRunIds(experimentId: string): Promise<Set<string>> {
    return this.tx(["receipts"], "readonly", async (tx) => {
      const idx = tx.objectStore("receipts").index("byExperiment");
      const keys = await req<IDBValidKey[]>(idx.getAllKeys(experimentId));
      return new Set(keys.map((k) => (Array.isArray(k) ? String(k[1]) : String(k))));
    });
  }

  async listRunReceipts(experimentId: string): Promise<RunReceipt[]> {
    return this.tx(["receipts"], "readonly", async (tx) => {
      const idx = tx.objectStore("receipts").index("byExperiment");
      return req<RunReceipt[]>(idx.getAll(experimentId));
    });
  }

  async getRun(experimentId: string, runId: string): Promise<RunRecord | undefined> {
    return this.tx(["runs"], "readonly", async (tx) => {
      const row = await req<StoredRunRow | undefined>(tx.objectStore("runs").get(runId));
      return row?.experimentId === experimentId ? row.record : undefined;
    });
  }

  async getRunsPage(
    experimentId: string,
    opts: { cursor?: string; limit?: number; status?: RunRecord["status"] } = {}
  ): Promise<RunPage> {
    const limit = opts.limit ?? 100;
    return this.tx(["receipts", "runs"], "readonly", async (tx) => {
      const idx = tx.objectStore("receipts").index("byExpRunIndex");
      const lower = opts.cursor
        ? [experimentId, Number(opts.cursor) + 1]
        : [experimentId, -Infinity];
      const range = IDBKeyRange.bound(lower, [experimentId, Infinity]);
      const runIds: string[] = [];
      await new Promise<void>((resolve, reject) => {
        const c = idx.openCursor(range);
        c.onsuccess = () => {
          const cursor = c.result;
          if (!cursor || runIds.length >= limit + 1) return resolve();
          const rec = cursor.value as RunReceipt;
          if (!opts.status || rec.status === opts.status) {
            runIds.push(rec.runId);
          } else {
            // status filter — keep scanning but count toward fetch bound
          }
          cursor.continue();
        };
        c.onerror = () => reject(c.error ?? new Error("cursor failed"));
      });
      const hasMore = runIds.length > limit;
      const pageIds = hasMore ? runIds.slice(0, limit) : runIds;
      const records: RunRecord[] = [];
      for (const id of pageIds) {
        const row = await req<StoredRunRow | undefined>(tx.objectStore("runs").get(id));
        if (row) records.push(row.record);
      }
      const last = pageIds.length ? records[records.length - 1] : undefined;
      return {
        records,
        cursor: hasMore && last ? String(last.runIndex) : undefined,
      };
    });
  }

  async countRuns(experimentId: string, status?: RunRecord["status"]): Promise<number> {
    return this.tx(["receipts"], "readonly", async (tx) => {
      const idx = tx.objectStore("receipts").index("byExperiment");
      if (!status) return req<number>(idx.count(experimentId));
      const all = await req<RunReceipt[]>(idx.getAll(experimentId));
      return all.filter((r) => r.status === status).length;
    });
  }

  async getRuns(experimentId: string): Promise<RunRecord[]> {
    return this.tx(["runs"], "readonly", async (tx) => {
      const idx = tx.objectStore("runs").index("byExperiment");
      const rows = await req<StoredRunRow[]>(idx.getAll(experimentId));
      return rows.map((r) => r.record);
    });
  }

  async getExperiment(id: string): Promise<StoredExperiment | undefined> {
    return this.tx(["experiments"], "readonly", async (tx) => {
      return req<StoredExperiment | undefined>(tx.objectStore("experiments").get(id));
    });
  }

  async listExperiments(): Promise<StoredExperiment[]> {
    return this.tx(["experiments"], "readonly", async (tx) => {
      const all = await req<StoredExperiment[]>(tx.objectStore("experiments").getAll());
      return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
  }

  async deleteExperiment(id: string): Promise<void> {
    await this.tx(["experiments", "runs", "receipts"], "readwrite", async (tx) => {
      tx.objectStore("experiments").delete(id);
      const idx = tx.objectStore("runs").index("byExperiment");
      const keys = await req<IDBValidKey[]>(idx.getAllKeys(id));
      for (const k of keys) tx.objectStore("runs").delete(k);
      const ridx = tx.objectStore("receipts").index("byExperiment");
      const rkeys = await req<IDBValidKey[]>(ridx.getAllKeys(id));
      for (const k of rkeys) tx.objectStore("receipts").delete(k);
      await txDone(tx);
    });
  }

  async acquireLease(id: string, ownerToken: string, ttlMs: number): Promise<LeaseResult> {
    return this.tx(["experiments"], "readwrite", async (tx) => {
      const store = tx.objectStore("experiments");
      const meta = await req<StoredExperiment | undefined>(store.get(id));
      if (!meta) return { ok: false, reason: "not-found" };
      const now = Date.now();
      if (meta.ownerToken && meta.ownerToken !== ownerToken && (meta.leaseUntil ?? 0) > now) {
        return { ok: false, heldBy: meta.ownerToken };
      }
      const fenceEpoch = (meta.fenceEpoch ?? 0) + 1;
      store.put({
        ...meta,
        ownerToken,
        leaseUntil: now + ttlMs,
        fenceEpoch,
        updatedAt: new Date().toISOString(),
      });
      await txDone(tx);
      return { ok: true, fenceEpoch };
    });
  }

  async renewLease(id: string, ownerToken: string, ttlMs: number): Promise<boolean> {
    return this.tx(["experiments"], "readwrite", async (tx) => {
      const store = tx.objectStore("experiments");
      const meta = await req<StoredExperiment | undefined>(store.get(id));
      if (!meta || meta.ownerToken !== ownerToken) return false;
      store.put({ ...meta, leaseUntil: Date.now() + ttlMs, updatedAt: new Date().toISOString() });
      await txDone(tx);
      return true;
    });
  }

  async releaseLease(id: string, ownerToken: string): Promise<void> {
    await this.tx(["experiments"], "readwrite", async (tx) => {
      const store = tx.objectStore("experiments");
      const meta = await req<StoredExperiment | undefined>(store.get(id));
      if (meta && meta.ownerToken === ownerToken) {
        const { ownerToken: _o, leaseUntil: _l, ...rest } = meta;
        store.put({ ...rest, updatedAt: new Date().toISOString() });
      }
      await txDone(tx);
    });
  }
}

// ─── In-memory fallback ──────────────────────────────────────────────────────

export class MemoryExperimentStore implements ExperimentStore {
  readonly durable = false;
  private experiments = new Map<string, StoredExperiment>();
  private runs = new Map<string, StoredRunRow>();
  private receipts = new Map<string, RunReceipt>();

  async init(): Promise<void> {}

  async createExperiment(meta: StoredExperiment): Promise<void> {
    this.experiments.set(meta.id, { ...meta });
  }

  async updateExperiment(id: string, patch: Partial<StoredExperiment>): Promise<void> {
    const existing = this.experiments.get(id);
    if (!existing) throw new Error(`Experiment ${id} not found`);
    this.experiments.set(id, { ...existing, ...patch, id, updatedAt: new Date().toISOString() });
  }

  async commitCheckpoint(
    experimentId: string,
    runs: RunRecord[],
    metaPatch: CheckpointMetaPatch,
    ownerToken?: string
  ): Promise<{ committedRunIds: string[]; checkpointSeq: number }> {
    const meta = this.experiments.get(experimentId);
    if (!meta) throw new Error(`Experiment ${experimentId} not found`);
    if (ownerToken && meta.ownerToken && meta.ownerToken !== ownerToken) {
      throw new Error(`Ownership lost: experiment ${experimentId} is owned by another context`);
    }
    const committedRunIds: string[] = [];
    for (const record of runs) {
      const existing = this.runs.get(record.runId);
      if (existing?.record && !shouldReplaceRecord(existing.record, record)) continue;
      this.runs.set(record.runId, {
        runId: record.runId,
        experimentId,
        runIndex: record.runIndex,
        status: record.status,
        comboId: record.comboId,
        record,
      });
      this.receipts.set(`${experimentId} ${record.runId}`, receiptOf(record, experimentId));
      committedRunIds.push(record.runId);
    }
    const checkpointSeq = (meta.checkpointSeq ?? 0) + 1;
    this.experiments.set(experimentId, {
      ...meta,
      ...metaPatch,
      checkpointSeq,
      updatedAt: new Date().toISOString(),
    });
    return { committedRunIds, checkpointSeq };
  }

  async putRuns(records: RunRecord[]): Promise<void> {
    for (const record of records) {
      const existing = this.runs.get(record.runId);
      if (existing?.record && !shouldReplaceRecord(existing.record, record)) continue;
      const experimentId = record.experimentId ?? "";
      this.runs.set(record.runId, {
        runId: record.runId,
        experimentId,
        runIndex: record.runIndex,
        status: record.status,
        comboId: record.comboId,
        record,
      });
      this.receipts.set(`${experimentId} ${record.runId}`, receiptOf(record, experimentId));
    }
  }

  async getRunIds(experimentId: string): Promise<Set<string>> {
    const ids = new Set<string>();
    for (const r of this.receipts.values()) {
      if (r.experimentId === experimentId) ids.add(r.runId);
    }
    return ids;
  }

  async listRunReceipts(experimentId: string): Promise<RunReceipt[]> {
    return [...this.receipts.values()].filter((r) => r.experimentId === experimentId);
  }

  async getRun(experimentId: string, runId: string): Promise<RunRecord | undefined> {
    const row = this.runs.get(runId);
    return row?.experimentId === experimentId ? row.record : undefined;
  }

  async getRunsPage(
    experimentId: string,
    opts: { cursor?: string; limit?: number; status?: RunRecord["status"] } = {}
  ): Promise<RunPage> {
    const limit = opts.limit ?? 100;
    const after = opts.cursor !== undefined ? Number(opts.cursor) : -1;
    const rows = [...this.runs.values()]
      .filter((r) => r.experimentId === experimentId)
      .map((r) => r.record)
      .sort((a, b) => a.runIndex - b.runIndex);
    const filtered = rows.filter(
      (r) => r.runIndex > after && (!opts.status || r.status === opts.status)
    );
    const page = filtered.slice(0, limit);
    return {
      records: page,
      cursor: filtered.length > limit && page.length ? String(page[page.length - 1].runIndex) : undefined,
    };
  }

  async countRuns(experimentId: string, status?: RunRecord["status"]): Promise<number> {
    let n = 0;
    for (const r of this.receipts.values()) {
      if (r.experimentId === experimentId && (!status || r.status === status)) n++;
    }
    return n;
  }

  async getRuns(experimentId: string): Promise<RunRecord[]> {
    return [...this.runs.values()]
      .filter((r) => r.experimentId === experimentId)
      .map((r) => r.record);
  }

  async getExperiment(id: string): Promise<StoredExperiment | undefined> {
    const e = this.experiments.get(id);
    return e ? { ...e } : undefined;
  }

  async listExperiments(): Promise<StoredExperiment[]> {
    return [...this.experiments.values()]
      .map((e) => ({ ...e }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async deleteExperiment(id: string): Promise<void> {
    this.experiments.delete(id);
    for (const [k, v] of this.runs) {
      if (v.experimentId === id) this.runs.delete(k);
    }
    for (const [k, v] of this.receipts) {
      if (v.experimentId === id) this.receipts.delete(k);
    }
  }

  async acquireLease(id: string, ownerToken: string, ttlMs: number): Promise<LeaseResult> {
    const meta = this.experiments.get(id);
    if (!meta) return { ok: false, reason: "not-found" };
    const now = Date.now();
    if (meta.ownerToken && meta.ownerToken !== ownerToken && (meta.leaseUntil ?? 0) > now) {
      return { ok: false, heldBy: meta.ownerToken };
    }
    const fenceEpoch = (meta.fenceEpoch ?? 0) + 1;
    this.experiments.set(id, {
      ...meta, ownerToken, leaseUntil: now + ttlMs, fenceEpoch,
      updatedAt: new Date().toISOString(),
    });
    return { ok: true, fenceEpoch };
  }

  async renewLease(id: string, ownerToken: string, ttlMs: number): Promise<boolean> {
    const meta = this.experiments.get(id);
    if (!meta || meta.ownerToken !== ownerToken) return false;
    this.experiments.set(id, { ...meta, leaseUntil: Date.now() + ttlMs, updatedAt: new Date().toISOString() });
    return true;
  }

  async releaseLease(id: string, ownerToken: string): Promise<void> {
    const meta = this.experiments.get(id);
    if (meta && meta.ownerToken === ownerToken) {
      const { ownerToken: _o, leaseUntil: _l, ...rest } = meta;
      this.experiments.set(id, { ...rest, updatedAt: new Date().toISOString() });
    }
  }
}

// ─── Singleton access ────────────────────────────────────────────────────────

let storePromise: Promise<ExperimentStore> | null = null;
let testOverride: ExperimentStore | null = null;

/** Inject a store implementation (tests). Pass null to clear. */
export function setExperimentStoreForTest(store: ExperimentStore | null): void {
  testOverride = store;
  storePromise = null;
}

/**
 * Get the experiment store. Uses IndexedDB when available; otherwise a
 * clearly-flagged volatile fallback (`durable === false`).
 */
export function getExperimentStore(): Promise<ExperimentStore> {
  if (testOverride) return Promise.resolve(testOverride);
  if (!storePromise) {
    storePromise = (async () => {
      if (typeof indexedDB !== "undefined") {
        try {
          const store = new IdbExperimentStore();
          await store.init();
          return store;
        } catch {
          // fall through to memory
        }
      }
      const mem = new MemoryExperimentStore();
      await mem.init();
      return mem;
    })();
  }
  return storePromise;
}

/** Reset the singleton (tests). */
export function resetExperimentStore(): void {
  storePromise = null;
}

export function newExperimentMeta(
  id: string,
  kind: ExperimentKind,
  config: unknown,
  totalTasks: number,
  name: string | undefined,
  fingerprints: { engine: string; config: string }
): StoredExperiment {
  const now = new Date().toISOString();
  return {
    id,
    kind,
    name,
    status: "created",
    createdAt: now,
    updatedAt: now,
    schemaVersion: EXPERIMENT_SCHEMA_VERSION,
    engineFingerprint: fingerprints.engine,
    configFingerprint: fingerprints.config,
    config,
    totalTasks,
    completedTasks: 0,
    persistedTasks: 0,
  };
}
