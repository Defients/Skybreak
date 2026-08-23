# Skyward Ascent — Project Notes

## Build / Test / Verify
- Install: `npm ci`
- Test: `npm test` (vitest run, 252 tests, jsdom)
- Typecheck: `npx tsc -b --noEmit`
- Build: `npm run build` (tsc -b && vite build)
- Dev: `npm run dev`
- No lint script configured. No CI workflow (`.github/workflows` absent).

## Stack
React 18 + TypeScript (strict) + Vite 5 + Zustand 4 + Tailwind 3 + vitest 2 + recharts + marked.

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

## AI Execution Map (verified)
- Batch + Strategy Lab: `batchSimulationEngine.autoPlayCombat` (inline strategy switch; Strategy Lab calls `runSingleGame`).
- Sim mode: `hooks/useAutoPlay.step` (inline hardcoded 0.3 heal threshold; ignores `combatStrategy`).
- Hybrid mode: `CombatView.executeAIHeroTurn` (inline hardcoded 0.3 heal threshold; ignores strategy).
- `aiController.aiPlayHeroTurn` — canonical decision fn, but only called by dead `aiExecuteHeroTurn` + tests.
- `aiController.aiAutoPlayFullCombat` / `aiExecuteHeroTurn` — DEAD (only self-references).

## Known Divergences (to address in SA-2/SA-4)
- `useAutoPlay` and `CombatView` ignore `combatStrategy` (hardcoded balanced-ish).
- `batchSimulationEngine.autoPlayCombat` has a redundant local stalemate counter that forces retreat at 5 no-progress rounds WITHOUT the `round > 10` guard that canonical `checkCombatEnd` requires. Batch retreats earlier than playable.

## Dead Code (verified zero references)
- `src/engine/diceEngine.ts` (DiceEngine wrapper)
- `src/engine/scoringEngine.ts` (1-line re-export of calculateScore)

## Dead Config (verified)
- `showAiReasoning` — set in defaults, never read.
- `stopConditions` — defined in defaults + types, never evaluated.

## Latent Risks (verified)
- `gameStore` merchant actions omit `withRng` (harmless today because `merchantEngine` uses no RNG, but latent).
- `doManualOverride` shallow-copies root then mutates nested refs via path traversal (shared-reference mutation + `__proto__`/`constructor` path risk).
- `doResetGame` does not call `hybridStore.resetAIControl` (stale AI toggle bleed).
- `saveLoad.importSave` casts `JSON.parse` to `SaveData` with no structural validation; `RngEngine.deserialize` throws on malformed `rng`.
