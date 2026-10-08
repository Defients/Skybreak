import { describe, expect, it } from "vitest";
import { CLASS_DATA, ALL_CLASSES } from "../data/classes";
import { MONSTERS } from "../data/monsters";
import { WEAPONS } from "../data/weapons";
import { ITEMS, PERMANENT_UPGRADES, HEALING_SERVICES } from "../data/items";
import { createRoomsForTier } from "../data/rooms";
import { getHeroPortrait, getMonsterImageById, getMonsterImage, getWeaponImageById, getWeaponImage, getItemImageById, getItemImage, getDiceUpgradeImage, getDiceImage } from "../assets/assetRegistry";
import { createDefaultConfig, initializeGame, type PartySetupChoice } from "../engine/gameState";
import { startCombat } from "../engine/combatEngine";
import { executeHeroAction, useItem } from "../engine/heroAbilityEngine";
import { executeMonsterTurn } from "../engine/monsterAbilityEngine";
import { buyHealing, buyUpgrade } from "../engine/merchantEngine";
import { RngEngine } from "../utils/random";
import type { Suit } from "../types/cards";

const party: PartySetupChoice[] = [
  { className: "Bladedancer", suit: "spades", position: 1 },
  { className: "Manipulator", suit: "hearts", position: 2 },
  { className: "Guardian", suit: "clubs", position: 3 },
];
function encounter() {
  const state = initializeGame(createDefaultConfig({ seed: "content-coverage" }), party);
  const rng = RngEngine.deserialize(state.rng!);
  return { state: startCombat(state, rng), rng };
}
describe("Stage 2: canonical artwork coverage", () => {
  it.each(MONSTERS)("monster $id — $name", monster => {
    const url = getMonsterImageById(monster.id);
    expect(url).toBeTruthy(); expect(url).toBe(getMonsterImage(monster.name));
    expect(url).toMatch(/\.webp(?:\?|$)/);
  });
  it.each(WEAPONS)("weapon $id — $name", weapon => {
    const url = getWeaponImageById(weapon.id);
    expect(url).toBeTruthy(); expect(url).toBe(getWeaponImage(weapon.name));
  });
  it.each(Object.values(ITEMS))("item $itemId — $name", item => {
    const url = getItemImageById(item.itemId);
    expect(url).toBeTruthy(); expect(url).toBe(getItemImage(item.name));
  });
  it("does not conceal unknown IDs using supplied names", () => {
    expect(getMonsterImageById(999, MONSTERS[0].name)).toBeNull();
    expect(getWeaponImageById("missing")).toBeNull(); expect(getItemImageById("missing")).toBeNull();
  });
  it("resolves class portraits and every die including the upgrade", () => {
    for (const name of ALL_CLASSES) expect(getHeroPortrait(name)).toContain("/hero_portraits/class_portrait/");
    for (let die = 1; die <= 6; die++) expect(getDiceImage(die)).toBeTruthy();
    expect(getDiceUpgradeImage()).toBeTruthy();
  });
});

describe("Stage 2: content execution smoke coverage (not full ability certification)", () => {
  it.each(WEAPONS)("weapon $id — $name equips and executes its class action", weapon => {
    const className = ALL_CLASSES.find(c => c === weapon.className)!;
    const state = initializeGame(createDefaultConfig({ seed: `weapon-${weapon.id}` }), [{ className, suit: "spades", position: 1 }, ...party.slice(1)]);
    state.party.heroes[0].weapon = { ...weapon, id: `instance-${weapon.id}`, weaponId: weapon.id };
    const rng = RngEngine.deserialize(state.rng!);
    const next = startCombat(state, rng); next.combat!.activeSide = "heroes";
    rng.setPhysicalActionRoll(`hero_action_${next.party.heroes[0].name}`, 4);
    const result = executeHeroAction(next, rng, next.party.heroes[0].id, next.combat!.monster.id).state;
    expect(result.party.heroes[0].weapon.weaponId).toBe(weapon.id);
    expect(result.log.some(e => e.type === "DICE_ROLLED" && e.actorId === next.party.heroes[0].id)).toBe(true);
    expect(result.party.heroes.every(h => h.currentHp >= 0 && h.currentHp <= h.maxHp)).toBe(true);
  });
  for (const className of ALL_CLASSES) for (const suit of ["clubs", "hearts"] as Suit[]) {
    const spec = suit === "clubs" ? CLASS_DATA[className].specializations.black : CLASS_DATA[className].specializations.red;
    it(`${className} / ${spec.name} starts and activates its specialization`, () => {
      const state = initializeGame(createDefaultConfig({ seed: `${className}-${suit}` }), [{ className, suit, position: 1 }, ...party.slice(1)]);
      const rng = RngEngine.deserialize(state.rng!); let next = startCombat(state, rng);
      next.combat!.activeSide = "heroes";
      const hero = next.party.heroes[0]; const rune = ITEMS["Mystic Rune"];
      hero.items = [{ ...rune, id: "rune", quantity: 1 }];
      next = useItem(next, hero.id, rune.itemId, next.combat!.monster.id, rng);
      expect(next.party.heroes[0].oncePerCombat[`spec_${className}_${spec.name}`]).toBe(true);
      expect(next.party.heroes[0].items).toHaveLength(0);
    });
    for (let roll = 1; roll <= 6; roll++) it(`${className} / ${spec.name}: natural action ${roll} executes`, () => {
      const state = initializeGame(createDefaultConfig({ seed: "class-tables" }), [{ className, suit, position: 1 }, ...party.slice(1)]);
      const rng = RngEngine.deserialize(state.rng!); const next = startCombat(state, rng);
      next.combat!.activeSide = "heroes"; rng.setPhysicalRolls([roll]);
      const result = executeHeroAction(next, rng, next.party.heroes[0].id, next.combat!.monster.id).state;
      expect(result.log.some(e => e.type === "DICE_ROLLED" && e.actorId === next.party.heroes[0].id)).toBe(true);
      for (const h of result.party.heroes) { expect(h.currentHp).toBeGreaterThanOrEqual(0); expect(h.currentHp).toBeLessThanOrEqual(h.maxHp); }
    });
  }
  for (const monster of MONSTERS) for (let roll = 1; roll <= 6; roll++) it(`${monster.name}: natural action ${roll} executes`, () => {
    const state = initializeGame(createDefaultConfig({ seed: "monster-tables" }), party);
    const rng = RngEngine.deserialize(state.rng!);
    const next = startCombat(state, rng, { forcedMonsterId: monster.id, isFinalBoss: monster.id === 21 });
    rng.setPhysicalRolls([roll]); const result = executeMonsterTurn(next, rng);
    expect(result.combat!.monster.monsterId).toBe(monster.id);
    expect(result.combat!.combatResult || result.combat!.activeSide === "heroes").toBeTruthy();
    for (const h of result.party.heroes) { expect(h.currentHp).toBeGreaterThanOrEqual(0); expect(h.currentHp).toBeLessThanOrEqual(h.maxHp); }
  });
  it.each(Object.values(ITEMS))("$name has an executable effect and valid consumption", item => {
    const { state, rng } = encounter(); state.combat!.activeSide = "heroes";
    const hero = state.party.heroes[0]; hero.currentHp = 1;
    hero.items = [{ ...item, id: "item-coverage", quantity: 1 }];
    const next = useItem(state, hero.id, item.itemId, state.combat!.monster.id, rng);
    if (item.itemId === "lucky_charm") { expect(next).toBe(state); return; }
    expect(next).not.toBe(state); expect(next.party.heroes[0].items).toHaveLength(0);
  });
  it.each(Object.keys(PERMANENT_UPGRADES))("%s purchases exactly once and records its cost", name => {
    const { state } = encounter(); state.party.gold = 10000;
    const next = buyUpgrade(state, name, state.party.heroes[0].id);
    expect(next.party.heroes[0].upgrades.some(u => u.name === name)).toBe(true);
    expect(next.stats.goldSpent).toBe(state.party.gold - next.party.gold);
  });
  it.each(Object.keys(HEALING_SERVICES))("%s applies to an eligible target", name => {
    const { state } = encounter(); state.party.gold = 10000;
    const hero = state.party.heroes[0]; hero.currentHp = 1;
    if (name.startsWith("Revive")) { hero.alive = false; hero.currentHp = 0; }
    const next = buyHealing(state, name, hero.id);
    expect(next.party.heroes[0].currentHp).toBeGreaterThan(hero.currentHp);
    expect(next.party.heroes[0].alive).toBe(true);
  });
  it("enumerates 32 authored rooms with unique IDs, including valid split choices", () => {
    const rooms = ([1, 2, 3] as const).flatMap(createRoomsForTier);
    expect(rooms).toHaveLength(32); expect(new Set(rooms.map(r => r.roomId)).size).toBe(32);
    expect(rooms[31].type).toBe("final_boss");
    for (const room of rooms) if (room.type === "split") expect(room.splitOptions?.length).toBe(2);
  });
});
