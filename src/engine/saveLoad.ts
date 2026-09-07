import type { GameState, SaveData } from "../types/gameState";
import { WEAPONS } from "../data/weapons";
import { ITEMS } from "../data/items";
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

    // Populate tags/itemId on legacy saves that predate the tag system
    if (migrated.party?.heroes) {
      migrated = {
        ...migrated,
        party: {
          ...migrated.party,
          heroes: migrated.party.heroes.map((h) => {
            let newHero = h;
            // Backfill weapon tags from WeaponData
            if (newHero.weapon && !newHero.weapon.tags) {
              const weaponData = WEAPONS.find(w => w.id === newHero.weapon!.weaponId || w.name === newHero.weapon!.name);
              if (weaponData) {
                newHero = { ...newHero, weapon: { ...newHero.weapon, tags: weaponData.tags } };
              }
            }
            // Backfill item tags and itemId from ItemData
            if (newHero.items && newHero.items.length > 0) {
              const updatedItems = newHero.items.map(i => {
                if (i.tags && i.itemId) return i;
                const itemData = ITEMS[i.name as keyof typeof ITEMS];
                if (itemData) {
                  return { ...i, itemId: itemData.itemId, tags: itemData.tags };
                }
                return i;
              });
              newHero = { ...newHero, items: updatedItems };
            }
            return newHero;
          }),
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
 * Structural validation for a SaveData object. Checks that the parsed JSON
 * has the required top-level fields and that gameState has the minimum
 * required shape (party with heroes, meta, spire). Returns true if valid.
 */
function isValidSaveShape(data: unknown): data is SaveData {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  if (typeof d.version !== "string") return false;
  if (typeof d.savedAt !== "string") return false;
  if (typeof d.name !== "string") return false;
  const gs = d.gameState;
  if (typeof gs !== "object" || gs === null) return false;
  const g = gs as Record<string, unknown>;
  // Minimum required gameState fields.
  if (typeof g.phase !== "string") return false;
  // Phase must be a known GamePhase value, not an arbitrary string.
  if (!VALID_PHASES.has(g.phase)) return false;
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
  // RNG must be present and well-shaped (or absent, which is tolerated).
  if (g.rng !== undefined && g.rng !== null) {
    if (typeof g.rng !== "object") return false;
    const rng = g.rng as Record<string, unknown>;
    if (typeof rng.seed !== "string") return false;
    if (typeof rng.step !== "number") return false;
    // Bound the step: a negative, non-finite, or absurdly large step is not a
    // valid replay position and would loop unboundedly in deserialize.
    if (!Number.isFinite(rng.step) || rng.step < 0 || rng.step > 1_000_000) return false;
  }
  return true;
}

export function loadSave(saveData: SaveData): GameState | null {
  try {
    if (!isValidSaveShape(saveData)) {
      console.error("Save data failed structural validation");
      return null;
    }
    if (saveData.version !== VERSION) {
      console.warn(`Save version mismatch: ${saveData.version} vs ${VERSION}`);
    }
    const migrated = migrateLegacyState(saveData.gameState);
    // Validate that the RNG can be deserialized (throws on malformed data).
    if (migrated.rng) {
      try {
        RngEngine.deserialize(migrated.rng);
      } catch (e) {
        console.error("Save data has corrupt RNG, clearing RNG field:", e);
        return { ...migrated, rng: undefined as any };
      }
    }
    return migrated;
  } catch (e) {
    console.error("Failed to load save:", e);
    return null;
  }
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

export function getAutosave(): SaveData | null {
  try {
    let raw = localStorage.getItem(AUTOSAVE_KEY);
    // Fall back to the legacy autosave key if the current one is absent, so
    // players who upgrade mid-run do not lose their autosave.
    if (!raw) raw = localStorage.getItem(LEGACY_AUTOSAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    return { ...data, gameState: migrateLegacyState(data.gameState) };
  } catch {
    return null;
  }
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
  try {
    const data = JSON.parse(json);
    // loadSave performs structural + semantic validation.
    return loadSave(data as SaveData);
  } catch {
    return null;
  }
}

export function clearAllSaves(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(AUTOSAVE_KEY);
}
