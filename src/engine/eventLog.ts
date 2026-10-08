import type { GameEvent, GameEventType } from "../types/events";
import type { GameState } from "../types/gameState";
import { generateId } from "../utils/ids";

let eventSequence = 0;

export function resetEventSequence(): void {
  eventSequence = 0;
}

export function createEvent(
  type: GameEventType,
  summary: string,
  options: {
    actorId?: string;
    targetIds?: string[];
    details?: Record<string, unknown>;
    visibleToPlayer?: boolean;
  } = {}
): GameEvent {
  eventSequence++;
  return {
    id: generateId("event"),
    type,
    timestamp: Date.now(),
    sequence: eventSequence,
    actorId: options.actorId,
    targetIds: options.targetIds,
    summary,
    details: options.details,
    visibleToPlayer: options.visibleToPlayer ?? true,
  };
}

const MAX_LOG_ENTRIES = 500;

export function addEvent(state: GameState, event: GameEvent): GameState {
  let stats = state.stats;
  if (event.type === "DAMAGE_APPLIED" && typeof event.details?.damage === "number" && event.details.damage > 0 && event.actorId) {
    const damageByHero = { ...stats.damageByHero };
    const damageByMonster = { ...stats.damageByMonster };
    // Bootstrap old saves from the events they still carry. Earlier pruned
    // history cannot be reconstructed; new runs retain totals from event one.
    const events = stats.damageByHero && stats.damageByMonster ? [event] : [...state.log, event];
    for (const entry of events) {
      const damage = entry.details?.damage;
      if (entry.type !== "DAMAGE_APPLIED" || typeof damage !== "number" || damage <= 0 || !entry.actorId) continue;
      const hero = state.party.heroes.find(h => h.id === entry.actorId || h.pet?.id === entry.actorId || h.secondPet?.id === entry.actorId);
      if (hero) damageByHero[hero.id] = (damageByHero[hero.id] ?? 0) + damage;
      else {
        const name = typeof entry.details?.attackerName === "string" ? entry.details.attackerName : entry.summary.split(" dealt ")[0];
        damageByMonster[name] = (damageByMonster[name] ?? 0) + damage;
      }
    }
    stats = { ...stats, damageByHero, damageByMonster };
  }
  // Stage 3 telemetry accumulators — maintained at the canonical event
  // boundary so per-hero aggregates survive bounded-log pruning.
  if (event.type === "DAMAGE_APPLIED" && typeof event.details?.damage === "number" && event.details.damage > 0) {
    const targets = event.targetIds ?? [];
    if (targets.some(t => state.party.heroes.some(h => h.id === t))) {
      const received = { ...stats.damageReceivedByHero };
      for (const t of targets) {
        if (state.party.heroes.some(h => h.id === t)) {
          received[t] = (received[t] ?? 0) + (event.details.damage as number);
        }
      }
      stats = { ...stats, damageReceivedByHero: received };
    }
  }
  if (event.type === "HEAL_APPLIED" && typeof event.details?.amount === "number" && event.details.amount > 0) {
    const targets = event.targetIds ?? [];
    if (targets.some(t => state.party.heroes.some(h => h.id === t))) {
      const healing = { ...stats.healingByHero };
      for (const t of targets) {
        if (state.party.heroes.some(h => h.id === t)) {
          healing[t] = (healing[t] ?? 0) + (event.details.amount as number);
        }
      }
      stats = { ...stats, healingByHero: healing };
    }
  }

  let log = [...state.log, event];
  if (log.length > MAX_LOG_ENTRIES) {
    const setup = log.filter(e => e.type === "GAME_STARTED" || e.type === "PARTY_CREATED" || (e.type === "DICE_ROLLED" && e.summary.includes("Welcome Bonus"))).slice(0, 5);
    const setupIds = new Set(setup.map(e => e.id));
    log = [...setup, ...log.filter(e => !setupIds.has(e.id)).slice(-(MAX_LOG_ENTRIES - setup.length))];
  }
  return {
    ...state,
    stats,
    log,
  };
}

export function emitEvent(
  state: GameState,
  type: GameEventType,
  summary: string,
  options: {
    actorId?: string;
    targetIds?: string[];
    details?: Record<string, unknown>;
    visibleToPlayer?: boolean;
  } = {}
): GameState {
  // A resumed run can have a higher sequence than this module's counter.
  eventSequence = Math.max(eventSequence, state.log[state.log.length - 1]?.sequence ?? 0);
  const event = createEvent(type, summary, options);
  return addEvent(state, event);
}

export function getEventsByType(state: GameState, type: GameEventType): GameEvent[] {
  return state.log.filter((e) => e.type === type);
}

export function getRecentEvents(state: GameState, count: number): GameEvent[] {
  return state.log.slice(-count);
}

export function filterEvents(
  state: GameState,
  predicate: (e: GameEvent) => boolean
): GameEvent[] {
  return state.log.filter(predicate);
}

export function searchEvents(state: GameState, query: string): GameEvent[] {
  const lower = query.toLowerCase();
  return state.log.filter((e) => e.summary.toLowerCase().includes(lower));
}

export function getEventCount(state: GameState): number {
  return state.log.length;
}

export function formatEventLog(event: GameEvent): string {
  const parts: string[] = [];
  parts.push(`[#${event.sequence}]`);
  parts.push(event.type);
  if (event.actorId) parts.push(`(${event.actorId})`);
  parts.push("—");
  parts.push(event.summary);
  return parts.join(" ");
}
