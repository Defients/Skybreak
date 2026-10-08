import { afterEach, describe, expect, it } from "vitest";
import { useGameStore } from "../app/gameStore";
import { createDefaultConfig, initializeGame, applyWelcomeBonusResults, rollWelcomeBonus, type PartySetupChoice } from "../engine/gameState";
import { applyDamage, calculateDamage, startCombat } from "../engine/combatEngine";
import { executeMonsterTurn } from "../engine/monsterAbilityEngine";
import { checkAndSetCombatEnd } from "../engine/combatRunner";
import { buyItem, buyEnchantment, enterMerchant, leaveMerchant, autoBuy } from "../engine/merchantEngine";
import { moveInventoryItem, discardInventoryItem } from "../engine/inventoryEngine";
import { itemHasTag } from "../utils/tagMatchers";
import { aiMerchantActions } from "../engine/aiController";
import { useItem } from "../engine/heroAbilityEngine";
import { finalizeRunStats } from "../engine/progressionEngine";
import { emitEvent } from "../engine/eventLog";
import { runSingleGame } from "../engine/batchSimulationEngine";
import { ITEMS } from "../data/items";
import { RngEngine } from "../utils/random";
import type { Difficulty } from "../types/simulation";

const party: PartySetupChoice[] = [
  { className: "Bladedancer", suit: "spades", position: 1 },
  { className: "Manipulator", suit: "hearts", position: 2 },
  { className: "Guardian", suit: "clubs", position: 3 },
];
const fresh = (difficulty: Difficulty = "normal") => initializeGame(createDefaultConfig({ seed: "stage2-integration", difficulty, mode: "simulation" }), party);
afterEach(() => { useGameStore.getState().doResetGame(); localStorage.clear(); });

describe("Stage 2 integration: controlled boundary fixtures", () => {
  for (const difficulty of ["easy", "normal", "hard", "nightmare"] as const) it(`${difficulty}: visits all 32 authored rooms and finalizes victory once`, () => {
    useGameStore.getState().startNewRun({ seed: "stage2-campaign", difficulty, mode: "simulation" }, party);
    useGameStore.setState({ state: { ...useGameStore.getState().state!, welcomeBonusPending: false } });
    const visited: string[] = [];
    let transitions = 0;
    for (let guard = 0; guard < 80; guard++) {
      const store = useGameStore.getState();
      let state = store.state!;
      if (state.phase === "victory") break;
      if (state.phase === "tier_transition") { transitions++; store.doConfirmTierTransition(); continue; }
      const room = state.spire.currentRoom!;
      if (room.type === "split") { store.doResolveSplit(0); state = useGameStore.getState().state!; }
      visited.push(`${state.spire.tier}:${state.spire.roomIndex}`);
      const type = state.spire.currentRoom!.type;
      if (type === "merchant") { store.doEnterMerchant(); useGameStore.getState().doLeaveMerchant(); }
      else if (type === "rest") { store.doEnterRest(); useGameStore.getState().doRestChoice(1); }
      else {
        store.doStartCombat();
        state = useGameStore.getState().state!;
        for (let hit = 0; hit < 3 && state.combat!.monster.alive; hit++) {
          state = applyDamage(state, state.combat!.monster.id, state.party.heroes[0].id, calculateDamage({ base: 1000, phaseThrough: true }), true).state;
        }
        state = checkAndSetCombatEnd(state);
        expect(state.combat!.combatResult).toBe("victory");
        useGameStore.setState({ state });
        useGameStore.getState().doResolveRoom();
      }
    }
    const final = useGameStore.getState().state!;
    expect(visited).toHaveLength(32);
    expect(new Set(visited).size).toBe(32);
    expect(transitions).toBe(2);
    expect(final.phase).toBe("victory");
    expect(final.stats.roomsCleared).toBe(32);
    expect(final.score?.tier3RoomsCleared).toBe(10);
    useGameStore.getState().doResolveRoom();
    expect(useGameStore.getState().state).toBe(final);
  });

  it("merchant stock and per-hero stack limits reject purchases atomically", () => {
    let state = enterMerchant(fresh()); state.party.gold = 10000; state.party.heroes.forEach(h => h.items = []);
    const [a, b] = state.party.heroes;
    state = buyItem(state, "Minor Potion", a.id);
    state = buyItem(state, "Minor Potion", a.id);
    expect(buyItem(state, "Minor Potion", a.id)).toBe(state);
    state = buyItem(state, "Minor Potion", b.id);
    expect(state.merchant!.items.find(i => i.name === "Minor Potion")!.quantity).toBe(0);
    expect(buyItem(state, "Minor Potion", b.id)).toBe(state);
  });

  it("unsupported reroll purchases preserve gold, items and enchantment state", () => {
    const state = fresh(); const hero = state.party.heroes[0];
    hero.items = [{ ...ITEMS["Lucky Charm"], id: "charm", quantity: 1 }];
    expect(useItem(state, hero.id, "lucky_charm")).toBe(state);
    state.party.gold = 1000;
    expect(buyItem(state, "Lucky Charm", hero.id)).toBe(state);
    expect(buyEnchantment(state, "Swift", hero.id)).toBe(state);
  });

  it("Smoke Bomb's canonical tags cannot acquire the Bomb effect by name", () => {
    const item = { ...ITEMS["Smoke Bomb"], id: "smoke", quantity: 1 };
    expect(itemHasTag(item, "smoke_bomb")).toBe(true);
    expect(itemHasTag(item, "bomb")).toBe(false);
    expect(itemHasTag({ ...item, itemId: "unknown", name: "Bomb" }, "bomb")).toBe(false);
  });

  it("over-capacity recovery preserves IDs and blocks departure until resolved", () => {
    const state = enterMerchant(fresh()); const hero = state.party.heroes[0];
    hero.items = (["Minor Potion", "Bomb", "Mystic Rune", "Shield Charm"] as const).map((name, i) => ({ ...ITEMS[name], id: `over-${i}`, quantity: 1 }));
    expect(leaveMerchant(state)).toBe(state);
    const moved = moveInventoryItem(state, "over-3");
    expect(moved.party.heroes[0].items).toHaveLength(3);
    expect(moved.party.sharedInventory[0]).toEqual(hero.items[3]);
    expect(leaveMerchant(moved).phase).toBe("exploration");
    expect(discardInventoryItem(moved, "over-3").party.sharedInventory).toEqual([]);
    expect(discardInventoryItem(moved, hero.weapon.id)).toBe(moved);
  });

  it("auto-buy never spends more gold than it actually debits", () => {
    const state = enterMerchant(fresh()); state.party.gold = 80;
    const next = autoBuy(state);
    expect(next.party.gold).toBeGreaterThanOrEqual(0);
    expect(next.stats.goldSpent - state.stats.goldSpent).toBe(state.party.gold - next.party.gold);
  });

  it("automatic welcome rewards match batch when the dice and choices have the same order", () => {
    useGameStore.getState().startNewRun({ seed: "stage2-welcome-parity", mode: "simulation" }, party);
    const initial = useGameStore.getState().state!;
    const batchRng = RngEngine.deserialize(initial.rng!);
    const expected = applyWelcomeBonusResults(initial, rollWelcomeBonus(initial, batchRng), batchRng);
    const results = initial.party.heroes.map(h => { const [die1, die2] = useGameStore.getState().doRollWelcomeBonus(h.heroId); return { heroId: h.heroId, die1, die2 }; });
    const selected = results.map(r => ({ ...r, chosenWeaponId: useGameStore.getState().doChooseWelcomeWeapon(r.heroId) ?? undefined }));
    useGameStore.getState().doApplyWelcomeBonus(selected);
    const actual = useGameStore.getState().state!;
    expect(actual.party.gold).toBe(expected.party.gold);
    expect(actual.party.heroes.map(h => h.weapon.weaponId)).toEqual(expected.party.heroes.map(h => h.weapon.weaponId));
    expect(actual.rng!.step).toBe(batchRng.currentStep);
  });

  it("Smoke Bomb skips the current encounter without rewards, and cannot skip Vyridian", () => {
    const base = fresh(); const rng = RngEngine.deserialize(base.rng!);
    const state = startCombat(base, rng, { forcedMonsterId: 1 });
    const hero = state.party.heroes[0]; hero.items = [{ ...ITEMS["Smoke Bomb"], id: "smoke", quantity: 1 }];
    const next = useItem(state, hero.id, "smoke_bomb", state.combat!.monster.id, rng);
    expect(next.combat!.combatResult).toBe("retreat");
    expect(next.party.gold).toBe(state.party.gold);
    const boss = { ...state, combat: { ...state.combat!, isFinalBoss: true } };
    expect(useItem(boss, hero.id, "smoke_bomb", boss.combat.monster.id, rng)).toBe(boss);
  });

  it("the AI stops proposing maxed upgrades or unaffordable multiplied prices", () => {
    const state = enterMerchant(fresh()); state.party.gold = 10000;
    state.party.heroes.forEach(h => h.upgrades = Array.from({ length: 3 }, (_, i) => ({ id: `u-${i}`, name: "HP Increase", effect: "+2 HP", count: 1 })));
    expect(aiMerchantActions(state, "upgrades")).toEqual([]);
    state.party.heroes.forEach(h => { h.upgrades = []; }); state.party.gold = 80; state.spire.merchantPriceMultiplier = 1.5;
    expect(aiMerchantActions(state, "upgrades")).toEqual([]);
  });

  it("a hero can consume a shared potion without changing another hero's inventory", () => {
    const state = fresh(); const hero = state.party.heroes[0]; hero.items = []; hero.currentHp = 1;
    state.party.sharedInventory = [{ ...ITEMS["Minor Potion"], id: "shared-potion", quantity: 1 }];
    const next = useItem(state, hero.id, "minor_potion");
    expect(next.party.heroes[0].currentHp).toBe(9);
    expect(next.party.sharedInventory).toEqual([]);
    expect(state.party.sharedInventory).toHaveLength(1);
  });

  it("next-turn immunity expires after the whole monster turn", () => {
    const base = fresh(); const rng = RngEngine.deserialize(base.rng!);
    let state = startCombat(base, rng, { forcedMonsterId: 1 });
    state.party.heroes.forEach(h => { h.perTurnFlags.immuneNextTurn = true; });
    const hp = state.party.heroes.map(h => h.currentHp);
    state = executeMonsterTurn(state, rng);
    expect(state.party.heroes.map(h => h.currentHp)).toEqual(hp);
    expect(state.party.heroes.every(h => !h.perTurnFlags.immuneNextTurn)).toBe(true);
  });

  it("welcome dice survive repeat requests and save/load without consuming more RNG", () => {
    useGameStore.getState().startNewRun({ seed: "welcome-cache" }, party);
    const id = useGameStore.getState().state!.party.heroes[0].heroId;
    const first = useGameStore.getState().doRollWelcomeBonus(id);
    const state = useGameStore.getState().state!;
    const step = state.rng!.step;
    expect(useGameStore.getState().doRollWelcomeBonus(id)).toEqual(first);
    expect(useGameStore.getState().rng!.currentStep).toBe(step);
    useGameStore.getState().doLoadState(state);
    expect(useGameStore.getState().doRollWelcomeBonus(id)).toEqual(first);
    expect(useGameStore.getState().rng!.currentStep).toBe(step);
  });

  it("MVP totals include early combat even after more than 500 events", () => {
    let state = fresh(); const [a, b] = state.party.heroes;
    state = emitEvent(state, "DAMAGE_APPLIED", "Early attack", { actorId: a.id, details: { damage: 100 } });
    for (let i = 0; i < 550; i++) state = emitEvent(state, "TURN_STARTED", "Later turn");
    state = emitEvent(state, "DAMAGE_APPLIED", "Later attack", { actorId: b.id, details: { damage: 1 } });
    expect(state.log).toHaveLength(500);
    expect(finalizeRunStats(state).stats.mvpHeroId).toBe(a.id);
  });
});

describe("Stage 2 integration: natural deterministic simulation smoke", () => {
  for (const difficulty of ["easy", "normal", "hard", "nightmare"] as const) it(`${difficulty}: a natural run terminates lawfully`, async () => {
    const result = await runSingleGame(0, `stage2-natural-${difficulty}`, { runs: 1, difficulty, partyMode: "fixed", partyChoices: party, baseSeed: "stage2-natural", combatStrategy: "balanced", merchantStrategy: "balanced", restStrategy: "full-heal", splitStrategy: "safe", itemUsageStrategy: "conservative", weaponUpgradeStrategy: "when-affordable" });
    expect(["victory", "defeat", "retreat"]).toContain(result.outcome);
    expect(result.roomsCleared).toBeLessThanOrEqual(32);
    expect(Number.isFinite(result.score.finalScore)).toBe(true);
    console.info("Stage 2 natural run", JSON.stringify({ difficulty, seed: result.seed, outcome: result.outcome, roomsCleared: result.roomsCleared, totalTurns: result.totalTurns }));
  }, 30000);
});
