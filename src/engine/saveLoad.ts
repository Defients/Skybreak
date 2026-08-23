import type { GameState, SaveData } from "../types/gameState";
import { WEAPONS } from "../data/weapons";
import { ITEMS } from "../data/items";

const STORAGE_KEY = "skyward_ascent_saves";
const AUTOSAVE_KEY = "skyward_ascent_autosave";
const VERSION = "0.1.0";

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
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(saveData));
    return true;
  } catch (e) {
    console.error("Failed to autosave:", e);
    return false;
  }
}

export function loadSave(saveData: SaveData): GameState | null {
  try {
    if (saveData.version !== VERSION) {
      console.warn(`Save version mismatch: ${saveData.version} vs ${VERSION}`);
    }
    return migrateLegacyState(saveData.gameState);
  } catch (e) {
    console.error("Failed to load save:", e);
    return null;
  }
}

export function getAllSaves(): SaveData[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SaveData[];
  } catch {
    return [];
  }
}

export function getAutosave(): SaveData | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
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
    const data = JSON.parse(json) as SaveData;
    return loadSave(data);
  } catch {
    return null;
  }
}

export function clearAllSaves(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(AUTOSAVE_KEY);
}
