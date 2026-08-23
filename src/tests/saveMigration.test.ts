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
