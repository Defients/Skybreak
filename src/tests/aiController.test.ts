import { describe, it, expect } from "vitest";
import { initializeGame, createDefaultConfig, type PartySetupChoice } from "../engine/gameState";
import { RngEngine } from "../utils/random";
import { aiPlayHeroTurn, aiPickSplitChoice, aiRestChoice, aiMerchantActions } from "../engine/aiController";
import type { GameState } from "../types/gameState";

const sampleParty: PartySetupChoice[] = [
  { className: "Bladedancer", suit: "spades", position: 1 },
  { className: "Manipulator", suit: "hearts", position: 2 },
  { className: "Tracker", suit: "clubs", position: 3 },
];

function makeState(): GameState {
  const config = createDefaultConfig({ seed: "test-ai", mode: "simulation" });
  return initializeGame(config, sampleParty);
}

function makeRng() {
  return new RngEngine("test-ai");
}

function withCombat(state: GameState, heroOverrides?: Record<string, any>): GameState {
  const hero = state.party.heroes[0];
  const heroes = heroOverrides
    ? state.party.heroes.map(h => heroOverrides[h.id] ? { ...h, ...heroOverrides[h.id] } : h)
    : state.party.heroes;
  return {
    ...state,
    party: { ...state.party, heroes },
    phase: "combat",
    combat: {
      id: "test-combat",
      round: 1,
      turnCount: 1,
      activeSide: "heroes",
      monster: {
        id: "monster-1",
        name: "Test Monster",
        currentHp: 10,
        maxHp: 10,
        alive: true,
        apcs: [],
        tokens: [],
        specialState: {},
        isSummoned: false,
      },
      summons: [],
      environment: { suit: "", name: "", effect: "", description: "" },
      heroTurnOrder: [hero.id],
      completedHeroTurns: [],
      cardFlips: [],
      damageEvents: [],
      perfectCombatEligible: true,
      isElite: false,
      isMiniBoss: false,
      isFinalBoss: false,
      roundsWithoutProgress: 0,
      lastHpSnapshot: { monsterHp: 10, totalHeroHp: 30 },
    } as any,
  };
}

describe("AI Controller", () => {
  describe("aiPlayHeroTurn", () => {
    it("returns end_turn when no combat is active", () => {
      const state = makeState();
      const rng = makeRng();
      const hero = state.party.heroes[0];
      const decision = aiPlayHeroTurn(state, rng, hero.id);
      expect(decision.action).toBe("end_turn");
    });

    it("returns attack action for aggressive strategy", () => {
      const state = withCombat(makeState());
      const rng = makeRng();
      const hero = state.party.heroes[0];
      const decision = aiPlayHeroTurn(state, rng, hero.id, "aggressive");
      expect(decision.action).toBe("attack");
      expect(decision.targetId).toBe("monster-1");
    });

    it("returns use_item when HP is low and potion available", () => {
      const baseState = makeState();
      const state = withCombat(baseState, {
        [baseState.party.heroes[0].id]: {
          currentHp: 2,
          maxHp: 10,
          items: [{ id: "item-1", name: "Minor Potion", quantity: 1, effect: "Heal 8", stackLimit: 3 }],
        },
      });
      const rng = makeRng();
      const hero = state.party.heroes[0];
      const decision = aiPlayHeroTurn(state, rng, hero.id, "balanced");
      expect(decision.action).toBe("use_item");
      expect(decision.itemName).toBe("Minor Potion");
    });

    it("returns end_turn for dead hero", () => {
      const state = makeState();
      const rng = makeRng();
      const deadHero = { ...state.party.heroes[0], alive: false };
      const newState = { ...state, party: { ...state.party, heroes: [deadHero, ...state.party.heroes.slice(1)] } };
      const decision = aiPlayHeroTurn(newState, rng, deadHero.id);
      expect(decision.action).toBe("end_turn");
    });
  });

  describe("aiPickSplitChoice", () => {
    it("returns 0 when no split options", () => {
      const state = makeState();
      const rng = makeRng();
      const result = aiPickSplitChoice(state, rng, "safe");
      expect(result).toBe(0);
    });
  });

  describe("aiRestChoice", () => {
    it("returns full-heal (1) by default", () => {
      const state = makeState();
      const rng = makeRng();
      const result = aiRestChoice(state, rng, "full-heal");
      expect(result).toBe(1);
    });

    it("returns gold (3) when strategy is gold", () => {
      const state = makeState();
      const rng = makeRng();
      const result = aiRestChoice(state, rng, "gold");
      expect(result).toBe(3);
    });

    it("returns max-hp (4) when strategy is max-hp", () => {
      const state = makeState();
      const rng = makeRng();
      const result = aiRestChoice(state, rng, "max-hp");
      expect(result).toBe(4);
    });

    it("returns revive (2) when heroes are dead", () => {
      const state = makeState();
      const rng = makeRng();
      const deadHero = { ...state.party.heroes[0], alive: false };
      const newState = { ...state, party: { ...state.party, heroes: [deadHero, ...state.party.heroes.slice(1)] } };
      const result = aiRestChoice(newState, rng, "revive");
      expect(result).toBe(2);
    });
  });

  describe("aiMerchantActions", () => {
    it("returns empty array for skip strategy", () => {
      const state = makeState();
      const result = aiMerchantActions(state, "skip");
      expect(result).toHaveLength(0);
    });

    it("returns empty array when no living heroes", () => {
      const state = makeState();
      const deadHeroes = state.party.heroes.map(h => ({ ...h, alive: false }));
      const newState = { ...state, party: { ...state.party, heroes: deadHeroes } };
      const result = aiMerchantActions(newState, "balanced");
      expect(result).toHaveLength(0);
    });
  });
});
