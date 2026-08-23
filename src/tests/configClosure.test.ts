import { describe, it, expect } from "vitest";
import { createDefaultConfig } from "../engine/gameState";

/**
 * SA-7 — Configuration Closure.
 *
 * Proves that dead config fields (showAiReasoning, stopConditions) have been
 * removed from the type system and defaults, and that all remaining config
 * fields are consumed by the engine or UI.
 */
describe("SA-7 Configuration Closure", () => {
  it("createDefaultConfig does not include removed dead fields", () => {
    const config = createDefaultConfig();
    expect((config as any).showAiReasoning).toBeUndefined();
    expect((config as any).stopConditions).toBeUndefined();
  });

  it("all user-visible config fields are consumed (difficulty, seed, mode)", () => {
    const config = createDefaultConfig({ seed: "test", difficulty: "hard", mode: "simulation" });
    expect(config.seed).toBe("test");
    expect(config.difficulty).toBe("hard");
    expect(config.mode).toBe("simulation");
  });

  it("applyModeDefaults no longer sets showAiReasoning for companion mode", () => {
    const config = createDefaultConfig({ mode: "companion" });
    expect((config as any).showAiReasoning).toBeUndefined();
  });
});
