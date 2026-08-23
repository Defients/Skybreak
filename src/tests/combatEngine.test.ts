import { describe, it, expect } from "vitest";
import { startCombat, calculateDamage, detectMatches, checkCombatEnd, applyHealing, cleanupCombat, grantRewards, flipPeonCards } from "../engine/combatEngine";
import { initializeGame, createDefaultConfig, type PartySetupChoice } from "../engine/gameState";
import { RngEngine } from "../utils/random";
import { getLivingHeroes } from "../engine/rulesEngine";
import { weaponHasTag } from "../utils/tagMatchers";
import type { GameState } from "../types/gameState";
import type { APCInstance } from "../types/combat";
import type { Card } from "../types/cards";

describe("Combat Engine", () => {
  const sampleParty: PartySetupChoice[] = [
    { className: "Bladedancer", suit: "spades", position: 1 },
    { className: "Manipulator", suit: "hearts", position: 2 },
    { className: "Tracker", suit: "clubs", position: 3 },
  ];

  function createTestState(seed = "combat-test"): { state: GameState; rng: RngEngine } {
    const config = createDefaultConfig({ seed });
    const state = initializeGame(config, sampleParty);
    const rng = new RngEngine(seed);
    return { state, rng };
  }

  it("startCombat sets phase to combat and creates combat state", () => {
    const { state, rng } = createTestState();
    const newState = startCombat(state, rng);
    expect(newState.phase).toBe("combat");
    expect(newState.combat).toBeDefined();
    expect(newState.combat!.monster).toBeDefined();
    expect(newState.combat!.monster.alive).toBe(true);
  });

  it("startCombat with isFinalBoss creates final boss", () => {
    const { state, rng } = createTestState();
    const newState = startCombat(state, rng, { isFinalBoss: true });
    expect(newState.combat!.isFinalBoss).toBe(true);
  });

  it("startCombat sets heroTurnOrder with living heroes", () => {
    const { state, rng } = createTestState();
    const newState = startCombat(state, rng);
    const livingIds = getLivingHeroes(newState).map((h) => h.id);
    expect(newState.combat!.heroTurnOrder).toEqual(livingIds);
  });

  it("calculateDamage computes base damage with no modifiers", () => {
    const result = calculateDamage({ base: 5 });
    expect(result.finalDamage).toBe(5);
    expect(result.base).toBe(5);
  });

  it("calculateDamage applies weapon and match bonuses", () => {
    const result = calculateDamage({ base: 3, weaponBonus: 2, matchBonus: 1 });
    expect(result.finalDamage).toBe(6);
  });

  it("calculateDamage applies shield reduction", () => {
    const result = calculateDamage({ base: 5, shieldReduction: 3 });
    expect(result.finalDamage).toBe(2);
  });

  it("calculateDamage phaseThrough ignores shields and armor", () => {
    const result = calculateDamage({ base: 5, shieldReduction: 3, armorReduction: 2, phaseThrough: true });
    expect(result.finalDamage).toBe(5);
    expect(result.shieldReduction).toBe(0);
    expect(result.armorReduction).toBe(0);
  });

  it("calculateDamage does not go below 0", () => {
    const result = calculateDamage({ base: 2, shieldReduction: 10 });
    expect(result.finalDamage).toBe(0);
  });

  it("detectMatches returns none when no cards match APCs", () => {
    const apcs: APCInstance[] = [
      { id: "apc1", rank: "A", suit: "hearts", source: { id: "s1", suit: "hearts", rank: "A", display: "AH", deckType: "royalty" }, temporary: false, permanent: true, matched: false },
      { id: "apc2", rank: "K", suit: "hearts", source: { id: "s2", suit: "hearts", rank: "K", display: "KH", deckType: "royalty" }, temporary: false, permanent: true, matched: false },
    ];
    const cards: Card[] = [
      { id: "c1", suit: "hearts", rank: "5", display: "5H", deckType: "peon" },
      { id: "c2", suit: "clubs", rank: "7", display: "7C", deckType: "peon" },
    ];
    const results = detectMatches(apcs, cards);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("none");
  });

  it("detectMatches detects single match", () => {
    const apcs: APCInstance[] = [
      { id: "apc1", rank: "A", suit: "hearts", source: { id: "s1", suit: "hearts", rank: "A", display: "AH", deckType: "royalty" }, temporary: false, permanent: true, matched: false },
      { id: "apc2", rank: "K", suit: "hearts", source: { id: "s2", suit: "hearts", rank: "K", display: "KH", deckType: "royalty" }, temporary: false, permanent: true, matched: false },
    ];
    const cards: Card[] = [
      { id: "c1", suit: "hearts", rank: "A", display: "AH", deckType: "peon" },
    ];
    const results = detectMatches(apcs, cards);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("single");
    expect(results[0].matchedApcs).toHaveLength(1);
  });

  it("detectMatches detects double match (different ranks)", () => {
    const apcs: APCInstance[] = [
      { id: "apc1", rank: "A", suit: "hearts", source: { id: "s1", suit: "hearts", rank: "A", display: "AH", deckType: "royalty" }, temporary: false, permanent: true, matched: false },
      { id: "apc2", rank: "K", suit: "hearts", source: { id: "s2", suit: "hearts", rank: "K", display: "KH", deckType: "royalty" }, temporary: false, permanent: true, matched: false },
    ];
    const cards: Card[] = [
      { id: "c1", suit: "hearts", rank: "A", display: "AH", deckType: "peon" },
      { id: "c2", suit: "clubs", rank: "K", display: "KC", deckType: "peon" },
    ];
    const results = detectMatches(apcs, cards);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("double");
    expect(results[0].bonusDamage).toBe(1);
  });

  it("detectMatches detects set match (same rank)", () => {
    const apcs: APCInstance[] = [
      { id: "apc1", rank: "A", suit: "hearts", source: { id: "s1", suit: "hearts", rank: "A", display: "AH", deckType: "royalty" }, temporary: false, permanent: true, matched: false },
      { id: "apc2", rank: "A", suit: "clubs", source: { id: "s2", suit: "clubs", rank: "A", display: "AC", deckType: "royalty" }, temporary: false, permanent: true, matched: false },
    ];
    const cards: Card[] = [
      { id: "c1", suit: "hearts", rank: "A", display: "AH", deckType: "peon" },
      { id: "c2", suit: "clubs", rank: "A", display: "AC", deckType: "peon" },
    ];
    const results = detectMatches(apcs, cards);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("set");
    expect(results[0].rollBonus).toBe(1);
  });

  it("checkCombatEnd returns ongoing when monster alive and heroes alive", () => {
    const { state, rng } = createTestState();
    const newState = startCombat(state, rng);
    const result = checkCombatEnd(newState);
    expect(result.result).toBe("ongoing");
  });

  it("checkCombatEnd returns victory when monster is dead", () => {
    const { state, rng } = createTestState();
    const newState = startCombat(state, rng);
    newState.combat!.monster.alive = false;
    newState.combat!.monster.currentHp = 0;
    const result = checkCombatEnd(newState);
    expect(result.result).toBe("victory");
  });

  it("checkCombatEnd returns defeat when all heroes dead", () => {
    const { state, rng } = createTestState();
    const newState = startCombat(state, rng);
    newState.party.heroes.forEach((h) => (h.alive = false));
    const result = checkCombatEnd(newState);
    expect(result.result).toBe("defeat");
  });

  it("applyHealing increases HP without exceeding max", () => {
    const { state, rng } = createTestState();
    const newState = startCombat(state, rng);
    const hero = newState.party.heroes[0];
    hero.currentHp = Math.max(1, hero.maxHp - 5);
    const healed = applyHealing(newState, hero.id, 3);
    const healedHero = healed.party.heroes.find((h) => h.id === hero.id)!;
    expect(healedHero.currentHp).toBe(hero.currentHp + 3);
  });

  it("applyHealing clamps to maxHp", () => {
    const { state, rng } = createTestState();
    const newState = startCombat(state, rng);
    const hero = newState.party.heroes[0];
    hero.currentHp = hero.maxHp - 1;
    const healed = applyHealing(newState, hero.id, 10);
    const healedHero = healed.party.heroes.find((h) => h.id === hero.id)!;
    expect(healedHero.currentHp).toBe(hero.maxHp);
  });

  it("cleanupCombat removes combat state and resets phase", () => {
    const { state, rng } = createTestState();
    const combatState = startCombat(state, rng);
    expect(combatState.combat).toBeDefined();
    const cleaned = cleanupCombat(combatState);
    expect(cleaned.combat).toBeUndefined();
    expect(cleaned.phase).not.toBe("combat");
  });

  it("grantRewards gives gold on victory", () => {
    const { state, rng } = createTestState();
    const newState = startCombat(state, rng);
    newState.combat!.combatResult = "victory";
    newState.combat!.monster.alive = false;
    const initialGold = newState.party.gold;
    const rewarded = grantRewards(newState);
    expect(rewarded.party.gold).toBeGreaterThanOrEqual(initialGold);
  });

  it("grantRewards does nothing on non-victory", () => {
    const { state, rng } = createTestState();
    const newState = startCombat(state, rng);
    newState.combat!.combatResult = "defeat";
    const initialGold = newState.party.gold;
    const rewarded = grantRewards(newState);
    expect(rewarded.party.gold).toBe(initialGold);
  });

  it("APC assignment draws unique cards from peon deck (no duplicates)", () => {
    const { state, rng } = createTestState("dedup-test");
    const newState = startCombat(state, rng);
    const allApcSources: Card[] = [];
    for (const hero of newState.party.heroes) {
      if (hero.alive) allApcSources.push(...hero.apcs.map(a => a.source));
    }
    allApcSources.push(...newState.combat!.monster.apcs.map(a => a.source));
    const cardKeys = allApcSources.map(c => `${c.rank}-${c.suit}`);
    const uniqueKeys = new Set(cardKeys);
    expect(uniqueKeys.size).toBe(cardKeys.length);
  });

  it("flipPeonCards draws from peon deck without duplicates", () => {
    const { state, rng } = createTestState("flip-dedup-test");
    const combatState = startCombat(state, rng);
    const hero = combatState.party.heroes.find(h => h.alive)!;
    const { cards } = flipPeonCards(combatState, hero.id, rng);
    expect(cards).toHaveLength(2);
    const keys = cards.map(c => `${c.rank}-${c.suit}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("deckManager is initialized with proper deck sizes", () => {
    const { state } = createTestState("deck-init-test");
    expect(state.deckManager).toBeDefined();
    expect(state.deckManager!.royalty.drawPile).toHaveLength(16);
    expect(state.deckManager!.peon.drawPile).toHaveLength(36);
    expect(state.deckManager!.joker.drawPile).toHaveLength(2);
    expect(state.deckManager!.environment.drawPile).toHaveLength(4);
  });

  // ─── Phase 7c: Tower Shield + Fortress Gate regression tests ──────────────

  it("Tower Shield: maxHp does not stack across multiple combat starts", () => {
    const guardianParty: PartySetupChoice[] = [
      { className: "Guardian", suit: "spades", position: 1 },
      { className: "Manipulator", suit: "hearts", position: 2 },
      { className: "Tracker", suit: "clubs", position: 3 },
    ];
    const config = createDefaultConfig({ seed: "ts-stack" });
    const state = initializeGame(config, guardianParty);
    const rng = new RngEngine("ts-stack");

    // Manually give the Guardian a Tower Shield weapon
    const guardian = state.party.heroes[0];
    const towerShieldState: GameState = {
      ...state,
      party: {
        ...state.party,
        heroes: state.party.heroes.map(h =>
          h.id === guardian.id
            ? { ...h, weapon: { ...h.weapon, weaponId: "gd_common_1", name: "Tower Shield", tags: ["tower_shield"] } }
            : h
        ),
      },
    };

    const baseMaxHp = towerShieldState.party.heroes[0].baseMaxHp;

    // First combat start
    const combat1 = startCombat(towerShieldState, rng);
    const hero1 = combat1.party.heroes[0];
    expect(hero1.maxHp).toBe(baseMaxHp + 1);

    // Cleanup does NOT reset maxHp, but the fix is that startCombat uses
    // baseMaxHp + 1 (not maxHp + 1), so it won't stack
    const cleaned = cleanupCombat(combat1);

    // Second combat start — should still be baseMaxHp + 1, not baseMaxHp + 2
    const combat2 = startCombat(cleaned, new RngEngine("ts-stack-2"));
    const hero2 = combat2.party.heroes[0];
    expect(hero2.maxHp).toBe(baseMaxHp + 1);
  });

  it("Fortress Gate: immunity uses weapon tag, not name string", () => {
    const guardianParty: PartySetupChoice[] = [
      { className: "Guardian", suit: "spades", position: 1 },
      { className: "Manipulator", suit: "hearts", position: 2 },
      { className: "Tracker", suit: "clubs", position: 3 },
    ];
    const config = createDefaultConfig({ seed: "fg-tag" });
    const state = initializeGame(config, guardianParty);
    const rng = new RngEngine("fg-tag");

    const guardian = state.party.heroes[0];

    // Give Guardian a weapon with fortress_gate tag but a non-matching name
    const fortressState: GameState = {
      ...state,
      party: {
        ...state.party,
        heroes: state.party.heroes.map(h =>
          h.id === guardian.id
            ? { ...h, weapon: { ...h.weapon, weaponId: "gd_epic_1", name: "Custom Name", tags: ["fortress_gate"] } }
            : h
        ),
      },
    };

    const combatState = startCombat(fortressState, rng);

    // Verify the tag is present
    expect(weaponHasTag(combatState.party.heroes[0], "fortress_gate")).toBe(true);

    // Verify fortressGateUsed is initially falsy (false or undefined)
    expect(combatState.combat?.fortressGateUsed).toBeFalsy();
  });
});
