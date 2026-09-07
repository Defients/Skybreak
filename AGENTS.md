# Skybreak — Project Notes

## Build / Test / Verify
- Install: `npm ci`
- Test: `npm test` (vitest run, **728 tests / 24 files**, jsdom, ~60s)
- Typecheck: `npx tsc -b --noEmit`
- Build: `npm run build` (tsc -b && vite build, ~26s)
- Dev: `npm run dev`
- No lint script configured. GitHub CI workflow exists and passes.

## Stack
React 18 + TypeScript (strict) + Vite 5 + Zustand 4 + Tailwind 3 + vitest 2 + recharts + marked.

## Delivery Metrics (measured at HEAD 80540bc; earlier ce819a2 figures superseded)
- Build duration: ~26s (tsc -b + vite build)
- Dist total: 221.44 MB
- JS: 1,381 KB (gzipped: ~423 KB across all chunks)
- CSS: 100 KB (gzip: 19 KB)
- Images: 191.04 MB (PNG/WebP, loaded on demand)
- Audio: 28.89 MB (MP3, loaded on demand)
- Initial browser transfer (eagerly loaded, gzipped): ~158 KB
  - index.html: 0.85 KB, index JS: 61.20 KB, react-vendor: 45.41 KB,
    data: 9.22 KB, game-engine: 22.00 KB, CSS: 19.01 KB
- Lazy-loaded chunks: CombatView (12.65 KB gz), MerchantView (11.88 KB gz),
  StrategyLabScreen (127.82 KB gz), WikiScreen (66.42 KB gz), others < 12 KB gz
- Tests: 728/728 pass (24 files), ~60s total (715 original + 13 Megaplan Phase 0 fixtures)

## Asset Optimization Findings (SA-11, measurement-driven)
- 30+ monster portrait PNGs at 2.5–3.1 MB each (~90 MB total). Converting
  to WebP (quality 80) would reduce to ~0.5–0.8 MB each (~60–80% reduction).
- 2 WebP backgrounds (shopkeeper_room 10.4 MB, spire 8.5 MB) — already WebP
  but oversized. Re-encoding at quality 70 would roughly halve them.
- 5 audio MP3s at 2.8–5.6 MB each (~20 MB total). Re-encoding at 128kbps
  would reduce by ~50%.
- JS is already code-split with lazy-loaded screens. Initial gzipped
  transfer (~158 KB) is reasonable. No JS optimization needed.
- RECOMMENDATION: Batch-convert PNGs to WebP and re-encode audio, but only
  after visual/audio quality review. This is a ~200 MB → ~50 MB reduction
  but requires user approval for quality tradeoffs.

## Structural Decomposition Findings (SA-12, deferred)
- Largest files: MerchantView.tsx (82 KB), monsterAbilityEngine.ts (71 KB),
  CombatView.tsx (71 KB), heroAbilityEngine.ts (66 KB), StrategyLabScreen.tsx (62 KB).
- 728 tests now protect behavior across all paths, making decomposition safe.
- RECOMMENDATION: Split per-class hero/monster ability resolvers into
  separate files, extract MerchantView/CombatView sub-components. Deferred
  to user direction — no behavior change, pure maintainability improvement.

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

## AI Execution Map (verified at HEAD 80540bc)
- Batch + Strategy Lab: `batchSimulationEngine.autoPlayCombat` → `combatRunner.runCombatStep` → `aiPlayHeroTurn` (shared). Strategy Lab calls `runSingleGame`.
- Sim mode: `hooks/useAutoPlay.step` now routes through `aiPlayHeroTurn` (no longer inline), but still hardcodes `"balanced"` and ignores `combatStrategy`.
- Hybrid mode: `CombatView.executeAIHeroTurn` — re-verify whether it still hardcodes 0.3 / ignores strategy.
- `aiController.aiPlayHeroTurn` — canonical decision fn, now called by `combatRunner.runCombatStep` and `useAutoPlay`.
- The dead `aiAutoPlayFullCombat` / `aiExecuteHeroTurn` functions referenced in the old audit have been REMOVED; `executeAiHeroDecision` is the current executor.

## Known Divergences (outstanding; tracked in Megaplan §4 as B5/B6)
- `useAutoPlay` still hardcodes `"balanced"` and ignores `combatStrategy` (no longer inline, but strategy not honored).
- `batchSimulationEngine.autoPlayCombat` has a redundant local stalemate counter that forces retreat at 5 no-progress rounds WITHOUT the `round > 10` guard that canonical `checkCombatEnd` requires. Batch retreats earlier than playable.
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
- `saveLoad.importSave` performs structural validation via `isValidSaveShape`, but it does NOT validate the phase enum or hero fields, and legacy `skyward_ascent_*` keys are not discovered. `RngEngine.deserialize` accepts an unbounded/negative `step`. All tracked as B3 with failing fixtures.
- `gameStore.doResolveRoom` clears combat (via `cleanupCombat`) BEFORE calling `checkVictory`, so a live final-boss victory never finalizes (B1, failing fixture).
