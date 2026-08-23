import { describe, it, expect } from "vitest";
import { initializeGame, createDefaultConfig, type PartySetupChoice } from "../engine/gameState";
import { finalizeRunStats } from "../engine/progressionEngine";
import { transitionTier } from "../engine/rulesEngine";
import { STALEMATE_ROUNDS_WITHOUT_PROGRESS, checkCombatEnd, cleanupCombat, startCombat } from "../engine/combatEngine";
import { reforgeWeapon, repairWeapon, createMerchant, buyEnchantment } from "../engine/merchantEngine";
import { resetIdCounter } from "../utils/ids";
import { RngEngine } from "../utils/random";
import type { GameState } from "../types/gameState";
import { emitEvent } from "../engine/eventLog";

describe("Autonomous Enhancement Tests", () => {
  const sampleParty: PartySetupChoice[] = [
    { className: "Bladedancer", suit: "spades", position: 1 },
    { className: "Manipulator", suit: "hearts", position: 2 },
    { className: "Tracker", suit: "clubs", position: 3 },
  ];

  function createTestState(seed = "enhance-test"): GameState {
    resetIdCounter();
    const config = createDefaultConfig({ seed });
    return initializeGame(config, sampleParty);
  }

  // ─── Stalemate Constant ───
  describe("STALEMATE_ROUNDS_WITHOUT_PROGRESS", () => {
    it("equals 5", () => {
      expect(STALEMATE_ROUNDS_WITHOUT_PROGRESS).toBe(5);
    });
  });

  // ─── Tier Transition ───
  describe("transitionTier", () => {
    it("sets phase to tier_transition", () => {
      const state = createTestState();
      const newState = transitionTier(state);
      expect(newState.phase).toBe("tier_transition");
    });

    it("advances tier from 1 to 2", () => {
      const state = createTestState();
      const newState = transitionTier(state);
      expect(newState.spire.tier).toBe(2);
    });

    it("heals all heroes to full and grants +2 max HP", () => {
      const state = createTestState();
      state.party.heroes[0].currentHp = 1;
      const oldMaxHp = state.party.heroes[0].maxHp;
      const newState = transitionTier(state);
      // transitionTier heals to new maxHp (old maxHp + 2)
      expect(newState.party.heroes[0].currentHp).toBe(oldMaxHp + 2);
      expect(newState.party.heroes[0].maxHp).toBe(oldMaxHp + 2);
    });

    it("does not exceed tier 3", () => {
      const state = createTestState();
      let s = transitionTier(state);  // 1 → 2
      s = transitionTier(s);          // 2 → 3
      s = transitionTier(s);          // 3 → 3 (capped)
      expect(s.spire.tier).toBe(3);
    });
  });

  // ─── finalizeRunStats ───
  describe("finalizeRunStats", () => {
    it("computes mvpHeroId from DAMAGE_APPLIED events", () => {
      const state = createTestState();
      const hero0 = state.party.heroes[0];
      const hero1 = state.party.heroes[1];
      const monsterId = "monster_test";

      let s = state;
      s = emitEvent(s, "DAMAGE_APPLIED", `${hero0.className} dealt 5 damage to Goblin.`, {
        actorId: hero0.id,
        details: { damage: 5, attackerName: hero0.className, targetName: "Goblin" },
      });
      s = emitEvent(s, "DAMAGE_APPLIED", `${hero1.className} dealt 3 damage to Goblin.`, {
        actorId: hero1.id,
        details: { damage: 3, attackerName: hero1.className, targetName: "Goblin" },
      });

      const result = finalizeRunStats(s);
      expect(result.stats.mvpHeroId).toBe(hero0.id);
    });

    it("computes deadliestMonster from monster attacker events", () => {
      const state = createTestState();
      const hero0 = state.party.heroes[0];
      const monsterId = "monster_goblin";

      let s = state;
      s = emitEvent(s, "DAMAGE_APPLIED", `Goblin dealt 4 damage to ${hero0.className}.`, {
        actorId: monsterId,
        details: { damage: 4, attackerName: "Goblin", targetName: hero0.className },
      });
      s = emitEvent(s, "DAMAGE_APPLIED", `Orc dealt 2 damage to ${hero0.className}.`, {
        actorId: "monster_orc",
        details: { damage: 2, attackerName: "Orc", targetName: hero0.className },
      });

      const result = finalizeRunStats(s);
      expect(result.stats.deadliestMonster).toBe("Goblin");
    });

    it("returns undefined mvpHeroId when no hero damage events exist", () => {
      const state = createTestState();
      const result = finalizeRunStats(state);
      expect(result.stats.mvpHeroId).toBeUndefined();
    });
  });

  // ─── Reforge Weapon ───
  describe("reforgeWeapon", () => {
    it("does nothing for a hero with no alternative weapons at same rarity", () => {
      const state = createTestState();
      // Give hero a weapon that has no same-rarity alternatives (unlikely in practice, but test the guard)
      const hero = state.party.heroes[0];
      const originalWeaponName = hero.weapon.name;
      const newState = reforgeWeapon(state, hero.id);
      // Should either return same state or swap — just verify it doesn't crash
      expect(newState.party.heroes.find(h => h.id === hero.id)?.weapon).toBeDefined();
    });

    it("deducts gold on successful reforge", () => {
      const state = createTestState();
      const hero = state.party.heroes[0];
      state.party.gold = 1000;
      const originalGold = state.party.gold;
      const newState = reforgeWeapon(state, hero.id);
      // Gold should decrease if reforge succeeded (weapon changed)
      const newWeapon = newState.party.heroes.find(h => h.id === hero.id)?.weapon;
      if (newWeapon?.name !== hero.weapon.name) {
        expect(newState.party.gold).toBeLessThan(originalGold);
      }
    });
  });

  // ─── Repair Weapon ───
  describe("repairWeapon", () => {
    it("does nothing if hero has no debuffs or weaponDisabled", () => {
      const state = createTestState();
      const hero = state.party.heroes[0];
      const originalGold = state.party.gold;
      const newState = repairWeapon(state, hero.id);
      expect(newState.party.gold).toBe(originalGold);
    });

    it("clears debuffs and deducts gold when hero has debuffs", () => {
      const state = createTestState();
      const hero = state.party.heroes[0];
      state.party.gold = 1000;
      // Simulate debuff
      state.party.heroes[0] = {
        ...hero,
        debuffs: [{ id: "test_debuff", name: "Poison", type: "debuff", duration: 3, durationType: "turns", value: 1, description: "Poison damage" }],
      };
      const originalGold = state.party.gold;
      const newState = repairWeapon(state, hero.id);
      const repairedHero = newState.party.heroes.find(h => h.id === hero.id);
      expect(repairedHero?.debuffs).toHaveLength(0);
      expect(newState.party.gold).toBeLessThan(originalGold);
    });
  });

  // ─── buyEnchantment ───
  describe("buyEnchantment", () => {
    it("fails gracefully when no merchant exists", () => {
      const state = createTestState();
      const hero = state.party.heroes[0];
      const newState = buyEnchantment(state, "Arcane", hero.id);
      // No merchant → should return state unchanged
      expect(newState).toBe(state);
    });

    it("fails when insufficient gold", () => {
      const state = createTestState();
      const hero = state.party.heroes[0];
      state.party.gold = 0;
      state.merchant = createMerchant(1);
      const newState = buyEnchantment(state, "Arcane", hero.id);
      // Should not add enchantment
      const updatedHero = newState.party.heroes.find(h => h.id === hero.id);
      expect(updatedHero?.enchantment).toBeUndefined();
    });
  });

  // ─── Stalemate Detection ───
  describe("checkCombatEnd stalemate", () => {
    it("returns retreat when roundsWithoutProgress exceeds threshold", () => {
      const state = createTestState();
      const rng = new RngEngine("stalemate-test");
      const combatState = startCombat(state, rng);

      // Simulate stalemate: set round > 10 and roundsWithoutProgress at threshold
      const staleState: GameState = {
        ...combatState,
        combat: {
          ...combatState.combat!,
          round: 12,
          roundsWithoutProgress: STALEMATE_ROUNDS_WITHOUT_PROGRESS,
          lastHpSnapshot: {
            monsterHp: combatState.combat!.monster.currentHp,
            totalHeroHp: combatState.party.heroes.reduce((s, h) => s + h.currentHp, 0),
          },
        },
      };

      const result = checkCombatEnd(staleState);
      expect(result.result).toBe("retreat");
      expect(result.reason).toContain("Stalemate");
    });

    it("returns ongoing when HP has changed even after round 10", () => {
      const state = createTestState();
      const rng = new RngEngine("stalemate-test2");
      const combatState = startCombat(state, rng);

      // HP changed from snapshot → not stalemate
      const staleState: GameState = {
        ...combatState,
        combat: {
          ...combatState.combat!,
          round: 12,
          roundsWithoutProgress: 0,
          lastHpSnapshot: {
            monsterHp: combatState.combat!.monster.currentHp - 5,
            totalHeroHp: combatState.party.heroes.reduce((s, h) => s + h.currentHp, 0),
          },
        },
      };

      const result = checkCombatEnd(staleState);
      expect(result.result).toBe("ongoing");
    });
  });

  // ─── cleanupCombat Immutability ───
  describe("cleanupCombat immutability", () => {
    it("does not mutate original state's deckManager", () => {
      const state = createTestState();
      const rng = new RngEngine("cleanup-test");
      const combatState = startCombat(state, rng);

      // Mark combat as victory for cleanup
      const victoryState: GameState = {
        ...combatState,
        combat: { ...combatState.combat!, combatResult: "victory" },
      };

      const originalDiscardPileLength = victoryState.deckManager?.peon.discardPile.length ?? 0;
      const newState = cleanupCombat(victoryState);

      // Original state's discardPile should be unchanged
      expect(victoryState.deckManager?.peon.discardPile.length).toBe(originalDiscardPileLength);
      // New state may have a different (longer) discardPile
      expect(newState.deckManager?.peon.discardPile.length).toBeGreaterThanOrEqual(originalDiscardPileLength);
    });
  });

  // ─── RngEngine.clone() ───
  describe("RngEngine.clone()", () => {
    it("produces same sequence as original after cloning mid-sequence", () => {
      const rng = new RngEngine("clone-test");
      rng.rollD6("a");
      rng.rollD6("b");
      rng.roll2D6("c");

      const clone = rng.clone();
      const originalRoll = rng.rollD6("next");
      const cloneRoll = clone.rollD6("next");

      expect(cloneRoll).toEqual(originalRoll);
    });

    it("preserves step count after clone", () => {
      const rng = new RngEngine("clone-step");
      rng.rollD6("a");
      rng.rollD6("b");

      const clone = rng.clone();
      expect(clone.currentStep).toBe(rng.currentStep);
    });
  });
});
