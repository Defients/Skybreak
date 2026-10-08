import { describe, expect, it } from "vitest";
import { initializeGame, createDefaultConfig } from "../engine/gameState";
import { startCombat, applyDamage, calculateDamage, addToken } from "../engine/combatEngine";
import { applyHeroDamage } from "../engine/heroDamage";
import { useItem } from "../engine/heroAbilityEngine";
import { ITEMS } from "../data/items";
import { createShieldToken, createBuffStatus } from "../data/tokens";
import { RngEngine } from "../utils/random";
function encounter() {
  const state = initializeGame(createDefaultConfig({ seed: "stage2-damage" }), [
    { className: "Tracker", suit: "clubs", position: 1 },
    { className: "Manipulator", suit: "hearts", position: 2 },
    { className: "Guardian", suit: "clubs", position: 3 },
  ]);
  const rng = RngEngine.deserialize(state.rng!);
  return { state: startCombat(state, rng, { forcedMonsterId: 1 }), rng };
}
describe("Stage 2: damage follows the actual target and reports resolved values", () => {
  it("monster shields absorb damage and are consumed", () => {
    const { state } = encounter(); const monster = state.combat!.monster;
    monster.tokens = [createShieldToken(2)];
    const next = applyDamage(state, monster.id, state.party.heroes[0].id, calculateDamage({ base: 5 }), true).state;
    expect(next.combat!.monster.currentHp).toBe(monster.currentHp - 3);
    expect(next.combat!.monster.tokens).toHaveLength(0);
    const event = next.log.filter(e => e.type === "DAMAGE_APPLIED").pop()!;
    expect(event.details!.damage).toBe(3);
    expect(event.details!.breakdown).toMatchObject({ shieldReduction: 2, finalDamage: 3 });
  });
  it("hero damage logs and biggest-hit stats use damage AFTER shielding", () => {
    const { state } = encounter(); const hero = state.party.heroes[0];
    hero.tokens = [createShieldToken(2)];
    const next = applyDamage(state, hero.id, state.combat!.monster.id, calculateDamage({ base: 5 }), false).state;
    expect(next.party.heroes[0].currentHp).toBe(hero.currentHp - 3);
    const event = next.log.filter(e => e.type === "DAMAGE_APPLIED").pop()!;
    expect(event.details!.damage).toBe(3);
    expect(event.details!.breakdown).toMatchObject({ shieldReduction: 2, finalDamage: 3 });
    expect(next.stats.biggestDamageEvent).toBe(3);
  });
  it("an attack against a summon damages that summon, never the main monster", () => {
    const { state } = encounter(); const monsterHp = state.combat!.monster.currentHp;
    state.combat!.summons = [{ ...state.combat!.monster, id: "summon", name: "Ooze Minion", currentHp: 4, maxHp: 4, alive: true, type: "summon" }];
    const next = applyDamage(state, "summon", state.party.heroes[0].id, calculateDamage({ base: 5 }), true).state;
    expect(next.combat!.monster.currentHp).toBe(monsterHp);
    expect(next.combat!.summons[0]).toMatchObject({ currentHp: 0, alive: false });
    const event = next.log.filter(e => e.type === "DAMAGE_APPLIED").pop()!;
    expect(event.targetIds).toEqual(["summon"]);
  });
  it("phase-through preserves shields and ignores Colossal reduction", () => {
    const { state } = encounter(); const monster = state.combat!.monster;
    monster.tokens = [createShieldToken(2)]; monster.specialState.colossal = true;
    const next = applyDamage(state, monster.id, "test", calculateDamage({ base: 5, phaseThrough: true }), true).state;
    expect(next.combat!.monster.currentHp).toBe(monster.currentHp - 5);
    expect(next.combat!.monster.tokens).toHaveLength(1);
  });
  it("tokens assigned to a summon never alter the main monster", () => {
    const { state } = encounter();
    state.combat!.summons = [{ ...state.combat!.monster, id: "summon", name: "Ooze Minion", currentHp: 4, maxHp: 4, alive: true, type: "summon", tokens: [] }];
    const next = addToken(state, "summon", createShieldToken(2), true);
    expect(next.combat!.monster.tokens).toEqual(state.combat!.monster.tokens);
    expect(next.combat!.summons[0].tokens).toHaveLength(1);
    expect(next.log[next.log.length - 1].targetIds).toEqual(["summon"]);
  });
  it("Power Scroll adds exactly 3 to the next attack, once", () => {
    const { state } = encounter(); const hero = state.party.heroes[0];
    const item = ITEMS["Power Scroll"]; hero.items = [{ ...item, id: "scroll", quantity: 1 }];
    let next = useItem(state, hero.id, item.itemId);
    const hp = next.combat!.monster.currentHp;
    next = applyHeroDamage(next, next.party.heroes[0], 1, [], next.combat!.monster.id).state;
    expect(next.combat!.monster.currentHp).toBe(hp - 4);
    const after = next.combat!.monster.currentHp;
    next = applyHeroDamage(next, hero, 1, [], next.combat!.monster.id).state;
    expect(next.combat!.monster.currentHp).toBe(after - 1);
  });
  it("one-use Might does not apply twice when a multi-hit action retains the old hero object", () => {
    const { state } = encounter(); const hero = state.party.heroes[0]; hero.buffs = [createBuffStatus("Might", 1)];
    let next = applyHeroDamage(state, hero, 1, [], state.combat!.monster.id).state;
    const after = next.combat!.monster.currentHp;
    next = applyHeroDamage(next, hero, 1, [], next.combat!.monster.id).state;
    expect(next.combat!.monster.currentHp).toBe(after - 1);
  });
});
