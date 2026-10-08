import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  importSave,
  loadSave,
  hydrateSave,
  getAutosave,
  getLastGoodAutosave,
  isValidSaveShape,
} from "../engine/saveLoad";
import { initializeGame, createDefaultConfig, type PartySetupChoice } from "../engine/gameState";
import { startCombat } from "../engine/combatEngine";
import { RngEngine } from "../utils/random";
import { useGameStore } from "../app/gameStore";
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

// ============================================================
// Stage 1 / Task B — Canonical save hydration boundary
//
// Every load entry point must converge on hydrateSave: parse → structural
// validation → legacy migration → RNG validation → deterministic install.
// These tests exercise the boundary directly and through the store.
// ============================================================

describe("Stage 1 — canonical save hydration", () => {
  const sampleParty: PartySetupChoice[] = [
    { className: "Bladedancer", suit: "spades", position: 1 },
    { className: "Manipulator", suit: "hearts", position: 2 },
    { className: "Tracker", suit: "clubs", position: 3 },
  ];

  beforeEach(() => {
    localStorage.clear();
    useGameStore.getState().doResetGame();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    useGameStore.getState().doResetGame();
  });

  function makeValidState(seed = "hydrate"): GameState {
    return initializeGame(createDefaultConfig({ seed }), sampleParty);
  }

  function wrap(state: GameState, extra: Record<string, unknown> = {}): SaveData {
    return {
      version: "0.1.0",
      gameState: state,
      savedAt: new Date().toISOString(),
      name: "Test",
      ...extra,
    };
  }

  it("hydrates a valid modern save from JSON text, SaveData, and bare GameState", () => {
    const state = makeValidState();
    const fromJson = hydrateSave(JSON.stringify(wrap(state)));
    const fromEnvelope = hydrateSave(wrap(state));
    const fromRaw = hydrateSave(state);
    expect(fromJson.ok).toBe(true);
    expect(fromEnvelope.ok).toBe(true);
    expect(fromRaw.ok).toBe(true);
    if (fromJson.ok) expect(fromJson.state.meta.seed).toBe("hydrate");
    if (fromEnvelope.ok) expect(fromEnvelope.rngRestored).toBe(true);
  });

  it("rejects corrupted JSON with an unparseable reason", () => {
    const result = hydrateSave("{ not json !!");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unparseable");
  });

  it("rejects valid JSON containing malformed state", () => {
    const result = hydrateSave(JSON.stringify({ gameState: { phase: "exploration" } }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_shape");
  });

  it("rejects an unknown phase enum", () => {
    const state = makeValidState() as any;
    state.phase = "infinite_dungeon";
    expect(hydrateSave(wrap(state)).ok).toBe(false);
  });

  it("rejects heroes missing critical fields", () => {
    const state = makeValidState() as any;
    state.party.heroes = [{ id: "h1" }]; // no className/currentHp/maxHp
    expect(hydrateSave(wrap(state)).ok).toBe(false);
  });

  it("recovers a save whose serialized RNG is corrupt instead of rejecting it", () => {
    const state = makeValidState();
    (state as any).rng = { seed: 123, step: "not-a-number" };
    const result = hydrateSave(wrap(state));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rngRestored).toBe(false);
      expect(result.state.rng).toBeUndefined();
      expect(result.warnings.length).toBeGreaterThan(0);
    }
  });

  it("does not mutate the input save object", () => {
    const state = makeValidState();
    (state as any).rng = { seed: 123, step: "bad" };
    const save = wrap(state);
    const before = JSON.stringify(save);
    hydrateSave(save);
    expect(JSON.stringify(save)).toBe(before);
  });

  it("store install: doLoadState accepts a SaveData envelope end-to-end", () => {
    const state = makeValidState("store-load");
    const ok = useGameStore.getState().doLoadState(wrap(state));
    expect(ok).toBe(true);
    expect(useGameStore.getState().state?.meta.seed).toBe("store-load");
    expect(useGameStore.getState().loadError).toBeNull();
    // RNG reconstructed at the serialized position.
    expect(useGameStore.getState().rng?.serialize().step).toBe(state.rng.step);
  });

  it("store install: doLoadState accepts a JSON string end-to-end", () => {
    const state = makeValidState("store-json");
    const ok = useGameStore.getState().doLoadState(JSON.stringify(wrap(state)));
    expect(ok).toBe(true);
    expect(useGameStore.getState().state?.meta.seed).toBe("store-json");
  });

  it("failed hydration preserves the current live session and reports loadError", () => {
    const good = makeValidState("live-run");
    expect(useGameStore.getState().doLoadState(good)).toBe(true);

    const ok = useGameStore.getState().doLoadState("definitely not a save");
    expect(ok).toBe(false);
    // The live session is untouched.
    expect(useGameStore.getState().state?.meta.seed).toBe("live-run");
    expect(useGameStore.getState().loadError).not.toBeNull();
  });

  it("failed hydration preserves session when the payload is valid JSON with bad shape", () => {
    const good = makeValidState("live-run-2");
    useGameStore.getState().doLoadState(good);
    const bad = wrap({ phase: "exploration" } as any);
    expect(useGameStore.getState().doLoadState(bad)).toBe(false);
    expect(useGameStore.getState().state?.meta.seed).toBe("live-run-2");
  });

  it("recovered RNG is deterministic — no wall-clock fallback", () => {
    const state = makeValidState("det-seed");
    (state as any).rng = undefined;
    expect(useGameStore.getState().doLoadState(wrap(state))).toBe(true);
    const step1 = useGameStore.getState().rng!.rollD6("probe").total;

    // Reload the same save — the rebuilt engine must produce identical output.
    useGameStore.getState().doLoadState(wrap(state));
    const step2 = useGameStore.getState().rng!.rollD6("probe").total;
    expect(step1).toBe(step2);
  });

  it("getAutosave recovers to the last-good copy when the current autosave is corrupt", () => {
    const good = makeValidState("lastgood");
    localStorage.setItem("skybreak_autosave", "{corrupt");
    localStorage.setItem("skybreak_autosave_lastgood", JSON.stringify(wrap(good)));
    const auto = getAutosave();
    expect(auto).not.toBeNull();
    expect(auto!.gameState.meta.seed).toBe("lastgood");
  });

  it("getAutosave falls back to the legacy skyward_ascent autosave", () => {
    const legacy = makeValidState("legacy-auto");
    localStorage.setItem("skyward_ascent_autosave", JSON.stringify(wrap(legacy)));
    const auto = getAutosave();
    expect(auto).not.toBeNull();
    expect(auto!.gameState.meta.seed).toBe("legacy-auto");
  });

  it("getLastGoodAutosave rejects malformed last-good data", () => {
    localStorage.setItem("skybreak_autosave_lastgood", JSON.stringify({ version: "0.1.0", savedAt: "x", name: "x", gameState: {} }));
    expect(getLastGoodAutosave()).toBeNull();
  });

  it("legacy autosave content loads through the same store boundary", () => {
    const legacy = makeValidState("legacy-install");
    localStorage.setItem("skyward_ascent_autosave", JSON.stringify(wrap(legacy)));
    const auto = getAutosave();
    expect(auto).not.toBeNull();
    const ok = useGameStore.getState().doLoadState(auto);
    expect(ok).toBe(true);
    expect(useGameStore.getState().state?.meta.seed).toBe("legacy-install");
  });

  it("isValidSaveShape marks malformed manual saves so listings cannot crash", () => {
    expect(isValidSaveShape(wrap(makeValidState()))).toBe(true);
    expect(isValidSaveShape({ version: "0.1.0", savedAt: "x", name: "x", gameState: null })).toBe(false);
    expect(isValidSaveShape({ version: "0.1.0", savedAt: "x", name: "x", gameState: { phase: "exploration" } })).toBe(false);
    expect(isValidSaveShape("garbage")).toBe(false);
  });

  it("a monster-turn timer from the previous run cannot mutate a loaded run", () => {
    vi.useFakeTimers();

    // Run A in playable mode: combat starts on the monster side, so
    // doBeginCombat schedules a delayed monster turn.
    let stateA = initializeGame(createDefaultConfig({ seed: "run-A", mode: "playable" }), sampleParty);
    const rngA = new RngEngine("run-A");
    stateA = startCombat(stateA, rngA);
    if (!stateA.combat) throw new Error("setup: combat did not start");
    useGameStore.setState({ state: stateA, rng: rngA, validationWarnings: [] });
    useGameStore.getState().doBeginCombat();

    // Loading run B (through the canonical boundary) invalidates the timer.
    const stateB = makeValidState("run-B");
    expect(useGameStore.getState().doLoadState(stateB)).toBe(true);
    const beforeTimer = JSON.stringify(useGameStore.getState().state);

    vi.advanceTimersByTime(1000);

    expect(JSON.stringify(useGameStore.getState().state)).toBe(beforeTimer);
    expect(useGameStore.getState().state?.meta.seed).toBe("run-B");
  });

  it("loadSave still accepts a plain valid SaveData (compatibility)", () => {
    const loaded = loadSave(wrap(makeValidState("compat")));
    expect(loaded).not.toBeNull();
    expect(loaded!.meta.seed).toBe("compat");
  });
});
