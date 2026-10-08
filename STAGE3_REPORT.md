# Skybreak Revival — Stage 3 Report

**Scope:** Simulation, Strategy Lab & Scientific Balance Infrastructure.
**Baseline HEAD:** `01f7f11a9736377459e0f8f7dcc62434e76a900e`
**Guiding principle honored:** accuracy > reproducibility > durability > scale > interpretation.

---

## 1. What was built

### Architecture

```
BatchSimulationScreen ──┐
                        ├─→ store (batchStore / strategyLabStore)
StrategyLabScreen  ─────┘        │
                                 ▼
                    experimentRunner.ts  — coordinator:
                    worker pool, inline fallback, cooperative
                    cancel/pause, incremental flush, resume
                          │              │
              ┌───────────┘              ▼
              ▼                  persistence/experimentDb.ts
   workers/simulation.worker.ts   IndexedDB + memory fallback
              │
              ▼
        engine/simRunner.ts — canonical headless executor
              │
   experimentSpec.ts (identity/seeds/fingerprints)
   telemetry.ts (per-hero/encounter records)
   statistics.ts (Wilson CI, summaries, paired compare)
   evidenceExport.ts (versioned evidence packages)
```

### New files

| File | Purpose |
|---|---|
| `src/types/experiment.ts` | Canonical contracts: `RunTask`, `RunRecord`, `ExecutionStatus`, `HeroRunRecord`, `EncounterRecord`, `RunDiagnostics`, `TelemetryLevel`/`TelemetryCompleteness` |
| `src/types/workerProtocol.ts` | Typed worker message protocol |
| `src/engine/experimentSpec.ts` | Seed protocol v2, `comboToId` (6-axis canonical key), `configFingerprint`, `fnv1a`/`stableStringify`, task expansion, `ENGINE_FINGERPRINT` |
| `src/engine/simRunner.ts` | Worker-safe `executeRun`: per-run counter resets, per-run `defeatedBy`, bounded iteration, cooperative cancel, honest status classification |
| `src/engine/simPolicies.ts` | `getItemUsageThreshold` leaf module (breaks combatRunner↔simRunner import cycle) |
| `src/engine/telemetry.ts` | Per-hero records + encounter reconstruction from bounded log; honest completeness flags |
| `src/engine/statistics.ts` | `wilsonInterval`, `summarize`, `evidenceTier`, `aggregateRuns` (correct denominators), `pairedCompare` |
| `src/engine/evidenceExport.ts` | Versioned `skybreak-evidence` packages, `validateEvidencePackage`, JSON/CSV downloaders |
| `src/workers/simulation.worker.ts` | Web Worker entrypoint; stale-experiment guard; cooperative cancel |
| `src/persistence/experimentDb.ts` | `ExperimentStore` iface, IndexedDB impl (`skybreak-experiments` DB), `MemoryExperimentStore` fallback, duplicate-safe writes |
| `src/app/experimentRunner.ts` | Coordinator: worker pool (respawn, bounded retries, stale-msg rejection), inline fallback, throttle progress, flush-every-25 commits, fingerprint-checked resume |
| `src/components/experiment/ExperimentHistoryPanel.tsx` | Shared history UI (status badges, resume, delete) |
| `e2e/stage3Experiments.spec.ts` | 4 browser tests + screenshot evidence |

### Modified files

- `src/app/batchStore.ts`, `src/app/strategyLabStore.ts` — rewired to the coordinator; history open/resume/delete; evidence export.
- `src/components/screens/BatchSimulationScreen.tsx` — pause/cancel, persisted counter, throughput, CI + evidence tier + excluded-failure disclosure, per-run diagnostics panel, history panel, telemetry selector, partial-evidence banner with inline Resume.
- `src/components/screens/StrategyLabScreen.tsx` — same infrastructure UI; `sharedCohort` protocol checkbox with honest scoping note; CI + n columns in comparison table; per-hero class table (individual survival, damage dealt/taken).
- `src/engine/batchSimulationEngine.ts` — compatibility layer; `runSingleGame`/`runBatch` delegate to `executeRun`; download helpers kept (DOM-bound, UI-side only).
- `src/engine/strategyLabEngine.ts` — `runStrategyLab` delegates to `executeRun` (no parallel engine drift); canonical `comboToId` in results.
- `src/engine/combatRunner.ts` — imports `getItemUsageThreshold` from `simPolicies` (cycle fix).
- `src/engine/eventLog.ts` — `resetEventSequence`; persistent accumulators (`damageReceivedByHero`, `healingByHero`, `itemsUsedByHero`, `deathsByHero`) written at emission time so they survive log pruning.
- `src/engine/heroAbilityEngine.ts` — `useItem` now increments `itemsUsed`/`itemsUsedByHero` (was a dead metric).
- `src/types/ui.ts`, `src/types/batch.ts`, `src/types/strategyLab.ts` — `RunStats` accumulators; `RunResult` is now `RunRecord`; `AggregateStats` gains valid/failure counts, CI, evidence tier.

## 2. Corrected defects

| Defect | Fix |
|---|---|
| d6→4-suit mapping biased (2/6,1/6,2/6,1/6) | `randomParty` uses `rng.chooseRandom` — uniform 1/4 per suit; `ENGINE_FINGERPRINT` bumped to `skybreak-sim/3.1.0` |
| d6→N split "random" mapping could index out of bounds and was non-uniform for N=4 | `pickSplitChoice` uses uniform `chooseRandom` |
| Module-global `_defeatedByMonster` leaked across runs | per-run `ctx.defeatedByMonster` |
| Module-global event sequence/id counters leaked across runs | `resetEventSequence()` + `resetIdCounter()` per run |
| Stuck/timeout runs folded into `"defeat"` | honest `status` taxonomy: `completed`/`invalid`/`error`/`timeout`/`cancelled`/`interrupted`; only `completed` has an `outcome` |
| `stats.itemsUsed` never incremented | incremented at `useItem()` consumption point, per-hero tracked |
| Aggregation denominators included failures | `aggregateRuns` counts only `completed` runs; failures shown separately |
| Class "survival" was party-level misattribution | `individualSurvivalRate` from per-hero `HeroRunRecord`s; party-level metric labeled deprecated |
| Results lost on refresh | incremental commits every 25 runs to IndexedDB + resume |
| Worker bundling broken in production (`new URL` hoisted → raw unbundled data: URL) | canonical `?worker` import → real bundled chunk `simulation.worker-*.js` |

## 3. Verification (actual results)

| Command | Result |
|---|---|
| `npm test` | **1202 tests / 32 files, all pass** (~12.4s) |
| `npx tsc -b --noEmit` | **clean, 0 errors** |
| `npm run build` | **success, 9.8s**, worker chunk emitted (`simulation.worker-C9UNQq0a.js`, self-contained) |
| `npm run test:e2e` | **33 tests, all pass** (29 existing + 4 new), ~2.3min |

### New test coverage

- `stage3Outcomes.test.ts` — 23 tests: status classification, technical-failure exclusion from denominators, deterministic outcomes/fingerprints, unbiased suit distribution (all 4 suits reachable; χ²-style bound), split sampling in range, run isolation, Wilson CI/summarize/evidenceTier/pairedCompare.
- `stage3Coordinator.test.ts` — 8 tests: inline execution, completion-order independence, cancellation, incremental persistence, resume equivalence vs fresh run, fingerprint-incompatible resume rejection, memory-store CRUD, duplicate-run prevention.
- `stage3Perf.test.ts` — 2 report-only benchmarks (no timing assertions that could flake CI).

### Measured performance (this machine)

- Inline executor (vitest env): **23–28 runs/sec**, ~36–43 ms/run.
- Browser worker pool (dev server, 4 workers, IndexedDB committing): **60 runs in 678ms ≈ 88 runs/sec**, all 60 persisted.
- e2e evidence: 100-run batch cancel→resume completed in ~2.8s of wall-clock test time.

### Browser evidence

`artifacts/stage3/screenshots/` (real Chromium, dev server):

- `stage3-01` setup (telemetry selector, experiment name), `stage3-02` running view
- `stage3-03` results: 95% CI `[0–39%]`, `insufficient evidence · n=6` badge, per-run `vs <monster>` attribution
- `stage3-04` run diagnostics (runId, seed, status, engine fingerprint, per-hero stats)
- `stage3-05` cancelled run → partial-evidence banner + Resume button
- `stage3-06/07` history panel after reload; reopened results from committed records
- `stage3-08` resumed 100-run cohort complete
- `stage3-09/10/11` Strategy Lab shared-cohort protocol banner, comparison table with CI + n, class analysis with per-hero telemetry

## 4. Known limitations / non-goals

- **Import UI**: `validateEvidencePackage` exists and checks schema/version/status integrity, but no in-app import surface — validation is programmatic only.
- **Shared cohort** guarantees identical initial seeds/party draws only; realized RNG diverges once strategies consume it differently — disclosed in the UI and export statement.
- **Paired comparison** (`pairedCompare`) is implemented and unit-tested but not yet surfaced as a dedicated UI view; the comparison table shows per-combo CIs.
- **Memory store** (non-IDB environments) keeps results session-scoped; the UI discloses `storageWarning` — "results are in memory only".
- Telemetry `encounters` is reconstructed from the 500-event bounded log; early spans may be absent at `standard` level (`completeness: "partial"`); `deep` keeps the full log.
- `runBatch`/`runStrategyLab` legacy entry points remain (used by existing tests) but delegate to `executeRun`.
- Worker failure mid-run produces an `interrupted` record after 1 retry; a crashed run can be re-executed on resume (retrySafe flagged).
- e2e `stage3-05` cancel fired before any run committed (0 committed) — resume-from-partial-commit is covered by the unit test; browser evidence shows the interrupted state but not a partially-populated table.

## 5. Missing rules decisions (unchanged)

No gameplay balance was modified. The biased suit mapping fix and dead `itemsUsed` counter are integrity corrections, not balance changes. Wolf HP, deadline rules, and all item/monster values untouched.

## 6. Performance bottlenecks

- Combat stepping dominates run cost (~36ms/run inline). Worker parallelism scales roughly linearly to the 4-worker cap.
- IndexedDB flush at 25-run batches is a small fraction of runtime; `deep` telemetry increases structured-clone cost per record.
- Strategy Lab result grouping is O(runs) once at completion; large labs (hundreds of runs × full logs) will be memory-heavy in the results view — per-run logs are only rendered on selection.

## 7. Compatibility notes

- IndexedDB store name: `skybreak-experiments` (DB v1); memory fallback active when IDB is unavailable (SSR/tests).
- Worker requires `?worker` bundling — verified in `vite build` output; dev mode uses the module worker.
- `ENGINE_FINGERPRINT` mismatch marks a stored experiment `incompatible` — resume is refused, never silently continued.
