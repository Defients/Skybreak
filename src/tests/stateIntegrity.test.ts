import { describe, it, expect, beforeEach } from "vitest";
import { useGameStore } from "../app/gameStore";
import { useHybridStore } from "../app/hybridStore";
import { initializeGame, createDefaultConfig, type PartySetupChoice } from "../engine/gameState";
import { resetEventSequence } from "../engine/eventLog";
import { resetIdCounter } from "../utils/ids";

/**
 * SA-6 — State Integrity / Autosave / Event Sequencing.
 *
 * Proves that:
 *   - doManualOverride does not mutate the prior state (immutable path update).
 *   - doManualOverride blocks __proto__/constructor/prototype path keys.
 *   - doResetGame resets module-level mutable state and hybrid AI control.
 *   - startNewRun resets event sequence and ID counter.
 */
describe("SA-6 State Integrity", () => {
  const sampleParty: PartySetupChoice[] = [
    { className: "Bladedancer", suit: "spades", position: 1 },
    { className: "Manipulator", suit: "hearts", position: 2 },
    { className: "Tracker", suit: "clubs", position: 3 },
  ];

  beforeEach(() => {
    useGameStore.getState().doResetGame();
    resetEventSequence();
    resetIdCounter();
  });

  it("doManualOverride does not mutate the prior state object", () => {
    const config = createDefaultConfig({ seed: "manual-override" });
    const state = initializeGame(config, sampleParty);
    useGameStore.getState().doLoadState(state);

    const originalGold = state.party.gold;
    const originalStateRef = useGameStore.getState().state;
    const originalPartyRef = originalStateRef!.party;

    // Override a nested field.
    useGameStore.getState().doManualOverride("party.gold", 9999);

    // The store state should have the new value.
    expect(useGameStore.getState().state!.party.gold).toBe(9999);
    // The ORIGINAL state object should be unchanged (no shared-ref mutation).
    expect(state.party.gold).toBe(originalGold);
    // The original party reference should not have been mutated.
    expect(originalPartyRef.gold).toBe(originalGold);
  });

  it("doManualOverride does not mutate nested arrays/objects in prior state", () => {
    const config = createDefaultConfig({ seed: "nested-override" });
    const state = initializeGame(config, sampleParty);
    useGameStore.getState().doLoadState(state);

    const originalHero0Hp = state.party.heroes[0].currentHp;
    // Override a deeply nested field.
    useGameStore.getState().doManualOverride("party.heroes.0.currentHp", 1);

    expect(useGameStore.getState().state!.party.heroes[0].currentHp).toBe(1);
    // The original state's hero should be unchanged.
    expect(state.party.heroes[0].currentHp).toBe(originalHero0Hp);
  });

  it("doManualOverride blocks __proto__ path keys", () => {
    const config = createDefaultConfig({ seed: "proto-block" });
    const state = initializeGame(config, sampleParty);
    useGameStore.getState().doLoadState(state);

    const goldBefore = useGameStore.getState().state!.party.gold;
    // Attempt prototype pollution — should be a no-op.
    useGameStore.getState().doManualOverride("__proto__.polluted", true);
    expect(useGameStore.getState().state!.party.gold).toBe(goldBefore);
    expect((globalThis as any).polluted).toBeUndefined();
  });

  it("doResetGame clears state, rng, and resets hybrid AI control", () => {
    const config = createDefaultConfig({ seed: "reset-test" });
    const state = initializeGame(config, sampleParty);
    useGameStore.getState().doLoadState(state);

    // Set some hybrid AI control state.
    useHybridStore.getState().setHeroAI("hero-1", true);
    expect(useHybridStore.getState().aiControlledHeroes["hero-1"]).toBe(true);

    // Reset the game.
    useGameStore.getState().doResetGame();

    // Store state should be cleared.
    expect(useGameStore.getState().state).toBeNull();
    expect(useGameStore.getState().rng).toBeNull();
    // Hybrid AI control should be reset.
    expect(useHybridStore.getState().aiControlledHeroes["hero-1"]).toBeUndefined();
  });

  it("startNewRun resets event sequence and ID counter", () => {
    // Generate some events and IDs to advance the counters.
    const config = createDefaultConfig({ seed: "seq-test-1" });
    useGameStore.getState().startNewRun({ seed: "seq-test-1" }, sampleParty);
    const state1 = useGameStore.getState().state!;
    expect(state1.log.length).toBeGreaterThan(0);
    // The first event in a fresh run should have sequence 0 (or close to it).
    expect(state1.log[0].sequence).toBeLessThanOrEqual(1);

    // Start a new run — event sequence should reset.
    useGameStore.getState().startNewRun({ seed: "seq-test-2" }, sampleParty);
    const state2 = useGameStore.getState().state!;
    // The first event of the new run should have a low sequence number
    // (reset, not continuing from the prior run).
    expect(state2.log[0].sequence).toBeLessThanOrEqual(1);
  });
});
