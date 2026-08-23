import { describe, it, expect } from "vitest";
import { resolveRestChoice, calculateScore, checkVictory, checkDefeat } from "../engine/progressionEngine";
import { initializeGame, createDefaultConfig, type PartySetupChoice } from "../engine/gameState";
import { RngEngine } from "../utils/random";
import { startCombat, cleanupCombat } from "../engine/combatEngine";
import { markRoomResolved } from "../engine/rulesEngine";
import type { GameState } from "../types/gameState";

describe("Progression Engine", () => {
  const sampleParty: PartySetupChoice[] = [
    { className: "Bladedancer", suit: "spades", position: 1 },
    { className: "Manipulator", suit: "hearts", position: 2 },
    { className: "Tracker", suit: "clubs", position: 3 },
  ];

  function createTestState(seed = "progression-test"): { state: GameState; rng: RngEngine } {
    const config = createDefaultConfig({ seed });
    const state = initializeGame(config, sampleParty);
    const rng = new RngEngine(seed);
    return { state, rng };
  }

  it("resolveRestChoice choice 1 fully heals living heroes", () => {
    const { state, rng } = createTestState();
    state.party.heroes[0].currentHp = 1;
    const newState = resolveRestChoice(state, 1, rng);
    expect(newState.party.heroes[0].currentHp).toBe(newState.party.heroes[0].maxHp);
  });

  it("resolveRestChoice choice 2 revives first dead hero at 50% HP", () => {
    const { state, rng } = createTestState();
    state.party.heroes[0].alive = false;
    state.party.heroes[0].currentHp = 0;
    const newState = resolveRestChoice(state, 2, rng);
    expect(newState.party.heroes[0].alive).toBe(true);
    expect(newState.party.heroes[0].currentHp).toBe(Math.floor(newState.party.heroes[0].maxHp * 0.5));
  });

  it("resolveRestChoice choice 2 increments revivals stat", () => {
    const { state, rng } = createTestState();
    state.party.heroes[0].alive = false;
    state.party.heroes[0].currentHp = 0;
    const initialRevivals = state.stats.revivals;
    const newState = resolveRestChoice(state, 2, rng);
    expect(newState.stats.revivals).toBe(initialRevivals + 1);
  });

  it("resolveRestChoice choice 3 grants gold based on 2d6 roll", () => {
    const { state, rng } = createTestState();
    const initialGold = state.party.gold;
    const newState = resolveRestChoice(state, 3, rng);
    expect(newState.party.gold).toBeGreaterThan(initialGold);
    expect(newState.stats.goldEarned).toBeGreaterThan(0);
  });

  it("resolveRestChoice choice 4 increases max HP by 2 for all heroes", () => {
    const { state, rng } = createTestState();
    const initialMaxHp = state.party.heroes.map((h) => h.maxHp);
    const newState = resolveRestChoice(state, 4, rng);
    newState.party.heroes.forEach((h, i) => {
      expect(h.maxHp).toBe(initialMaxHp[i] + 2);
    });
  });

  it("calculateScore returns positive score for fresh state", () => {
    const { state } = createTestState();
    const score = calculateScore(state);
    expect(score.finalScore).toBeGreaterThan(0);
    expect(score.baseScore).toBe(1000);
  });

  it("calculateScore gives bonus for alive heroes", () => {
    const { state } = createTestState();
    const score = calculateScore(state);
    expect(score.heroesAlive).toBe(3);
    expect(score.heroesAliveBonus).toBe(3000);
  });

  it("calculateScore reduces score for dead heroes", () => {
    const { state } = createTestState();
    state.party.heroes[0].alive = false;
    const score = calculateScore(state);
    expect(score.heroesAlive).toBe(2);
    expect(score.heroesAliveBonus).toBe(2000);
  });

  it("calculateScore includes gold bonus", () => {
    const { state } = createTestState();
    state.party.gold = 100;
    const score = calculateScore(state);
    expect(score.goldBonus).toBe(1000);
  });

  it("calculateScore includes turn penalty", () => {
    const { state } = createTestState();
    state.stats.totalTurns = 10;
    const score = calculateScore(state);
    expect(score.turnPenalty).toBe(500);
  });

  it("checkVictory returns false for non-final-boss combat", () => {
    const { state, rng } = createTestState();
    const combatState = startCombat(state, rng);
    combatState.combat!.monster.alive = false;
    combatState.combat!.monster.currentHp = 0;
    expect(checkVictory(combatState)).toBe(false);
  });

  it("checkVictory returns true when final boss is dead and heroes alive", () => {
    const { state, rng } = createTestState();
    const combatState = startCombat(state, rng, { isFinalBoss: true });
    combatState.combat!.monster.alive = false;
    combatState.combat!.monster.currentHp = 0;
    expect(checkVictory(combatState)).toBe(true);
  });

  it("checkDefeat returns true when all heroes are dead", () => {
    const { state } = createTestState();
    state.party.heroes.forEach((h) => (h.alive = false));
    expect(checkDefeat(state)).toBe(true);
  });

  it("checkDefeat returns false when at least one hero alive", () => {
    const { state } = createTestState();
    state.party.heroes[0].alive = false;
    state.party.heroes[1].alive = false;
    expect(checkDefeat(state)).toBe(false);
  });
});
