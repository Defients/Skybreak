import { describe, it, expect } from "vitest";
import { startCombat, checkCombatEnd, applyDamage, calculateDamage, cleanupCombat, grantRewards } from "../engine/combatEngine";
import { executeMonsterTurn } from "../engine/monsterAbilityEngine";
import { executeHeroAction } from "../engine/heroAbilityEngine";
import { initializeGame, createDefaultConfig, type PartySetupChoice } from "../engine/gameState";
import { RngEngine } from "../utils/random";
import { getLivingHeroes, getHeroById } from "../engine/rulesEngine";
import type { GameState } from "../types/gameState";

/**
 * SA-1 — Canonical Combat Termination regression suite.
 *
 * Proves that terminal-state detection is owned by the canonical engine path:
 *   executeHeroAction / executeMonsterTurn → checkCombatEnd → combatResult
 * No test manually assigns combatResult (except where explicitly testing the
 * consumer side of an already-terminal state). These lock the invariant that
 * playable / sim / hybrid / batch all resolve terminal state through the same
 * engine functions.
 */
describe("SA-1 Canonical Combat Termination", () => {
  const sampleParty: PartySetupChoice[] = [
    { className: "Bladedancer", suit: "spades", position: 1 },
    { className: "Manipulator", suit: "hearts", position: 2 },
    { className: "Tracker", suit: "clubs", position: 3 },
  ];

  function createTestState(seed = "sa1-term"): { state: GameState; rng: RngEngine } {
    const config = createDefaultConfig({ seed });
    const state = initializeGame(config, sampleParty);
    const rng = new RngEngine(seed);
    return { state, rng };
  }

  /** Force the next `count` RNG steps to roll 6 (guarantees max hero rolls). */
  function forceHighRolls(rng: RngEngine, count: number): void {
    const start = rng.currentStep;
    for (let i = 0; i < count; i++) rng.forceResult(start + i, 0.999);
  }

  it("monster killed by hero action sets combatResult=victory via the engine (no manual assignment)", () => {
    const { state, rng } = createTestState("sa1-hero-kill");
    let combatState = startCombat(state, rng);
    // Run the opening monster turn to reach the heroes' side.
    combatState = executeMonsterTurn(combatState, rng);
    if (!combatState.combat) throw new Error("combat lost");
    // Weaken the monster to 3 HP so a max-roll hero action kills it.
    combatState = {
      ...combatState,
      combat: {
        ...combatState.combat,
        monster: { ...combatState.combat.monster, currentHp: 3, alive: true },
        activeSide: "heroes",
        completedHeroTurns: [],
      },
    };
    const hero = getLivingHeroes(combatState)[0];
    forceHighRolls(rng, 20);
    const after = executeHeroAction(combatState, rng, hero.id, combatState.combat!.monster.id).state;
    // The engine must have set combatResult without any manual help.
    expect(after.combat?.combatResult).toBe("victory");
    expect(after.combat?.monster.alive).toBe(false);
  });

  it("monster killed by indirect damage (applyDamage) is detected by checkCombatEnd", () => {
    const { state, rng } = createTestState("sa1-indirect-kill");
    const combatState = startCombat(state, rng);
    // Simulate an indirect/status-damage source killing the monster.
    const res = applyDamage(combatState, combatState.combat!.monster.id, "poison", calculateDamage({ base: combatState.combat!.monster.currentHp }), true);
    expect(res.killed).toBe(true);
    const endCheck = checkCombatEnd(res.state);
    expect(endCheck.result).toBe("victory");
  });

  it("last hero killed during monster turn sets combatResult=defeat via the engine", () => {
    const { state, rng } = createTestState("sa1-hero-wipe");
    const combatState = startCombat(state, rng);
    // Drive all heroes to 1 HP so the monster turn wipes them.
    const weakened: GameState = {
      ...combatState,
      party: {
        ...combatState.party,
        heroes: combatState.party.heroes.map(h => ({ ...h, currentHp: 1, alive: true })),
      },
    };
    let current = weakened;
    // Force high monster rolls so the monster deals damage and wipes the party.
    forceHighRolls(rng, 40);
    // executeMonsterTurn does not guard on activeSide, so drive it directly.
    for (let i = 0; i < 15 && current.combat && !current.combat.combatResult; i++) {
      current = executeMonsterTurn(current, rng);
    }
    expect(current.combat?.combatResult).toBe("defeat");
    expect(getLivingHeroes(current).length).toBe(0);
  });

  it("terminal evaluation is idempotent: resolving an already-terminal state does not double-grant rewards", () => {
    const { state, rng } = createTestState("sa1-idempotent");
    const combatState = startCombat(state, rng);
    // Kill the monster and mark victory.
    const killed = applyDamage(combatState, combatState.combat!.monster.id, "test", calculateDamage({ base: combatState.combat!.monster.currentHp }), true);
    const terminal: GameState = {
      ...killed.state,
      combat: { ...killed.state.combat!, combatResult: "victory" as any },
    };
    const goldBefore = terminal.party.gold;
    // Calling grantRewards twice must not double the gold.
    const rewardedOnce = grantRewards(terminal);
    const goldAfterOnce = rewardedOnce.party.gold;
    // grantRewards guards on combatResult === "victory"; after cleanupCombat the
    // combat ref is gone so a second grantRewards is a no-op.
    const cleaned = cleanupCombat(rewardedOnce);
    const rewardedTwice = grantRewards(cleaned);
    expect(rewardedTwice.party.gold).toBe(goldAfterOnce);
    expect(goldAfterOnce).toBeGreaterThan(goldBefore);
  });

  it("checkCombatEnd returns ongoing for a healthy mid-combat state", () => {
    const { state, rng } = createTestState("sa1-ongoing");
    const combatState = startCombat(state, rng);
    const endCheck = checkCombatEnd(combatState);
    expect(endCheck.result).toBe("ongoing");
  });

  it("full engine combat loop reaches a terminal combatResult without manual checkCombatEnd calls", () => {
    const { state, rng } = createTestState("sa1-full-loop");
    let combatState = startCombat(state, rng);
    // Weaken the monster so the loop terminates quickly.
    combatState = {
      ...combatState,
      combat: { ...combatState.combat!, monster: { ...combatState.combat!.monster, currentHp: 2 } },
    };
    let safety = 0;
    while (combatState.combat && !combatState.combat.combatResult && safety < 60) {
      safety++;
      if (combatState.combat.activeSide === "monster") {
        combatState = executeMonsterTurn(combatState, rng);
        continue;
      }
      // Heroes' side: each living hero acts once, then end their turn.
      const order = combatState.combat.heroTurnOrder.filter(id => getHeroById(combatState, id)?.alive);
      for (const heroId of order) {
        if (!combatState.combat || combatState.combat.combatResult) break;
        if (combatState.combat.completedHeroTurns.includes(heroId)) continue;
        combatState = executeHeroAction(combatState, rng, heroId, combatState.combat.monster.id).state;
        combatState = {
          ...combatState,
          combat: { ...combatState.combat!, completedHeroTurns: [...combatState.combat!.completedHeroTurns, heroId] },
        };
      }
      // If not already terminal, hand back to monster.
      if (combatState.combat && !combatState.combat.combatResult) {
        combatState = {
          ...combatState,
          combat: {
            ...combatState.combat!,
            activeSide: "monster",
            completedHeroTurns: [],
            round: combatState.combat.round + 1,
          },
        };
      }
    }
    expect(combatState.combat?.combatResult).toBeDefined();
    expect(["victory", "defeat", "retreat"]).toContain(combatState.combat?.combatResult);
  });
});
