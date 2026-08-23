import { describe, it, expect, beforeEach } from "vitest";
import { useGameStore } from "../app/gameStore";
import { startCombat } from "../engine/combatEngine";
import { runCombatToCompletion, type CombatRunnerConfig } from "../engine/combatRunner";
import { aiPlayHeroTurn } from "../engine/aiController";
import { getHeroById, getLivingHeroes } from "../engine/rulesEngine";
import { initializeGame, createDefaultConfig, type PartySetupChoice } from "../engine/gameState";
import { RngEngine } from "../utils/random";
import { resetEventSequence } from "../engine/eventLog";
import { resetIdCounter } from "../utils/ids";
import type { GameState } from "../types/gameState";
import type { CombatStrategy, ItemUsageStrategy } from "../types/batch";
import type { Difficulty } from "../types/simulation";

/**
 * P2 — Real differential tests.
 *
 * Runs the exact same initialized combat state and RNG snapshot through:
 *   (A) Headless: runCombatToCompletion (sync runner)
 *   (B) Store adapter: drive useGameStore step-by-step via doHeroAction/doUseItem/doEndTurn
 *
 * Compares a normalized canonical state (excluding event log, timestamps,
 * and sequence numbers). Records the first divergent field if any.
 *
 * Matrix: 25 seeds × 4 strategies × 2 difficulties = 200 differential runs.
 */
describe("P2 Differential — headless vs store adapter", () => {
  const parties: PartySetupChoice[][] = [
    [
      { className: "Bladedancer", suit: "spades", position: 1 },
      { className: "Manipulator", suit: "hearts", position: 2 },
      { className: "Tracker", suit: "clubs", position: 3 },
    ],
    [
      { className: "Guardian", suit: "diamonds", position: 1 },
      { className: "Bladedancer", suit: "hearts", position: 2 },
      { className: "Manipulator", suit: "spades", position: 3 },
    ],
  ];

  const strategies: CombatStrategy[] = ["aggressive", "defensive", "balanced", "survivalist"];
  const difficulties: Difficulty[] = ["normal", "hard"];
  const seeds = Array.from({ length: 25 }, (_, i) => `diff-${i + 1}`);

  const itemUsageStrategy: ItemUsageStrategy = "conservative";

  beforeEach(() => {
    useGameStore.getState().doResetGame();
    resetEventSequence();
    resetIdCounter();
  });

  /**
   * Normalize a GameState for comparison: strip event log, timestamps,
   * sequence numbers, and other presentation-only fields. Keep only
   * canonical game-state fields.
   */
  function normalize(state: GameState): Record<string, unknown> {
    const combat = state.combat;
    return {
      phase: state.phase,
      combatResult: combat?.combatResult ?? null,
      round: combat?.round ?? 0,
      turnCount: combat?.turnCount ?? 0,
      totalTurns: state.stats.totalTurns,
      monstersKilled: state.stats.deaths,
      roomsCleared: state.stats.roomsCleared,
      gold: state.party.gold,
      heroes: state.party.heroes.map(h => ({
        name: h.name,
        alive: h.alive,
        currentHp: h.currentHp,
        maxHp: h.maxHp,
        items: h.items.map(i => ({ name: i.name, quantity: i.quantity })),
        buffs: h.buffs.map(b => b.name),
        debuffs: h.debuffs.map(d => d.name),
      })),
      monster: combat ? {
        name: combat.monster.name,
        currentHp: combat.monster.currentHp,
        maxHp: combat.monster.maxHp,
        alive: combat.monster.alive,
      } : null,
      // rngStep excluded: headless runner doesn't persist RNG into state
      // (P3 will make RNG atomic and re-enable this comparison)
    };
  }

  /**
   * Drive the store through combat step-by-step, mimicking useAutoPlay.
   * Returns the final state.
   */
  function driveStoreCombat(
    initialState: GameState,
    rng: RngEngine,
    strategy: CombatStrategy
  ): GameState {
    // Load the initial state into the store
    useGameStore.getState().doLoadState(initialState);
    // Set the RNG engine
    useGameStore.setState({ rng });

    let safety = 0;
    while (safety < 500) {
      safety++;
      const { state, rng: currentRng } = useGameStore.getState();
      if (!state || !currentRng || !state.combat) break;
      if (state.combat.combatResult) break;

      // Monster side: execute via doMonsterTurn
      if (state.combat.activeSide === "monster") {
        useGameStore.getState().doMonsterTurn();
        continue;
      }

      // Hero side
      if (state.combat.activeSide !== "heroes") break;

      const combat = state.combat;
      const nextHeroId = combat.heroTurnOrder.find(
        id => !combat.completedHeroTurns.includes(id) && getHeroById(state, id)?.alive
      );
      if (!nextHeroId) break;

      const healThreshold = 0.3; // conservative
      const decision = aiPlayHeroTurn(state, currentRng, nextHeroId, strategy, { healThreshold });
      if (decision.action === "attack") {
        useGameStore.getState().doHeroAction(nextHeroId, "attack", decision.targetId ?? combat.monster.id);
      } else if (decision.action === "use_item") {
        useGameStore.getState().doUseItem(nextHeroId, decision.itemName!, decision.targetId ?? nextHeroId);
      } else {
        useGameStore.getState().doEndTurn(nextHeroId);
      }
    }

    return useGameStore.getState()!.state!;
  }

  /**
   * Find the first divergent field between two normalized states.
   * Returns a description string, or null if they match.
   */
  function findFirstDivergence(
    a: Record<string, unknown>,
    b: Record<string, unknown>,
    path = ""
  ): string | null {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      const p = path ? `${path}.${key}` : key;
      const va = a[key];
      const vb = b[key];
      if (va === vb) continue;
      if (typeof va === "object" && typeof vb === "object" && va !== null && vb !== null) {
        const sub = findFirstDivergence(va as Record<string, unknown>, vb as Record<string, unknown>, p);
        if (sub) return sub;
      } else {
        return `${p}: ${JSON.stringify(va)} vs ${JSON.stringify(vb)}`;
      }
    }
    return null;
  }

  // Generate all test cases
  for (const party of parties) {
    for (const strategy of strategies) {
      for (const difficulty of difficulties) {
        for (const seed of seeds) {
          it(`${seed}/${strategy}/${difficulty}/${party.map(p => p.className).join("+")}`, () => {
            // Create INDEPENDENT initial states for both paths (startCombat
            // mutates the deck via drawFromDeck, so sharing initState would
            // cause the second path to draw a different monster).
            const config = createDefaultConfig({ seed, difficulty });

            // Path A: headless runner
            const initStateA = initializeGame(config, party);
            const combatStateA = startCombat(initStateA, new RngEngine(seed));
            const rngA = RngEngine.deserialize(combatStateA.rng!);
            const config2: CombatRunnerConfig = { combatStrategy: strategy, itemUsageStrategy };
            const finalA = runCombatToCompletion(combatStateA, rngA, config2);

            // Path B: store adapter — fresh initState + fresh startCombat
            const initStateB = initializeGame(config, party);
            const combatStateB = startCombat(initStateB, new RngEngine(seed));
            const finalB = driveStoreCombat(combatStateB, RngEngine.deserialize(combatStateB.rng!), strategy);

            // Compare normalized states
            const normA = normalize(finalA);
            const normB = normalize(finalB);
            const divergence = findFirstDivergence(normA, normB);
            if (divergence) {
              expect.fail(`First divergence: ${divergence}\nA: ${JSON.stringify(normA, null, 2)}\nB: ${JSON.stringify(normB, null, 2)}`);
            }
            expect(divergence).toBeNull();
          }, 30000);
        }
      }
    }
  }
});
