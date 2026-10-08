/**
 * Ascent Capsules — compact, versioned reproduction packets for Skybreak runs.
 *
 * A capsule captures the *starting conditions* of a run (seed, difficulty,
 * mode, party composition, strategies) so that the same run can be replayed
 * or shared. It does NOT capture mid-run state; it is a reproduction seed,
 * not a save file.
 *
 * Capsules are intentionally human-readable JSON so they can be copied to
 * clipboard, pasted into chat, or saved as a file.
 */

import type { Difficulty, GameMode, RngMode } from "../types/simulation";
import type { HeroClassName, HeroPosition } from "../types/heroes";
import type { Suit } from "../types/cards";
import type { GameState } from "../types/gameState";
import type {
  CombatStrategy,
  MerchantStrategy,
  RestStrategy,
  SplitStrategy,
  ItemUsageStrategy,
  WeaponUpgradeStrategy,
} from "../types/batch";

/**
 * Semantic version of the capsule format. Bumped on breaking changes.
 *
 * v2: party.suit may be null (unrecorded in pre-`startingParty` saves) and a
 * `replayable` flag reports whether the capsule captures the exact starting
 * conditions. v1 capsules inferred suits from mutable APC state.
 */
export const CAPSULE_VERSION = 2;
/** Versions this build can parse. */
const SUPPORTED_CAPSULE_VERSIONS = new Set([1, CAPSULE_VERSION]);

export interface RunCapsule {
  /** Format version, incremented on breaking schema changes. */
  v: number;
  /** Identifier so consumers can distinguish capsule types. */
  type: "skybreak-capsule";
  /** Game version from state.meta.version, for compatibility checks. */
  gameVersion: string;
  /** The canonical seed — replaying this seed reproduces the run. */
  seed: string;
  difficulty: Difficulty;
  mode: GameMode;
  /** RNG mode from the run config (seeded/manual/physical). */
  rngMode?: RngMode;
  /** Party composition: class + suit + specialization per hero position. */
  party: {
    className: HeroClassName;
    /** Null when the original suit was never recorded (pre-v2 saves). */
    suit: Suit | null;
    specialization: string | null;
    position?: HeroPosition;
  }[];
  /**
   * True when the capsule captures every field needed to exactly reproduce
   * the run's starting conditions. False when any part of the original
   * configuration (e.g. suit) was never recorded — an honest signal so an
   * inexact capsule never masquerades as a fully reproducible one.
   */
  replayable: boolean;
  /** AI strategies (for sim/hybrid/batch modes). */
  strategies?: {
    combat?: CombatStrategy;
    merchant?: MerchantStrategy;
    rest?: RestStrategy;
    split?: SplitStrategy;
    itemUsage?: ItemUsageStrategy;
    weaponUpgrade?: WeaponUpgradeStrategy;
  };
  /** Run outcome (filled when exporting from a finished run). */
  outcome?: "victory" | "defeat" | "retreat";
  /** Final score (filled when exporting from a finished run). */
  score?: number;
  /** Rooms cleared (filled when exporting from a finished run). */
  roomsCleared?: number;
  /** Total turns (filled when exporting from a finished run). */
  totalTurns?: number;
  /** ISO timestamp of when the capsule was created. */
  createdAt: string;
}

/**
 * Build a capsule from a game state. Captures starting conditions and,
 * if the run is finished, the outcome.
 */
export function buildRunCapsule(state: GameState): RunCapsule {
  // The immutable starting-party record is the authoritative source. It is
  // written once at initializeGame and survives APC consumption, item use,
  // and save/load. Saves that predate it have no reliable suit record —
  // APC inference was speculative (consumed/replaced APCs, and clubs-vs-
  // spades or hearts-vs-diamonds cannot be derived from specialization
  // color), so the capsule reports suit: null and replayable: false rather
  // than presenting a guess as replayable data.
  const starting = state.startingParty;
  const party = starting
    ? starting.map((s) => ({
        className: s.className,
        suit: s.suit,
        specialization: s.specialization,
        position: s.position,
      }))
    : state.party.heroes.map((h) => ({
        className: h.className,
        suit: null,
        specialization: h.specialization ?? null,
        position: h.position,
      }));

  const capsule: RunCapsule = {
    v: CAPSULE_VERSION,
    type: "skybreak-capsule",
    gameVersion: state.meta.version,
    seed: state.meta.seed,
    difficulty: state.meta.difficulty,
    mode: state.meta.mode,
    rngMode: state.settings.rngMode,
    party,
    replayable:
      starting !== undefined &&
      starting.length > 0 &&
      party.every((p) => p.suit !== null),
    strategies: {
      combat: state.settings.combatStrategy,
      merchant: state.settings.merchantStrategy,
      itemUsage: state.settings.itemUsageStrategy,
    },
    createdAt: new Date().toISOString(),
  };

  if (state.phase === "victory" || state.phase === "defeat") {
    capsule.outcome = state.phase;
    capsule.roomsCleared = state.spire.roomIndex;
    capsule.totalTurns = state.stats.totalTurns;
    // Score is computed, not stored on state directly.
    // We import lazily to avoid a circular dependency at module load.
  }

  return capsule;
}

/**
 * Serialize a capsule to a compact JSON string for clipboard/share.
 */
export function serializeCapsule(capsule: RunCapsule): string {
  return JSON.stringify(capsule);
}

/**
 * Parse and validate a capsule from a string (clipboard paste, file import).
 * Returns null if the input is not a valid capsule.
 */
export function parseCapsule(input: string): RunCapsule | null {
  try {
    const parsed = JSON.parse(input);
    if (!isValidCapsule(parsed)) return null;
    // Normalize v1 capsules to the current schema: their party.suit values
    // are strings (APC-inferred) and they carry no `replayable` flag. The
    // suits the file asserts are kept as recorded.
    if (parsed.v === 1) {
      const party = (parsed.party as RunCapsule["party"]).map((p) => ({
        ...p,
        specialization: p.specialization ?? null,
      }));
      return {
        ...(parsed as RunCapsule),
        v: CAPSULE_VERSION,
        party,
        replayable: party.every((p) => p.suit !== null),
      };
    }
    return parsed as RunCapsule;
  } catch {
    return null;
  }
}

/**
 * Type guard / validator for capsule shape. Accepts v1 (legacy, string
 * suits) and the current version (nullable suits + `replayable` flag).
 */
export function isValidCapsule(value: unknown): value is RunCapsule {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  if (typeof c.v !== "number" || !SUPPORTED_CAPSULE_VERSIONS.has(c.v)) return false;
  if (c.type !== "skybreak-capsule") return false;
  if (typeof c.seed !== "string") return false;
  if (typeof c.difficulty !== "string") return false;
  if (typeof c.mode !== "string") return false;
  if (!Array.isArray(c.party)) return false;
  if (typeof c.createdAt !== "string") return false;
  // Party entries must have className (string). suit is a string in v1 and
  // string|null in v2.
  for (const entry of c.party) {
    if (typeof entry !== "object" || entry === null) return false;
    const e = entry as Record<string, unknown>;
    if (typeof e.className !== "string") return false;
    if (c.v === 1) {
      if (typeof e.suit !== "string") return false;
    } else if (e.suit !== null && typeof e.suit !== "string") {
      return false;
    }
  }
  return true;
}

/**
 * Copy a capsule to the clipboard. Falls back to a textarea prompt
 * if the Clipboard API is unavailable (non-secure context, older browser).
 */
export async function copyCapsuleToClipboard(capsule: RunCapsule): Promise<boolean> {
  const text = serializeCapsule(capsule);
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy method
  }
  // Legacy fallback: use a temporary textarea + execCommand.
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
