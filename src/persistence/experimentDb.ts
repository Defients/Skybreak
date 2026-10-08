/**
 * Stage 3 — durable experiment storage.
 *
 * IndexedDB-backed store with an in-memory fallback for environments
 * without IDB (tests, workers, locked-down browsers). The fallback sets
 * `durable: false` so the UI can disclose the limitation honestly —
 * it is never silently treated as durable.
 *
 * Schema v1:
 *   experiments: { id (pk), kind, name, status, createdAt, updatedAt,
 *                  schemaVersion, engineFingerprint, configFingerprint,
 *                  config, totalTasks, completedTasks, persistedTasks,
 *                  summary, error }
 *   runs:        { runId (pk), experimentId (index "byExperiment"), record }
 *
 * Write boundary: a run is durable only after putRuns() resolves — i.e.,
 * after the IDB transaction commits. Duplicate runIds are idempotent puts;
 * resume reads committed runIds and never re-executes committed work.
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
}

export interface ExperimentStore {
  /** True when backed by IndexedDB; false = volatile in-memory fallback. */
  readonly durable: boolean;
  init(): Promise<void>;
  createExperiment(meta: StoredExperiment): Promise<void>;
  updateExperiment(id: string, patch: Partial<StoredExperiment>): Promise<void>;
  putRuns(records: RunRecord[]): Promise<void>;
  getRunIds(experimentId: string): Promise<Set<string>>;
  getRuns(experimentId: string): Promise<RunRecord[]>;
  getExperiment(id: string): Promise<StoredExperiment | undefined>;
  listExperiments(): Promise<StoredExperiment[]>;
  deleteExperiment(id: string): Promise<void>;
}

// ─── IndexedDB implementation ────────────────────────────────────────────────

const DB_NAME = "skybreak-experiments";
const DB_VERSION = 1;

interface StoredRunRow {
  runId: string;
  experimentId: string;
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
      open.onupgradeneeded = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains("experiments")) {
          db.createObjectStore("experiments", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("runs")) {
          const runs = db.createObjectStore("runs", { keyPath: "runId" });
          runs.createIndex("byExperiment", "experimentId", { unique: false });
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

  async putRuns(records: RunRecord[]): Promise<void> {
    if (records.length === 0) return;
    await this.tx(["runs"], "readwrite", async (tx) => {
      const store = tx.objectStore("runs");
      for (const record of records) {
        const row: StoredRunRow = {
          runId: record.runId,
          experimentId: record.experimentId ?? "",
          record,
        };
        store.put(row); // idempotent — same runId overwrites
      }
      await txDone(tx);
    });
  }

  async getRunIds(experimentId: string): Promise<Set<string>> {
    return this.tx(["runs"], "readonly", async (tx) => {
      const idx = tx.objectStore("runs").index("byExperiment");
      const keys = await req<IDBValidKey[]>(idx.getAllKeys(experimentId));
      return new Set(keys.map(String));
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
    await this.tx(["experiments", "runs"], "readwrite", async (tx) => {
      tx.objectStore("experiments").delete(id);
      const idx = tx.objectStore("runs").index("byExperiment");
      const keys = await req<IDBValidKey[]>(idx.getAllKeys(id));
      for (const k of keys) tx.objectStore("runs").delete(k);
      await txDone(tx);
    });
  }
}

// ─── In-memory fallback ──────────────────────────────────────────────────────

export class MemoryExperimentStore implements ExperimentStore {
  readonly durable = false;
  private experiments = new Map<string, StoredExperiment>();
  private runs = new Map<string, StoredRunRow>();

  async init(): Promise<void> {}

  async createExperiment(meta: StoredExperiment): Promise<void> {
    this.experiments.set(meta.id, { ...meta });
  }

  async updateExperiment(id: string, patch: Partial<StoredExperiment>): Promise<void> {
    const existing = this.experiments.get(id);
    if (!existing) throw new Error(`Experiment ${id} not found`);
    this.experiments.set(id, { ...existing, ...patch, id, updatedAt: new Date().toISOString() });
  }

  async putRuns(records: RunRecord[]): Promise<void> {
    for (const record of records) {
      this.runs.set(record.runId, {
        runId: record.runId,
        experimentId: record.experimentId ?? "",
        record,
      });
    }
  }

  async getRunIds(experimentId: string): Promise<Set<string>> {
    const ids = new Set<string>();
    for (const row of this.runs.values()) {
      if (row.experimentId === experimentId) ids.add(row.runId);
    }
    return ids;
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
