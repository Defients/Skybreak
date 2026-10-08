/**
 * Stage 3/4 — structured telemetry extraction.
 *
 * All records are DERIVED from authoritative engine state at the run
 * boundary — no ad hoc instrumentation inside gameplay code, and no
 * invented data. Missing metrics stay missing.
 *
 * Metric semantics (documented contract):
 *   - damageDealt: DAMAGE_APPLIED totals attributed to hero actorIds
 *     (includes pet damage — pets are attributed to their owner hero).
 *     Counts applied damage after mitigation; overkill IS included.
 *   - damageReceived: DAMAGE_APPLIED totals where the hero is a targetId.
 *   - healingReceived: EFFECTIVE healing restored (post-clamp HP delta,
 *     including revive restoration and rest-room heals). Pre-Stage-4
 *     records accumulated the pre-clamp requested amount — treat legacy
 *     values as approximate.
 *   - itemsUsed: consumptions counted at useItem() (stats.itemsUsedByHero).
 *   - deaths: cumulative per-hero deaths from stats.deathsByHero — survives
 *     bounded-log pruning. For legacy states lacking the accumulator, falls
 *     back to counting retained HERO_DIED events (may undercount).
 *   - Encounter outcomes are only populated from an observed COMBAT_ENDED.
 *     Unclosed spans are "in-progress"/"unknown" — never fabricated as
 *     retreat or victory.
 *   - Encounters are reconstructed from the retained event span; if the
 *     log was pruned, early encounters are absent and completeness is
 *     "partial".
 */
import type { GameState } from "../types/gameState";
import type { GameEvent } from "../types/events";
import type { HeroRunRecord, EncounterRecord, EncounterOutcome, TelemetryCompleteness } from "../types/experiment";
import type { Suit } from "../types/cards";
import type { PartySetupChoice } from "./gameState";

export const EVENT_LOG_CAPACITY = 500;
export const TELEMETRY_SCHEMA_VERSION = 2;

/** True when the bounded event log shows evidence of pruning. */
export function logWasTruncated(state: GameState): boolean {
  if (state.log.length < EVENT_LOG_CAPACITY) return false;
  const seqs = state.log.map((e) => e.sequence);
  for (let i = 1; i < seqs.length; i++) {
    if (seqs[i] > seqs[i - 1] + 1) return true;
  }
  return true; // exactly at capacity with contiguous seqs — ambiguous; flag partial
}

/** Per-hero records from final state + cumulative stats. */
export function buildHeroRecords(
  state: GameState,
  partyChoices: PartySetupChoice[]
): HeroRunRecord[] {
  const dmgByHero = state.stats.damageByHero ?? {};
  const dmgReceived = state.stats.damageReceivedByHero ?? {};
  const healByHero = state.stats.healingByHero ?? {};
  const itemsByHero = state.stats.itemsUsedByHero ?? {};
  // Prefer the authoritative cumulative accumulator (survives pruning).
  // Fall back to retained-log counting only for pre-Stage-4 states, where
  // the count may be partial — the run-level completeness flag discloses.
  const deathsByHero = state.stats.deathsByHero ?? countEventsByTargetRecord(state.log, "HERO_DIED");

  return state.party.heroes.map((h) => {
    const setup = partyChoices.find((c) => `hero_${c.position}` === h.id);
    return {
      heroId: h.id,
      className: h.className,
      specialization: h.specialization,
      suit: setup?.suit ?? (("clubs") as Suit),
      position: h.position,
      alive: h.alive,
      currentHp: h.currentHp,
      maxHp: h.maxHp,
      damageDealt: dmgByHero[h.id] ?? 0,
      damageReceived: dmgReceived[h.id] ?? 0,
      healingReceived: healByHero[h.id] ?? 0,
      itemsUsed: itemsByHero[h.id] ?? 0,
      deaths: deathsByHero[h.id] ?? 0,
    };
  });
}

function countEventsByTargetRecord(log: GameEvent[], type: GameEvent["type"]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const e of log) {
    if (e.type !== type) continue;
    for (const t of e.targetIds ?? []) m[t] = (m[t] ?? 0) + 1;
  }
  return m;
}

/**
 * Reconstruct encounter records by pairing COMBAT_STARTED with the next
 * COMBAT_ENDED in the retained log.
 *
 * Honesty contract:
 *   - `closed: true` + a result → a COMBAT_ENDED with that result was seen.
 *   - `closed: true` + "unknown" → COMBAT_ENDED seen, result value missing.
 *   - `closed: false` + "in-progress" → span still open when the run's
 *     evidence ended (mid-combat termination).
 *   - `closed: false` + "unknown" → span superseded without an observed end
 *     (a later COMBAT_STARTED appeared) — boundary not reconstructible.
 * No fallback fabricates victory or retreat.
 */
export function buildEncounterRecords(
  state: GameState,
  opts: { terminatedMidCombat?: boolean } = {}
): {
  encounters: EncounterRecord[];
  completeness: TelemetryCompleteness;
} {
  const log = state.log;
  const truncated = logWasTruncated(state);
  const encounters: EncounterRecord[] = [];

  let open: {
    monsterName: string;
    isElite: boolean;
    isMiniBoss: boolean;
    isFinalBoss: boolean;
    rounds: number;
    damageDealtByHeroes: number;
    heroDeaths: number;
    complete: boolean;
  } | null = null;

  const heroIds = new Set(state.party.heroes.map((h) => h.id));

  const flush = (result: EncounterOutcome, closed: boolean) => {
    if (!open) return;
    encounters.push({
      index: encounters.length,
      monsterName: open.monsterName,
      isElite: open.isElite,
      isMiniBoss: open.isMiniBoss,
      isFinalBoss: open.isFinalBoss,
      result,
      closed,
      rounds: open.rounds,
      damageDealtByHeroes: open.damageDealtByHeroes,
      heroDeaths: open.heroDeaths,
      complete: open.complete && closed,
    });
    open = null;
  };

  for (const e of log) {
    if (e.type === "COMBAT_STARTED") {
      flush("unknown", false); // superseded without observed end
      const d = e.details ?? {};
      open = {
        monsterName: typeof d.monsterName === "string" ? d.monsterName : "Unknown",
        isElite: d.isElite === true,
        isMiniBoss: d.isMiniBoss === true,
        isFinalBoss: d.isFinalBoss === true,
        rounds: 0,
        damageDealtByHeroes: 0,
        heroDeaths: 0,
        complete: !truncated,
      };
      continue;
    }
    if (!open) continue;
    if (e.type === "TURN_STARTED") open.rounds++;
    else if (e.type === "DAMAGE_APPLIED" && e.actorId && heroIds.has(e.actorId)) {
      const dmg = e.details?.damage;
      if (typeof dmg === "number" && dmg > 0) open.damageDealtByHeroes += dmg;
    } else if (e.type === "HERO_DIED") {
      open.heroDeaths += (e.targetIds ?? []).filter((t) => heroIds.has(t)).length || 1;
    } else if (e.type === "COMBAT_ENDED") {
      const r = e.details?.result;
      const outcome: EncounterOutcome =
        r === "victory" || r === "defeat" || r === "retreat" ? r : "unknown";
      flush(outcome, true);
    }
  }
  // Unclosed span at end of evidence: mid-combat termination vs lost
  // boundary — distinguished by the run's terminal state.
  flush(opts.terminatedMidCombat ? "in-progress" : "unknown", false);

  return {
    encounters,
    completeness: truncated ? "partial" : "complete",
  };
}
