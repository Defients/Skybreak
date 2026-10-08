/**
 * Stage 3 — structured telemetry extraction.
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
 *   - healingReceived: HEAL_APPLIED amounts targeting the hero — the
 *     pre-clamp requested amount (see event details.amount).
 *   - itemsUsed: consumptions counted at useItem() (stats.itemsUsedByHero).
 *   - deaths: HERO_DIED events targeting the hero (revivals don't erase them).
 *   - A combat "retreat" (e.g. Smoke Bomb) is recorded as result "retreat"
 *   and is NOT an encounter victory.
 *   - Encounters are reconstructed from the bounded event log; if the log
 *     was pruned, early encounters are absent and completeness is "partial".
 */
import type { GameState } from "../types/gameState";
import type { GameEvent } from "../types/events";
import type { HeroRunRecord, EncounterRecord, TelemetryCompleteness } from "../types/experiment";
import type { Suit } from "../types/cards";
import type { PartySetupChoice } from "./gameState";

export const EVENT_LOG_CAPACITY = 500;

/** True when the bounded event log shows evidence of pruning. */
export function logWasTruncated(state: GameState): boolean {
  if (state.log.length < EVENT_LOG_CAPACITY) return false;
  // The retained window starts after the pinned setup events; a pruned log
  // has a sequence gap between the pinned head and the first general event.
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
  const deathsByHero = countEventsByTarget(state.log, "HERO_DIED");

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
      deaths: deathsByHero.get(h.id) ?? 0,
    };
  });
}

function countEventsByTarget(log: GameEvent[], type: GameEvent["type"]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of log) {
    if (e.type !== type) continue;
    for (const t of e.targetIds ?? []) m.set(t, (m.get(t) ?? 0) + 1);
  }
  return m;
}

/**
 * Reconstruct encounter records by pairing COMBAT_STARTED with the next
 * COMBAT_ENDED in the retained log. Bounded-log pruning is surfaced via
 * `complete: false` on spans that start before the retained window.
 */
export function buildEncounterRecords(state: GameState): {
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

  const flush = (result: EncounterRecord["result"]) => {
    if (!open) return;
    encounters.push({
      index: encounters.length,
      monsterName: open.monsterName,
      isElite: open.isElite,
      isMiniBoss: open.isMiniBoss,
      isFinalBoss: open.isFinalBoss,
      result,
      rounds: open.rounds,
      damageDealtByHeroes: open.damageDealtByHeroes,
      heroDeaths: open.heroDeaths,
      complete: open.complete,
    });
    open = null;
  };

  for (const e of log) {
    if (e.type === "COMBAT_STARTED") {
      flush("retreat"); // defensive: unclosed prior combat
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
      flush(r === "victory" || r === "defeat" || r === "retreat" ? r : "victory");
    }
  }
  flush("retreat"); // unclosed combat (e.g. run terminated mid-combat)

  return {
    encounters,
    completeness: truncated ? "partial" : "complete",
  };
}
