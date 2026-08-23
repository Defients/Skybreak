import { describe, it, expect } from "vitest";
import { initializeGame, createDefaultConfig, type PartySetupChoice } from "../engine/gameState";
import { suggestCombatAction, suggestRestChoice, suggestSplitChoice, suggestMerchantAction } from "../engine/aiAdvisor";
import type { GameState } from "../types/gameState";

const sampleParty: PartySetupChoice[] = [
  { className: "Bladedancer", suit: "spades", position: 1 },
  { className: "Manipulator", suit: "hearts", position: 2 },
  { className: "Tracker", suit: "clubs", position: 3 },
];

function makeState(): GameState {
  const config = createDefaultConfig({ seed: "test-advisor", mode: "companion" });
  return initializeGame(config, sampleParty);
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

describe("AI Advisor", () => {
  describe("suggestCombatAction", () => {
    it("returns end_turn when no combat is active", () => {
      const state = makeState();
      const hero = state.party.heroes[0];
      const suggestion = suggestCombatAction(state, hero.id);
      expect(suggestion.action).toBe("end_turn");
    });

    it("suggests attack when monster HP is low", () => {
      const baseState = makeState();
      const state = withCombat(baseState);
      // Override monster HP to be low
      state.combat!.monster.currentHp = 2;
      const hero = state.party.heroes[0];
      const suggestion = suggestCombatAction(state, hero.id);
      expect(suggestion.action).toBe("attack");
      expect(suggestion.reason).toContain("2/10");
    });

    it("suggests use_item when HP is critically low", () => {
      const baseState = makeState();
      const state = withCombat(baseState, {
        [baseState.party.heroes[0].id]: {
          currentHp: 2,
          maxHp: 10,
          items: [{ id: "item-1", name: "Minor Potion", quantity: 1, effect: "Heal 8", stackLimit: 3 }],
        },
      });
      const hero = state.party.heroes[0];
      const suggestion = suggestCombatAction(state, hero.id);
      expect(suggestion.action).toBe("use_item");
      expect(suggestion.itemName).toBe("Minor Potion");
    });
  });

  describe("suggestRestChoice", () => {
    it("suggests full-heal when heroes are injured", () => {
      const state = makeState();
      const injuredHero = { ...state.party.heroes[0], currentHp: 3, maxHp: 10 };
      const newState = { ...state, party: { ...state.party, heroes: [injuredHero, ...state.party.heroes.slice(1)] } };
      const suggestion = suggestRestChoice(newState);
      expect(suggestion.choice).toBe(1);
      expect(suggestion.reason).toContain("injured");
    });

    it("suggests revive when heroes are dead", () => {
      const state = makeState();
      const deadHero = { ...state.party.heroes[0], alive: false };
      const newState = { ...state, party: { ...state.party, heroes: [deadHero, ...state.party.heroes.slice(1)] } };
      const suggestion = suggestRestChoice(newState);
      expect(suggestion.choice).toBe(2);
      expect(suggestion.reason).toContain("dead");
    });

    it("suggests max-hp in tier 2+ when all healthy", () => {
      const state = makeState();
      const tier2State = {
        ...state,
        spire: { ...state.spire, tier: 2 as const },
      };
      const suggestion = suggestRestChoice(tier2State);
      expect(suggestion.choice).toBe(4);
    });

    it("suggests gold in tier 1 when all healthy", () => {
      const state = makeState();
      const suggestion = suggestRestChoice(state);
      expect(suggestion.choice).toBe(3);
      expect(suggestion.reason).toContain("Gold");
    });
  });

  describe("suggestSplitChoice", () => {
    it("returns index 0 when no split options", () => {
      const state = makeState();
      const suggestion = suggestSplitChoice(state);
      expect(suggestion.index).toBe(0);
    });
  });

  describe("suggestMerchantAction", () => {
    it("returns skip when no merchant", () => {
      const state = makeState();
      const suggestion = suggestMerchantAction(state);
      expect(suggestion.type).toBe("skip");
    });
  });
});
