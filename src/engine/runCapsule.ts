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

import type { Difficulty, GameMode } from "../types/simulation";
import type { HeroClassName } from "../types/heroes";
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

/** Semantic version of the capsule format. Bumped on breaking changes. */
export const CAPSULE_VERSION = 1;

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
  /** Party composition: class + suit + specialization per hero position. */
  party: {
    className: HeroClassName;
    suit: Suit;
    specialization: string;
  }[];
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
  const party = state.party.heroes.map((h) => {
    // Suit is stored on APCs, not on HeroState directly.
    // The first APC's suit is the hero's chosen suit.
    const suit = (h.apcs[0]?.suit ?? h.permanentApcs[0]?.suit ?? "clubs") as Suit;
    return {
      className: h.className,
      suit,
      specialization: h.specialization,
    };
  });

  const capsule: RunCapsule = {
    v: CAPSULE_VERSION,
    type: "skybreak-capsule",
    gameVersion: state.meta.version,
    seed: state.meta.seed,
    difficulty: state.meta.difficulty,
    mode: state.meta.mode,
    party,
    strategies: {
      combat: state.settings.combatStrategy,
      merchant: state.settings.merchantStrategy,
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
    return parsed as RunCapsule;
  } catch {
    return null;
  }
}

/**
 * Type guard / validator for capsule shape.
 */
export function isValidCapsule(value: unknown): value is RunCapsule {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  if (c.v !== CAPSULE_VERSION) return false;
  if (c.type !== "skybreak-capsule") return false;
  if (typeof c.seed !== "string") return false;
  if (typeof c.difficulty !== "string") return false;
  if (typeof c.mode !== "string") return false;
  if (!Array.isArray(c.party)) return false;
  if (typeof c.createdAt !== "string") return false;
  // Party entries must have className (string) and suit (string).
  for (const entry of c.party) {
    if (typeof entry !== "object" || entry === null) return false;
    const e = entry as Record<string, unknown>;
    if (typeof e.className !== "string") return false;
    if (typeof e.suit !== "string") return false;
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
