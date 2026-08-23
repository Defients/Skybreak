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
  const log = [...state.log, event];
  if (log.length > MAX_LOG_ENTRIES) {
    log.splice(0, log.length - MAX_LOG_ENTRIES);
  }
  return {
    ...state,
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
