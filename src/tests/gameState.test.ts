import { describe, it, expect } from "vitest";
import { initializeGame, createDefaultConfig, type PartySetupChoice } from "../engine/gameState";

describe("Game State Initialization", () => {
  const sampleParty: PartySetupChoice[] = [
    { className: "Bladedancer", suit: "spades", position: 1 },
    { className: "Manipulator", suit: "hearts", position: 2 },
    { className: "Tracker", suit: "clubs", position: 3 },
  ];

  it("creates default config with expected fields", () => {
    const config = createDefaultConfig({});
    expect(config.mode).toBe("playable");
    expect(config.difficulty).toBe("normal");
    expect(config.seed).toBeDefined();
    expect(config.seed.length).toBeGreaterThan(0);
  });

  it("initializes game with correct phase", () => {
    const config = createDefaultConfig({ seed: "test-init" });
    const state = initializeGame(config, sampleParty);
    expect(state.phase).toBe("setup");
  });

  it("creates 3 heroes from party choices", () => {
    const config = createDefaultConfig({ seed: "test-heroes" });
    const state = initializeGame(config, sampleParty);
    expect(state.party.heroes).toHaveLength(3);
  });

  it("assigns correct classes to heroes", () => {
    const config = createDefaultConfig({ seed: "test-classes" });
    const state = initializeGame(config, sampleParty);
    expect(state.party.heroes[0].className).toBe("Bladedancer");
    expect(state.party.heroes[1].className).toBe("Manipulator");
    expect(state.party.heroes[2].className).toBe("Tracker");
  });

  it("starts with welcome bonus gold", () => {
    const config = createDefaultConfig({ seed: "test-gold" });
    const state = initializeGame(config, sampleParty);
    expect(state.party.gold).toBeGreaterThan(0);
  });

  it("initializes spire at tier 1", () => {
    const config = createDefaultConfig({ seed: "test-spire" });
    const state = initializeGame(config, sampleParty);
    expect(state.spire.tier).toBe(1);
    expect(state.spire.roomIndex).toBe(0);
  });

  it("creates rooms for tier 1", () => {
    const config = createDefaultConfig({ seed: "test-rooms" });
    const state = initializeGame(config, sampleParty);
    expect(state.spire.rooms.length).toBeGreaterThan(0);
    expect(state.spire.currentRoom).toBeDefined();
  });

  it("initializes empty event log", () => {
    const config = createDefaultConfig({ seed: "test-log" });
    const state = initializeGame(config, sampleParty);
    expect(state.log).toBeDefined();
    expect(Array.isArray(state.log)).toBe(true);
  });

  it("initializes run stats at 0", () => {
    const config = createDefaultConfig({ seed: "test-stats" });
    const state = initializeGame(config, sampleParty);
    expect(state.stats.totalTurns).toBe(0);
    expect(state.stats.roomsCleared).toBe(0);
    expect(state.stats.deaths).toBe(0);
  });

  it("all heroes start alive", () => {
    const config = createDefaultConfig({ seed: "test-alive" });
    const state = initializeGame(config, sampleParty);
    expect(state.party.heroes.every((h) => h.alive)).toBe(true);
  });

  it("all heroes start at max HP", () => {
    const config = createDefaultConfig({ seed: "test-hp" });
    const state = initializeGame(config, sampleParty);
    expect(state.party.heroes.every((h) => h.currentHp === h.maxHp)).toBe(true);
  });

  it("stores seed in meta", () => {
    const config = createDefaultConfig({ seed: "my-custom-seed" });
    const state = initializeGame(config, sampleParty);
    expect(state.meta.seed).toBe("my-custom-seed");
  });
});
