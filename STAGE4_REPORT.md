# STAGE 4 — Reliability, Evidence Integrity & Balance Readiness

**Baseline:** commit `a189a37` (Stage 3 complete)
**Verification date:** 2026-10-08
**Status:** Implemented and verified — see completion matrix (§J) for per-requirement status and limitations.

---

## A. Starting Baseline

| Item | State at Stage 4 start |
|---|---|
| Commit | `a189a374616852aa7f377036c72ccf7a32586ff6` |
| Unit tests | 1,202 tests / 32 files passing |
| E2E tests | 33 Chromium tests |
| Stage 3 systems | Worker-pool executor, IndexedDB v1 persistence, seeded determinism, resumability (status-blind), telemetry v1, statistics, evidence export v1, history panel |

**Verified defects in the baseline (root causes in §B):**

1. `void flush()` — results could reach the "completed" status write while run-record writes were still in flight.
2. Run records and experiment metadata written in separate transactions — a crash between them produced inconsistent state (meta says N committed, fewer records exist).
3. `status: "completed"` written unconditionally when the loop ended — technical failures produced a clean "completed" badge.
4. Resume was status-blind: any committed runId was skipped, so `interrupted`/`cancelled`/crashed-task records permanently shadowed work that never ran.
5. Worker `handleMessage` freed the worker slot before validating `taskId`/`experimentId` — a stale or mismatched result could silently drop a live task.
6. `deaths` telemetry counted `HERO_DIED` events retained in the 500-entry bounded log — silently undercounted after pruning.
7. `healingReceived` accumulated the pre-clamp *requested* heal amount — overstated effective healing.
8. Rest-room healing applied HP directly without a `HEAL_APPLIED` event — the largest healing source was invisible to telemetry.
9. Encounter reconstruction defaulted unknown `COMBAT_ENDED` results to `"victory"` and unclosed spans to `"retreat"` — fabricated gameplay outcomes.
10. Win-rate `victories/runs*100` used all records as denominator (technical failures counted as losses) and empty samples rendered as `0%`.
11. `evidenceTier(50)` returned `"replicated"` — sample size alone claimed replication.
12. Tasks and results were fully materialized arrays; no paging, no backpressure — 100k-run experiments would exhaust memory.
13. No cross-tab ownership — two tabs could execute the same experiment and interleave writes.
14. Evidence export/import: weak validation (no status/outcome legality, no duplicates, no provenance), no import UI.

---

## B. Root-Cause Analysis & Corrections

| # | Symptom | Root cause | Correction | Regression test |
|---|---|---|---|---|
| 1 | Results lost on crash near completion | Fire-and-forget `void flush()`; status written before drains | `CheckpointWriter` — serialized promise-chain writer; finalization `await writer.drain()` before any terminal status | `stage4Reliability` "completion is not reported until every queued write has committed" (SlowStore: completion resolves only after `getRunIds == total`) |
| 2 | Meta/run divergence after crash | Runs and meta in separate txs | `commitCheckpoint()` — single tx over `runs`+`receipts`+`experiments`, with `checkpointSeq` | "atomic checkpoints & dedupe precedence" tests |
| 3 | Technical failures shown as clean completion | Final status unconditional | Classification: `completed` / `completed-with-errors` / `failed` / `cancelled` / `paused`; `ownershipLost` degrades `completed` → `completed-with-errors` | "completed-with-errors" coordinator test; e2e `completed-with-errors` history badge |
| 4 | Committed-but-failed tasks never re-run | Resume skipped every committed runId | `planResume()` — receipt-driven classification: `completed`/`timeout`/`invalid`/non-retrySafe `error` → reusable; `interrupted`/`cancelled`/retrySafe `error` → re-execute | "planResume classifies" + "resume re-executes retryable records" |
| 5 | Stale worker result freed slot / dropped task | `handleMessage` freed worker before validating task identity | Validate `experimentId` + `taskId` + in-flight assignment *before* freeing; mismatch → anomaly report, task timeout recovers it | `WorkerPool.handleMessage` (lines 325–360); worker-crash path produces retry-safe `interrupted` records |
| 6 | Deaths undercounted on long runs | Counted from pruned log | `stats.deathsByHero` accumulator at `addEvent` (survives pruning); telemetry falls back to log-counting only for legacy states | "deathsByHero is cumulative and survives bounded-log pruning" (600 events > 500-cap, count still exact) |
| 7 | Healing overstated | `HEAL_APPLIED.details.amount` was pre-clamp | `combatEngine.applyHealing` emits `effectiveAmount` (post-clamp HP delta); accumulator prefers `amounts`/`effectiveAmount`, falls back to `amount` only for legacy events | "healing telemetry uses EFFECTIVE amounts" |
| 8 | Rest healing invisible | `resolveRestChoice` mutated HP without events | `emitRestHealing` emits per-hero `HEAL_APPLIED` with `details.amounts` (effective map) | progressionEngine `emitRestHealing`; accumulator test |
| 9 | Fabricated encounter outcomes | Defaults `"victory"`/`"retreat"` for missing evidence | `EncounterRecord.closed` + `result ∈ {victory,defeat,retreat,unknown,in-progress}`; superseded spans → `closed:false, unknown`; mid-combat termination → `in-progress` | "encounters never fabricate outcomes" + executeRun timeout e2e |
| 10 | Wrong denominators, 0% for no data | Denominator = all records | `aggregateRuns`: `status==="completed" && outcome` only; `victoryRate?: number` (undefined → UI `N/A`); corrupt records excluded from score stats instead of crashing | "empty and failure-only samples produce N/A", "technical failures never enter denominator" |
| 11 | "Replicated" from n alone | Tier table mislabeled | `insufficient(<10) / exploratory(10–49) / estimated(≥50) / replicated(explicit flag only)` | `evidenceTier` boundary test + updated stage3 test |
| 12 | Unbounded memory for large runs | Eager task/result arrays | `TaskSource` lazy generation (`batchTaskSource`, `labTaskSource`); `BoundedRecordSink` (recent 300 + failures 1000); `getRunsPage`/receipts/counts; results table paged (PAGE_SIZE=100); `OnlineAggregator` (Welford, O(1)) | "lazy TaskSource" test; `getRunsPage` cursor walk (250 records, 3 pages) |
| 13 | Concurrent tab execution | Nothing prevented it | Web Lock `skybreak-exp:<id>` (exclusive, ifAvailable) + IDB lease (`ownerToken`, `leaseUntil`, `fenceEpoch`) + fenced `commitCheckpoint` + renewal loop; history shows 🔒 "active elsewhere" | "live lease refuses concurrent execution"; fenced-commit persistence test |
| 14 | Weak/untrusted evidence path | No structural validation; no UI | `validateEvidencePackage` (schema, legal status/outcome combos, duplicates, numerics, size caps, fingerprint/totals warnings); `importEvidencePackage` (idempotent `imp_<id>` target, duplicate-skip); "Import Evidence" button in history panel | evidence validation + idempotent-import tests; e2e import test |

**Remaining limitations (honest disclosure):**

- **L1.** `openExperiment`/`exportEvidence` still load the full run set for the viewed experiment (`getRuns`). Execution is bounded; *viewing* a 100k-run experiment materializes its records. The store has `getRunsPage` for a future streaming view — tracked as remaining work.
- **L2.** Worker-crash paths (init timeout, respawn, mid-flight crash) are covered by code review + the stale-result/timeout recovery logic; the browser e2e covers worker execution and reload recovery, but there is no automated forced-crash test (requires instrumentation the production worker doesn't expose).
- **L3.** A "running" experiment whose tab died shows the `running` badge until resumed (the lease drives the actual claim check — display is truthful but could read "interrupted" for clarity).
- **L4.** Deep-trace retention cap is 8,000 events/run — long combats truncate; `traceStats.truncated` discloses it on the record and demotes `telemetryCompleteness` to `partial`.
- **L5.** Paired-comparison CI is a normal approximation (not exact); stated in UI caveat text.

---

## C. Architecture

```
RunTask (seed + policy)                    IndexedDB v2
      │                              ┌─────────────────────┐
      ▼                              │ experiments (meta,  │
┌───────────────┐   RunTask index    │  lease, fenceEpoch) │
│  TaskSource   │───────────────────▶│ runs (RunRecord,    │
│  (lazy gen)   │                    │  keyPath runId)     │
└───────┬───────┘                    │ receipts (light:    │
        │ schedulable indexes        │  id,status,retrySafe)│
        ▼                            └─────────▲───────────┘
┌───────────────┐   dispatch       ┌───────────┴───────────┐
│  WorkerPool   │◀────────────────▶│ CheckpointWriter      │
│  init hs 5s   │   result/error   │ serialized, 1 tx in   │
│  validate-    │                  │ flight; drain before  │
│  before-free  │                  │ final status          │
│  timeout 120s │                  └─────────▲─────────────┘
│  respawn ≤10  │                            │ commitCheckpoint
└───────┬───────┘                            │ (atomic: runs+
        │ recordOf(rec)                      │  receipts+meta,
        ▼                                    │  fenced by owner)
┌───────────────┐                    ┌───────┴───────┐
│BoundedRecord  │  online counters   │ planResume()  │
│Sink + session │───────────────────▶│ reusable vs   │
│accumulators   │                    │ retryable     │
└───────────────┘                    └───────────────┘

Ownership: Web Lock (exclusive, ifAvailable) + IDB lease (15s TTL, 5s renew,
fenceEpoch). Checkpoint commits carry ownerToken — a stale owner's writes
are rejected inside the tx. Lease expiry is the crash-recovery path.
```

**Task states:** `pending → dispatched → in-flight → completed|error|timeout|invalid` (committed) or `→ lost(crash/timeout) → requeue(≤1) → interrupted(retrySafe)`. Cancelled in-flight tasks are *not* committed — they re-execute on resume.

**Recovery planner** (`planResume`): reads receipts (light — no full records), classifies reusable vs retryable; fingerprints mismatch → `incompatible`.

---

## D. Failure Guarantees

| Failure | Guarantee | Mechanism |
|---|---|---|
| Browser crash / tab close | Committed work intact; ≥1-`checkpointSeq` granularity | Atomic `commitCheckpoint` tx per batch; lease expires (15s TTL) |
| Worker crash | Task re-queued once, then retry-safe `interrupted` record; worker respawned (≤10) | `handleCrash → onTaskLost → requeue`; crash never counts as gameplay outcome |
| IndexedDB failure | Disclosed via `onStorageError`; after 4 consecutive commit failures → status `failed`, never `completed` | `CheckpointWriter.deadError`; drain before status |
| Storage quota failure | Same as above + `VOLATILE_TASK_LIMIT` (500) gate refuses large experiments on the memory fallback unless `allowVolatileLarge` | `durable===false` disclosure |
| Cancellation | In-flight runs get `cancel` (cooperative), bounded 2s drain, then terminate; committed work kept; status `cancelled` (resumable) | `pool.cancel()` + `CANCEL_DRAIN_MS` |
| Pause | Dispatch stops, in-flight drains, status `paused` (resumable) | `pauseDispatching` |
| Resume | Receipt-driven; reusable skipped, retryable re-executed; fingerprint mismatch → `incompatible` | `planResume` |
| Engine version change | Resume refused → `incompatible`; import → warning, not silent | fingerprint check |
| Duplicate/stale results | `taskId`+`experimentId` validated before freeing worker; dedupe precedence (`completed` never downgraded) | `handleMessage` + `shouldReplaceRecord` |
| Ownership loss mid-run | Next `renewLease` failure → cancel + `onStorageError`; `completed` degraded to `completed-with-errors` | lease renew loop |

---

## E. Telemetry Semantics

| Metric | Definition | Completeness handling |
|---|---|---|
| `damageDealt` | `DAMAGE_APPLIED` attributed to hero actorIds (pets → owner); post-mitigation applied damage; overkill included | cumulative accumulator, pruning-proof |
| `damageReceived` | `DAMAGE_APPLIED` targeting heroes | same |
| `healingReceived` | **Effective** post-clamp HP restored (combat + revive + rest) | `amounts`/`effectiveAmount` preferred; legacy `amount` = requested value (approximate, disclosed) |
| `itemsUsed` | canonical consumption count at `useItem` | cumulative |
| `deaths` | `stats.deathsByHero` — survives bounded-log pruning; legacy fallback = retained-log count (may undercount, disclosed) | pruning-proof |
| Encounters | `COMBAT_STARTED`↔`COMBAT_ENDED` spans in retained log | `closed` distinguishes observed ends; `unknown`/`in-progress` never fabricated; truncated logs → `partial` |
| Deep trace | pre-pruning observer, 8,000-event retention cap | `traceStats{emitted,retained,truncated}` — truncated → `partial` |
| `telemetryVersion` | `2` on Stage 4 records | records declare their schema |

`TelemetryCompleteness`: `complete | summary-only | partial | missing | invalid` — no record claims more than it has.

---

## F. Performance (measured, not projected)

| Benchmark | Result | Method |
|---|---|---|
| Unit suite | 1,230 tests / 33 files in 16.6s | `npm test` |
| Typecheck | clean | `npx tsc -b --noEmit` |
| Production build | 10.28s | `npm run build` |
| Worker chunk | `simulation.worker-*.js` 184.6 kB, self-contained (Stage 3 data:URL defect stays fixed) | build output |
| Inline executor | 17.1 runs/s (20 runs, single thread, vitest) | `stage3Perf` bench |
| Worker pool (browser) | 40 runs completed within the 2.5s pre-reload observation window (~≥16 runs/s, 4 workers); resumed ~280 remaining runs of a 300-run experiment in ≈6s (~45+ runs/s effective) | e2e timing, Chromium |
| Bounded memory | record sink capped at 300 recent + 1,000 failure records; task generation lazy; results table paged at 100 | code constants + paging e2e |

*Note: worker throughput numbers are observed wall-clock from e2e runs, not a controlled benchmark — they bound, not project, capability.*

---

## G. Statistical Methodology

- **Denominator:** `status==="completed" && outcome` only. Technical failures (`error`/`timeout`/`invalid`/`cancelled`/`interrupted`) counted separately, never as defeats.
- **Win rate:** `victories/validRuns`, Wilson 95% CI. `victoryRate` is `undefined` (→ `N/A`) when no valid observations — "no data" is not 0%.
- **Score σ:** sample standard deviation (n−1). Corrupt completed records without score contribute to the denominator but not score stats.
- **Evidence tiers:** `insufficient(<10) · exploratory(10–49) · estimated(≥50) · replicated(explicit independent-replication flag only)`.
- **Paired comparison:** shared-cohort runs matched by `cohortIndex`; only pairs where *both* sides completed count; unmatched disclosed (`unmatchedA/B`); win diffs + mean score diff with normal-approx CI. UI caveat: shared *starting* seeds — realized RNG diverges once strategies consume it differently.
- **Class association:** party-level win rate by class presence is *association, not causation*; individual-hero survival reported separately (`heroSurvivals/heroAppearances`).
- **AI competency:** `noProgressBreaks` (forced turn completions) surfaced per run in diagnostics; sim AI is a balance probe, not a skill model — strategies bound, not represent, play.

---

## H. Verification Results

| Command | Result |
|---|---|
| `npm ci` | ✅ clean install (18 pre-existing audit vulnerabilities — 6 moderate, 10 high, 2 critical — unchanged by this work, dev/dep-chain issues) |
| `npm test` | ✅ **1,230 tests / 33 files** pass (was 1,202/32; +28 Stage 4 tests) |
| `npx tsc -b --noEmit` | ✅ clean |
| `npm run build` | ✅ 10.28s, bundled worker chunk emitted |
| `npm run test:e2e` | ✅ **38/38** Chromium tests (29 playability + 4 stage3 + 5 stage4) |

Two e2e selectors updated (IDB version open, history-row button) — test-side fixes, not app changes.

---

## I. Browser Evidence (`artifacts/stage4/screenshots/`)

| Requirement | Evidence |
|---|---|
| Running experiment + durable checkpoint progress | `stage4-03-running-checkpoint-progress.png` |
| Deep-tracking diagnostics | `stage4-02-deep-trace-diagnostics.png` (trace `2134/2134 events`, engine fingerprint, telemetry badge) |
| Interrupted/recoverable + resume | `stage4-04-history-after-crash.png`, `stage4-05-recoverable-experiment.png`, `stage4-06-resumed-complete.png` (300/300, no duplicates — verified via IDB count) |
| Experiment history (new statuses, lease lock) | `stage4-04`, `stage4-05`, `stage4-09` |
| Large-results view (pagination) | `stage4-07-paginated-results.png` (`120 runs · page 1 of 2`) |
| Paired comparison | `stage4-08-paired-comparison.png` |
| Evidence import | `stage4-09-imported-history.png` ("Imported 3 run(s) as read-only evidence") |
| Technical failure separation | `stage4-10-imported-technical-failure-separation.png` ("Excluded from gameplay statistics: 1 error — technical failures are not counted as defeats") |

---

## J. Completion Matrix

| Requirement | Status | Evidence | Limitations |
|---|---|---|---|
| Atomic checkpoints, no `void flush()` races | Complete and verified | SlowStore drain test; `commitCheckpoint` tx | — |
| Completion only after durable writes | Complete and verified | drain-before-status test | — |
| Status-aware resume (reusable vs retryable) | Complete and verified | planResume + resume e2e | — |
| Technical failures ≠ gameplay outcomes | Complete and verified | `completed-with-errors` + denominator tests | — |
| Honest encounter outcomes | Complete and verified | telemetry tests + timeout e2e | L4 |
| Cumulative deaths / effective healing | Complete and verified | accumulator tests | legacy records approximate |
| Bounded memory / lazy tasks / paging | Complete and verified | TaskSource + sink + paged UI tests | L1 (view path loads full set) |
| Cross-tab ownership (lock + lease + fence) | Complete and verified | lease tests + refusal e2e path | Web Lock absent → lease-only (still fenced) |
| Worker hardening (timeout/validate/respawn/cancel) | Implemented but insufficiently verified | code + stale-result recovery; e2e worker runs | L2 (no forced-crash automation) |
| Statistics honesty (N/A, tiers, paired) | Complete and verified | statistics tests + paired UI | L5 (normal-approx CI) |
| Evidence validation + import UI | Complete and verified | validation tests + import e2e | — |
| Storage/quota failure disclosure | Complete and verified | FailingStore test + volatile gate | — |
| Regression test suite | Complete and verified | 28 new tests, 1,230 total green | — |
| Browser evidence for all listed states | Complete and verified | 10 screenshots | — |

---

*Report generated for the Stage 4 directive. All measurements above are actual; nothing projected is presented as measured.*
