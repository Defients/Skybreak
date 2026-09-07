# Skybreak — Forensic Development-State Audit

**Date:** 2026-08-22
**Auditor:** Devin (autonomous)
**Subject:** `skybreak-simulator` v0.1.0 — React + Zustand + Vite + TypeScript single-page card-game simulator
**Method:** Static read of every file under `src/`, execution of `vitest` (252 tests, all green) and `tsc -b` (clean), cross-reference of imports/exports to detect orphaned and duplicated logic.

**Verification baseline (FACT):**
- `npx vitest run` → 14 files, 252 tests, **all pass** (~13s).
- `npx tsc -b --noEmit` → **exit 0, no errors**.
- No `.git` directory present (version control is NOT initialized — claims cannot be cross-checked against commit history).

---

## 0) Audit Rules Compliance

Every claim below is grounded in a file path / function / line. Inferences are labelled **[INFERENCE]** with the supporting evidence. “Exists” is treated as distinct from “works end-to-end.”

---

## 1) Full System Scan — Component Index

### Core Engine (`src/engine/`)
| # | Component | File | LOC | Role |
|---|-----------|------|-----|------|
| E1 | Game state factory | `gameState.ts` | 362 | `initializeGame`, `createHero`, welcome-bonus rolls, mode defaults |
| E2 | Rules / room progression | `rulesEngine.ts` | 292 | `advanceRoom`, `transitionTier`, `resolveSplitChoice`, target selection (incl. nightmare AI targeting) |
| E3 | Combat engine | `combatEngine.ts` | ~1,200 | `startCombat`, `flipPeonCards`, `detectMatches`, `calculateDamage`, `applyDamage`, `applyHealing`, `checkCombatEnd`, `cleanupCombat`, `grantRewards` |
| E4 | Hero ability engine | `heroAbilityEngine.ts` | ~1,300 | `executeHeroAction`, `useItem`, all 4 class roll-tables, specs, pets, combo chains |
| E5 | Monster ability engine | `monsterAbilityEngine.ts` | ~1,400 | `executeMonsterTurn`, all monster roll-tables, summons, Vyridian 3-phase boss, redirect logic |
| E6 | Merchant engine | `merchantEngine.ts` | ~900 | `enterMerchant`, buy/upgrade/reforge/repair/enchant, `autoBuy`, `getSuggestedPurchases` |
| E7 | Progression / scoring | `progressionEngine.ts` | 217 | `resolveRestChoice`, `calculateScore`, `checkVictory/Defeat`, `finalizeRunStats` (MVP, deadliest monster) |
| E8 | Deck engine | `deckEngine.ts` | 194 | Royalty/peon/joker/environment decks, draw/peek/reshuffle |
| E9 | Dice engine | `diceEngine.ts` | 38 | Thin wrapper around `RngEngine` |
| E10 | Scoring engine | `scoringEngine.ts` | 1 | Single re-export of `calculateScore` |
| E11 | Event log | `eventLog.ts` | 95 | `emitEvent`, 500-entry ring buffer, sequence counter |
| E12 | Validation engine | `validationEngine.ts` | 134 | HP/token/inventory/combat invariants |
| E13 | AI controller | `aiController.ts` | 300 | `aiPlayHeroTurn`, `aiExecuteHeroTurn`, `aiAutoPlayFullCombat`, split/rest/merchant AI |
| E14 | AI advisor | `aiAdvisor.ts` | 187 | Human-readable `suggestCombatAction/Rest/Split/Merchant` (companion mode) |
| E15 | Batch simulation engine | `batchSimulationEngine.ts` | 741 | `runSingleGame`, `runBatch`, `autoPlayCombat`, `autoMerchant`, `autoRest`, CSV/JSON export |
| E16 | Strategy lab engine | `strategyLabEngine.ts` | 377 | Cross-product of strategy axes, per-combo aggregation, class performance, variance/std-dev |
| E17 | Save / load | `saveLoad.ts` | 211 | localStorage saves + autosave, legacy name migration, export/import |

### State Stores (`src/app/`)
| # | Store | File | Role |
|---|-------|------|------|
| S1 | `useGameStore` | `gameStore.ts` (522) | Single source of truth for live game; wraps every engine action + autosave |
| S2 | `useBatchStore` | `batchStore.ts` (121) | Batch sim config + progress + result |
| S3 | `useStrategyLabStore` | `strategyLabStore.ts` (103) | Strategy lab config + progress + result |
| S4 | `useHybridStore` | `hybridStore.ts` (31) | Per-hero AI toggle map for hybrid mode |

### Data Layer (`src/data/`)
| # | Dataset | File | Content |
|---|---------|------|---------|
| D1 | Classes | `classes.ts` (7024 B) | 4 classes × 2 specs, roll tables, unique mechanics |
| D2 | Monsters | `monsters.ts` (36 KB) | Full bestiary incl. Vyridian 3-phase final boss, summons, WOLF/BEAR pet tables |
| D3 | Weapons | `weapons.ts` (10 KB) | Class weapons by rarity + tags |
| D4 | Items | `items.ts` (5.6 KB) | Consumables, healing services, permanent upgrades, weapon services |
| D5 | Enchantments | `enchantments.ts` (2.4 KB) | Enchantments + chaotic effects |
| D6 | Tokens | `tokens.ts` (4.7 KB) | Shield/Target/Buff/Debuff/Counter factories |
| D7 | Rooms | `rooms.ts` (3 KB) | Hard-coded 10/12/10 room sequences per tier |
| D8 | Rule ambiguities | `ruleAmbiguities.ts` (3.2 KB) | Default rulings |
| D9 | Rules index | `rulesIndex.ts` (11.7 KB) | Wiki search index + keywords |
| D10 | Strategy guide | `strategyGuide.ts` (47 KB) | Wiki strategy content |
| D11 | Monster taunts | `monsterTaunts.ts` (6.3 KB) | Flavor text for run report |
| D12 | Loading lines | `loadingLines.ts` (714 B) | Loading screen flavor |
| D13 | Asset registry | `assetRegistry.ts` (12 KB) | Image/audio path resolver |

### UI Layer (`src/components/`)
| # | Screen | File (KB) | Reachable |
|---|--------|-----------|-----------|
| U1 | HomeScreen | 59 KB | Yes — entry, party builder, mode/difficulty picker |
| U2 | GameDashboard | 27 KB | Yes — main hub, room navigation, event log |
| U3 | CombatView | 71 KB | Yes — full combat UI, card flips, dice, hybrid toggle, companion suggestions |
| U4 | MerchantView | 82 KB | Yes — buy/upgrade/reforge/enchant |
| U5 | RestView | 9.8 KB | Yes — 4 rest choices |
| U6 | WelcomeBonusView | 36 KB | Yes — 2d6 bonus roll per hero |
| U7 | TierTransitionView | 4 KB | Yes — tier-up screen |
| U8 | RunReport | 22 KB | Yes — victory/defeat summary, MVP, score breakdown |
| U9 | BatchSimulationScreen | 60 KB | Yes — batch config + live progress + results charts |
| U10 | StrategyLabScreen | 62 KB | Yes — axis picker + cross-product results + radar/bar charts |
| U11 | WikiScreen | 62 KB | Yes — gallery/armory/audio/rules/pcg/strategy tabs |
| U12 | RulesReference | 3.6 KB | Yes — quick rules |
| U13 | DebugScreen | 6.5 KB | Yes — state inspector, validation, manual override, rulings |
| U14 | SandboxPanel | 6 KB | Yes (inside dashboard, sandbox mode) — gold/HP override, skip room, force combat result |
| U15 | SaveManagerPanel | 13 KB | Yes (AppShell) — save/load/import/export/delete |
| U16 | SimulationControls | 1.8 KB | Yes (sim mode) — play/pause/step/speed |
| U17 | InteractiveDiceRoller | 30 KB | Yes (combat) |
| U18 | Supporting UI | HeroIcon, PetIcon, ApcText, Tooltip, EffectOverlay, FloatingBubbles, CosmoCursor, CosmicBackground, CombatTransition, DieRollAnimation, DeffyBadge, EntityImage | Yes |

### Cross-Cutting
| # | Component | File | Role |
|---|-----------|------|------|
| C1 | App router | `app/App.tsx` (261) | Screen state machine, lazy loading, keyboard hotkeys, combat transition |
| C2 | AppShell | `layout/AppShell.tsx` (32 KB) | Nav, header, tier/difficulty badges, save panel |
| C3 | Audio | `audio/AudioManager.tsx` (7.9 KB) + `AudioContext` + `useAudio` | Music + SFX with mute/volume persistence |
| C4 | Auto-play hook | `hooks/useAutoPlay.ts` (193) | Drives simulation mode via store actions |
| C5 | RNG | `utils/random.ts` (200) | Seeded mulberry32, serialize/deserialize, forced results, history |
| C6 | Tests | `src/tests/` (14 files, 252 tests) | Engine + AI + save-migration coverage |

### Hidden / Implicit / Background
- **Autosave** fires on every store mutation (`autosave()` in `gameStore.ts`) → localStorage `skybreak_autosave`.
- **Event-sequence counter** (`eventLog.ts`) is a **module-level mutable singleton** reset only by `resetEventSequence()` at run start.
- **ID counter** (`utils/ids.ts`) is also module-level mutable, reset by `resetIdCounter()` at run start.
- **`_defeatedByMonster`** module-level mutable in `batchSimulationEngine.ts` — shared across batch runs, reset per `runSingleGame`.
- **Vyridian phase machine** lives implicitly inside `monsterAbilityEngine.executeMonsterTurn` (HP-threshold transitions).
- **Stalemate detector** duplicated in `combatEngine.checkCombatEnd` (constant `5`) and `batchSimulationEngine.autoPlayCombat` (uses the constant) and `aiController.aiAutoPlayFullCombat` (hardcoded `8`).

---

## 2) Progress Mapping — Component-by-Component

Rubric: 0–20 placeholder · 21–40 partial logic · 41–60 integrated/fragile · 61–80 mostly complete · 81–95 production-ready pending hardening · 96–100 battle-tested + documented.

| Component | Status | % | Notes / Blockers |
|-----------|--------|---|------------------|
| **Game state factory (E1)** | Shipping | 88 | Welcome-bonus weapon pick uses `rollD6 % length` (off-by-one safe but not 2d6-faithful). `updatedAt` never refreshed after init. |
| **Rules / room progression (E2)** | Shipping | 85 | Rooms are hard-coded arrays — no procedural generation, no seed-driven room layout. Nightmare targeting is sophisticated. |
| **Combat engine (E3)** | Integrated | 72 | Huge surface; `roundsWithoutProgress` is maintained in `checkCombatEnd` but the live `gameStore.doHeroAction`/`doEndTurn` paths **do not call `checkCombatEnd`** — only `doResolveRoom` and the batch path do. [INFERENCE: in-game combat can run indefinitely without the stalemate guard firing because the live hero-turn path never invokes `checkCombatEnd`; only batch/ai paths do.] |
| **Hero ability engine (E4)** | Integrated | 78 | 4 classes × 2 specs × 6 roll outcomes + pets + combo chains. 50 dedicated tests. No tests for pet second-pet path edge cases. |
| **Monster ability engine (E5)** | Integrated | 80 | 56 tests. Vyridian 3-phase boss implemented. Summon lifecycle partially tested. |
| **Merchant engine (E6)** | Integrated | 75 | 10 tests. `autoBuy` exists but is not wired to any UI button (only `doAutoBuy` store action; no UI calls it — [INFERENCE: `doAutoBuy` is reachable only via `useAutoPlay` sim path, not via a merchant UI button]). `getSuggestedPurchases` powers companion suggestions. |
| **Progression / scoring (E7)** | Shipping | 82 | Score formula is flat (base 1000 + bonuses). `title` only returns one string regardless of score tier — under-baked. |
| **Deck engine (E8)** | Shipping | 90 | 16 tests, clean. |
| **Dice engine (E9)** | **Stubbed/Orphaned** | 10 | Defined but **imported by nobody** (only self-reference). Dead code. |
| **Scoring engine (E10)** | **Orphaned** | 5 | 1-line re-export; **imported by nobody**. `RunReport` imports `calculateScore` directly from `progressionEngine`. Dead code. |
| **Event log (E11)** | Shipping | 85 | Module-level mutable sequence counter is a hidden global — safe only because runs always start with `resetEventSequence`. |
| **Validation engine (E12)** | Integrated | 65 | 6 tests. Only invoked manually from DebugScreen; **never run automatically** after mutations. Warnings stored in store but never surfaced outside Debug. |
| **AI controller (E13)** | Partial | 45 | `aiPlayHeroTurn` is tested. **`aiAutoPlayFullCombat` and `aiExecuteHeroTurn` are dead code** — no UI or sim path calls them (see §3). |
| **AI advisor (E14)** | Shipping | 80 | 9 tests; wired into Combat/Merchant/Rest/Dashboard for companion mode. |
| **Batch simulation (E15)** | Shipping | 84 | `runSingleGame` + `runBatch` power BatchSimulationScreen and StrategyLab. Stuck-room and timeout guards present. |
| **Strategy lab (E16)** | Shipping | 82 | Cross-product generation, variance/std-dev, class performance. No persistence of results across sessions. |
| **Save / load (E17)** | Shipping | 80 | 7 migration tests. No save-size cap; large logs (500 events) bloat localStorage. No quota-error recovery. |
| **gameStore (S1)** | Integrated | 70 | Central dispatcher. **`withRng` is applied inconsistently** — merchant actions (lines 310–388) do NOT persist `rng` back to state, while combat actions do. [INFERENCE: after a merchant action the in-memory `state.rng` step is stale relative to the actual `RngEngine` step — harmless because the live `rng` object is the source of truth, but breaks save/load determinism for merchant-phase saves.] |
| **hybridStore (S4)** | Partial | 55 | Wired into CombatView toggle + auto-play effect. `resetAIControl` is never called when a run ends/resets — stale toggle state persists across runs. |
| **useAutoPlay (C4)** | Integrated | 60 | Re-implements AI decision logic inline (duplication — §3). Speed map missing key `2` is present but `SPEED_DELAYS` has no entry for value `1`? (it does: `1:1500`). OK. |
| **HomeScreen (U1)** | Shipping | 80 | Party builder, mode/difficulty picker, autosave resume. 59 KB single file — hotspot. |
| **CombatView (U3)** | Integrated | 70 | 71 KB — largest screen. Hybrid + companion + sandbox branches all in one file. Hotspot. |
| **MerchantView (U4)** | Integrated | 70 | 82 KB — second largest. `autoBuy` button missing. |
| **WikiScreen (U11)** | Shipping | 78 | 6 tabs, markdown rendering via `marked`, asset gallery via `import.meta.glob`. |
| **DebugScreen (U13)** | Shipping | 70 | State JSON truncated at 8 KB. Validation manual-only. |
| **Audio (C3)** | Integrated | 70 | Mute/volume persisted. No audio asset preloading; first SFX may stutter. |
| **App router (C1)** | Integrated | 72 | `effectiveScreen` derivation is duplicated logic between `renderScreen` and `effectiveScreen` — drift risk. |

**User reachability:** Every screen in §1 is reachable from `HomeScreen` → `onNavigate` or via phase-driven rendering in `App.renderScreen`. No orphaned routes.

---

## 3) Behavioral & Logic Diagnostics — Behavior Gap Report

### B1. AI combat loop is implemented THREE times (CRITICAL duplication)
- **`aiController.aiAutoPlayFullCombat`** (lines 198–300) — full combat loop. **Called by: nobody** (only self/tests). Dead.
- **`batchSimulationEngine.autoPlayCombat`** (lines 107–303) — full combat loop, used by batch + strategy lab.
- **`useAutoPlay.step`** (lines 47–168) — single-step loop, used by in-game simulation mode.
- **`CombatView.executeAIHeroTurn`** (lines 284–296) — fourth, separate inline AI for hybrid mode.

**Today:** Each copy has its own strategy interpretation and its own stalemate threshold. **Should:** One canonical `autoPlayCombat(state, rng, strategy)` consumed by batch, strategy lab, sim mode, and hybrid. **Impact:** Batch results and in-game sim mode can diverge for the same seed/strategy — undermining the entire purpose of the strategy lab.

### B2. Stalemate threshold inconsistency (FACT bug)
- `combatEngine.ts:1065` → `STALEMATE_ROUNDS_WITHOUT_PROGRESS = 5`
- `batchSimulationEngine.ts:274` → uses the constant (5) ✓
- `aiController.ts:271` → hardcoded `>= 8` ✗

**Today:** Dead `aiAutoPlayFullCombat` retreats after 8 rounds; live paths after 5. **Should:** Single constant. Low real-world impact (dead code) but signals discipline gap.

### B3. Live combat never calls `checkCombatEnd` (FACT)
`gameStore.doHeroAction` and `doEndTurn` advance turns and swap to monster side but **never invoke `checkCombatEnd`**. Combat end is only detected:
- in `doResolveRoom` (after user clicks "resolve"),
- in `batchSimulationEngine.autoPlayCombat`,
- in `aiController.aiAutoPlayFullCombat` (dead).

**Today:** In `playable`/`companion`/`hybrid`/`sandbox` modes, the player must manually trigger resolution; the engine does not auto-detect victory/defeat mid-round. **Should:** `checkCombatEnd` should run after every damage application and set `combatResult` so the UI can transition. **Impact:** A monster that dies mid-round leaves the player clicking around with no auto-advance; a party wipe mid-round is not detected until manual resolve. Brittle UX.

### B4. `withRng` inconsistency in merchant actions (FACT)
`gameStore` merchant actions (`doBuyItem`, `doBuyHealing`, … `doLeaveMerchant`) call `set({ state: newState })` **without** `withRng`. Combat actions do. **Today:** `state.rng.step` in localStorage saves during merchant phase lags the real engine step. **Should:** Uniform `withRng` wrapping. **Impact:** Save/load during merchant phase is non-deterministic on reload.

### B5. `showAiReasoning` config is write-only (FACT)
Set in `gameState.createDefaultConfig` and `applyModeDefaults` (companion → true). **Read by: nobody.** Companion mode shows suggestion banners unconditionally via `isCompanionMode` checks in CombatView. **Today:** The flag is dead config. **Should:** Either drive suggestion visibility from `showAiReasoning` or delete it.

### B6. `stopConditions` are never evaluated (FACT)
`SimulationConfig.stopConditions` (onHeroDeath, onMerchant, onEliteRoom, onMiniBoss, onFinalBoss, onRuleAmbiguity) defined in types and defaults but **no code path reads them**. **Today:** Simulation mode never pauses on the configured stop points. **Should:** `useAutoPlay.step` should consult `stopConditions` before advancing. **Impact:** The "stop on final boss / merchant / elite" UX promised by the config is silently absent.

### B7. `autoBuy` unreachable from UI (FACT)
`merchantEngine.autoBuy` + `gameStore.doAutoBuy` exist. **No MerchantView button calls `doAutoBuy`.** Only `useAutoPlay` (sim mode) calls it. **Today:** A playable-mode player cannot one-click the AI purchase recommendation. **Should:** Surface as a button.

### B8. Module-level mutable singletons (FACT)
`eventLog.eventSequence`, `utils/ids` counter, `batchSimulationEngine._defeatedByMonster` are module-level mutable state reset only at explicit run start. **Today:** Safe because every run start calls the resetters. **Should:** Move into `GameState` or a per-run context to eliminate the latent bug surface. **Impact:** A future code path that starts a run without calling `resetIdCounter`/`resetEventSequence` produces colliding IDs and corrupted event ordering.

### B9. `hybridStore` not reset on run end (FACT)
`resetAIControl` exists but is never called from `doResetGame` or `App` run-end handlers. **Today:** AI-toggle state from a previous hybrid run bleeds into the next. **Should:** Call `resetAIControl()` in `doResetGame`.

### B10. Score `title` is single-valued (FACT)
`progressionEngine.calculateScore` returns `title: finalScore > 0 ? "Ascendant Champions" : undefined`. **Today:** Every winning run gets the same title regardless of score. **Should:** Tiered titles (e.g. <5k "Aspirant", <15k "Ascendant", <30k "Astral Conductor", ≥30k "Vyridian's Equal"). **Impact:** Run-report replayability loss.

### B11. `effectiveScreen` vs `renderScreen` duplicated derivation (FACT)
`App.tsx` computes `effectiveScreen` (lines 209–223) and separately `renderScreen` (lines 165–205) using near-identical phase branching. **Today:** Two sources of truth for "what screen am I on," prone to drift. **Should:** Single function returning both the component and the screen key.

### B12. Rooms are static arrays, not seed-driven (FACT)
`data/rooms.ts` ships three hard-coded arrays. `RngEngine` is never used to vary room layout. **Today:** Every run on a given tier sees the same room sequence; only monster draws and split choices vary. **Should:** Seed-driven room generation (or explicit design decision documented). **Impact:** Reduces strategic variety run-over-run.

---

## 4) Architecture Overview — As-Built Map

```
┌─────────────────────────────────────────────────────────────────┐
│ UI Layer (React + Tailwind)                                      │
│  App.tsx (router) → AppShell → 14 lazy screens + 18 ui widgets   │
│  State hooks: useAutoPlay, useIsMobile, useAudio                  │
└───────────────▲───────────────────────────────▲──────────────────┘
                │ selectors                       │ actions
┌───────────────┴─────────────────┐  ┌───────────┴──────────────┐
│ Zustand Stores                   │  │ Audio Provider (context)  │
│  useGameStore (S1) — live game   │  │  useHybridStore (S4)      │
│  useBatchStore (S2)              │  └───────────────────────────┘
│  useStrategyLabStore (S3)        │
└───────────────▲─────────────────┘
                │ calls
┌───────────────┴─────────────────────────────────────────────────┐
│ Engine Layer (pure functions, GameState in → GameState out)      │
│  gameState · rulesEngine · combatEngine · heroAbilityEngine      │
│  monsterAbilityEngine · merchantEngine · progressionEngine       │
│  deckEngine · eventLog · validationEngine · saveLoad             │
│  aiController · aiAdvisor · batchSimulationEngine · strategyLab  │
│  [diceEngine · scoringEngine — ORPHANED]                         │
└───────────────▲─────────────────────────────────────────────────┘
                │
┌───────────────┴─────────────────────────────────────────────────┐
│ Data Layer (static tables)                                       │
│  classes · monsters · weapons · items · enchantments · tokens    │
│  rooms · rulesIndex · strategyGuide · ruleAmbiguities · taunts   │
└───────────────▲─────────────────────────────────────────────────┘
                │
┌───────────────┴─────────────────────────────────────────────────┐
│ Utils / Types                                                    │
│  random (RngEngine) · ids · format · nameResolver · tagMatchers  │
│  logFormatter · formatAbilityText · math · assertions · cn       │
│  types/* (12 type modules)                                       │
└──────────────────────────────────────────────────────────────────┘
```

**Architectural drift / fragmentation:**
1. **Three AI combat implementations** (§3 B1) — the single biggest fragmentation.
2. **Two "what screen am I on" derivations** in `App.tsx` (B11).
3. **Two scoring entry points** (`progressionEngine.calculateScore` vs the orphaned `scoringEngine.ts` re-export).
4. **Two dice surfaces** (`RngEngine.rollD6` used everywhere vs the orphaned `DiceEngine` class wrapper).
5. **Mixed persistence discipline**: `withRng` applied in combat actions but not merchant actions (B4).

**Hotspots (files with too many responsibilities):**
- `CombatView.tsx` (71 KB) — combat rendering + card-flip animation + dice + hybrid AI + companion suggestions + sandbox controls.
- `MerchantView.tsx` (82 KB) — buy/upgrade/reforge/repair/enchant + UI.
- `heroAbilityEngine.ts` (~1,300 LOC) — all 4 classes' entire move sets in one file.
- `monsterAbilityEngine.ts` (~1,400 LOC) — all monster mechanics + boss phases + summons in one file.
- `HomeScreen.tsx` (59 KB) — party builder + mode picker + resume + flavor.

---

## 5) Risk Zones & Missing Pieces — Risk Register

| ID | Risk | Severity | Evidence |
|----|------|----------|----------|
| R1 | Live combat never auto-detects end (B3) | **High** | `gameStore.doHeroAction`/`doEndTurn` lack `checkCombatEnd` |
| R2 | AI logic triplicated (B1) | **High** | `aiController` (dead) + `batchSimulationEngine` + `useAutoPlay` + `CombatView` |
| R3 | `stopConditions` silently ignored (B6) | **High** | grep: no readers outside types/defaults |
| R4 | `withRng` inconsistency breaks merchant-phase save determinism (B4) | **Med** | `gameStore.ts` lines 310–388 |
| R5 | Module-level mutable singletons (B8) | **Med** | `eventLog.ts:5`, `ids.ts`, `batchSimulationEngine.ts:47` |
| R6 | `hybridStore` not reset between runs (B9) | **Med** | `doResetGame` does not call `resetAIControl` |
| R7 | Validation never auto-runs (E12) | **Med** | only DebugScreen invokes `validateState` |
| R8 | No save quota handling (E17) | **Med** | `saveLoad.ts` catches errors but no size guard; 500-event logs × many saves |
| R9 | No tests for UI / integration | **Med** | 14 test files all under `src/tests/`, all engine-unit; no RTL/component tests despite `@testing-library/react` installed |
| R10 | No observability / error reporting | **Low** | `ErrorBoundary` exists but swallows to a static fallback; no telemetry |
| R11 | No git repository | **Med** | `git status` → fatal; no version history, no rollback |
| R12 | `autoBuy` unreachable in playable mode (B7) | **Low** | store action exists, no UI |
| R13 | Dead code (`diceEngine`, `scoringEngine`, `aiAutoPlayFullCombat`) | **Low** | grep confirms zero external imports |
| R14 | Static room layouts (B12) | **Low** | `rooms.ts` hard-coded |
| R15 | Single score title (B10) | **Low** | `progressionEngine.ts:155` |
| R16 | No security surface (client-only, localStorage) | **Low** | no auth, no network — N/A but noted |
| R17 | `marked` markdown rendering of rules MD files in WikiScreen | **Low** | `marked` v18 — verify XSS posture if rules MD ever sourced from user input (today: bundled files, safe) |

**Underdeveloped:** `stopConditions`, `showAiReasoning`, `autoBuy` UI, score titles, validation auto-run, observability.
**Over-engineered:** `DiceEngine` wrapper (unused), `scoringEngine` re-export (unused), `aiAutoPlayFullCombat` (unused duplicate).
**Structurally risky:** triplicated AI, module-level mutable singletons, `withRng` inconsistency, 71–82 KB screen hotspots.

---

## 6) Next Moves Blueprint — Prioritized Roadmap

### P0 — Stabilize (stop the bleeding)
| # | Action | Why | Impact | DoD |
|---|--------|-----|--------|-----|
| P0.1 | Call `checkCombatEnd` after every damage application in `doHeroAction`/`doEndTurn`/`doMonsterTurn`; set `combatResult` and let UI transition | R1 — combat currently doesn't auto-end in playable modes | High UX stability | Test: monster killed mid-round → UI auto-advances without manual resolve |
| P0.2 | Initialize git repo, commit current green state | R11 — no version control | High safety | `.git` exists, initial commit passes `tsc` + `vitest` |
| P0.3 | Reset `hybridStore` in `doResetGame` | R6 — stale AI toggle bleed | Med UX | Test: start hybrid run, toggle AI, end run, start new run → toggles cleared |
| P0.4 | Apply `withRng` uniformly in `gameStore` (wrap merchant actions) | R4 — save determinism | Med correctness | Test: save mid-merchant, reload, advance → same RNG sequence as no-save |

### P1 — Complete (finish partially built tools)
| # | Action | Why | Impact | DoD |
|---|--------|-----|--------|-----|
| P1.1 | **Unify AI combat loop**: delete `aiAutoPlayFullCombat`/`aiExecuteHeroTurn`; make `batchSimulationEngine.autoPlayCombat` the canonical loop; have `useAutoPlay` and `CombatView.executeAIHeroTurn` call a shared `decideHeroAction(state, rng, heroId, strategy)` | B1/R2 — triplication causes batch-vs-sim divergence | High correctness + maintainability | Single `decideHeroAction`; batch and sim produce identical results for same seed/strategy; `aiController.test.ts` migrated |
| P1.2 | **Implement `stopConditions`** in `useAutoPlay.step` and batch engine | R3/B6 — promised UX absent | High feature completeness | Test: `onFinalBoss:true` → sim pauses at final boss; `onMerchant:true` → pauses at merchant |
| P1.3 | **Surface `autoBuy` in MerchantView** as "AI Auto-Buy" button | B7/R12 | Med UX | Button visible in playable/companion; calls `doAutoBuy`; test confirms gold spent |
| P1.4 | **Auto-run validation** after every store mutation; surface non-error warnings as toasts | R7 | Med correctness | Test: forcing HP>max via sandbox → warning toast appears without opening Debug |
| P1.5 | **Delete dead code**: `diceEngine.ts`, `scoringEngine.ts` (or wire them) | R13 | Low maintainability | grep shows zero references; `tsc` clean |
| P1.6 | **Tiered score titles** in `calculateScore` | B10/R15 | Low UX | 4+ title tiers; RunReport renders the earned title |

### P2 — Improve (refactors, DX, performance)
| # | Action | Why | Impact | DoD |
|---|--------|-----|--------|-----|
| P2.1 | Split `CombatView.tsx` into `CombatView` + `CombatHeroCard` + `CombatMonsterPanel` + `CombatLog` + `CombatCardFlip` | 71 KB hotspot | Med maintainability | Each subfile <20 KB; behavior unchanged; screenshot parity |
| P2.2 | Split `MerchantView.tsx` similarly | 82 KB hotspot | Med maintainability | Same DoD pattern |
| P2.3 | Split `heroAbilityEngine`/`monsterAbilityEngine` per-class/per-monster-type | 1,300–1,400 LOC hotspots | Med maintainability | One file per class; tests still green |
| P2.4 | Move module-level mutable singletons (`eventSequence`, id counter, `_defeatedByMonster`) into `GameState`/per-run context | R5/B8 | Med correctness | No module-level `let`; test that two concurrent runs (rare) don't collide |
| P2.5 | Add component/integration tests with `@testing-library/react` (already installed) | R9 | Med safety | At least one test per screen rendering without crash |
| P2.6 | Add save-size guard + quota-error recovery in `saveLoad` | R8 | Low safety | Test: fill localStorage → save fails gracefully with user message |
| P2.7 | Unify `effectiveScreen`/`renderScreen` into one derivation | B11 | Low correctness | Single function returns `{ screen, element }` |
| P2.8 | Seed-driven room layout generation | B12/R14 | Med replayability | Same seed → same rooms; different seed → different layout; tests cover determinism |

### P3 — Expand (new features only after foundations)
| # | Action | Why | Impact | DoD |
|---|--------|-----|--------|-----|
| P3.1 | Persist batch + strategy-lab results to localStorage / IndexedDB | Currently lost on refresh | Med UX | Reload restores last result |
| P3.2 | Run-history ledger (last N runs with seed, score, party) | Replayability | Med UX | HomeScreen shows recent runs |
| P3.3 | Companion-mode "explain" mode driven by `showAiReasoning` | Dead config → feature | Low UX | Toggle reveals reasoning text per suggestion |
| P3.4 | Procedural monster variants / ascension modifiers | Replayability | Med UX | New modifier pool; tests for balance |

---

## 7) Final Deliverables

### State Grade: **B−**

| Axis | Score | Justification |
|------|-------|---------------|
| **Completeness** | B | All 5 modes reachable; batch + strategy lab + wiki + save system shipping. `stopConditions`, `autoBuy` UI, score titles incomplete. |
| **Correctness** | C+ | 252 unit tests green and `tsc` clean, but live combat doesn't auto-end (R1), AI triplicated (R2), `withRng` inconsistency (R4). |
| **Coherence** | C+ | Clean layered architecture (UI → stores → engine → data), but three AI implementations, two screen derivations, and orphaned `diceEngine`/`scoringEngine` show mid-stream drift. |
| **Observability** | D | No telemetry, no auto-validation, no error reporting beyond a static ErrorBoundary. DebugScreen is manual-only. |
| **Maintainability** | C+ | Strong typing + tests, but 71–82 KB screen hotspots, 1,400-LOC engine files, no git, no component tests. |

**Overall: B−** — A genuinely ambitious, mostly-working single-player card-game simulator with a real engine, real tests, and real tooling (batch + strategy lab are standout features). Pulled down by the live-combat auto-end gap, AI triplication, and absent observability/git. None of the issues are fatal; all are fixable in the P0/P1 track.

---

## 8) Autonomy Directive — Chosen High-Leverage Target

### Target: **Unify the AI combat loop (P1.1)** — the single highest-leverage partially-finished subsystem.

**Why this one:** The strategy lab's entire value proposition is "find the best strategy." That claim is **false today** because batch and in-game sim use different AI implementations — the same strategy label can produce different outcomes. Fixing this one subsystem (a) kills the worst duplication, (b) makes the strategy lab trustworthy, (c) shrinks `aiController`/`useAutoPlay`/`CombatView`, (d) removes the stalemate-constant bug (B2) as a side effect.

### Shortest path to end-to-end excellence
1. Extract a single `decideHeroAction(state, rng, heroId, strategy): AICombatDecision` in `aiController.ts` (the existing `aiPlayHeroTurn` is already 90% there — promote it to the canonical decision function and make `useAutoPlay`/`batchSimulationEngine`/`CombatView` import it).
2. Extract a single `applyHeroTurn(state, rng, heroId, strategy): GameState` that calls `decideHeroAction` then `executeHeroAction`/`useItem`/skip.
3. Make `batchSimulationEngine.autoPlayCombat` call `applyHeroTurn` instead of its inline switch.
4. Make `useAutoPlay.step` call `decideHeroAction` (it already re-implements the same thresholds).
5. Make `CombatView.executeAIHeroTurn` call `decideHeroAction` with `"balanced"`.
6. Delete `aiAutoPlayFullCombat` and `aiExecuteHeroTurn` (dead).
7. Replace the hardcoded `8` in the (now-deleted) `aiController` stalemate line — gone with the dead code.
8. Add a parity test: `runSingleGame` with seed S and strategy X produces a `RunResult` whose `combatLog` is byte-identical to driving `useAutoPlay` step-by-step with the same seed/strategy.

### Exact next 5–10 commits
1. `refactor(ai): promote aiPlayHeroTurn to canonical decideHeroAction` — rename, add `strategy` param validation, export from a new `engine/aiDecisions.ts`.
2. `refactor(batch): autoPlayCombat consumes decideHeroAction` — delete inline switch in `batchSimulationEngine.ts:152-224`.
3. `refactor(useAutoPlay): step() consumes decideHeroAction` — delete inline HP-ratio logic in `useAutoPlay.ts:99-109`.
4. `refactor(combat): CombatView.executeAIHeroTurn consumes decideHeroAction` — delete inline logic in `CombatView.tsx:284-296`.
5. `refactor(ai): delete aiAutoPlayFullCombat + aiExecuteHeroTurn` — remove dead code; fix stalemate-constant bug B2 by deletion.
6. `test(ai): add batch-vs-sim parity test` — same seed/strategy → identical `combatLog` hashes.
7. `feat(combat): auto-detect combat end in live store actions (P0.1)` — call `checkCombatEnd` in `doHeroAction`/`doEndTurn`/`doMonsterTurn`; this becomes safe to do cleanly once the AI is unified.
8. `test(combat): mid-round victory/defeat auto-advance` — RTL test that killing the monster mid-round transitions the screen.
9. `chore: init git repo + commit green baseline (P0.2)` — safety net for the above.
10. `chore: remove orphaned diceEngine + scoringEngine (P1.5)` — cleanup pass.

### Tests / metrics that prove it's truly fixed
- **Parity test:** `hash(runSingleGame(seed, strategy).combatLog) === hash(simulateViaUseAutoPlay(seed, strategy).combatLog)` — must be equal for 5 seeds × 5 strategies.
- **Stalemate-constant test:** grep asserts no literal `>= 8` remains in AI paths.
- **Live combat auto-end test:** RTL test renders `CombatView`, forces monster HP to 0 via sandbox, asserts `RunReport` or dashboard renders without a manual "resolve" click.
- **LOC reduction:** `aiController.ts` + `batchSimulationEngine.autoPlayCombat` + `useAutoPlay.step` + `CombatView.executeAIHeroTurn` total LOC drops by ≥25%.
- **All 252 existing tests remain green** + new parity/auto-end tests pass.

---

*End of audit.*
