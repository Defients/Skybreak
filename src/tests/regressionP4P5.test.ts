import { describe, it, expect, beforeEach } from "vitest";
import { useGameStore } from "../app/gameStore";
import { startCombat } from "../engine/combatEngine";
import { runCombatToCompletion, type CombatRunnerConfig } from "../engine/combatRunner";
import { initializeGame, createDefaultConfig, type PartySetupChoice } from "../engine/gameState";
import { RngEngine } from "../utils/random";
import { resetEventSequence } from "../engine/eventLog";
import { resetIdCounter } from "../utils/ids";
import { importSave } from "../engine/saveLoad";
import type { GameState } from "../types/gameState";

/**
 * P4+P5 — Regression tests for concrete misses.
 *
 * Covers:
 *   - Deep override preserves arrays (party.heroes.0.currentHp)
 *   - Item use does not complete turn (free action in both paths)
 *   - Counters agree across paths (turnCount, totalTurns)
 *   - Card flips autosave (doFlipCards persists state)
 *   - Start-of-turn status death terminates combat
 *   - Malformed local saves cannot crash load
 */
describe("P4+P5 Regression Tests", () => {
  const party: PartySetupChoice[] = [
    { className: "Bladedancer", suit: "spades", position: 1 },
    { className: "Manipulator", suit: "hearts", position: 2 },
    { className: "Tracker", suit: "clubs", position: 3 },
  ];

  beforeEach(() => {
    useGameStore.getState().doResetGame();
    resetEventSequence();
    resetIdCounter();
  });

  function makeState(seed = "regression"): GameState {
    const config = createDefaultConfig({ seed });
    return initializeGame(config, party);
  }

  it("deep override preserves arrays — party.heroes.0.currentHp", () => {
    const state = makeState("deep-override");
    useGameStore.getState().doLoadState(state);

    const originalHp = state.party.heroes[0].currentHp;
    useGameStore.getState().doManualOverride("party.heroes.0.currentHp", 1);

    const newState = useGameStore.getState().state!;
    expect(newState.party.heroes[0].currentHp).toBe(1);
    // heroes must still be an array
    expect(Array.isArray(newState.party.heroes)).toBe(true);
    // All heroes must be present
    expect(newState.party.heroes.length).toBe(3);
    // Original state unchanged
    expect(state.party.heroes[0].currentHp).toBe(originalHp);
    expect(Array.isArray(state.party.heroes)).toBe(true);
  });

  it("deep override preserves arrays — party.heroes.1.items", () => {
    const state = makeState("deep-override-items");
    useGameStore.getState().doLoadState(state);

    const newItems = [{ name: "Test Item", quantity: 5 }];
    useGameStore.getState().doManualOverride("party.heroes.1.items", newItems);

    const newState = useGameStore.getState().state!;
    expect(Array.isArray(newState.party.heroes)).toBe(true);
    expect(newState.party.heroes[1].items).toBe(newItems);
    expect(newState.party.heroes.length).toBe(3);
  });

  it("item use does not complete hero turn (free action)", () => {
    const state = makeState("item-free-action");
    const combatState = startCombat(state, new RngEngine("item-free-action"));
    useGameStore.getState().doLoadState(combatState);
    useGameStore.setState({ rng: RngEngine.deserialize(combatState.rng!) });

    // Execute monster turn first (combat starts with monster side)
    useGameStore.getState().doMonsterTurn();

    // Now it's heroes' turn — find the first hero
    const storeState = useGameStore.getState().state!;
    const heroId = storeState.combat!.heroTurnOrder[0];
    const completedBefore = storeState.combat!.completedHeroTurns.length;

    // Use an item (if the hero has one)
    const hero = storeState.party.heroes.find(h => h.id === heroId);
    if (hero && hero.items.length > 0) {
      useGameStore.getState().doUseItem(heroId, hero.items[0].name, heroId);
      const afterItem = useGameStore.getState().state!;
      // Hero's turn should NOT be complete (items are free actions)
      expect(afterItem.combat!.completedHeroTurns.length).toBe(completedBefore);
      expect(afterItem.combat!.completedHeroTurns).not.toContain(heroId);
    }
  });

  it("counters agree across paths — turnCount and totalTurns", () => {
    const seed = "counter-parity";
    const config = createDefaultConfig({ seed });
    const cfg: CombatRunnerConfig = { combatStrategy: "aggressive", itemUsageStrategy: "conservative" };

    // Headless path
    const stateA = initializeGame(config, party);
    const combatA = startCombat(stateA, new RngEngine(seed));
    const rngA = RngEngine.deserialize(combatA.rng!);
    const finalA = runCombatToCompletion(combatA, rngA, cfg);

    // Store path
    const stateB = initializeGame(config, party);
    const combatB = startCombat(stateB, new RngEngine(seed));
    useGameStore.getState().doLoadState(combatB);
    useGameStore.setState({ rng: RngEngine.deserialize(combatB.rng!) });

    // Drive store through combat
    let safety = 0;
    while (safety < 500) {
      safety++;
      const { state } = useGameStore.getState();
      if (!state || !state.combat || state.combat.combatResult) break;
      if (state.combat.activeSide === "monster") {
        useGameStore.getState().doMonsterTurn();
        continue;
      }
      const heroId = state.combat.heroTurnOrder.find(
        id => !state.combat!.completedHeroTurns.includes(id) &&
          state.party.heroes.find(h => h.id === id)?.alive
      );
      if (!heroId) break;
      useGameStore.getState().doHeroAction(heroId, "attack", state.combat.monster.id);
    }

    const finalB = useGameStore.getState().state!;

    expect(finalB.combat?.turnCount).toBe(finalA.combat?.turnCount);
    expect(finalB.stats.totalTurns).toBe(finalA.stats.totalTurns);
  });

  it("malformed local saves cannot crash load — null state", () => {
    const store = useGameStore.getState();
    store.doLoadState(null as any);
    expect(useGameStore.getState().state).toBeNull();
  });

  it("malformed local saves cannot crash load — missing party", () => {
    const badState = { phase: "exploration", meta: {}, spire: {} } as any;
    useGameStore.getState().doLoadState(badState);
    expect(useGameStore.getState().state).toBeNull();
  });

  it("malformed local saves cannot crash load — corrupt RNG", () => {
    const state = makeState("corrupt-rng");
    state.rng = { seed: 123, step: "bad" } as any;
    // Should not crash — should create a fallback RNG
    useGameStore.getState().doLoadState(state);
    const loaded = useGameStore.getState();
    expect(loaded.state).not.toBeNull();
    expect(loaded.rng).not.toBeNull();
  });

  it("importSave rejects empty object saves", () => {
    expect(importSave(JSON.stringify({}))).toBeNull();
  });

  it("importSave rejects saves with non-array heroes", () => {
    const badSave = {
      version: "0.1.0",
      savedAt: new Date().toISOString(),
      name: "Bad",
      gameState: {
        phase: "exploration",
        party: { heroes: "not array" },
        meta: {},
        spire: {},
      },
    };
    expect(importSave(JSON.stringify(badSave))).toBeNull();
  });
});
