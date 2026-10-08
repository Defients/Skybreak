import type { GameState, SaveData } from "../types/gameState";
import type { ItemInstance } from "../types/inventory";
import type { RngState } from "../types/gameState";
import { WEAPONS } from "../data/weapons";
import { ITEMS_BY_ID, getItemDataByName } from "../data/items";
import { RngEngine } from "../utils/random";

const STORAGE_KEY = "skybreak_saves";
const AUTOSAVE_KEY = "skybreak_autosave";
// Last-good autosave: the previous autosave is preserved here so a corrupt
// current autosave can be recovered non-destructively.
const AUTOSAVE_LASTGOOD_KEY = "skybreak_autosave_lastgood";
// Quarantine: a fatal-error recovery moves the autosave here instead of
// deleting it, so the user can export/recover it after a reload.
const AUTOSAVE_QUARANTINE_KEY = "skybreak_autosave_quarantine";
// Legacy keys from the pre-rename "Skyward Ascent" build. Saves written under
// these keys are discovered and merged so existing players do not lose runs.
const LEGACY_STORAGE_KEY = "skyward_ascent_saves";
const LEGACY_AUTOSAVE_KEY = "skyward_ascent_autosave";
const VERSION = "0.1.0";

// Valid GamePhase values (must match src/types/gameState.ts GamePhase).
const VALID_PHASES = new Set<string>([
  "setup",
  "exploration",
  "merchant",
  "rest",
  "combat_setup",
  "combat",
  "combat_cleanup",
  "tier_transition",
  "victory",
  "defeat",
]);

// ─── Legacy save migration (Astrizda canon pass) ─────────────────────────────
// Saves created before the canon migration may contain legacy display names.
// Internal keys, IDs, and mechanics are unchanged — only names are remapped.

const LEGACY_MONSTER_NAMES: Record<string, string> = {
  "Apexus, the Astral Overlord": "Vyridian, the Astril Conductor",
};

const LEGACY_PHASE_NAMES: Record<string, string> = {
  "Phase 1 — Astral Form": "Phase 1 — The Measure",
  "Phase 2 — Void Form": "Phase 2 — The Conduction",
  "Phase 3 — Transcendent": "Phase 3 — The Harmonic Trial",
};

const LEGACY_WEAPON_NAMES: Record<string, string> = {
  "Astral Rod": "Astril Rod",
};

/**
 * Migration-boundary item resolution. Unlike the strict runtime resolver
 * (`resolveItemData`, which is ID-only), this upgrades pre-ID save items:
 * a resolvable stable `itemId` wins; otherwise the legacy display name is
 * resolved against canonical item data and the correct `itemId` is assigned.
 *
 * The item's instance `id`, `quantity`, and existing fields are preserved —
 * only missing canonical fields (itemId, tags, effect, stackLimit, isJoker)
 * are backfilled. Items that resolve by neither ID nor name are returned
 * untouched: unknown or obsolete content is preserved explicitly, never
 * silently replaced or deleted.
 */
function migrateItemInstance(item: ItemInstance): ItemInstance {
  const legacy = item as Partial<ItemInstance>;
  const hasValidId =
    typeof legacy.itemId === "string" &&
    legacy.itemId.length > 0 &&
    ITEMS_BY_ID[legacy.itemId] !== undefined;
  const hasTags = Array.isArray(legacy.tags) && legacy.tags.length > 0;
  if (hasValidId && hasTags) return item;

  const data =
    (hasValidId ? ITEMS_BY_ID[legacy.itemId!] : undefined) ??
    (typeof legacy.name === "string" ? getItemDataByName(legacy.name) : undefined);
  if (!data) {
    console.warn(
      `Save migration: unrecognized item "${String(legacy.name)}" — preserving instance unchanged`
    );
    return item;
  }

  return {
    ...(item as ItemInstance),
    itemId: data.itemId,
    tags: hasTags ? item.tags : data.tags,
    effect:
      typeof legacy.effect === "string" && legacy.effect.length > 0
        ? item.effect
        : data.effect,
    stackLimit:
      typeof legacy.stackLimit === "number" ? item.stackLimit : data.stackLimit,
    isJoker: legacy.isJoker ?? data.isJoker,
  };
}

export function migrateLegacyState(state: GameState): GameState {
  try {
    let migrated = state;

    if (migrated.combat?.monster) {
      const monster = migrated.combat.monster;
      const newName = LEGACY_MONSTER_NAMES[monster.name];
      const newPhase = monster.phase ? LEGACY_PHASE_NAMES[monster.phase] : undefined;
      if (newName || newPhase) {
        migrated = {
          ...migrated,
          combat: {
            ...migrated.combat,
            monster: {
              ...monster,
              name: newName ?? monster.name,
              phase: newPhase ?? monster.phase,
            },
          },
        };
      }
    }

    if (migrated.party?.heroes?.some((h) => h.weapon && LEGACY_WEAPON_NAMES[h.weapon.name])) {
      migrated = {
        ...migrated,
        party: {
          ...migrated.party,
          heroes: migrated.party.heroes.map((h) =>
            h.weapon && LEGACY_WEAPON_NAMES[h.weapon.name]
              ? { ...h, weapon: { ...h.weapon, name: LEGACY_WEAPON_NAMES[h.weapon.name] } }
              : h
          ),
        },
      };
    }

    // Populate tags/itemId on legacy saves that predate the tag system —
    // for hero inventories AND the shared party inventory.
    if (migrated.party) {
      const heroes = Array.isArray(migrated.party.heroes)
        ? migrated.party.heroes.map((h) => {
            let newHero = h;
            // Backfill weapon tags from WeaponData
            if (newHero.weapon && !newHero.weapon.tags) {
              const weaponData = WEAPONS.find(w => w.id === newHero.weapon!.weaponId || w.name === newHero.weapon!.name);
              if (weaponData) {
                newHero = { ...newHero, weapon: { ...newHero.weapon, tags: weaponData.tags } };
              }
            }
            // Backfill item tags and itemId via the migration-boundary resolver
            if (Array.isArray(newHero.items) && newHero.items.length > 0) {
              newHero = { ...newHero, items: newHero.items.map(migrateItemInstance) };
            }
            return newHero;
          })
        : migrated.party.heroes;
      migrated = {
        ...migrated,
        party: {
          ...migrated.party,
          heroes,
          sharedInventory: Array.isArray(migrated.party.sharedInventory)
            ? migrated.party.sharedInventory.map(migrateItemInstance)
            : migrated.party.sharedInventory,
        },
      };
    }

    if (migrated.stats?.bossPhaseReached && LEGACY_PHASE_NAMES[migrated.stats.bossPhaseReached]) {
      migrated = {
        ...migrated,
        stats: { ...migrated.stats, bossPhaseReached: LEGACY_PHASE_NAMES[migrated.stats.bossPhaseReached] },
      };
    }

    return migrated;
  } catch {
    // Never let migration break loading — fall back to the raw state
    return state;
  }
}

export function saveGame(state: GameState, name: string = "Manual Save"): boolean {
  try {
    const saveData: SaveData = {
      version: VERSION,
      gameState: state,
      savedAt: new Date().toISOString(),
      name,
    };
    const saves = getAllSaves();
    saves.push(saveData);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
    return true;
  } catch (e) {
    console.error("Failed to save game:", e);
    return false;
  }
}

export function autosave(state: GameState): boolean {
  try {
    const saveData: SaveData = {
      version: VERSION,
      gameState: state,
      savedAt: new Date().toISOString(),
      name: "Autosave",
    };
    // Preserve the previous autosave as last-good before overwriting, so a
    // corrupt current autosave can be recovered non-destructively.
    const prev = localStorage.getItem(AUTOSAVE_KEY);
    if (prev) {
      localStorage.setItem(AUTOSAVE_LASTGOOD_KEY, prev);
    }
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(saveData));
    return true;
  } catch (e) {
    console.error("Failed to autosave:", e);
    return false;
  }
}

/**
 * Structural validation for a raw GameState object: known phase enum, a
 * party with well-formed heroes, and meta/spire objects. The serialized RNG
 * is intentionally NOT part of this check — a corrupt RNG is recoverable
 * (the store rebuilds a deterministic engine from meta.seed), while a
 * corrupt party is not.
 */
function isValidGameStateShape(gs: unknown): gs is GameState {
  if (typeof gs !== "object" || gs === null) return false;
  const g = gs as Record<string, unknown>;
  // Phase must be a known GamePhase value, not an arbitrary string.
  if (typeof g.phase !== "string" || !VALID_PHASES.has(g.phase)) return false;
  if (typeof g.party !== "object" || g.party === null) return false;
  const party = g.party as Record<string, unknown>;
  if (!Array.isArray(party.heroes)) return false;
  // Each hero must be a non-null object with a string id and className.
  // Rejects malformed heroes (e.g. empty objects) that would crash the engine.
  for (const h of party.heroes) {
    if (typeof h !== "object" || h === null) return false;
    const hero = h as Record<string, unknown>;
    if (typeof hero.id !== "string" || hero.id.length === 0) return false;
    if (typeof hero.className !== "string" || hero.className.length === 0) return false;
    if (typeof hero.currentHp !== "number" || typeof hero.maxHp !== "number") return false;
  }
  if (typeof g.meta !== "object" || g.meta === null) return false;
  if (typeof g.spire !== "object" || g.spire === null) return false;
  if (g.welcomeBonusRolls !== undefined) {
    if (!Array.isArray(g.welcomeBonusRolls) || g.welcomeBonusRolls.some(r =>
      typeof r !== "object" || r === null || !Number.isInteger(r.heroId) || ![r.die1, r.die2].every(d => Number.isInteger(d) && d >= 1 && d <= 6))) return false;
  }
  return true;
}

/**
 * A serialized RNG position is usable only if it carries a string seed and a
 * bounded, non-negative, finite step (see RngEngine.deserialize's clamp).
 */
function isValidRngStateShape(rng: unknown): rng is RngState {
  if (typeof rng !== "object" || rng === null) return false;
  const r = rng as Record<string, unknown>;
  if (typeof r.seed !== "string" || r.seed.length === 0) return false;
  if (typeof r.step !== "number") return false;
  if (!Number.isFinite(r.step) || r.step < 0 || r.step > 1_000_000) return false;
  return true;
}

/**
 * Structural validation for a SaveData object: required top-level fields
 * plus a well-shaped gameState. Exported so listing UIs can mark malformed
 * entries instead of crashing on them.
 */
export function isValidSaveShape(data: unknown): data is SaveData {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  if (typeof d.version !== "string") return false;
  if (typeof d.savedAt !== "string") return false;
  if (typeof d.name !== "string") return false;
  return isValidGameStateShape(d.gameState);
}

export type HydrateRejectionReason = "unparseable" | "invalid_shape";

export interface HydrateSuccess {
  ok: true;
  /** Migrated, validated game state, ready for store installation. */
  state: GameState;
  /** Non-fatal issues encountered during hydration (version drift, RNG reset). */
  warnings: string[];
  /** The save's declared version, when present. */
  sourceVersion: string | null;
  /** True when a valid serialized RNG position survived hydration. */
  rngRestored: boolean;
}

export interface HydrateFailure {
  ok: false;
  error: string;
  reason: HydrateRejectionReason;
}

export type HydrateResult = HydrateSuccess | HydrateFailure;

/**
 * The canonical save hydration boundary. Every entry point that installs a
 * persisted or externally supplied game state MUST route through here:
 *
 *   parse (if string) → unwrap SaveData envelope → structural validation →
 *   legacy migration → RNG validation → result
 *
 * Accepts a JSON string, a SaveData envelope, or a bare GameState object.
 * Never mutates its input. Never throws.
 */
export function hydrateSave(input: unknown): HydrateResult {
  // 1. Parse serialized input.
  let parsed: unknown = input;
  if (typeof input === "string") {
    try {
      parsed = JSON.parse(input);
    } catch {
      return { ok: false, error: "Save file is not valid JSON.", reason: "unparseable" };
    }
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, error: "Save data is not an object.", reason: "invalid_shape" };
  }

  const warnings: string[] = [];

  // 2. Unwrap a SaveData envelope when present; otherwise treat the value as
  //    a bare GameState (sandbox/test/engine-internal loads).
  let candidate: unknown = parsed;
  let sourceVersion: string | null = null;
  const rec = parsed as Record<string, unknown>;
  if ("gameState" in rec) {
    candidate = rec.gameState;
    if (typeof rec.version === "string") {
      sourceVersion = rec.version;
      if (rec.version !== VERSION) {
        // Unknown/future versions are tolerated — the structural validator is
        // the real gate — but the drift is reported so it stays visible.
        warnings.push(`Save version ${rec.version} differs from current ${VERSION}; loaded with migration.`);
      }
    } else {
      warnings.push("Save has no version marker; treated as legacy data.");
    }
  }

  // 3. Structural validation of the game state itself.
  if (!isValidGameStateShape(candidate)) {
    return {
      ok: false,
      error: "Save failed structural validation (unknown phase, or missing/malformed party, meta, or spire).",
      reason: "invalid_shape",
    };
  }

  // 4. Version-aware legacy migration (canon names, item IDs/tags, shared
  //    inventory). Never throws — falls back to the input on internal error.
  let migrated = migrateLegacyState(candidate);

  // 5. Serialized RNG ownership. A missing or malformed RNG section is
  //    recoverable: strip it so the store deterministically rebuilds from
  //    meta.seed rather than silently inheriting a corrupt replay position.
  let rngRestored = false;
  if (migrated.rng !== undefined && migrated.rng !== null) {
    if (isValidRngStateShape(migrated.rng)) {
      try {
        RngEngine.deserialize(migrated.rng);
        rngRestored = true;
      } catch {
        // fall through to strip
      }
    }
    if (!rngRestored) {
      migrated = { ...migrated, rng: undefined as unknown as RngState };
      warnings.push("Serialized RNG state was corrupt; replay position will restart from the run seed.");
    }
  } else {
    warnings.push("Save carries no serialized RNG; the run seed will be used.");
  }

  return { ok: true, state: migrated, warnings, sourceVersion, rngRestored };
}

export function loadSave(saveData: SaveData): GameState | null {
  const result = hydrateSave(saveData);
  if (!result.ok) {
    console.error("Failed to load save:", result.error);
    return null;
  }
  for (const w of result.warnings) console.warn(w);
  return result.state;
}

function readCurrentSaves(): SaveData[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SaveData[]) : [];
  } catch {
    return [];
  }
}

function readLegacySaves(): SaveData[] {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SaveData[]) : [];
  } catch {
    return [];
  }
}

export function getAllSaves(): SaveData[] {
  return readCurrentSaves();
}

/**
 * Idempotently import saves from the legacy "skyward_ascent_saves" key into
 * the current "skybreak_saves" key. Merges without overwriting newer saves
 * (dedupes by gameState.meta.gameId). The legacy key is NOT deleted, so the
 * original bytes are retained for recovery. Returns the number imported.
 */
export function importLegacySaves(): number {
  try {
    const legacy = readLegacySaves();
    if (legacy.length === 0) return 0;
    const current = readCurrentSaves();
    const seen = new Set(
      current.map((s) => s.gameState?.meta?.gameId).filter(Boolean) as string[]
    );
    const merged = [...current];
    let added = 0;
    for (const ls of legacy) {
      if (!isValidSaveShape(ls)) continue;
      const id = ls.gameState?.meta?.gameId as string | undefined;
      if (id && seen.has(id)) continue; // don't overwrite a newer current save
      if (id) seen.add(id);
      merged.push(ls);
      added++;
    }
    if (added > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    }
    return added;
  } catch {
    return 0;
  }
}

/**
 * Read the resumable autosave through the recovery chain:
 * current autosave → last-good autosave → legacy "skyward_ascent" autosave.
 * Entries that fail to parse or fail structural validation are skipped
 * (not deleted) so a corrupt current autosave recovers to the last-good
 * copy instead of crashing the Continue flow.
 */
export function getAutosave(): SaveData | null {
  for (const key of [AUTOSAVE_KEY, AUTOSAVE_LASTGOOD_KEY, LEGACY_AUTOSAVE_KEY]) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const data = JSON.parse(raw) as SaveData;
      if (!isValidSaveShape(data)) continue;
      return { ...data, gameState: migrateLegacyState(data.gameState) };
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Move the current autosave to a quarantine key instead of deleting it, so a
 * fatal-error recovery preserves the run for export/recovery. Returns the
 * quarantined bytes (or null if there was nothing to quarantine).
 */
export function quarantineAutosave(): string | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    localStorage.setItem(AUTOSAVE_QUARANTINE_KEY, raw);
    return raw;
  } catch {
    return null;
  }
}

export function getLastGoodAutosave(): SaveData | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_LASTGOOD_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    if (!isValidSaveShape(data)) return null;
    return { ...data, gameState: migrateLegacyState(data.gameState) };
  } catch {
    return null;
  }
}

export function deleteSave(index: number): boolean {
  try {
    const saves = getAllSaves();
    saves.splice(index, 1);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
    return true;
  } catch {
    return false;
  }
}

export function exportSave(state: GameState): string {
  const saveData: SaveData = {
    version: VERSION,
    gameState: state,
    savedAt: new Date().toISOString(),
    name: "Export",
  };
  return JSON.stringify(saveData, null, 2);
}

export function importSave(json: string): GameState | null {
  // hydrateSave is the canonical boundary: parse → validate → migrate → RNG.
  const result = hydrateSave(json);
  return result.ok ? result.state : null;
}

export function clearAllSaves(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(AUTOSAVE_KEY);
}
