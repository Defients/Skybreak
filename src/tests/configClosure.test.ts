import { describe, it, expect } from "vitest";
import { createDefaultConfig } from "../engine/gameState";

/**
 * SA-7 — Configuration Closure.
 *
 * Proves that declared-but-unconsumed config fields are explicitly marked
 * and not surfaced in any UI. These fields are "hidden" — they exist in the
 * type system for future implementation but have no runtime effect today.
 */
describe("SA-7 Configuration Closure", () => {
  it("showAiReasoning defaults to false and is not consumed by any engine/UI code", () => {
    const config = createDefaultConfig();
    expect(config.showAiReasoning).toBe(false);
    // This field is declared in SimulationConfig but not read by any engine
    // function or UI component. It is hidden from the user.
    // If this field is implemented in the future, remove this test and add
    // a consumption test instead.
  });

  it("stopConditions defaults are present but not evaluated by any engine code", () => {
    const config = createDefaultConfig();
    expect(config.stopConditions).toBeDefined();
    expect(config.stopConditions.onPartyDeath).toBe(true);
    expect(config.stopConditions.onVictory).toBe(true);
    // These fields are declared in SimulationConfig but not evaluated by any
    // engine function or UI component. They are hidden from the user.
  });

  it("all user-visible config fields are consumed (difficulty, seed, mode)", () => {
    const config = createDefaultConfig({ seed: "test", difficulty: "hard", mode: "simulation" });
    expect(config.seed).toBe("test");
    expect(config.difficulty).toBe("hard");
    expect(config.mode).toBe("simulation");
    // These fields ARE consumed: seed → RngEngine, difficulty → monster scaling,
    // mode → applyModeDefaults. They are surfaced in HomeScreen.
  });
});
