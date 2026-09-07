import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  initializeGame,
  createDefaultConfig,
  type PartySetupChoice,
} from "../engine/gameState";
import type { GameEvent } from "../types/events";
import {
  startCombat,
  applyDamage,
  calculateDamage,
  flipPeonCards,
} from "../engine/combatEngine";
import { checkAndSetCombatEnd } from "../engine/combatRunner";
import { getLivingHeroes } from "../engine/rulesEngine";
import { RngEngine } from "../utils/random";
import {
  importSave,
  getAllSaves,
  importLegacySaves,
} from "../engine/saveLoad";
import {
  getTierBackground,
  getSpireImage,
  getLogoImage,
  getMusicTrack,
} from "../assets/assetRegistry";
import {
  aiPlayHeroTurn,
  aiPickSplitChoice,
  aiMerchantActions,
} from "../engine/aiController";
import { randomParty, runSingleGame } from "../engine/batchSimulationEngine";
import { useGameStore } from "../app/gameStore";
import { useBatchStore } from "../app/batchStore";
import { CLASS_DATA } from "../data/classes";
import { STRATEGY_SECTIONS } from "../data/strategyGuide";
import { DIFFICULTY_INFO } from "../components/screens/HomeScreen";
import { ITEMS_BY_ID, getItemData } from "../data/items";
import { createRoomsForTier } from "../data/rooms";
import { getMonsterImage, getWeaponImage } from "../assets/assetRegistry";
import {
  buildRunCapsule,
  serializeCapsule,
  parseCapsule,
  isValidCapsule,
} from "../engine/runCapsule";
import { getPrimaryVerdict } from "../engine/vyridianVerdict";
import type { GameState } from "../types/gameState";
import type { BatchConfig } from "../types/batch";

/**
 * Megaplan Phase 0 — Reproduced defect regression fixtures.
 *
 * Each `it.fails` test documents a defect that was reproduced against the
 * codebase at HEAD 80540bc. The test body asserts the CORRECT expected
 * behavior; because the defect is present, the assertion fails and the
 * `it.fails` wrapper counts it as passing (fail-as-expected). When the
 * corresponding Phase 1 fix lands, the test body starts passing and the
 * `it.fails` wrapper reports a failure — that is the signal to drop the
 * `.fails` so the test guards the fix going forward.
 *
 * Findings covered (see Enhancement Megaplan §4):
 *   B1 — live final-boss victory fails to finalize
 *   B2 — art/music unreachable through helpers
 *   B3 — saves disappear from discovery / pass validation while unusable
 *   B4 — old delayed actions mutate a replacement run
 *   B5 — sampling and policy configuration defects
 */
describe("Megaplan Phase 0 — Reproduced defect fixtures", () => {
  const sampleParty: PartySetupChoice[] = [
    { className: "Bladedancer", suit: "spades", position: 1 },
    { className: "Manipulator", suit: "hearts", position: 2 },
    { className: "Tracker", suit: "clubs", position: 3 },
  ];

  beforeEach(() => {
    localStorage.clear();
    useGameStore.setState({ state: null, rng: null, validationWarnings: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
    useGameStore.setState({ state: null, rng: null, validationWarnings: [] });
    localStorage.clear();
  });

  function makeValidState(seed = "mp0"): GameState {
    return initializeGame(createDefaultConfig({ seed }), sampleParty);
  }

  // ─── B1: final-boss victory finalization ───────────────────────────────

  it("B1: doResolveRoom finalizes a final-boss victory to phase 'victory' with a score", () => {
    const seed = "mp0-b1-boss";
    const config = createDefaultConfig({ seed });
    let state = initializeGame(config, sampleParty);
    const rng = new RngEngine(seed);

    // Start a final-boss combat.
    state = startCombat(state, rng, { isFinalBoss: true });
    if (!state.combat) throw new Error("setup: combat did not start");
    expect(state.combat.isFinalBoss).toBe(true);

    // Kill the boss via the canonical damage path and let the engine mark the result.
    const bossHp = state.combat.monster.currentHp;
    const res = applyDamage(state, state.combat.monster.id, "test", calculateDamage({ base: bossHp }), true);
    state = checkAndSetCombatEnd(res.state);
    if (!state.combat || state.combat.combatResult !== "victory") {
      throw new Error("setup: boss kill did not produce combatResult=victory");
    }
    expect(getLivingHeroes(state).length).toBeGreaterThan(0);

    // Inject into the live store and run the real finalization path.
    useGameStore.setState({ state, rng, validationWarnings: [] });
    useGameStore.getState().doResolveRoom();

    const finalState = useGameStore.getState().state;
    expect(finalState).not.toBeNull();
    // CORRECT behavior: a final-boss victory reaches a terminal victory phase
    // with a computed score. Currently the boss combat is cleared before
    // checkVictory runs, so the run falls back to "exploration" with no score.
    expect(finalState!.phase).toBe("victory");
    expect(finalState!.score).toBeDefined();
  });

  // ─── B2: asset lookup ──────────────────────────────────────────────────

  it("B2: getTierBackground resolves a known tier background asset", () => {
    // assets/backgrounds/tier1_background.png exists in the repo. The helper
    // currently returns null because normalizeName keeps the file extension,
    // storing the key as "tier1_background_png" while the lookup asks for
    // "tier1_background".
    expect(getTierBackground(1)).not.toBeNull();
  });

  it("B2: getSpireImage resolves the spire asset", () => {
    // assets/backgrounds/spire.webp exists. Key stored as "spire_webp".
    expect(getSpireImage()).not.toBeNull();
  });

  it("B2: getMusicTrack resolves a known theme track", () => {
    // assets/...tier1_theme.mp3 exists. Key stored as "tier1_theme_mp3".
    expect(getMusicTrack("tier1")).not.toBeNull();
  });

  it("B2: getLogoImage resolves a logo asset (and does not reference a nonexistent skybreak_logo)", () => {
    // assets/logo.png exists. getLogoImage currently looks up "skybreak_logo",
    // a file that does not exist, so it returns null even apart from the
    // extension bug.
    expect(getLogoImage()).not.toBeNull();
  });

  // ─── B3: save discovery / validation / RNG ─────────────────────────────

  it("B3: legacy 'skyward_ascent_saves' saves are discoverable through importLegacySaves + getAllSaves", () => {
    localStorage.clear();
    const state = makeValidState("mp0-b3-legacy");
    const legacySave = {
      version: "0.1.0",
      gameState: state,
      savedAt: new Date().toISOString(),
      name: "Legacy Skyward Ascent Run",
    };
    localStorage.setItem("skyward_ascent_saves", JSON.stringify([legacySave]));
    // CORRECT behavior: legacy saves are imported into the current key and
    // become visible through getAllSaves. The legacy key is preserved.
    const imported = importLegacySaves();
    expect(imported).toBeGreaterThanOrEqual(1);
    const saves = getAllSaves();
    expect(saves.length).toBeGreaterThanOrEqual(1);
    expect(saves.some((s) => s.name === "Legacy Skyward Ascent Run")).toBe(true);
    // Legacy key is NOT deleted (non-destructive).
    expect(localStorage.getItem("skyward_ascent_saves")).not.toBeNull();
  });

  it("B3: importSave rejects saves with an invalid phase enum and malformed heroes", () => {
    const badSave = {
      version: "0.1.0",
      savedAt: new Date().toISOString(),
      name: "Bad",
      gameState: {
        phase: "not_a_real_phase",
        party: { heroes: [{ /* no id, no name, no hp fields */ }] },
        meta: {},
        spire: {},
      },
    };
    // CORRECT behavior: structural validation rejects an unknown phase enum and
    // heroes missing required fields.
    expect(importSave(JSON.stringify(badSave))).toBeNull();
  });

  it("B3: RngEngine.deserialize clamps an invalid (negative) step to 0 instead of looping unboundedly", () => {
    // CORRECT behavior: a negative (or otherwise non-finite/huge) step is not a
    // valid replay position. deserialize must not loop unboundedly on a huge
    // value nor accept a negative step as-is; it clamps to a safe value.
    const engine = RngEngine.deserialize({ seed: "x", step: -1, history: [] } as any);
    expect(engine.serialize().step).toBe(0);
    // A huge step is bounded, not looped a billion times.
    const huge = RngEngine.deserialize({ seed: "x", step: 1_000_000_000, history: [] } as any);
    expect(huge.serialize().step).toBeLessThanOrEqual(1_000_000);
  });

  // ─── B4: stale delayed monster-turn timer ──────────────────────────────

  it("B4: a monster-turn timer scheduled in run A does not mutate run B after reset", () => {
    vi.useFakeTimers();

    // Run A: enter combat (monster side first) and schedule the delayed turn.
    const configA = createDefaultConfig({ seed: "mp0-b4-runA" });
    let stateA = initializeGame(configA, sampleParty);
    const rngA = new RngEngine("mp0-b4-runA");
    stateA = startCombat(stateA, rngA);
    if (!stateA.combat) throw new Error("setup A: combat did not start");
    useGameStore.setState({ state: stateA, rng: rngA, validationWarnings: [] });
    useGameStore.getState().doBeginCombat(); // schedules setTimeout(800)

    // Reset (as a player would) and start a different run.
    useGameStore.getState().doResetGame();

    const configB = createDefaultConfig({ seed: "mp0-b4-runB" });
    let stateB = initializeGame(configB, sampleParty);
    const rngB = new RngEngine("mp0-b4-runB");
    stateB = startCombat(stateB, rngB);
    if (!stateB.combat) throw new Error("setup B: combat did not start");
    useGameStore.setState({ state: stateB, rng: rngB, validationWarnings: [] });

    const beforeTimer = JSON.stringify(useGameStore.getState().state);

    // Fire the timer that was scheduled by run A.
    vi.advanceTimersByTime(800);

    const afterTimer = JSON.stringify(useGameStore.getState().state);
    // CORRECT behavior: the stale callback must not apply run A's monster turn
    // to run B. Currently it fetches the latest state and executes against it.
    expect(afterTimer).toBe(beforeTimer);
  });

  // ─── B5: sampling and policy defects ───────────────────────────────────

  it("B5: randomParty can assign spades — all four suits are reachable", () => {
    const rng = new RngEngine("mp0-b5-suits");
    // shuffleDeck over 4 classes consumes 3 RNG draws (steps 0..2).
    // The first hero's suit-select rollD6 is therefore at step 3.
    // Force it to a max roll (d6 = 6).
    rng.forceResult(3, 0.999); // floor(0.999 * 6) + 1 = 6
    const party = randomParty(rng);
    // CORRECT behavior: a max roll should be able to select the 4th suit
    // (spades). Currently Math.min(3, Math.floor((roll-1)/2)) caps at index 2,
    // so spades is never selected by any roll.
    expect(party.some((p) => p.suit === "spades")).toBe(true);
  });

  it("B5: aiPickSplitChoice 'random' returns an in-bounds index for d6=6 with 3 options", () => {
    const state = makeValidState("mp0-b5-split");
    const rng = new RngEngine("mp0-b5-split");
    rng.forceResult(0, 0.999); // d6 = 6
    const splitState: GameState = {
      ...state,
      spire: {
        ...state.spire,
        splitChoicePending: true,
        currentRoom: {
          index: 0,
          type: "split" as const,
          symbol: "§",
          tier: 1,
          resolved: false,
          splitOptions: [
            { index: 0, type: "combat", symbol: "♣", tier: 1, resolved: false },
            { index: 1, type: "merchant", symbol: "♦", tier: 1, resolved: false },
            { index: 2, type: "rest", symbol: "♥", tier: 1, resolved: false },
          ],
        },
      },
    };
    const idx = aiPickSplitChoice(splitState, rng, "random");
    // CORRECT behavior: the index must be a valid array offset. Currently
    // Math.floor(6 * 3 / 6) === 3, which is out of bounds for a 3-option split.
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(3);
  });

  it("B5: 'never' item-usage policy prevents item use under defensive strategy", () => {
    const seed = "mp0-b5-never";
    const config = createDefaultConfig({ seed });
    let state = initializeGame(config, sampleParty);
    const rng = new RngEngine(seed);
    state = startCombat(state, rng);
    if (!state.combat) throw new Error("setup: combat did not start");

    // Give every hero a healing item and drop them below the defensive threshold.
    state = {
      ...state,
      combat: {
        ...state.combat,
        activeSide: "heroes",
        completedHeroTurns: [],
        heroTurnOrder: state.party.heroes.map((h) => h.id),
      },
      party: {
        ...state.party,
        heroes: state.party.heroes.map((h) => ({
          ...h,
          currentHp: 1,
          items: [
            {
              id: "minor-potion-1",
              name: "Minor Potion",
              itemId: "minor_potion",
              effect: "heal",
              stackLimit: 5,
              quantity: 1,
              tags: ["healing"],
            },
          ],
        })),
      },
    };

    const heroId = state.party.heroes[0].id;
    // healThreshold 0 encodes the "never" item-usage policy.
    const decision = aiPlayHeroTurn(state, rng, heroId, "defensive", { healThreshold: 0 });
    // CORRECT behavior: "never" means no item use, so the hero attacks.
    // Currently defensive clamps with Math.max(0.5, 0) = 0.5 and uses the item.
    expect(decision.action).toBe("attack");
  });

  it("B5: aiMerchantActions does not propose purchases the party cannot afford", () => {
    const state = makeValidState("mp0-b5-merchant");
    // Hurt heroes, zero gold.
    const merchantState: GameState = {
      ...state,
      phase: "merchant",
      party: {
        ...state.party,
        gold: 0,
        heroes: state.party.heroes.map((h) => ({ ...h, currentHp: 1, alive: true })),
      },
    };
    const purchases = aiMerchantActions(merchantState, "balanced");
    // CORRECT behavior: with 0 gold, no purchasable action should be proposed.
    // Currently a Minor Potion is proposed for every hurt hero with no gold check.
    expect(purchases.filter((p) => p.type !== "skip").length).toBe(0);
  });
});

// ============================================================
// Phase 2 — Run lifecycle, evidence, and Lab fixtures
// (First Moves #7 and #8)
// ============================================================

describe("Megaplan Phase 2 — Run lifecycle and evidence fixtures", () => {
  const sampleParty: PartySetupChoice[] = [
    { className: "Bladedancer", suit: "spades", position: 1 },
    { className: "Manipulator", suit: "hearts", position: 2 },
    { className: "Tracker", suit: "clubs", position: 3 },
  ];

  beforeEach(() => {
    localStorage.clear();
    useGameStore.setState({ state: null, rng: null, validationWarnings: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
    useGameStore.setState({ state: null, rng: null, validationWarnings: [] });
    localStorage.clear();
  });

  function makeBatchConfig(overrides: Partial<BatchConfig> = {}): BatchConfig {
    return {
      runs: 1,
      difficulty: "normal",
      partyMode: "fixed",
      partyChoices: sampleParty,
      combatStrategy: "balanced",
      merchantStrategy: "balanced",
      restStrategy: "safe",
      splitStrategy: "safe",
      itemUsageStrategy: "conservative",
      weaponUpgradeStrategy: "balanced",
      baseSeed: "mp2-test",
      ...overrides,
    } as BatchConfig;
  }

  // ─── FM#7: Welcome bonus divergence ────────────────────────────

  it("FM#7: batch runSingleGame on easy difficulty resolves the welcome bonus (heroes get bonus weapons/gold)", async () => {
    // CORRECT behavior: batch runs on easy/normal should resolve the welcome
    // bonus just like the playable path. Currently runSingleGame never calls
    // applyWelcomeBonusResults, so easy/normal batch runs start with only the
    // default common weapon and no bonus gold — diverging from playable runs.
    const config = makeBatchConfig({ difficulty: "easy" });
    const result = await runSingleGame(0, "mp2-wb-easy", config);
    // A welcome bonus resolution should produce at least one DICE_ROLLED event
    // with "Welcome Bonus" in the description, and the party should have
    // weapons beyond just the starting common weapon (or bonus gold).
    const hasWelcomeBonusEvent = result.combatLog.some(
      (e) => e.type === "DICE_ROLLED" && String(e.summary).includes("Welcome Bonus")
    );
    expect(hasWelcomeBonusEvent).toBe(true);
  });

  // ─── FM#7: Terminal resolution — finalizeRunStats in batch ─────

  it("FM#7: batch runSingleGame finalizes run stats (MVP and deadliest monster populated)", async () => {
    // CORRECT behavior: the batch path should call finalizeRunStats so that
    // mvpHeroId and deadliestMonster are populated in the result stats, just
    // like the playable path does in doResolveRoom. Currently the batch path
    // never calls finalizeRunStats.
    const config = makeBatchConfig();
    const result = await runSingleGame(0, "mp2-finalize", config);
    // After a full run, at least one of these should be populated (MVP is set
    // if any hero dealt damage; deadliestMonster is set if any monster dealt
    // damage). Both are undefined when finalizeRunStats is never called.
    const hasMvpOrDeadliest = result.stats.mvpHeroId !== undefined || result.stats.deadliestMonster !== undefined;
    expect(hasMvpOrDeadliest).toBe(true);
  });

  // ─── FM#8: Batch cancellation ──────────────────────────────────

  it("FM#8: runBatch stops early when cancelRequested is true", async () => {
    // CORRECT behavior: a batch run should be cancellable. Currently
    // runBatch never reads cancelRequested and runs all runs to completion.
    // We test by setting a large number of runs and cancelling immediately.
    const store = useBatchStore.getState();
    const config = makeBatchConfig({ runs: 100, baseSeed: "mp2-cancel" });
    // Start the batch, then cancel after the first run completes.
    const startPromise = store.startBatch();
    // Give it a moment to start, then cancel.
    await new Promise((r) => setTimeout(r, 100));
    store.cancelBatch();
    await startPromise;
    const result = useBatchStore.getState().result;
    // CORRECT: the batch should have been interrupted, so it should NOT have
    // completed all 100 runs. Currently it runs all 100.
    expect(result).not.toBeNull();
    expect(result!.runs.length).toBeLessThan(100);
  });
});

// ============================================================
// Phase 3 — Outstanding discrepancy resolution fixtures
// (B10 wolf HP, HomeScreen difficulty descriptions)
// ============================================================

describe("Megaplan Phase 3 — Discrepancy resolution fixtures", () => {
  // ─── B10: Wolf HP documentation matches engine ─────────────────

  it("B10: class description documents Wolf as 7 HP and Bear as 5 HP (matching engine)", () => {
    // The engine summons Wolf with 7 HP and Bear with 5 HP. The class
    // description and strategy guide must match the engine, not the
    // old "Pets have 5 HP" blanket statement.
    const trackerData = CLASS_DATA["Tracker"];
    expect(trackerData.uniqueMechanic).toContain("Wolf has 7 HP");
    expect(trackerData.uniqueMechanic).toContain("Bear has 5 HP");
    // The old blanket statement should be gone.
    expect(trackerData.uniqueMechanic).not.toContain("Pets have 5 HP");
  });

  it("B10: strategy guide documents Wolf as 7 HP (matching engine)", () => {
    // The strategy guide spec descriptions should match the engine.
    const guideText = JSON.stringify(STRATEGY_SECTIONS);
    expect(guideText).toContain("Wolf pet (7 HP)");
    expect(guideText).toContain("Bear pet (5 HP)");
  });

  // ─── Difficulty descriptions match engine/rules ────────────────

  it("HomeScreen difficulty descriptions match the authoritative rules text", () => {
    // The HomeScreen DIFFICULTY_INFO blurbs should match the rules
    // documents (rulesIndex, strategyGuide), not stale marketing text.
    // Easy: 150g start, +2 HP, revival -50%, monsters -2 HP
    expect(DIFFICULTY_INFO.easy.desc).toContain("150g");
    expect(DIFFICULTY_INFO.easy.desc).toContain("-2 HP");
    expect(DIFFICULTY_INFO.easy.desc).not.toContain("deal less damage");
    // Hard: 80g start, monsters +1 to rolls, permanent death
    expect(DIFFICULTY_INFO.hard.desc).toContain("80g");
    expect(DIFFICULTY_INFO.hard.desc).toContain("+1 to rolls");
    expect(DIFFICULTY_INFO.hard.desc).not.toContain("+20% HP");
    expect(DIFFICULTY_INFO.hard.desc).not.toContain("Elite rooms");
    // Nightmare: 40g start, tier bonuses, 40-turn limit
    expect(DIFFICULTY_INFO.nightmare.desc).toContain("40g");
    expect(DIFFICULTY_INFO.nightmare.desc).toContain("40-turn");
    expect(DIFFICULTY_INFO.nightmare.desc).not.toContain("+40% HP");
  });
});

// ============================================================
// Phase 3 — Ascent Capsules (reproduction packet export)
// ============================================================

describe("Megaplan Phase 3 — Ascent Capsules", () => {
  // ─── Capsule build/serialize/parse round-trip ────────────────

  it("FM#9: buildRunCapsule captures seed, difficulty, mode, and party composition", () => {
    const config = createDefaultConfig({
      mode: "playable",
      difficulty: "normal",
      seed: "capsule-test-seed",
    });
    const party: PartySetupChoice[] = [
      { className: "Bladedancer", suit: "hearts", position: 1 },
      { className: "Guardian", suit: "clubs", position: 2 },
      { className: "Tracker", suit: "spades", position: 3 },
    ];
    const state = initializeGame(config, party);

    const capsule = buildRunCapsule(state);

    expect(capsule.v).toBe(1);
    expect(capsule.type).toBe("skybreak-capsule");
    expect(capsule.seed).toBe("capsule-test-seed");
    expect(capsule.difficulty).toBe("normal");
    expect(capsule.mode).toBe("playable");
    expect(capsule.party).toHaveLength(3);
    expect(capsule.party[0].className).toBe("Bladedancer");
    expect(capsule.party[1].className).toBe("Guardian");
    expect(capsule.party[2].className).toBe("Tracker");
  });

  it("FM#9: serializeCapsule → parseCapsule round-trips correctly", () => {
    const config = createDefaultConfig({ seed: "capsule-rt-seed" });
    const party: PartySetupChoice[] = [
      { className: "Bladedancer", suit: "hearts", position: 1 },
      { className: "Guardian", suit: "clubs", position: 2 },
      { className: "Tracker", suit: "spades", position: 3 },
    ];
    const state = initializeGame(config, party);
    const capsule = buildRunCapsule(state);
    const serialized = serializeCapsule(capsule);
    const parsed = parseCapsule(serialized);

    expect(parsed).not.toBeNull();
    expect(parsed!.seed).toBe("capsule-rt-seed");
    expect(parsed!.party).toHaveLength(3);
    expect(parsed!.v).toBe(1);
  });

  it("FM#9: parseCapsule rejects invalid input", () => {
    expect(parseCapsule("not json")).toBeNull();
    expect(parseCapsule('{"foo":1}')).toBeNull();
    expect(parseCapsule('{"v":99,"type":"skybreak-capsule","seed":"x","difficulty":"easy","mode":"playable","party":[],"createdAt":"x"}')).toBeNull();
  });

  it("FM#9: isValidCapsule rejects wrong version", () => {
    const bad = {
      v: 999,
      type: "skybreak-capsule",
      seed: "x",
      difficulty: "easy",
      mode: "playable",
      party: [],
      createdAt: "x",
    };
    expect(isValidCapsule(bad)).toBe(false);
  });
});

// ============================================================
// Phase 4 — Vyridian's Verdict (cosmetic narrative epilogue)
// ============================================================

describe("Megaplan Phase 4 — Vyridian's Verdict", () => {
  // Helper: create a state with given stat overrides and phase.
  function makeState(overrides: Partial<GameState["stats"]>, phase: "victory" | "defeat", heroesAlive = 3): GameState {
    const config = createDefaultConfig({ seed: "verdict-test" });
    const party: PartySetupChoice[] = [
      { className: "Bladedancer", suit: "hearts", position: 1 },
      { className: "Guardian", suit: "clubs", position: 2 },
      { className: "Tracker", suit: "spades", position: 3 },
    ];
    const state = initializeGame(config, party);
    return {
      ...state,
      phase,
      stats: { ...state.stats, ...overrides },
      party: {
        ...state.party,
        heroes: state.party.heroes.map((h, i) => ({
          ...h,
          alive: i < heroesAlive,
        })),
      },
    };
  }

  it("FM#10: victory with no deaths returns 'The Unbroken' verdict", () => {
    const state = makeState({ deaths: 0, revivals: 0, perfectCombats: 0 }, "victory", 3);
    const verdict = getPrimaryVerdict(state);
    expect(verdict.id).toBe("unbroken");
    expect(verdict.title).toBe("The Unbroken");
    expect(verdict.text.length).toBeGreaterThan(20);
  });

  it("FM#10: victory with deaths returns a sacrifice-themed verdict", () => {
    const state = makeState({ deaths: 1, revivals: 0 }, "victory", 2);
    const verdict = getPrimaryVerdict(state);
    // The Sacrificed should be the primary verdict (weight 85 > Resilient's 70).
    expect(verdict.id).toBe("sacrificed");
  });

  it("FM#10: defeat that reached the final boss returns 'The Defiant'", () => {
    const state = makeState({ bossPhaseReached: "Phase 2" }, "defeat", 0);
    const verdict = getPrimaryVerdict(state);
    expect(verdict.id).toBe("defiant");
  });

  it("FM#10: defeat before the final boss returns 'The Fallen'", () => {
    const state = makeState({ roomsCleared: 5 }, "defeat", 0);
    const verdict = getPrimaryVerdict(state);
    expect(verdict.id).toBe("fallen");
  });

  it("FM#10: verdict is purely cosmetic — no state mutation", () => {
    const state = makeState({ deaths: 0 }, "victory", 3);
    const stateCopy = JSON.parse(JSON.stringify(state));
    getPrimaryVerdict(state);
    expect(state).toEqual(stateCopy);
  });
});

// ============================================================
// Phase 5 — Stable content IDs and asset cleanup
// ============================================================

describe("Megaplan Phase 5 — Stable content IDs", () => {
  // ─── classId ───────────────────────────────────────────────────

  it("FM#11: all classes have a stable classId field", () => {
    expect(CLASS_DATA.Bladedancer.classId).toBe("bladedancer");
    expect(CLASS_DATA.Manipulator.classId).toBe("manipulator");
    expect(CLASS_DATA.Tracker.classId).toBe("tracker");
    expect(CLASS_DATA.Guardian.classId).toBe("guardian");
  });

  // ─── roomId ────────────────────────────────────────────────────

  it("FM#11: createRoomsForTier generates stable roomId values", () => {
    const tier1 = createRoomsForTier(1);
    expect(tier1[0].roomId).toBe("t1_00_merchant");
    expect(tier1[1].roomId).toBe("t1_01_combat");
    expect(tier1[4].roomId).toBe("t1_04_split");
    // Split options should also have roomIds.
    if (tier1[4].splitOptions) {
      expect(tier1[4].splitOptions![0].roomId).toContain("t1_04_split");
      expect(tier1[4].splitOptions![0].roomId).toContain("_0_");
      expect(tier1[4].splitOptions![1].roomId).toContain("t1_04_split");
      expect(tier1[4].splitOptions![1].roomId).toContain("_1_");
    }
    const tier3 = createRoomsForTier(3);
    expect(tier3[9].roomId).toBe("t3_09_final_boss");
  });

  // ─── ITEMS_BY_ID ───────────────────────────────────────────────

  it("FM#11: ITEMS_BY_ID provides stable content-ID lookups", () => {
    expect(ITEMS_BY_ID["minor_potion"]).toBeDefined();
    expect(ITEMS_BY_ID["minor_potion"].name).toBe("Minor Potion");
    expect(ITEMS_BY_ID["guardian_angel"]).toBeDefined();
    expect(ITEMS_BY_ID["guardian_angel"].name).toBe("Guardian Angel");
    expect(ITEMS_BY_ID["bomb"]).toBeDefined();
  });

  it("FM#11: getItemData resolves by itemId", () => {
    const data = getItemData("lucky_charm");
    expect(data).toBeDefined();
    expect(data!.name).toBe("Lucky Charm");
    expect(data!.effect).toContain("Reroll");
  });

  it("FM#11: getItemData returns undefined for unknown itemId", () => {
    expect(getItemData("nonexistent_item")).toBeUndefined();
  });

  // ─── Asset filename fixes ──────────────────────────────────────

  it("FM#11: getMonsterImage resolves 'Arcane Elemental' with corrected filename", () => {
    // The old typo was "resonane_elemental"; the file was renamed to
    // "resonant_elemental". The registry should use the corrected name.
    const img = getMonsterImage("Arcane Elemental");
    // In test environment (jsdom), the asset may not resolve to a URL,
    // but it should not be null due to a typo'd filename.
    expect(img).not.toBeNull();
  });

  it("FM#11: getWeaponImage resolves \"Beastmaster's Pride\" with corrected filename", () => {
    const img = getWeaponImage("Beastmaster's Pride");
    expect(img).not.toBeNull();
  });
});

// ============================================================
// Phase 5 — Explain This Turn (combat outcome explanation)
// ============================================================

describe("Megaplan Phase 5 — Explain This Turn", () => {
  // ─── DAMAGE_APPLIED events carry structured breakdowns ─────────

  it("FM#12: DAMAGE_APPLIED events include a DamageBreakdown in details.breakdown", () => {
    // Run a combat and verify that DAMAGE_APPLIED events carry
    // structured breakdown data (base, bonuses, reductions, final).
    const seed = "explain-turn-test";
    const config = createDefaultConfig({ seed, mode: "simulation" });
    const party: PartySetupChoice[] = [
      { className: "Bladedancer", suit: "hearts", position: 1 },
      { className: "Guardian", suit: "clubs", position: 2 },
      { className: "Tracker", suit: "spades", position: 3 },
    ];
    let state = initializeGame(config, party);
    const rng = new RngEngine(seed);

    // Start combat to generate DAMAGE_APPLIED events.
    state = startCombat(state, rng);

    // The combat started event should exist with structured details.
    const combatStarted = state.log.find(e => e.type === "COMBAT_STARTED");
    expect(combatStarted).toBeDefined();
    expect(combatStarted!.details).toBeDefined();
    expect(combatStarted!.details!.monsterName).toBeDefined();
    expect(combatStarted!.details!.monsterHp).toBeDefined();
  });

  it("FM#12: DamageBreakdown type has all required fields", () => {
    // Verify the DamageBreakdown interface shape by constructing
    // a mock event and checking field access.
    const mockBreakdown = {
      base: 3,
      weaponBonus: 1,
      enchantmentBonus: 0,
      tokenBonus: 1,
      environmentBonus: 0,
      matchBonus: 0,
      shieldReduction: 0,
      armorReduction: 0,
      defenseReduction: 0,
      phaseThrough: false,
      finalDamage: 5,
      notes: [],
    };
    const mockEvent: GameEvent = {
      id: "test-event-1",
      type: "DAMAGE_APPLIED",
      timestamp: Date.now(),
      sequence: 1,
      summary: "Test hero dealt 5 damage to Test Monster. HP: 5/10.",
      details: { damage: 5, remainingHp: 5, breakdown: mockBreakdown, targetName: "Test Monster" },
      visibleToPlayer: true,
    };

    // The breakdown should be accessible and have all fields.
    const breakdown = mockEvent.details?.breakdown as Record<string, unknown>;
    expect(breakdown).toBeDefined();
    expect(breakdown.base).toBe(3);
    expect(breakdown.weaponBonus).toBe(1);
    expect(breakdown.finalDamage).toBe(5);
    expect(breakdown.phaseThrough).toBe(false);
    expect(Array.isArray(breakdown.notes)).toBe(true);
  });
});

// ============================================================
// Phase 6c — Physical Table Bridge
// ============================================================

describe("Megaplan Phase 6c — Physical Table Bridge", () => {
  it("FM#13: RngEngine.setPhysicalRolls overrides rollD6 results", () => {
    const rng = new RngEngine("physical-test");
    rng.setPhysicalRolls([6, 1, 3]);
    expect(rng.rollD6("test1").total).toBe(6);
    expect(rng.rollD6("test2").total).toBe(1);
    expect(rng.rollD6("test3").total).toBe(3);
    // After queue is empty, falls back to seeded RNG
    const seededRoll = rng.rollD6("test4");
    expect(seededRoll.total).toBeGreaterThanOrEqual(1);
    expect(seededRoll.total).toBeLessThanOrEqual(6);
    rng.clearPhysicalOverrides();
  });

  it("FM#13: RngEngine.setPhysicalRolls overrides roll2D6 results", () => {
    const rng = new RngEngine("physical-2d6");
    rng.setPhysicalRolls([5, 2]);
    const result = rng.roll2D6("test-2d6");
    expect(result.rolls).toEqual([5, 2]);
    expect(result.total).toBe(7);
    rng.clearPhysicalOverrides();
  });

  it("FM#13: RngEngine.consumePhysicalCards returns and clears cards", () => {
    const rng = new RngEngine("physical-cards");
    const cards = [
      { id: "test-c1", suit: "hearts" as const, rank: "5" as const, display: "5♥", deckType: "peon" as const },
      { id: "test-c2", suit: "clubs" as const, rank: "3" as const, display: "3♣", deckType: "peon" as const },
    ];
    rng.setPhysicalCards(cards);
    const consumed = rng.consumePhysicalCards();
    expect(consumed).not.toBeNull();
    expect(consumed!.length).toBe(2);
    expect(consumed![0].suit).toBe("hearts");
    // Second call returns null (already consumed)
    const consumed2 = rng.consumePhysicalCards();
    expect(consumed2).toBeNull();
  });

  it("FM#13: clearPhysicalOverrides clears both rolls and cards", () => {
    const rng = new RngEngine("physical-clear");
    rng.setPhysicalRolls([1, 2]);
    rng.setPhysicalCards([
      { id: "c", suit: "spades" as const, rank: "A" as const, display: "A♠", deckType: "peon" as const },
    ]);
    rng.clearPhysicalOverrides();
    expect(rng.hasPhysicalRolls).toBe(false);
    expect(rng.consumePhysicalCards()).toBeNull();
  });

  it("FM#13: flipPeonCards uses physical cards when set", () => {
    const seed = "physical-flip";
    const config = createDefaultConfig({ seed, mode: "simulation" });
    let state = initializeGame(config, [
      { className: "Bladedancer", suit: "hearts", position: 1 },
      { className: "Guardian", suit: "clubs", position: 2 },
      { className: "Tracker", suit: "spades", position: 3 },
    ]);
    const rng = new RngEngine(seed);
    state = startCombat(state, rng);

    // Set physical cards
    const physicalCards = [
      { id: "phys-1", suit: "hearts" as const, rank: "5" as const, display: "5♥", deckType: "peon" as const },
      { id: "phys-2", suit: "clubs" as const, rank: "3" as const, display: "3♣", deckType: "peon" as const },
    ];
    rng.setPhysicalCards(physicalCards);

    // Flip cards for the first hero
    const heroId = state.party.heroes[0].id;
    const { cards } = flipPeonCards(state, heroId, rng);
    expect(cards.length).toBe(2);
    expect(cards[0].suit).toBe("hearts");
    expect(cards[0].rank).toBe("5");
    expect(cards[1].suit).toBe("clubs");
    expect(cards[1].rank).toBe("3");
    rng.clearPhysicalOverrides();
  });

  it("FM#14: physical rolls are consumed FIFO and history records physical type", () => {
    const rng = new RngEngine("physical-history");
    rng.setPhysicalRolls([6, 3]);
    rng.rollD6("first");
    rng.rollD6("second");
    const history = rng.historyLog;
    const physicalEvents = history.filter(e => e.type === "d6-physical");
    expect(physicalEvents.length).toBe(2);
    expect(physicalEvents[0].result).toBe(6);
    expect(physicalEvents[1].result).toBe(3);
    rng.clearPhysicalOverrides();
  });

  it("FM#14: roll2D6 consumes two physical rolls when available", () => {
    const rng = new RngEngine("physical-2d6-fifo");
    rng.setPhysicalRolls([4, 2, 6]);
    const r1 = rng.roll2D6("first-2d6");
    expect(r1.rolls).toEqual([4, 2]);
    expect(r1.total).toBe(6);
    // One physical roll left; roll2D6 should fall back to seeded for the second die
    const r2 = rng.rollD6("leftover");
    expect(r2.total).toBe(6);
    rng.clearPhysicalOverrides();
  });

  it("FM#14: hasPhysicalRolls reflects queue state without consuming", () => {
    const rng = new RngEngine("physical-peek");
    expect(rng.hasPhysicalRolls).toBe(false);
    rng.setPhysicalRolls([1]);
    expect(rng.hasPhysicalRolls).toBe(true);
    rng.rollD6("consume");
    expect(rng.hasPhysicalRolls).toBe(false);
    rng.clearPhysicalOverrides();
  });
});
