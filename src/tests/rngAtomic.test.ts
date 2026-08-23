import { describe, it, expect, beforeEach } from "vitest";
import { startCombat } from "../engine/combatEngine";
import { runCombatToCompletion, runCombatStep, type CombatRunnerConfig } from "../engine/combatRunner";
import { initializeGame, createDefaultConfig, type PartySetupChoice } from "../engine/gameState";
import { RngEngine } from "../utils/random";
import { resetEventSequence } from "../engine/eventLog";
import { resetIdCounter } from "../utils/ids";
import type { GameState } from "../types/gameState";

/**
 * P3 — Atomic RNG ownership.
 *
 * Proves that:
 *   1. runCombatStep returns state with serialized post-action RNG
 *   2. runCombatToCompletion returns state with serialized final RNG
 *   3. Uninterrupted run vs save→reload→continue produces identical results
 */
describe("P3 Atomic RNG", () => {
  const party: PartySetupChoice[] = [
    { className: "Bladedancer", suit: "spades", position: 1 },
    { className: "Manipulator", suit: "hearts", position: 2 },
    { className: "Tracker", suit: "clubs", position: 3 },
  ];

  const config: CombatRunnerConfig = {
    combatStrategy: "balanced",
    itemUsageStrategy: "conservative",
  };

  beforeEach(() => {
    resetEventSequence();
    resetIdCounter();
  });

  it("runCombatStep returns state with serialized post-action RNG", () => {
    const cfg = createDefaultConfig({ seed: "atomic-step" });
    const state = initializeGame(cfg, party);
    const combatState = startCombat(state, new RngEngine("atomic-step"));
    const rng = RngEngine.deserialize(combatState.rng!);
    const step0 = rng.currentStep;

    // Execute one step (monster turn, since combat starts with monster side)
    const afterStep = runCombatStep(combatState, rng, config);

    // RNG advanced
    expect(rng.currentStep).toBeGreaterThan(step0);
    // State carries the serialized RNG
    expect(afterStep.rng).toBeDefined();
    expect(afterStep.rng!.step).toBe(rng.currentStep);
  });

  it("runCombatToCompletion returns state with serialized final RNG", () => {
    const cfg = createDefaultConfig({ seed: "atomic-full" });
    const state = initializeGame(cfg, party);
    const combatState = startCombat(state, new RngEngine("atomic-full"));
    const rng = RngEngine.deserialize(combatState.rng!);

    const finalState = runCombatToCompletion(combatState, rng, config);

    expect(finalState.rng).toBeDefined();
    expect(finalState.rng!.step).toBe(rng.currentStep);
    expect(finalState.combat?.combatResult).toBeDefined();
  });

  it("uninterrupted run vs save→reload→continue produces identical results", () => {
    const seed = "atomic-reload";
    const cfg = createDefaultConfig({ seed });

    // Path A: uninterrupted run
    const stateA = initializeGame(cfg, party);
    const combatA = startCombat(stateA, new RngEngine(seed));
    const rngA = RngEngine.deserialize(combatA.rng!);
    const finalA = runCombatToCompletion(combatA, rngA, config);

    // Path B: run 3 steps, "save" (serialize), "reload" (deserialize), continue
    const stateB = initializeGame(cfg, party);
    const combatB = startCombat(stateB, new RngEngine(seed));
    let rngB = RngEngine.deserialize(combatB.rng!);
    let stateBCurrent = combatB;

    // Run 3 steps
    for (let i = 0; i < 3; i++) {
      stateBCurrent = runCombatStep(stateBCurrent, rngB, config);
      if (stateBCurrent.combat?.combatResult) break;
    }

    // "Save" — serialize the state (which now includes serialized RNG)
    const saved = JSON.stringify(stateBCurrent);

    // "Reload" — deserialize the state and reconstruct the RNG
    const loaded = JSON.parse(saved) as GameState;
    rngB = RngEngine.deserialize(loaded.rng!);

    // Continue the run
    const finalB = runCombatToCompletion(loaded, rngB, config);

    // Both paths should produce identical results
    expect(finalB.combat?.combatResult).toBe(finalA.combat?.combatResult);
    expect(finalB.combat?.round).toBe(finalA.combat?.round);
    expect(finalB.combat?.turnCount).toBe(finalA.combat?.turnCount);
    expect(finalB.stats.totalTurns).toBe(finalA.stats.totalTurns);
    expect(finalB.rng!.step).toBe(finalA.rng!.step);

    // Compare hero HP
    for (let i = 0; i < finalA.party.heroes.length; i++) {
      expect(finalB.party.heroes[i].currentHp).toBe(finalA.party.heroes[i].currentHp);
      expect(finalB.party.heroes[i].alive).toBe(finalA.party.heroes[i].alive);
    }

    // Compare monster HP
    expect(finalB.combat?.monster.currentHp).toBe(finalA.combat?.monster.currentHp);
  });

  it("multiple save→reload cycles produce identical results to uninterrupted run", () => {
    const seed = "atomic-multi-reload";
    const cfg = createDefaultConfig({ seed });

    // Path A: uninterrupted
    const stateA = initializeGame(cfg, party);
    const combatA = startCombat(stateA, new RngEngine(seed));
    const rngA = RngEngine.deserialize(combatA.rng!);
    const finalA = runCombatToCompletion(combatA, rngA, config);

    // Path B: save→reload after every step
    const stateB = initializeGame(cfg, party);
    const combatB = startCombat(stateB, new RngEngine(seed));
    let stateBCurrent = combatB;
    let safety = 0;

    while (stateBCurrent.combat && !stateBCurrent.combat.combatResult && safety < 200) {
      safety++;
      // Deserialize RNG from state (simulating reload)
      let rngB = RngEngine.deserialize(stateBCurrent.rng!);
      // Run one step
      stateBCurrent = runCombatStep(stateBCurrent, rngB, config);
      // "Save" is implicit — stateBCurrent already has serialized RNG
    }

    const finalB = stateBCurrent;

    expect(finalB.combat?.combatResult).toBe(finalA.combat?.combatResult);
    expect(finalB.combat?.round).toBe(finalA.combat?.round);
    expect(finalB.stats.totalTurns).toBe(finalA.stats.totalTurns);
    expect(finalB.rng!.step).toBe(finalA.rng!.step);
  });
});
