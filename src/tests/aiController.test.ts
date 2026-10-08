import { describe, it, expect } from "vitest";
import { initializeGame, createDefaultConfig, type PartySetupChoice } from "../engine/gameState";
import { RngEngine } from "../utils/random";
import { aiPlayHeroTurn, aiPickSplitChoice, aiRestChoice, aiMerchantActions } from "../engine/aiController";
import { runCombatStep } from "../engine/combatRunner";
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

  // ─── Stage 1 / Task D — random-legal AI correctness ──────────────────────
  //
  // The old item pick used Math.floor((roll / 6) * items.length), which
  // returns items.length on a d6 of 6 — an out-of-bounds index. These tests
  // sweep every die result across inventory sizes and prove only legal
  // decisions are produced.
  describe("random-legal strategy", () => {
    const ITEM_POOL = [
      { name: "Minor Potion", itemId: "minor_potion", tags: ["minor_potion", "healing"] },
      { name: "Bomb", itemId: "bomb", tags: ["bomb"] },
      { name: "Shield Charm", itemId: "shield_charm", tags: ["shield_charm"] },
      { name: "Power Scroll", itemId: "power_scroll", tags: ["power_scroll"] },
      { name: "Mystic Rune", itemId: "mystic_rune", tags: ["mystic_rune"] },
      { name: "Guardian Angel", itemId: "guardian_angel", tags: ["guardian_angel"] },
    ];

    function makeItems(count: number, quantity = 1) {
      return ITEM_POOL.slice(0, count).map((t, i) => ({
        id: `item-${i}`,
        name: t.name,
        itemId: t.itemId,
        effect: "",
        stackLimit: 5,
        quantity,
        tags: t.tags,
      }));
    }

    function stateWithItems(items: any[], extraHero: Record<string, any> = {}) {
      const base = makeState();
      const heroId = base.party.heroes[0].id;
      return withCombat(base, { [heroId]: { items, ...extraHero } });
    }

    /** Force the two dice consumed by random-legal: choice=1 (use item), pick=v. */
    function rngForItemPick(pick: number): RngEngine {
      const rng = new RngEngine("rl-test");
      rng.forceResult(0, 0.01);            // ai_random_choice → d6 = 1
      rng.forceResult(1, (pick - 1) / 6);  // ai_item_pick → d6 = pick
      return rng;
    }

    it("never produces an out-of-bounds item index — every pick roll × every size", () => {
      for (let size = 1; size <= 6; size++) {
        const items = makeItems(size);
        const state = stateWithItems(items);
        const heroId = state.party.heroes[0].id;
        for (let pick = 1; pick <= 6; pick++) {
          const decision = aiPlayHeroTurn(state, rngForItemPick(pick), heroId, "random-legal");
          expect(decision.action).toBe("use_item");
          // The chosen item must be an actual inventory entry.
          const names = items.map(i => i.name);
          expect(names).toContain(decision.itemName);
        }
      }
    });

    it("d6=6 selects a real item instead of indexing past the array", () => {
      const items = makeItems(3);
      const state = stateWithItems(items);
      const heroId = state.party.heroes[0].id;
      // (6 - 1) % 3 = 2 → last item.
      const decision = aiPlayHeroTurn(state, rngForItemPick(6), heroId, "random-legal");
      expect(decision.action).toBe("use_item");
      expect(decision.itemName).toBe("Shield Charm");
    });

    it("attacks when the inventory is empty", () => {
      const state = stateWithItems([]);
      const heroId = state.party.heroes[0].id;
      const rng = new RngEngine("rl-empty");
      rng.forceResult(0, 0.01); // choice roll = 1
      const decision = aiPlayHeroTurn(state, rng, heroId, "random-legal");
      expect(decision.action).toBe("attack");
    });

    it("skips zero-quantity items — they are not legal choices", () => {
      const items = [
        { id: "spent", name: "Minor Potion", itemId: "minor_potion", effect: "", stackLimit: 5, quantity: 0, tags: ["minor_potion"] },
        { id: "live", name: "Bomb", itemId: "bomb", effect: "", stackLimit: 5, quantity: 1, tags: ["bomb"] },
      ];
      const state = stateWithItems(items);
      const heroId = state.party.heroes[0].id;
      for (let pick = 1; pick <= 6; pick++) {
        const decision = aiPlayHeroTurn(state, rngForItemPick(pick), heroId, "random-legal");
        expect(decision.action).toBe("use_item");
        expect(decision.itemName).toBe("Bomb");
      }
    });

    it("targets the hero for self items and the monster for offensive items", () => {
      const heroPotion = stateWithItems(makeItems(1)); // Minor Potion
      const heroId = heroPotion.party.heroes[0].id;
      const potionDecision = aiPlayHeroTurn(heroPotion, rngForItemPick(1), heroId, "random-legal");
      expect(potionDecision.action).toBe("use_item");
      expect(potionDecision.targetId).toBe(heroId);

      const bombState = stateWithItems([makeItems(2)[1]]); // Bomb only
      const bombDecision = aiPlayHeroTurn(bombState, rngForItemPick(1), heroId, "random-legal");
      expect(bombDecision.action).toBe("use_item");
      expect(bombDecision.itemName).toBe("Bomb");
      expect(bombDecision.targetId).toBe("monster-1");
    });

    it("targets the monster for Mystic Rune so spec abilities hit the enemy", () => {
      const rune = stateWithItems([makeItems(5)[4]]); // Mystic Rune only
      const heroId = rune.party.heroes[0].id;
      const decision = aiPlayHeroTurn(rune, rngForItemPick(1), heroId, "random-legal");
      expect(decision.action).toBe("use_item");
      expect(decision.targetId).toBe("monster-1");
    });

    it("does not offer item use while items are disabled for the hero", () => {
      const state = stateWithItems(makeItems(2), { perTurnFlags: { itemsDisabled: true } });
      const heroId = state.party.heroes[0].id;
      const rng = new RngEngine("rl-disabled");
      rng.forceResult(0, 0.01); // choice roll = 1
      const decision = aiPlayHeroTurn(state, rng, heroId, "random-legal");
      expect(decision.action).toBe("attack");
    });

    it("treats Mystic Rune as illegal once the specialization was triggered", () => {
      const state = stateWithItems([makeItems(5)[4]], {
        oncePerCombat: { specializationTriggered: true },
      });
      const heroId = state.party.heroes[0].id;
      const rng = new RngEngine("rl-rune-spent");
      rng.forceResult(0, 0.01);
      const decision = aiPlayHeroTurn(state, rng, heroId, "random-legal");
      expect(decision.action).toBe("attack");
    });

    it("is deterministic — identical seeds produce identical decisions", () => {
      const state = stateWithItems(makeItems(4));
      const heroId = state.party.heroes[0].id;
      const decisionsA: string[] = [];
      const decisionsB: string[] = [];
      const rngA = new RngEngine("rl-replay");
      const rngB = new RngEngine("rl-replay");
      for (let i = 0; i < 20; i++) {
        decisionsA.push(JSON.stringify(aiPlayHeroTurn(state, rngA, heroId, "random-legal")));
        decisionsB.push(JSON.stringify(aiPlayHeroTurn(state, rngB, heroId, "random-legal")));
      }
      expect(decisionsA).toEqual(decisionsB);
    });

    it("executes a randomly chosen item through the shared runner as a free action", () => {
      // Integration check: the decision path (aiPlayHeroTurn) and execution
      // path (runCombatStep → executeAiHeroDecision → useItem) stay in
      // agreement — the chosen item actually exists and is consumable.
      const items = makeItems(3);
      const state = stateWithItems(items);
      const heroId = state.party.heroes[0].id;
      const rng = new RngEngine("rl-exec");
      rng.forceResult(0, 0.01);  // ai_random_choice → use item
      rng.forceResult(1, 5 / 6); // ai_item_pick → d6 = 6 → (6-1)%3 = index 2
      const cfg = { combatStrategy: "random-legal" as const, itemUsageStrategy: "conservative" as const };

      const after = runCombatStep(state, rng, cfg);

      // A supported item was consumed and its real shields were applied.
      const hero = after.party.heroes.find(h => h.id === heroId)!;
      expect(hero.items.some(i => i.name === "Shield Charm")).toBe(false);
      expect(hero.tokens.filter(t => t.type === "shield")).toHaveLength(2);
      // Items are free actions — the hero's turn is still open.
      expect(after.combat!.completedHeroTurns).not.toContain(heroId);
      expect(after.combat!.activeSide).toBe("heroes");
    });
  });
});
