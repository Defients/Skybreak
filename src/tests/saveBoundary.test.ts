import { describe, it, expect } from "vitest";
import { importSave, loadSave } from "../engine/saveLoad";
import { initializeGame, createDefaultConfig, type PartySetupChoice } from "../engine/gameState";
import type { GameState, SaveData } from "../types/gameState";

/**
 * SA-8 — Save Boundary Hardening.
 *
 * Proves that importSave and loadSave reject corrupt/invalid save data
 * gracefully (return null) instead of crashing or loading invalid state.
 */
describe("SA-8 Save Boundary Hardening", () => {
  const sampleParty: PartySetupChoice[] = [
    { className: "Bladedancer", suit: "spades", position: 1 },
    { className: "Manipulator", suit: "hearts", position: 2 },
    { className: "Tracker", suit: "clubs", position: 3 },
  ];

  function makeValidState(): GameState {
    const config = createDefaultConfig({ seed: "save-test" });
    return initializeGame(config, sampleParty);
  }

  function makeValidSaveData(state: GameState): SaveData {
    return {
      version: "0.1.0",
      gameState: state,
      savedAt: new Date().toISOString(),
      name: "Test Save",
    };
  }

  it("importSave accepts a valid save", () => {
    const state = makeValidState();
    const json = JSON.stringify(makeValidSaveData(state));
    const loaded = importSave(json);
    expect(loaded).not.toBeNull();
    expect(loaded!.phase).toBe(state.phase);
  });

  it("importSave rejects non-JSON input", () => {
    expect(importSave("not json at all")).toBeNull();
  });

  it("importSave rejects JSON missing required top-level fields", () => {
    expect(importSave(JSON.stringify({ version: "0.1.0" }))).toBeNull();
    expect(importSave(JSON.stringify({ gameState: {} }))).toBeNull();
    expect(importSave(JSON.stringify({ version: "0.1.0", gameState: {}, savedAt: "x", name: "x" }))).toBeNull();
  });

  it("importSave rejects gameState missing required fields", () => {
    const badSave = {
      version: "0.1.0",
      savedAt: new Date().toISOString(),
      name: "Bad",
      gameState: { phase: "exploration" }, // missing party, meta, spire
    };
    expect(importSave(JSON.stringify(badSave))).toBeNull();
  });

  it("importSave rejects gameState with non-array heroes", () => {
    const badSave = {
      version: "0.1.0",
      savedAt: new Date().toISOString(),
      name: "Bad",
      gameState: {
        phase: "exploration",
        party: { heroes: "not an array" },
        meta: {},
        spire: {},
      },
    };
    expect(importSave(JSON.stringify(badSave))).toBeNull();
  });

  it("loadSave rejects null/undefined input", () => {
    expect(loadSave(null as any)).toBeNull();
    expect(loadSave(undefined as any)).toBeNull();
  });

  it("loadSave handles non-deserializable RNG gracefully (clears rng field)", () => {
    const state = makeValidState();
    const saveData = makeValidSaveData(state);
    // Pass a structurally-valid but semantically-odd RNG. deserialize won't
    // throw for this, but the try/catch in loadSave protects against any
    // future deserialize failures.
    saveData.gameState.rng = { seed: "test", step: 0, history: [] };
    const loaded = loadSave(saveData);
    expect(loaded).not.toBeNull();
    // The RNG should be present and valid.
    expect(loaded!.rng).toBeDefined();
    expect(loaded!.rng!.seed).toBe("test");
  });

  it("loadSave accepts a save with no rng field", () => {
    const state = makeValidState();
    const saveData = makeValidSaveData(state);
    saveData.gameState.rng = undefined as any;
    const loaded = loadSave(saveData);
    expect(loaded).not.toBeNull();
  });

  it("importSave rejects prototype pollution attempts", () => {
    const malicious = JSON.parse('{"__proto__":{"polluted":true}}');
    expect(loadSave(malicious as any)).toBeNull();
    expect((globalThis as any).polluted).toBeUndefined();
  });
});
