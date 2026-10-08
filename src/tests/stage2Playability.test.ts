import { afterEach, describe, expect, it } from "vitest";
import { useGameStore } from "../app/gameStore";
import { initializeGame, createDefaultConfig, type PartySetupChoice } from "../engine/gameState";
import { startCombat, cleanupCombat, checkCombatEnd } from "../engine/combatEngine";
import { executeHeroAction, useItem } from "../engine/heroAbilityEngine";
import { executeMonsterTurn } from "../engine/monsterAbilityEngine";
import { completeHeroTurn } from "../engine/combatRunner";
import { resolveCombatRoom } from "../engine/progressionEngine";
import { markRoomResolved } from "../engine/rulesEngine";
import { buyHealing, buyItem, buyWeapon, buyUpgrade } from "../engine/merchantEngine";
import { ITEMS } from "../data/items";
import { RngEngine } from "../utils/random";

export const party: PartySetupChoice[] = [
  { className: "Bladedancer", suit: "spades", position: 1 },
  { className: "Manipulator", suit: "hearts", position: 2 },
  { className: "Guardian", suit: "clubs", position: 3 },
];
function fresh(difficulty: "easy" | "normal" | "hard" | "nightmare" = "normal") {
  return initializeGame(createDefaultConfig({ seed: "stage2-flow", difficulty }), party);
}
function combat() {
  const state = fresh();
  const rng = RngEngine.deserialize(state.rng!);
  return { state: startCombat(state, rng), rng };
}
afterEach(() => { useGameStore.getState().doResetGame(); localStorage.clear(); });

describe("Stage 2: lawful lifecycle boundaries", () => {
  it("starts the live RNG at the post-setup position", () => {
    useGameStore.getState().startNewRun({ seed: "stage2-flow" }, party);
    const { state, rng } = useGameStore.getState();
    expect(rng!.serialize()).toEqual(state!.rng);
    expect(rng!.currentStep).toBeGreaterThan(0);
  });
  it("does not skip an unresolved room", () => {
    const state = fresh(); state.welcomeBonusPending = false;
    useGameStore.setState({ state, rng: RngEngine.deserialize(state.rng!) });
    useGameStore.getState().doAdvanceRoom();
    expect(useGameStore.getState().state).toBe(state);
  });
  it("counts room completion once", () => {
    const resolved = markRoomResolved(fresh());
    expect(markRoomResolved(resolved)).toBe(resolved);
  });
  it("rejects repeat merchant departure instead of skipping the following room", () => {
    const state = fresh(); state.welcomeBonusPending = false;
    state.spire.roomIndex = 0; state.spire.currentRoom = state.spire.rooms[0];
    useGameStore.setState({ state, rng: RngEngine.deserialize(state.rng!) });
    useGameStore.getState().doEnterMerchant();
    expect(useGameStore.getState().state!.phase).toBe("merchant");
    useGameStore.getState().doLeaveMerchant();
    const after = useGameStore.getState().state;
    useGameStore.getState().doLeaveMerchant();
    expect(useGameStore.getState().state).toBe(after);
  });
  it("rejects repeated rest choices instead of earning gold outside the rest room", () => {
    const state = fresh(); state.welcomeBonusPending = false;
    const index = state.spire.rooms.findIndex(r => r.type === "rest");
    state.spire.roomIndex = index; state.spire.currentRoom = state.spire.rooms[index];
    useGameStore.setState({ state, rng: RngEngine.deserialize(state.rng!) });
    useGameStore.getState().doRestChoice(3);
    const after = useGameStore.getState().state;
    useGameStore.getState().doRestChoice(3);
    expect(useGameStore.getState().state).toBe(after);
  });
  it("finalizes Nightmare timeout even while heroes survive", () => {
    const { state } = combat(); state.combat!.isFinalBoss = true;
    state.settings.difficulty = "nightmare"; state.combat!.turnCount = 40;
    state.combat!.combatResult = checkCombatEnd(state).result as "defeat";
    const result = resolveCombatRoom(state);
    expect(result.terminal).toBe("defeat"); expect(result.state.phase).toBe("defeat");
    expect(result.state.log[result.state.log.length - 1]?.summary).toContain("40-turn");
    expect(resolveCombatRoom(result.state).state).toBe(result.state);
  });
  it("includes the cleared final boss room in the victory score", () => {
    const { state } = combat(); state.spire.tier = 3;
    state.combat!.isFinalBoss = true; state.combat!.monster.alive = false;
    state.combat!.monster.currentHp = 0; state.combat!.combatResult = "victory";
    const result = resolveCombatRoom(state).state;
    expect(result.stats.roomsCleared).toBe(1);
    expect(result.score!.tier3RoomsCleared).toBe(1);
  });
  it.each(["victory", "defeat", "retreat"] as const)("rejects all further combat actions after %s", result => {
    const { state, rng } = combat(); state.combat!.combatResult = result;
    const step = rng.currentStep; const hero = state.party.heroes[0];
    expect(executeHeroAction(state, rng, hero.id).state).toBe(state);
    expect(executeMonsterTurn(state, rng)).toBe(state);
    expect(useItem(state, hero.id, "Minor Potion", hero.id, rng)).toBe(state);
    expect(rng.currentStep).toBe(step);
  });
  it("preserves the Easy HP bonus after combat cleanup", () => {
    const state = fresh("easy"); const hp = state.party.heroes.map(h => h.maxHp);
    const rng = RngEngine.deserialize(state.rng!);
    expect(cleanupCombat(startCombat(state, rng)).party.heroes.map(h => h.maxHp)).toEqual(hp);
  });
  it("cannot use another hero's items out of turn", () => {
    const { state, rng } = combat(); state.combat!.activeSide = "heroes";
    const hero = state.party.heroes[1]; hero.currentHp = 1;
    useGameStore.setState({ state, rng });
    useGameStore.getState().doUseItem(hero.id, "Minor Potion");
    expect(useGameStore.getState().state).toBe(state);
  });
});

describe("Stage 2: transactions and item effects", () => {
  it.each(["Patch Up", "First Aid", "Revive 50%", "Revive Full"])("does not debit %s for an invalid target", service => {
    const state = fresh(); state.party.gold = 1000;
    expect(buyHealing(state, service, "missing-hero")).toBe(state);
  });
  it("does not heal or charge a dead hero", () => {
    const state = fresh(); const h = state.party.heroes[0]; h.alive = false; h.currentHp = 0;
    expect(buyHealing(state, "Patch Up", h.id)).toBe(state);
  });
  it("Major Potions are Joker rewards, never free merchant purchases", () => {
    const state = fresh(); const h = state.party.heroes[0]; h.items = [];
    expect(buyItem(state, "Major Potion", h.id)).toBe(state);
  });
  it("rejects tier-locked weapon purchases", () => {
    const state = fresh(); state.party.gold = 1000;
    expect(buyWeapon(state, "Voidcutter", state.party.heroes[0].id)).toBe(state);
  });
  it("cannot upgrade a dead hero into positive HP while still dead", () => {
    const state = fresh(); state.party.gold = 1000;
    const h = state.party.heroes[0]; h.alive = false; h.currentHp = 0;
    expect(buyUpgrade(state, "HP Increase", h.id)).toBe(state);
  });
  it("Speed Potion actually grants a second action before completing the turn", () => {
    const { state } = combat(); state.combat!.activeSide = "heroes";
    const h = state.party.heroes[0]; const data = ITEMS["Speed Potion"];
    h.items = [{ ...data, id: "speed", quantity: 1 }];
    const used = useItem(state, h.id, "Speed Potion");
    const first = completeHeroTurn(used, h.id);
    expect(first.combat!.completedHeroTurns).not.toContain(h.id);
    const second = completeHeroTurn(first, h.id);
    expect(second.combat!.completedHeroTurns).toContain(h.id);
  });
});

describe("Stage 2: physical RNG", () => {
  it("records physical rolls at the current seed position without negative indices or seed consumption", () => {
    const rng = new RngEngine("physical"); rng.setPhysicalRolls([6, 2, 3]);
    expect(rng.rollD6().step).toBe(0); expect(rng.roll2D6().step).toBe(0);
    expect(rng.currentStep).toBe(0);
    expect(rng.historyLog.map(e => e.step)).toEqual([0, 0]);
    expect(rng.rollD6()).toEqual(new RngEngine("physical").rollD6());
  });
  it.each([0, 7, 1.5, NaN, Infinity])("rejects invalid physical die value %s", value => {
    expect(() => new RngEngine("physical").setPhysicalRolls([value])).toThrow();
  });
});
