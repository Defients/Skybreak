import { describe, it, expect } from "vitest";
import { migrateLegacyState } from "../engine/saveLoad";
import type { GameState } from "../types/gameState";

function makeMinimalState(overrides: Record<string, unknown>): GameState {
  return {
    phase: "exploration",
    rng: { seed: "test", step: 0 },
    spire: {
      tier: 1,
      roomIndex: 0,
      rooms: [],
      currentRoom: null,
      splitChoicePending: false,
    },
    party: {
      heroes: [],
      gold: 0,
      maxHpBoostUsed: false,
    },
    settings: {
      difficulty: "normal",
      config: {
        seed: "test",
        difficulty: "normal",
        partyComposition: [],
      },
    },
    stats: {
      totalTurns: 0,
      roomsCleared: 0,
      tier3RoomsCleared: 0,
      perfectCombats: 0,
      deaths: 0,
      revivals: 0,
      goldEarned: 0,
      goldSpent: 0,
      itemsUsed: 0,
      biggestDamageEvent: 0,
      biggestDamageDescription: "",
    },
    log: [],
    ...overrides,
  } as unknown as GameState;
}

describe("Save Migration — Astrizda Canon", () => {
  it("migrates legacy boss name Apexus → Vyridian", () => {
    const state = makeMinimalState({
      combat: {
        round: 1,
        turnCount: 0,
        activeSide: "monster",
        monster: {
          id: "m1",
          monsterId: 21,
          name: "Apexus, the Astral Overlord",
          sourceCard: { rank: "FB", suit: "none" } as any,
          type: "finalBoss",
          currentHp: 30,
          maxHp: 35,
          tokens: [],
          buffs: [],
          debuffs: [],
          specialState: {},
          phase: "Phase 1 — Astral Form",
          alive: true,
          untargetable: false,
          immune: false,
        },
        summons: [],
        environment: { suit: "none", name: "Test", effect: "", description: "" },
        heroTurnOrder: [],
        completedHeroTurns: [],
        isMiniBoss: false,
        isFinalBoss: true,
        roundsWithoutProgress: 0,
        lastHpSnapshot: { monsterHp: 35, totalHeroHp: 30 },
      } as any,
    });

    const migrated = migrateLegacyState(state);
    expect(migrated.combat!.monster.name).toBe("Vyridian, the Astril Conductor");
  });

  it("migrates legacy phase names to canon phase names", () => {
    const legacyPhases = [
      "Phase 1 — Astral Form",
      "Phase 2 — Void Form",
      "Phase 3 — Transcendent",
    ];
    const expectedPhases = [
      "Phase 1 — The Measure",
      "Phase 2 — The Conduction",
      "Phase 3 — The Harmonic Trial",
    ];

    for (let i = 0; i < legacyPhases.length; i++) {
      const state = makeMinimalState({
        combat: {
          round: 1,
          turnCount: 0,
          activeSide: "monster",
          monster: {
            id: "m1",
            monsterId: 21,
            name: "Apexus, the Astral Overlord",
            sourceCard: { rank: "FB", suit: "none" } as any,
            type: "finalBoss",
            currentHp: 30,
            maxHp: 35,
            tokens: [],
            buffs: [],
            debuffs: [],
            specialState: {},
            phase: legacyPhases[i],
            alive: true,
            untargetable: false,
            immune: false,
          },
          summons: [],
          environment: { suit: "none", name: "Test", effect: "", description: "" },
          heroTurnOrder: [],
          completedHeroTurns: [],
          isMiniBoss: false,
          isFinalBoss: true,
          roundsWithoutProgress: 0,
          lastHpSnapshot: { monsterHp: 35, totalHeroHp: 30 },
        } as any,
      });

      const migrated = migrateLegacyState(state);
      expect(migrated.combat!.monster.phase).toBe(expectedPhases[i]);
    }
  });

  it("migrates legacy weapon name Astral Rod → Astril Rod", () => {
    const state = makeMinimalState({
      party: {
        heroes: [
          {
            id: "h1",
            name: "Test Hero",
            className: "Manipulator",
            specialization: "Test",
            position: 1,
            suit: "hearts",
            currentHp: 10,
            maxHp: 10,
            alive: true,
            apcs: [],
            tokens: [],
            buffs: [],
            debuffs: [],
            weapon: { id: "w1", weaponId: "astral_rod", name: "Astral Rod" },
            items: [],
            upgrades: [],
          } as any,
        ],
        gold: 0,
        maxHpBoostUsed: false,
      },
    });

    const migrated = migrateLegacyState(state);
    expect(migrated.party.heroes[0].weapon.name).toBe("Astril Rod");
  });

  it("migrates legacy bossPhaseReached in stats", () => {
    const state = makeMinimalState({
      stats: {
        totalTurns: 5,
        roomsCleared: 3,
        tier3RoomsCleared: 0,
        perfectCombats: 0,
        deaths: 0,
        revivals: 0,
        goldEarned: 100,
        goldSpent: 50,
        itemsUsed: 0,
        biggestDamageEvent: 10,
        biggestDamageDescription: "test",
        bossPhaseReached: "Phase 2 — Void Form",
      },
    });

    const migrated = migrateLegacyState(state);
    expect(migrated.stats.bossPhaseReached).toBe("Phase 2 — The Conduction");
  });

  it("does not alter already-canonical state", () => {
    const state = makeMinimalState({
      combat: {
        round: 1,
        turnCount: 0,
        activeSide: "monster",
        monster: {
          id: "m1",
          monsterId: 21,
          name: "Vyridian, the Astril Conductor",
          sourceCard: { rank: "FB", suit: "none" } as any,
          type: "finalBoss",
          currentHp: 30,
          maxHp: 35,
          tokens: [],
          buffs: [],
          debuffs: [],
          specialState: {},
          phase: "Phase 2 — The Conduction",
          alive: true,
          untargetable: false,
          immune: false,
        },
        summons: [],
        environment: { suit: "none", name: "Test", effect: "", description: "" },
        heroTurnOrder: [],
        completedHeroTurns: [],
        isMiniBoss: false,
        isFinalBoss: true,
        roundsWithoutProgress: 0,
        lastHpSnapshot: { monsterHp: 35, totalHeroHp: 30 },
      } as any,
    });

    const migrated = migrateLegacyState(state);
    expect(migrated.combat!.monster.name).toBe("Vyridian, the Astril Conductor");
    expect(migrated.combat!.monster.phase).toBe("Phase 2 — The Conduction");
  });

  it("handles state with no combat gracefully", () => {
    const state = makeMinimalState({});
    const migrated = migrateLegacyState(state);
    expect(migrated).toBeDefined();
    expect(migrated.phase).toBe("exploration");
  });

  it("handles null/undefined stats gracefully", () => {
    const state = makeMinimalState({});
    const migrated = migrateLegacyState(state);
    expect(migrated.stats).toBeDefined();
  });
});

// ============================================================
// Stage 1 — Legacy item-ID migration (Task A)
//
// `resolveItemData` resolves strictly by `itemId`, so the migration boundary
// must do the legacy display-name → stable-ID resolution itself. These tests
// prove the migration assigns canonical itemIds/tags, preserves instance
// state, covers shared inventory, tolerates unknown content, and is
// idempotent without mutating its input.
// ============================================================

describe("Stage 1 — legacy item-ID migration", () => {
  function makeHeroWithItems(items: Record<string, unknown>[]) {
    return {
      id: "h1",
      heroId: 1,
      name: "Test Hero",
      className: "Bladedancer",
      specialization: "Shadowblade",
      position: 1,
      alive: true,
      currentHp: 10,
      maxHp: 10,
      baseMaxHp: 10,
      apcs: [],
      temporaryApcs: [],
      permanentApcs: [],
      tokens: [],
      buffs: [],
      debuffs: [],
      weapon: {
        id: "w1",
        weaponId: "swift_blade",
        name: "Swift Blade",
        rarity: "Common",
        className: "Bladedancer",
        effect: "",
        description: "",
        tags: ["swift_blade"],
      },
      items,
      upgrades: [],
      oncePerCombat: {},
      perTurnFlags: {},
    } as any;
  }

  function stateWithHeroItems(items: Record<string, unknown>[], shared?: Record<string, unknown>[]): GameState {
    return makeMinimalState({
      party: {
        heroes: [makeHeroWithItems(items)],
        sharedInventory: shared ?? [],
        sharedInventoryLimit: 2,
        gold: 0,
        turnOrder: ["h1"],
        deadHeroIds: [],
      },
    });
  }

  it("assigns a canonical itemId to a legacy item resolved by display name", () => {
    const state = stateWithHeroItems([
      { id: "inst-1", name: "Minor Potion", effect: "Heal 8 HP instantly", stackLimit: 2, quantity: 1 },
    ]);
    const migrated = migrateLegacyState(state);
    const item = migrated.party.heroes[0].items[0];
    expect(item.itemId).toBe("minor_potion");
    expect(item.tags).toContain("healing");
    // Instance state preserved.
    expect(item.id).toBe("inst-1");
    expect(item.name).toBe("Minor Potion");
    expect(item.quantity).toBe(1);
  });

  it("backfills missing tags on an item that already has a valid itemId", () => {
    const state = stateWithHeroItems([
      { id: "inst-2", name: "Bomb", itemId: "bomb", effect: "Deal 5 damage to all enemies", stackLimit: 2, quantity: 1 },
    ]);
    const migrated = migrateLegacyState(state);
    const item = migrated.party.heroes[0].items[0];
    expect(item.itemId).toBe("bomb");
    expect(item.tags).toEqual(["bomb"]);
  });

  it("backfills missing canonical fields without overwriting existing ones", () => {
    const state = stateWithHeroItems([
      // Legacy item missing effect/stackLimit/isJoker entirely.
      { id: "inst-3", name: "Major Potion", quantity: 1 },
    ]);
    const migrated = migrateLegacyState(state);
    const item = migrated.party.heroes[0].items[0];
    expect(item.itemId).toBe("major_potion");
    expect(item.effect).toBe("Heal to full instantly");
    expect(item.stackLimit).toBe(2);
    expect(item.isJoker).toBe(true);
  });

  it("migrates every item in a stacked inventory and preserves quantities", () => {
    const state = stateWithHeroItems([
      { id: "a", name: "Minor Potion", effect: "", stackLimit: 2, quantity: 2 },
      { id: "b", name: "Smoke Bomb", effect: "x", stackLimit: 1, quantity: 1 },
      { id: "c", name: "Lucky Charm", itemId: "lucky_charm", effect: "x", stackLimit: 2, quantity: 1, tags: ["lucky_charm"] },
    ]);
    const migrated = migrateLegacyState(state);
    const items = migrated.party.heroes[0].items;
    expect(items.map(i => i.itemId)).toEqual(["minor_potion", "smoke_bomb", "lucky_charm"]);
    expect(items.map(i => i.quantity)).toEqual([2, 1, 1]);
    expect(items.map(i => i.id)).toEqual(["a", "b", "c"]);
  });

  it("migrates shared inventory items", () => {
    const state = stateWithHeroItems([], [
      { id: "shared-1", name: "Treasure Map", effect: "x", stackLimit: 1, quantity: 1 },
    ]);
    const migrated = migrateLegacyState(state);
    const item = migrated.party.sharedInventory[0];
    expect(item.itemId).toBe("treasure_map");
    expect(item.tags).toContain("treasure_map");
    expect(item.id).toBe("shared-1");
  });

  it("leaves already-migrated items unchanged", () => {
    const original = {
      id: "inst-ok",
      name: "Guardian Angel",
      itemId: "guardian_angel",
      effect: "Auto-revive at 50% HP",
      stackLimit: 2,
      quantity: 1,
      tags: ["guardian_angel"],
    };
    const state = stateWithHeroItems([original]);
    const migrated = migrateLegacyState(state);
    expect(migrated.party.heroes[0].items[0]).toEqual(original);
  });

  it("preserves unknown or obsolete items without deleting or rewriting them", () => {
    const state = stateWithHeroItems([
      { id: "mystery", name: "Astral Philter", quantity: 1, effect: "Obsolete relic", stackLimit: 1 },
      { id: "known", name: "Power Scroll", quantity: 1, effect: "", stackLimit: 3 },
    ]);
    const migrated = migrateLegacyState(state);
    const items = migrated.party.heroes[0].items;
    // Unknown item preserved verbatim — not dropped, not given a wrong ID.
    expect(items[0].id).toBe("mystery");
    expect(items[0].name).toBe("Astral Philter");
    expect((items[0] as any).itemId).toBeUndefined();
    // The recognizable sibling still migrates.
    expect(items[1].itemId).toBe("power_scroll");
  });

  it("repairs a corrupted itemId when the display name resolves canonically", () => {
    const state = stateWithHeroItems([
      { id: "corrupt", name: "Speed Potion", itemId: "bogus_not_an_item", effect: "Take extra turn", stackLimit: 1, quantity: 1 },
    ]);
    const migrated = migrateLegacyState(state);
    const item = migrated.party.heroes[0].items[0];
    expect(item.itemId).toBe("speed_potion");
    expect(item.tags).toContain("speed_potion");
  });

  it("is idempotent — migrating twice yields the same result", () => {
    const state = stateWithHeroItems([
      { id: "a", name: "Minor Potion", quantity: 2 },
      { id: "b", name: "Astral Philter", quantity: 1 },
    ]);
    const once = migrateLegacyState(state);
    const twice = migrateLegacyState(once);
    expect(twice).toEqual(once);
  });

  it("does not mutate the input state object", () => {
    const state = stateWithHeroItems([
      { id: "a", name: "Minor Potion", quantity: 1 },
    ]);
    const before = JSON.stringify(state);
    migrateLegacyState(state);
    expect(JSON.stringify(state)).toBe(before);
  });
});
