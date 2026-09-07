/**
 * Vyridian's Verdict — a cosmetic narrative epilogue for finished runs.
 *
 * The megaplan describes this as: "A run is already a mythic trial, and
 * statistics can describe its character. Brief authored epilogue based
 * on survival, sacrifice, restraint or resilience."
 *
 * This is a COSMETIC layer only. It reads run statistics and produces
 * a short, atmospheric prose passage. It introduces no new rules,
 * no balance effects, and no hidden ending conditions.
 *
 * The verdict is determined by which "archetype" the run's stats most
 * strongly reflect. Multiple archetypes can coexist; the primary one
 * is chosen by the highest score.
 */

import type { GameState } from "../types/gameState";
import type { RunStats } from "../types/ui";

export interface VerdictArchetype {
  /** Stable identifier for this archetype. */
  id: string;
  /** Display title shown to the player. */
  title: string;
  /** The verdict prose. */
  text: string;
  /** Numeric weight (higher = more strongly matched). */
  weight: number;
}

/**
 * Evaluate a finished run and return its verdict archetypes, sorted
 * by weight descending. The first element is the primary verdict.
 */
export function computeVerdict(state: GameState): VerdictArchetype[] {
  const stats = state.stats;
  const isVictory = state.phase === "victory";
  const heroesAlive = state.party.heroes.filter((h) => h.alive).length;
  const totalHeroes = state.party.heroes.length;
  const goldRemaining = state.party.gold;

  const archetypes: VerdictArchetype[] = [];

  // ─── The Unbroken (victory, no deaths, all heroes alive) ───────
  if (isVictory && stats.deaths === 0 && heroesAlive === totalHeroes) {
    archetypes.push({
      id: "unbroken",
      title: "The Unbroken",
      text: "Vyridian crumbles, and not one of you fell. The Spire remembers this. There are songs that only the unwounded can sing, and you will sing them on the long road home.",
      weight: 100,
    });
  }

  // ─── The Sacrificed (victory, but heroes died along the way) ───
  if (isVictory && stats.deaths > 0) {
    const fallen = totalHeroes - heroesAlive;
    archetypes.push({
      id: "sacrificed",
      title: "The Sacrificed",
      text: fallen > 0
        ? `Vyridian is fallen, but ${fallen === 1 ? "one of your own did not rise to see it" : `${fallen} of your own did not rise to see it`}. Victory carved from loss is still victory. The Spire keeps its tally, and it does not forget the price.`
        : "Vyridian is fallen, and the cost is written in the names of the fallen. Victory carved from loss is still victory.",
      weight: 80 + stats.deaths * 5,
    });
  }

  // ─── The Resilient (victory with revivals — came back from death) ─
  if (isVictory && stats.revivals > 0) {
    archetypes.push({
      id: "resilient",
      title: "The Resilient",
      text: `You were broken, and you chose to mend. ${stats.revivals === 1 ? "One hero walked back from the edge of death" : `${stats.revivals} times, a hero walked back from the edge of death`}. Vyridian could not make the fallen stay down. That refusal is its own kind of strength.`,
      weight: 70 + stats.revivals * 8,
    });
  }

  // ─── The Flawless (many perfect combats — tactical mastery) ─────
  if (stats.perfectCombats >= 3) {
    archetypes.push({
      id: "flawless",
      title: "The Flawless",
      text: `${stats.perfectCombats} battles ended without a scratch. You read the cards, placed the APCs, and left nothing to chance. Vyridian was the final proof that precision is its own form of courage.`,
      weight: 60 + stats.perfectCombats * 3,
    });
  }

  // ─── The Frugal (low gold spent — restraint and economy) ────────
  if (isVictory && stats.goldSpent < stats.goldEarned * 0.4 && stats.goldEarned > 0) {
    archetypes.push({
      id: "frugal",
      title: "The Frugal",
      text: `You hoarded ${goldRemaining} gold through the entire Spire and still toppled its master. Some called it greed. Vyridian called it impossible. You call it patience.`,
      weight: 55,
    });
  }

  // ─── The Defiant (defeat, but reached the final boss) ───────────
  if (!isVictory && stats.bossPhaseReached) {
    archetypes.push({
      id: "defiant",
      title: "The Defiant",
      text: `You reached Vyridian. You saw ${stats.bossPhaseReached}. You did not survive it. But the Spire knows your name now, and the next party that climbs will walk in the shadow of your courage. The Spire does not forget those who fall at its peak.`,
      weight: 75,
    });
  }

  // ─── The Fallen (defeat before the final boss) ──────────────────
  if (!isVictory && !stats.bossPhaseReached) {
    archetypes.push({
      id: "fallen",
      title: "The Fallen",
      text: `The Spire claims another party. You cleared ${stats.roomsCleared} rooms before the end. It was not enough. But it was something. The next climbers will find the path you carved, and they will go further.`,
      weight: 50,
    });
  }

  // ─── The Item Master (many items used — resourceful) ────────────
  if (stats.itemsUsed >= 5) {
    archetypes.push({
      id: "item_master",
      title: "The Resourceful",
      text: `${stats.itemsUsed} items spent. Every potion, every charm, every bomb — turned to purpose. You understood that the Spire's gifts are not for hoarding. Vyridian learned that a prepared party is more dangerous than a sharp blade.`,
      weight: 40 + stats.itemsUsed * 2,
    });
  }

  // Sort by weight descending
  archetypes.sort((a, b) => b.weight - a.weight);

  // If no archetypes matched (shouldn't happen, but be safe), add a default
  if (archetypes.length === 0) {
    archetypes.push({
      id: "traveler",
      title: "The Traveler",
      text: "Your run has ended. The Spire is quiet, and the path behind you is yours alone to remember.",
      weight: 1,
    });
  }

  return archetypes;
}

/**
 * Get the primary (highest-weight) verdict for a run.
 */
export function getPrimaryVerdict(state: GameState): VerdictArchetype {
  const archetypes = computeVerdict(state);
  return archetypes[0];
}
