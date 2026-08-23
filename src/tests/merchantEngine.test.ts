import { describe, it, expect } from "vitest";
import { buyItem, buyUpgrade, enterMerchant } from "../engine/merchantEngine";
import { useItem } from "../engine/heroAbilityEngine";
import { startCombat } from "../engine/combatEngine";
import { initializeGame, createDefaultConfig, type PartySetupChoice } from "../engine/gameState";
import { RngEngine } from "../utils/random";
import { ITEMS } from "../data/items";
import { PERMANENT_UPGRADES } from "../data/items";
import type { GameState } from "../types/gameState";

describe("Merchant Engine — Upgrade Limits", () => {
  const sampleParty: PartySetupChoice[] = [
    { className: "Bladedancer", suit: "spades", position: 1 },
    { className: "Manipulator", suit: "hearts", position: 2 },
    { className: "Tracker", suit: "clubs", position: 3 },
  ];

  function createMerchantState(seed = "merchant-test", gold = 9999): GameState {
    const config = createDefaultConfig({ seed });
    const state = initializeGame(config, sampleParty);
    const withGold: GameState = { ...state, party: { ...state.party, gold } };
    return enterMerchant(withGold);
  }

  it("HP Increase: allows up to 3 per hero, blocks 4th", () => {
    const state = createMerchantState("hp-limit");
    const heroId = state.party.heroes[0].id;

    // Buy 3 HP Increases
    let s = state;
    for (let i = 0; i < 3; i++) {
      s = buyUpgrade(s, "HP Increase", heroId);
    }
    const heroAfter3 = s.party.heroes[0];
    expect(heroAfter3.upgrades.filter(u => u.name === "HP Increase").length).toBe(3);

    // 4th should be blocked
    const s4 = buyUpgrade(s, "HP Increase", heroId);
    const heroAfter4 = s4.party.heroes[0];
    expect(heroAfter4.upgrades.filter(u => u.name === "HP Increase").length).toBe(3);
  });

  it("Lucky Dice: allows 1 per hero, blocks 2nd", () => {
    const state = createMerchantState("ld-limit");
    const heroId = state.party.heroes[0].id;

    // Buy 1 Lucky Dice
    let s = buyUpgrade(state, "Lucky Dice", heroId);
    const heroAfter1 = s.party.heroes[0];
    expect(heroAfter1.upgrades.filter(u => u.name === "Lucky Dice").length).toBe(1);

    // 2nd should be blocked
    const s2 = buyUpgrade(s, "Lucky Dice", heroId);
    const heroAfter2 = s2.party.heroes[0];
    expect(heroAfter2.upgrades.filter(u => u.name === "Lucky Dice").length).toBe(1);
  });

  it("Extra Pocket: allows 2 per party, blocks 3rd", () => {
    const state = createMerchantState("ep-limit");
    const hero1Id = state.party.heroes[0].id;
    const hero2Id = state.party.heroes[1].id;

    // Buy 2 Extra Pockets across party (1 on hero1, 1 on hero2)
    let s = buyUpgrade(state, "Extra Pocket", hero1Id);
    s = buyUpgrade(s, "Extra Pocket", hero2Id);

    const totalExtraPockets = s.party.heroes.reduce(
      (sum, h) => sum + h.upgrades.filter(u => u.name === "Extra Pocket").length, 0
    );
    expect(totalExtraPockets).toBe(2);

    // 3rd should be blocked (on hero3)
    const hero3Id = state.party.heroes[2].id;
    const s3 = buyUpgrade(s, "Extra Pocket", hero3Id);
    const totalAfter3 = s3.party.heroes.reduce(
      (sum, h) => sum + h.upgrades.filter(u => u.name === "Extra Pocket").length, 0
    );
    expect(totalAfter3).toBe(2);
  });

  it("Party Fund: allows 1 per game, blocks 2nd", () => {
    const state = createMerchantState("pf-limit");
    const hero1Id = state.party.heroes[0].id;
    const hero2Id = state.party.heroes[1].id;

    // Buy 1 Party Fund
    let s = buyUpgrade(state, "Party Fund", hero1Id);
    const totalPF = s.party.heroes.reduce(
      (sum, h) => sum + h.upgrades.filter(u => u.name === "Party Fund").length, 0
    );
    expect(totalPF).toBe(1);

    // 2nd should be blocked (on hero2)
    const s2 = buyUpgrade(s, "Party Fund", hero2Id);
    const totalAfter2 = s2.party.heroes.reduce(
      (sum, h) => sum + h.upgrades.filter(u => u.name === "Party Fund").length, 0
    );
    expect(totalAfter2).toBe(1);
  });

  it("HP Increase limit is per-hero, not per-party", () => {
    const state = createMerchantState("hp-per-hero");
    const hero1Id = state.party.heroes[0].id;
    const hero2Id = state.party.heroes[1].id;

    // Buy 3 on hero1
    let s = state;
    for (let i = 0; i < 3; i++) {
      s = buyUpgrade(s, "HP Increase", hero1Id);
    }
    // Hero2 should still be able to buy
    s = buyUpgrade(s, "HP Increase", hero2Id);
    const hero2 = s.party.heroes[1];
    expect(hero2.upgrades.filter(u => u.name === "HP Increase").length).toBe(1);
  });
});

describe("Merchant Engine — Item Lookup by itemId", () => {
  const sampleParty: PartySetupChoice[] = [
    { className: "Bladedancer", suit: "spades", position: 1 },
    { className: "Manipulator", suit: "hearts", position: 2 },
    { className: "Tracker", suit: "clubs", position: 3 },
  ];

  function startCombatState(seed = "item-lookup-test"): { state: GameState; rng: RngEngine } {
    const config = createDefaultConfig({ seed });
    const state = initializeGame(config, sampleParty);
    const rng = new RngEngine(seed);
    const combatState = startCombat(state, rng);
    return { state: combatState, rng };
  }

  it("useItem finds item by itemId", () => {
    const { state, rng } = startCombatState("item-id-lookup");
    const heroId = state.party.heroes[0].id;

    // Add a Minor Potion with itemId set
    const itemState: GameState = {
      ...state,
      party: {
        ...state.party,
        heroes: state.party.heroes.map(h =>
          h.id === heroId
            ? {
                ...h,
                items: [
                  ...h.items,
                  {
                    id: "test-potion-1",
                    name: "Minor Potion",
                    itemId: "minor_potion",
                    effect: ITEMS["Minor Potion"].effect,
                    stackLimit: 3,
                    quantity: 1,
                    tags: ITEMS["Minor Potion"].tags,
                  },
                ],
              }
            : h
        ),
      },
    };

    // Use by itemId
    const result = useItem(itemState, heroId, "minor_potion", heroId, rng);
    const healEvents = result.log.filter(e => e.type === "ABILITY_TRIGGERED" && e.summary.includes("Minor Potion"));
    expect(healEvents.length).toBeGreaterThan(0);
  });

  it("useItem still finds item by name (legacy compatibility)", () => {
    const { state, rng } = startCombatState("item-name-lookup");
    const heroId = state.party.heroes[0].id;

    // Add a Minor Potion without itemId (legacy save style)
    const itemState: GameState = {
      ...state,
      party: {
        ...state.party,
        heroes: state.party.heroes.map(h =>
          h.id === heroId
            ? {
                ...h,
                items: [
                  ...h.items,
                  {
                    id: "test-potion-2",
                    name: "Minor Potion",
                    effect: ITEMS["Minor Potion"].effect,
                    stackLimit: 3,
                    quantity: 1,
                  },
                ],
              }
            : h
        ),
      },
    };

    // Use by name
    const result = useItem(itemState, heroId, "Minor Potion", heroId, rng);
    const healEvents = result.log.filter(e => e.type === "ABILITY_TRIGGERED" && e.summary.includes("Minor Potion"));
    expect(healEvents.length).toBeGreaterThan(0);
  });

  it("buyItem stores itemId on the purchased ItemInstance", () => {
    const config = createDefaultConfig({ seed: "buy-item-id" });
    const state = initializeGame(config, sampleParty);
    const merchantState = enterMerchant({ ...state, party: { ...state.party, gold: 9999 } });
    const heroId = merchantState.party.heroes[0].id;

    const result = buyItem(merchantState, "Minor Potion", heroId);
    const hero = result.party.heroes[0];
    const potion = hero.items.find(i => i.name === "Minor Potion");
    expect(potion).toBeDefined();
    expect(potion?.itemId).toBe("minor_potion");
    expect(potion?.tags).toEqual(ITEMS["Minor Potion"].tags);
  });

  it("all ITEMS entries have itemId populated", () => {
    for (const [name, data] of Object.entries(ITEMS)) {
      expect(data.itemId, `Item "${name}" missing itemId`).toBeDefined();
    }
  });

  it("all PERMANENT_UPGRADES entries have limitType and limitCount", () => {
    for (const [name, data] of Object.entries(PERMANENT_UPGRADES)) {
      expect(data.limitType, `Upgrade "${name}" missing limitType`).toBeDefined();
      expect(data.limitCount, `Upgrade "${name}" missing limitCount`).toBeDefined();
    }
  });
});
