# Skybreak — Project Notes

## Build / Test / Verify
- Install: `npm ci`
- Test: `npm test` (vitest run, **1,230 tests / 33 files**, jsdom, ~17s)
- Typecheck: `npx tsc -b --noEmit`
- Build: `npm run build` (tsc -b && vite build, ~10s)
- E2E: `npm run test:e2e` (Playwright Chromium, 38 tests)
- Dev: `npm run dev`
- No lint script configured. GitHub CI workflow exists and passes.

## Stack
React 18 + TypeScript (strict) + Vite 5 + Zustand 4 + Tailwind 3 + vitest 2 + recharts + marked.

## Experiment Infrastructure (Stage 4 — see STAGE4_REPORT.md)
- `src/app/experimentRunner.ts` — coordinator: lazy `TaskSource` scheduling,
  `WorkerPool` (init handshake 5s, task timeout 120s, validate-before-free,
  respawn ≤10, bounded cancel), serialized `CheckpointWriter` (drain before
  any terminal status), `planResume()` (reusable vs retryable), Web Lock +
  IDB lease fencing (15s TTL, 5s renew), `completed-with-errors` classification.
- `src/persistence/experimentDb.ts` — IndexedDB v2 (`experiments`, `runs`,
  `receipts`), atomic `commitCheckpoint` (runs+receipts+meta in one tx,
  ownerToken fencing), status-precedence dedupe (`completed` never
  downgraded), `getRunsPage`/receipts/counts, lease API, `MemoryExperimentStore`
  fallback (`durable === false` — volatile, disclosed).
- `src/engine/telemetry.ts` — v2: `stats.deathsByHero` (pruning-proof),
  effective healing (`amounts`/`effectiveAmount`, incl. rest heals), honest
  encounters (`closed` + `unknown`/`in-progress`, never fabricated),
  deep-trace sink (8k cap, `traceStats` disclosure).
- `src/engine/statistics.ts` — completed-only denominators, `victoryRate`
  undefined→N/A, Wilson CI, evidence tiers (estimated@50+, replicated only
  with explicit flag), `pairedCompare` (cohortIndex matching), `OnlineAggregator`
  (Welford, O(1)).
- `src/engine/evidenceExport.ts` — package validation (status/outcome
  legality, duplicates, provenance warnings), idempotent `importEvidencePackage`
  (`imp_<id>` target, "imported" read-only status), import UI in
  `ExperimentHistoryPanel`.
- Worker import must use `?worker` (`import SimulationWorker from
  "../workers/simulation.worker.ts?worker"`) — a hoisted `new URL()` emits an
  unbundled `data:` URL with unresolved imports.

## Delivery Metrics (measured at HEAD eda4f0a; updated Phase 6a)
- Build duration: ~26s (tsc -b + vite build)
- Dist total: ~65 MB (down from ~221 MB after WebP conversion)
- JS: 1,381 KB (gzipped: ~423 KB across all chunks)
- CSS: 100 KB (gzip: 19 KB)
- Images: 35.94 MB (all WebP, loaded on demand)
- Audio: 28.89 MB (MP3, loaded on demand)
- Initial browser transfer (eagerly loaded, gzipped): ~158 KB
  - index.html: 0.85 KB, index JS: 61.20 KB, react-vendor: 45.41 KB,
    data: 9.22 KB, game-engine: 22.00 KB, CSS: 19.01 KB
- Lazy-loaded chunks: CombatView (12.65 KB gz), MerchantView (11.88 KB gz),
  StrategyLabScreen (127.82 KB gz), WikiScreen (66.42 KB gz), others < 12 KB gz
- Tests: 760/760 pass (24 files), ~34s total

## Asset Optimization (Phase 6a — completed)
- All 166 PNGs converted to WebP (quality 80) via ffmpeg.
- Images: 172.57 MB PNG → 35.94 MB WebP (79% reduction).
- Public logo: 1.4 MB PNG → 170 KB WebP.
- Audio: kept at original bitrates (music already 192kbps, SFX at low bitrates —
  re-encoding to 192kbps would increase SFX size with no quality benefit).
- Total assets: ~220 MB → ~65 MB (70% reduction).
- Asset registry strips extensions at lookup time, so no lookup-key changes needed.
- Direct imports (deffy.webp) and public references (index.html, manifest.json) updated.

## Structural Decomposition (Phase 7, completed)
- heroAbilityEngine.ts: 1458 → 1140 lines. Extracted:
  - `src/engine/heroDamage.ts` (235 lines) — `applyHeroDamage`, `applyBasicHeroDamage`, `extractBaseDamage`
  - `src/engine/heroPetTurn.ts` (118 lines) — `executePetTurn`, `findPetRollEntry`
- monsterAbilityEngine.ts: 1350 → 1136 lines. Extracted:
  - `src/engine/monsterHelpers.ts` (245 lines) — `findRollEntry`, `getMonsterRollModifier`,
    `getMonsterDamageModifier`, `getMonsterActionCount`, `getActiveHero`, `healMonster`,
    `applyDebuffToHero`, `applyDebuffToMonster`, `createSummon`, `executeSummonTurns`,
    `applyDebuffsFromEffect`
- CombatView.tsx: 1459 → 1277 lines. Extracted:
  - `src/components/combat/CombatWidgets.tsx` (199 lines) — `colorizeHeads`, `colorizeApc`,
    `ItemDropdown`, `CombatLogTooltip`, `ItemEntry` interface
- All extractions are pure structural refactors — no behavior change.
- 760 tests protect all paths; full suite passes after decomposition.

## Architecture (verified at HEAD 7fad9ef)
- `src/engine/` — pure engine layer (GameState in → GameState out).
- `src/app/` — Zustand stores: `gameStore` (live game), `batchStore`, `strategyLabStore`, `hybridStore`.
- `src/components/screens/` — React screens (lazy-loaded).
- `src/utils/random.ts` — `RngEngine` (mulberry32, seeded, serializable). The only game-semantics RNG.
- `src/data/` — static tables (classes, monsters, weapons, items, rooms, etc.).

## Canonical Combat Terminal Path (verified)
`checkCombatEnd` (combatEngine.ts) is the terminal evaluator. It is invoked by:
- `heroAbilityEngine.executeHeroAction` / `useItem` (after hero action)
- `monsterAbilityEngine.finishMonsterTurn` (after monster turn — also maintains `roundsWithoutProgress`/`lastHpSnapshot`)
`combatResult` is set on `state.combat` by these engine functions. `gameStore.doResolveRoom` consumes `combatResult` to grant rewards / cleanup / advance.

## AI Execution Map (verified at HEAD 80540bc; updated Phase 2)
- Batch + Strategy Lab: `batchSimulationEngine.autoPlayCombat` → `combatRunner.runCombatStep` → `aiPlayHeroTurn` (shared). Strategy Lab calls `runSingleGame`.
- Sim mode: `hooks/useAutoPlay.step` routes through `aiPlayHeroTurn` and now reads `combatStrategy`/`merchantStrategy` from `SimulationConfig` (defaults to `"balanced"`).
- Hybrid mode: `CombatView.executeAIHeroTurn` routes through `aiPlayHeroTurn` and now reads `combatStrategy` from `SimulationConfig`.
- `aiController.aiPlayHeroTurn` — canonical decision fn, called by `combatRunner.runCombatStep`, `useAutoPlay`, and `CombatView`.
- The dead `aiAutoPlayFullCombat` / `aiExecuteHeroTurn` functions referenced in the old audit have been REMOVED; `executeAiHeroDecision` is the current executor.

## Known Divergences (outstanding)
- ~~`useAutoPlay` and `CombatView` hardcode `"balanced"`~~ — RESOLVED (Phase 2: both now read from `SimulationConfig`).
- `batchSimulationEngine.autoPlayCombat` has a local no-progress counter that force-completes a hero's turn after 3 identical state keys. This is a stuck-AI loop-breaker, NOT a stalemate retreat; the canonical `checkCombatEnd` stalemate (round > 10 + 5 no-progress) still applies. Documented as intentional.
- `randomParty` suit selection can never produce `spades` (`Math.min(3, Math.floor((roll-1)/2))` caps at index 2). `aiPickSplitChoice`/`pickSplitChoice` "random" can return an out-of-bounds index for d6=6. `aiMerchantActions` proposes purchases with no gold/affordability check. "never" item-usage is violated by defensive/survivalist `Math.max(default, ht)` clamping. All have failing fixtures in `src/tests/regressionMegaplan.test.ts`.

## Megaplan Phase 0 — Reproduced Defect Fixtures (added 2026-09-07)
- `src/tests/regressionMegaplan.test.ts` — 13 `it.fails` fixtures documenting B1 (final-boss finalization), B2 (asset lookup), B3 (save discovery/validation/RNG), B4 (stale timers), B5 (sampling/policy). Fail-as-expected; convert to `it` when each fix lands.
- `RULES_AUTHORITY.md` — rules-authority ledger. Records the wolf-HP discrepancy (engine 7 vs rules 5) and HomeScreen difficulty-description drift vs implementation. Decisions pending; do not mix into infrastructure PRs.
- See the Enhancement Megaplan (§4) for the full B1–B11 finding list and §10 for the phased plan.

## Dead Code (re-verify before acting)
- `src/engine/diceEngine.ts` and `src/engine/scoringEngine.ts` were flagged in the 2026-08-22 audit; re-verify zero references at current HEAD before removal.

## Dead Config (re-verify before acting)
- `showAiReasoning` and `stopConditions` were flagged in the 2026-08-22 audit; re-verify at current HEAD.

## Latent Risks (status updated at HEAD 80540bc)
- ~~`gameStore` merchant actions omit `withRng`~~ — RESOLVED. `doEnterMerchant`/`doBuyItem`/etc. now call `withRng`.
- ~~`doManualOverride` `__proto__`/`constructor` path risk~~ — RESOLVED. Path keys are now blocked (`gameStore.ts:506-510`); arrays preserved via `[...arr]`.
- ~~`doResetGame` does not call `hybridStore.resetAIControl`~~ — RESOLVED (`gameStore.ts:580`).
- ~~`saveLoad.importSave` structural validation weak; legacy keys not discovered; RNG unbounded~~ — RESOLVED (Phase 1 B3: `isValidSaveShape` validates phase enum + hero fields; `importLegacySaves` discovers `skyward_ascent_*`; `RngEngine.deserialize` clamps step).
- ~~`gameStore.doResolveRoom` clears combat before `checkVictory`~~ — RESOLVED (Phase 1 B1 + Phase 2: both paths now use shared `resolveCombatRoom` which checks victory before cleanup).
- ~~`useAutoPlay` and `CombatView` ignore `combatStrategy`~~ — RESOLVED (Phase 2 B6: both now read `combatStrategy`/`merchantStrategy` from `SimulationConfig`).
- ~~Batch path never resolves welcome bonus on easy/normal~~ — RESOLVED (Phase 2: `runSingleGame` now calls `rollWelcomeBonus` + `applyWelcomeBonusResults`).
- ~~Batch path never calls `finalizeRunStats`~~ — RESOLVED (Phase 2: `runSingleGame` now finalizes MVP/deadliest monster).
- ~~`runBatch`/`runStrategyLab` not cancellable~~ — RESOLVED (Phase 2: both accept `isCancelled` callback; stores wire `cancelRequested`).
- ~~Strategy Lab uses independent seeds per combo~~ — RESOLVED (Phase 2: `sharedCohort` option replays same seed across combos for comparable results).
- ~~`startCombat` clears the event log~~ — RESOLVED (Phase 2: log is now preserved across combat; welcome bonus and room events survive).
- ~~Wolf HP discrepancy (engine 7 vs rules 5)~~ — RESOLVED (Phase 3: 7 HP is intentional balance; docs updated to match engine).
- ~~HomeScreen difficulty descriptions diverge from engine~~ — RESOLVED (Phase 3: blurbs rewritten to match authoritative rules text).
- ~~Incomplete rename: `skyward_` preference keys in HomeScreen and AudioManager~~ — RESOLVED (Phase 3: migrated to `skybreak_` with legacy fallback).

## Ascent Capsules (Phase 3)
- `src/engine/runCapsule.ts` — versioned reproduction packet (`RunCapsule` type, `buildRunCapsule`, `serializeCapsule`, `parseCapsule`, `copyCapsuleToClipboard`).
- `RunReport.tsx` — "Copy Ascent Capsule" button copies seed/party/difficulty/outcome to clipboard.
- Capsules capture starting conditions for replay/sharing; they are NOT save files.

## Vyridian's Verdict (Phase 4)
- `src/engine/vyridianVerdict.ts` — cosmetic narrative epilogue based on run stats.
- `computeVerdict(state)` returns archetypes sorted by weight; `getPrimaryVerdict(state)` returns the top one.
- Archetypes: The Unbroken (victory, no deaths), The Sacrificed (victory + deaths), The Resilient (revivals), The Flawless (perfect combats), The Frugal (low spending), The Defiant (defeat at final boss), The Fallen (defeat before boss), The Resourceful (many items used).
- Purely cosmetic — no state mutation, no balance effects, no hidden ending rules.
- Displayed in `RunReport.tsx` between the header and the score breakdown.

## Content IDs & Explain This Turn (Phase 5)
- **Stable content identifiers** (additive, backward-compatible):
  - `ClassData.classId` added to all four classes (`bladedancer`, `manipulator`, `tracker`, `guardian`).
  - `RoomNode.roomId` added to all generated rooms and split options (format: `t{tier}_{index}_{type}`).
  - `ITEMS_BY_ID` index and `getItemData(itemId)` helper added alongside the existing display-name-keyed `ITEMS` map.
  - `ItemInstance.itemId` is now **required** (Phase 9). Legacy saves are backfilled by `migrateLegacyState`.
  - `resolveItemData` is now strict — resolves by `itemId` only, no name fallback.
- **ID-based asset lookup helpers** in `src/assets/assetRegistry.ts`:
  - `getMonsterImageById(id)`, `getWeaponImageById(id)`, `getItemImageById(itemId)`.
  - Legacy name-based helpers (`getMonsterImage`, `getWeaponImage`, `getItemImage`) retained.
  - `WikiScreen.tsx` now prefers ID-based lookup with name fallback.
- **Asset filename corrections**:
  - `resonane_elemental-portrait.png` → `resonant_elemental-portrait.png`
  - `beastmastersprid.png` → `beastmasterspride.png`
  - Registry and `FloatingBubbles.tsx` references updated.
- **Explain This Turn** (`src/components/combat/ExplainTurn.tsx`):
  - Clickable ℹ icon next to each combat log event in `CombatView.tsx`.
  - Surfaces the `DamageBreakdown` already stored in `DAMAGE_APPLIED.details.breakdown` (base, weapon/enchantment/token/environment/match bonuses, shield/armor/defense reductions, phase-through, notes, final damage).
  - For non-damage events with structured `details`, shows key/value pairs.
  - Derives explanations from actual `GameEvent` data — no invented narration.

## Physical Table Bridge (Phase 6c)
- **Physical input protocol**: When `rngMode === "physical"` in `SimulationConfig`:
  - `RngEngine.setPhysicalRolls(values)` queues physical die results consumed FIFO by `rollD6`/`roll2D6`.
  - `RngEngine.setPhysicalCards(cards)` sets cards for the next `flipPeonCards` call.
  - `rng.consumePhysicalCards()` returns and clears the override.
  - `rng.clearPhysicalOverrides()` clears both queues.
  - No engine function signatures changed — overrides are consumed transparently.
- **Store methods**: `doHeroActionPhysical(heroId, action, targetId, cards, rolls)` and
  `doMonsterTurnPhysical(cards, rolls)` set overrides, call the normal action, then clear.
- **UI**: `PhysicalInputPanel` (`src/components/combat/PhysicalInputPanel.tsx`) shows in
  CombatView when physical mode is on. Player enters 2 card suits/ranks + 1 d6 roll.
  "Use RNG" fallback button skips physical input. Shows for both hero and monster turns.
- **Design principle**: Physical inputs replace RNG at the injection point — the engine
  still runs synchronously through the canonical terminal path (`checkCombatEnd`).
  Secondary rolls (freeze, trap, dodge, etc.) use seeded RNG unless explicitly queued.
- **Future extension**: APC assignment from physical deck,
  environment card from physical deck, multi-roll queueing for secondary checks.

## Stage 3 — Simulation & Experiment Infrastructure (completed)
- `src/engine/simRunner.ts` — canonical worker-safe run executor (`executeRun`). Honest
  `ExecutionStatus` (completed/invalid/error/timeout/cancelled/interrupted); only
  `completed` carries a gameplay `outcome`. Per-run reset of event sequence + id
  counter; per-run `defeatedBy`. Cooperative cancel via `isCancelled`.
- `src/engine/experimentSpec.ts` — seed protocol v2 (`base|v2|batch|i`,
  `…|cohort|i` shared across combos, `…|ind|comboId|i`), `comboToId` (canonical
  6-axis key), `configFingerprint` (fnv1a over stableStringify), `ENGINE_FINGERPRINT`.
- `src/workers/simulation.worker.ts` — bundled via `?worker` import (NOT
  `new Worker(new URL())` — hoisted URLs inline unbundled source, breaking
  imports at runtime). Pool with respawn + bounded retry in `experimentRunner.ts`.
- `src/app/experimentRunner.ts` — coordinator: worker pool + inline fallback,
  incremental flush (every 25 records), cancel/pause, fingerprint-checked resume.
- `src/persistence/experimentDb.ts` — `ExperimentStore`; IndexedDB
  (`skybreak-experiments`, stores `experiments` + `runs`) with
  `MemoryExperimentStore` fallback. Duplicate-safe writes by `runId`.
- `src/engine/statistics.ts` — `wilsonInterval`, `summarize`, `evidenceTier`,
  `aggregateRuns` (failures excluded from denominators), `pairedCompare`.
- `src/engine/telemetry.ts` — per-hero (`HeroRunRecord`) + encounter records;
  persistent accumulators on `RunStats` survive the 500-event log bound.
- `src/engine/evidenceExport.ts` — versioned `skybreak-evidence` export packages.
- `src/components/experiment/ExperimentHistoryPanel.tsx` — shared history UI.
- Fixed: biased random-party suit mapping (now uniform 1/4), dead `itemsUsed`
  stat, run-state leakage, technical failures counted as defeats.
- Tests: `stage3Outcomes.test.ts` (23), `stage3Coordinator.test.ts` (8),
  `stage3Perf.test.ts` (2 benchmarks), `e2e/stage3Experiments.spec.ts` (4).
- Measured: ~24–28 runs/sec inline (jsdom), ~88 runs/sec via worker pool in
  browser (60 runs / 678ms). See STAGE3_REPORT.md for the full ledger.
