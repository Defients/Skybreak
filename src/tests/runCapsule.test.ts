import { describe, it, expect, beforeEach } from "vitest";
import {
  buildRunCapsule,
  serializeCapsule,
  parseCapsule,
  isValidCapsule,
  CAPSULE_VERSION,
} from "../engine/runCapsule";
import {
  initializeGame,
  createDefaultConfig,
  type PartySetupChoice,
} from "../engine/gameState";
import { hydrateSave } from "../engine/saveLoad";
import type { GameState } from "../types/gameState";
import type { Suit } from "../types/cards";
import type { HeroClassName } from "../types/heroes";

/**
 * Stage 1 / Task C — Ascent Capsule reproducibility.
 *
 * Capsules must reflect the run's *actual* starting configuration. The old
 * implementation inferred suits from mutable APC state (consumed, replaced,
 * or transformed during play) and silently fell back to "clubs". Now
 * `GameState.startingParty` records the immutable starting configuration at
 * run creation, and capsules consume it. Legacy saves that never recorded a
 * suit produce an honest metadata-only capsule (suit: null, replayable:
 * false) instead of a guess.
 */
describe("Stage 1 — Ascent Capsule starting conditions", () => {
  const ALL_SUITS: Suit[] = ["clubs", "diamonds", "hearts", "spades"];
  const ALL_CLASSES: HeroClassName[] = ["Bladedancer", "Manipulator", "Tracker", "Guardian"];

  beforeEach(() => {
    localStorage.clear();
  });

  function makeState(
    choices: PartySetupChoice[],
    seed = "capsule-stage1"
  ): GameState {
    return initializeGame(createDefaultConfig({ seed, mode: "simulation" }), choices);
  }

  const defaultParty: PartySetupChoice[] = [
    { className: "Bladedancer", suit: "hearts", position: 1 },
    { className: "Guardian", suit: "clubs", position: 2 },
    { className: "Tracker", suit: "spades", position: 3 },
  ];

  it("initializeGame records an immutable startingParty (class, suit, position, spec)", () => {
    const state = makeState(defaultParty);
    expect(state.startingParty).toBeDefined();
    expect(state.startingParty).toHaveLength(3);
    expect(state.startingParty![0]).toMatchObject({
      className: "Bladedancer",
      suit: "hearts",
      position: 1,
    });
    expect(state.startingParty![0].specialization).toBe("Runeblade"); // hearts → red spec
    expect(state.startingParty![2].suit).toBe("spades");
  });

  it("captures the chosen suit exactly for every starting suit", () => {
    for (const suit of ALL_SUITS) {
      const state = makeState([
        { className: "Bladedancer", suit, position: 1 },
        { className: "Guardian", suit: "clubs", position: 2 },
        { className: "Tracker", suit: "hearts", position: 3 },
      ]);
      const capsule = buildRunCapsule(state);
      expect(capsule.party[0].suit).toBe(suit);
      expect(capsule.replayable).toBe(true);
    }
  });

  it("captures all four classes and hero positions", () => {
    const choices: PartySetupChoice[] = ALL_CLASSES.map((className, i) => ({
      className,
      suit: ALL_SUITS[i],
      position: (i + 1) as 1 | 2 | 3,
    }));
    const state = makeState(choices);
    const capsule = buildRunCapsule(state);
    expect(capsule.party.map((p) => p.className)).toEqual(ALL_CLASSES);
    expect(capsule.party.map((p) => p.suit)).toEqual(ALL_SUITS);
    expect(capsule.party.map((p) => p.position)).toEqual([1, 2, 3, 4]);
  });

  it("remains accurate after APCs are consumed or removed", () => {
    const state = makeState(defaultParty);
    // Strip all APC state — the old implementation would have fallen back
    // to "clubs" here.
    const stripped: GameState = {
      ...state,
      party: {
        ...state.party,
        heroes: state.party.heroes.map((h) => ({
          ...h,
          apcs: [],
          temporaryApcs: [],
          permanentApcs: [],
        })),
      },
    };
    const capsule = buildRunCapsule(stripped);
    expect(capsule.party[0].suit).toBe("hearts");
    expect(capsule.party[1].suit).toBe("clubs");
    expect(capsule.party[2].suit).toBe("spades");
    expect(capsule.replayable).toBe(true);
  });

  it("remains accurate when APCs have been transformed or replaced", () => {
    const state = makeState(defaultParty);
    // Replace APCs with different suits — old code would have exported the
    // REPLACED suits, corrupting the capsule.
    const replaced: GameState = {
      ...state,
      party: {
        ...state.party,
        heroes: state.party.heroes.map((h) => ({
          ...h,
          apcs: [{ id: "fake", suit: "diamonds", rank: "7" } as any],
        })),
      },
    };
    const capsule = buildRunCapsule(replaced);
    expect(capsule.party.map((p) => p.suit)).toEqual(["hearts", "clubs", "spades"]);
  });

  it("starting conditions survive a save/hydrate round-trip", () => {
    const state = makeState(defaultParty);
    const hydrated = hydrateSave(
      JSON.stringify({
        version: "0.1.0",
        gameState: state,
        savedAt: new Date().toISOString(),
        name: "rt",
      })
    );
    expect(hydrated.ok).toBe(true);
    if (!hydrated.ok) return;
    const capsule = buildRunCapsule(hydrated.state);
    expect(capsule.party.map((p) => [p.className, p.suit])).toEqual([
      ["Bladedancer", "hearts"],
      ["Guardian", "clubs"],
      ["Tracker", "spades"],
    ]);
    expect(capsule.replayable).toBe(true);
  });

  it("legacy states without startingParty export an honest, non-replayable capsule", () => {
    const state = makeState(defaultParty);
    // Simulate a save created before startingParty existed.
    const legacy = { ...state };
    delete (legacy as any).startingParty;

    const capsule = buildRunCapsule(legacy);
    // Class and specialization are still true facts about the run.
    expect(capsule.party.map((p) => p.className)).toEqual([
      "Bladedancer",
      "Guardian",
      "Tracker",
    ]);
    // The suit was never recorded — the capsule says so instead of guessing.
    expect(capsule.party.every((p) => p.suit === null)).toBe(true);
    expect(capsule.replayable).toBe(false);
  });

  it("serializes and parses a v2 capsule with null suits", () => {
    const state = makeState(defaultParty);
    const legacy = { ...state };
    delete (legacy as any).startingParty;
    const capsule = buildRunCapsule(legacy);
    const parsed = parseCapsule(serializeCapsule(capsule));
    expect(parsed).not.toBeNull();
    expect(parsed!.v).toBe(CAPSULE_VERSION);
    expect(parsed!.replayable).toBe(false);
    expect(parsed!.party[0].suit).toBeNull();
  });

  it("parses legacy v1 capsules deliberately — suits preserved, replayable normalized", () => {
    const v1 = {
      v: 1,
      type: "skybreak-capsule",
      gameVersion: "0.1.0",
      seed: "old-seed",
      difficulty: "normal",
      mode: "playable",
      party: [
        { className: "Bladedancer", suit: "hearts", specialization: "Runeblade" },
        { className: "Guardian", suit: "clubs", specialization: "Sentinel" },
        { className: "Tracker", suit: "spades", specialization: "Huntmaster" },
      ],
      createdAt: "2026-09-01T00:00:00.000Z",
    };
    const parsed = parseCapsule(JSON.stringify(v1));
    expect(parsed).not.toBeNull();
    expect(parsed!.v).toBe(CAPSULE_VERSION);
    expect(parsed!.party.map((p) => p.suit)).toEqual(["hearts", "clubs", "spades"]);
    expect(parsed!.replayable).toBe(true);
  });

  it("repeated exports of the same run produce identical gameplay fields", () => {
    const state = makeState(defaultParty);
    const a = buildRunCapsule(state);
    const b = buildRunCapsule(state);
    // Everything except the wall-clock creation timestamp must be identical.
    const { createdAt: _a, ...restA } = a;
    const { createdAt: _b, ...restB } = b;
    expect(restA).toEqual(restB);
  });

  it("captures AI strategies and mode configuration needed for reproduction", () => {
    const state = initializeGame(
      createDefaultConfig({
        seed: "capsule-strat",
        mode: "simulation",
        combatStrategy: "aggressive",
        itemUsageStrategy: "aggressive",
        merchantStrategy: "upgrades",
      }),
      defaultParty
    );
    const capsule = buildRunCapsule(state);
    expect(capsule.strategies?.combat).toBe("aggressive");
    expect(capsule.strategies?.itemUsage).toBe("aggressive");
    expect(capsule.strategies?.merchant).toBe("upgrades");
    expect(capsule.rngMode).toBe("seeded");
  });

  it("isValidCapsule accepts v1 and v2, rejects other versions", () => {
    const base = {
      type: "skybreak-capsule",
      seed: "x",
      difficulty: "easy",
      mode: "playable",
      party: [],
      createdAt: "x",
    };
    expect(isValidCapsule({ ...base, v: 1 })).toBe(true);
    expect(isValidCapsule({ ...base, v: CAPSULE_VERSION })).toBe(true);
    expect(isValidCapsule({ ...base, v: 3 })).toBe(false);
    expect(isValidCapsule({ ...base, v: "2" })).toBe(false);
  });
});
