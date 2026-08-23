import { describe, it, expect } from "vitest";
import { validateState } from "../engine/validationEngine";
import { initializeGame, createDefaultConfig, type PartySetupChoice } from "../engine/gameState";
import type { GameState } from "../types/gameState";

describe("Validation Engine", () => {
  const sampleParty: PartySetupChoice[] = [
    { className: "Bladedancer", suit: "spades", position: 1 },
    { className: "Manipulator", suit: "hearts", position: 2 },
    { className: "Tracker", suit: "clubs", position: 3 },
  ];

  function createTestState(): GameState {
    const config = createDefaultConfig({ seed: "validation-test" });
    return initializeGame(config, sampleParty);
  }

  it("validates a fresh game state with no errors", () => {
    const state = createTestState();
    const result = validateState(state);
    expect(result.valid).toBe(true);
    expect(result.warnings.filter((w) => w.severity === "error")).toHaveLength(0);
  });

  it("detects hero with HP exceeding max", () => {
    const state = createTestState();
    state.party.heroes[0].currentHp = state.party.heroes[0].maxHp + 10;
    const result = validateState(state);
    const hpWarning = result.warnings.find((w) => w.category === "HP");
    expect(hpWarning).toBeDefined();
  });

  it("detects alive hero with 0 HP", () => {
    const state = createTestState();
    state.party.heroes[0].currentHp = 0;
    state.party.heroes[0].alive = true;
    const result = validateState(state);
    const error = result.warnings.find((w) => w.category === "HP" && w.severity === "error");
    expect(error).toBeDefined();
  });

  it("detects negative gold", () => {
    const state = createTestState();
    state.party.gold = -50;
    const result = validateState(state);
    const goldError = result.warnings.find((w) => w.category === "Gold" && w.severity === "error");
    expect(goldError).toBeDefined();
    expect(result.valid).toBe(false);
  });

  it("detects dead hero with positive HP", () => {
    const state = createTestState();
    state.party.heroes[0].alive = false;
    state.party.heroes[0].currentHp = 10;
    const result = validateState(state);
    const warning = result.warnings.find((w) => w.category === "HP");
    expect(warning).toBeDefined();
  });

  it("detects hero in deadHeroIds but alive", () => {
    const state = createTestState();
    const aliveHero = state.party.heroes[0];
    state.party.deadHeroIds = [aliveHero.id];
    const result = validateState(state);
    const error = result.warnings.find((w) => w.category === "Death" && w.severity === "error");
    expect(error).toBeDefined();
  });
});
