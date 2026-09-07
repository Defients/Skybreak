/**
 * Central asset registry — uses Vite's import.meta.glob to eagerly load
 * all asset URLs at build time. Provides typed helper functions for
 * resolving game entity names to image/audio paths.
 */

// Eagerly import all asset files as URLs
// Using query:"?url", import:"default" (Vite 5+ replacement for deprecated as:"url")
const allAssets = import.meta.glob("../../assets/**/*", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string | { default?: string }>;

/** Convert a glob-relative path to a direct public URL (dev fallback). */
function toPublicUrl(path: string): string {
  return path.replace(/^\.\.\/\.\.\//, "/");
}

/** Extract a string URL from the ?url import, falling back to the public path. */
function resolveUrl(path: string, val: string | { default?: string } | undefined): string | null {
  if (typeof val === "string") return val;
  if (val && typeof val === "object" && typeof val.default === "string") return val.default;
  // Defensive: if Vite dev fails to provide a ?url string, load from the public path.
  return toPublicUrl(path);
}

// Build a normalized lookup map: lowercase filename without extension → URL
const assetMap: Record<string, string> = {};
const assetPathMap: Record<string, string> = {};

for (const [path, raw] of Object.entries(allAssets)) {
  const url = resolveUrl(path, raw);
  if (!url) continue;
  // Store by full path
  assetPathMap[path] = url;
  // Store by normalized filename (lowercase, extension stripped, dashes→underscores)
  // Uses the same normalizeName function as lookup() so keys match queries.
  const filename = path.split("/").pop() || path;
  // Strip the file extension BEFORE normalizing, so "tier1_background.png"
  // becomes key "tier1_background" (matching extensionless lookups), not
  // "tier1_background_png". Handles png/webp/jpg/jpeg/gif/svg/mp3/ogg and
  // uppercase variants.
  const baseName = filename.replace(/\.[a-z0-9]+$/i, "");
  const normalized = normalizeName(baseName);
  if (!assetMap[normalized]) {
    assetMap[normalized] = url;
  }
}

/** Normalize a name: lowercase, remove apostrophes, replace spaces with underscores */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Look up an asset by normalized filename */
function lookup(name: string): string | null {
  const normalized = normalizeName(name);
  if (assetMap[normalized]) return assetMap[normalized];
  // Try without underscores replaced
  const noUnderscore = normalized.replace(/_/g, "");
  if (assetMap[noUnderscore]) return assetMap[noUnderscore];
  return null;
}

/** Look up by exact path suffix */
function lookupPath(pathSuffix: string): string | null {
  for (const [path, url] of Object.entries(assetPathMap)) {
    if (path.endsWith(pathSuffix)) return url;
  }
  return null;
}

// ============================================================
// Background helpers
// ============================================================

export function getBackground(name: string): string | null {
  return lookup(name);
}

export function getTierBackground(tier: 1 | 2 | 3): string | null {
  return lookup(`tier${tier}_background`);
}

export function getMenuBackground(): string | null {
  return lookup("menu_background");
}

export function getVictoryBackground(): string | null {
  return lookup("victory_bg");
}

export function getDefeatBackground(): string | null {
  return lookup("defeat_bg");
}

export function getSpireImage(): string | null {
  return lookup("spire");
}

export function getStarsImage(): string | null {
  return lookup("stars");
}

export function getFogImage(): string | null {
  return lookup("fog");
}

// ============================================================
// Hero portrait & class icon helpers
// ============================================================

const HERO_PORTRAIT_MAP: Record<string, string> = {
  Bladedancer: "bladedancer",
  Manipulator: "manipulator",
  Tracker: "tracker",
  Guardian: "guardian",
  Shadowblade: "shadowblade",
  Runeblade: "runeblade",
  Timebender: "timebender",
  Illusionist: "illusionist",
  Huntmaster: "huntress",
  Beastcaller: "beastmaster",
  Sentinel: "sentinel",
  Warden: "warden",
};

export function getHeroPortrait(name: string): string | null {
  const key = HERO_PORTRAIT_MAP[name] ?? normalizeName(name);
  return lookup(key);
}

export function getClassIcon(name: string): string | null {
  const key = HERO_PORTRAIT_MAP[name] ?? normalizeName(name);
  const iconKey = `${key}_icon`;
  return lookup(iconKey);
}

// ============================================================
// Specialization image helpers
// ============================================================

const SPEC_MAP: Record<string, string> = {
  Shadowblade: "spec_shadowblade",
  Timebender: "spec_timebender",
  Warden: "spec_warden",
  Huntmaster: "spec_huntmaster",
  Illusionist: "spec_psion",
  Beastcaller: "spec_sharpshooter",
  Runeblade: "spec_tempest",
  Sentinel: "spec_vindicator",
};

export function getSpecImage(name: string): string | null {
  const key = SPEC_MAP[name] ?? `spec_${normalizeName(name)}`;
  return lookup(key);
}

// ============================================================
// Monster image helpers
// ============================================================

const MONSTER_MAP: Record<string, string> = {
  "Abyssal Ooze": "astril_sludge",
  Treant: "rootbound_treant",
  "Glimmering Sprite": "prism",
  "Shadowy Assassin": "veilblade_stalker",
  Banshee: "moonbound_oracle",
  "Lunar Witch": "moonbound_oracle",
  "Arcane Elemental": "resonant_elemental",
  Phoenix: "emberglass_phoenix",
  Gargoyle: "vault_gargoyle",
  "Cursed Knight": "oathbroken_ascender",
  Minotaur: "mazehorn",
  Chimera: "triune_chimera",
  "Ember Drake": "emberglass_drake",
  "Frost Wyrm": "rimeglass_wyrm",
  "Nano Prototype": "vy_assimilator_prototype",
  "Laser Turret": "laser_turret",
  Behemoth: "starfall_behemoth",
  Cyclops: "oculus_giant",
  Dragon: "skyvault_dragon",
  Titan: "threshold_titan",
  "Vyridian, the Astril Conductor": "vyridian",
  // Legacy alias — saves created before the Astrizda canon migration
  "Apexus, the Astral Overlord": "vyridian",
};

export function getMonsterImage(name: string): string | null {
  const key = MONSTER_MAP[name] ?? normalizeName(name);
  // Prefer webp for Vyridian
  if (key === "vyridian") {
    const webp = lookupPath("assets/monsters/Vyridion.webp");
    if (webp) return webp;
  }
  // Try direct lookup
  let url = lookup(key);
  if (url) return url;
  // Try with _portrait suffix (image files are named "<monster>-portrait.png")
  url = lookup(`${key}_portrait`);
  if (url) return url;
  // Some files have concatenated names (e.g. "veilblade_stalkerrootbound_treant")
  // Try lookup with "rootbound_treant" appended for the affected monsters
  if (key === "veilblade_stalker" || key === "moonbound_oracle") {
    url = lookup(`${key}rootbound_treant_portrait`);
    if (url) return url;
  }
  // Try the full normalized name with _portrait
  const fullNorm = normalizeName(name);
  url = lookup(`${fullNorm}_portrait`);
  return url;
}

export function getMonsterSvgIcon(name: string): string | null {
  const key = MONSTER_MAP[name] ?? normalizeName(name);
  return lookup(`${key}_icon`);
}

export function getMonsterSpecialIcon(specialName: string): string | null {
  return lookup(normalizeName(specialName));
}

export function getRandomMonsterImage(): string | null {
  return lookup("randommonster");
}

// ============================================================
// Weapon image helpers
// ============================================================

const WEAPON_MAP: Record<string, string> = {
  "Swift Blade": "swiftblade",
  "Sharp Dagger": "sharpdagger",
  "Frostbite Dagger": "frostbitedagger",
  "Serpent's Kiss": "serpentskiss",
  "Moonshadow Shiv": "moonshadowshiv",
  "Voidcutter": "voidcutter",
  "Starforged Blade": "starforgedblade",
  "Edge of Eclipse": "eclipsesedge",
  "Crystal Wand": "crystalwand",
  "Scholar's Staff": "scholarstaff",
  "Astril Rod": "astrilrod",
  // Legacy alias — saves created before the Astrizda canon migration
  "Astral Rod": "astrilrod",
  "Aetherpulse": "mindprism",
  "Celestial Scepter": "celestialscepter",
  "Void Staff": "voidstaff",
  "Eternal Starweaver": "eternalstarweaver",
  "Reality Anchor": "realityanchor",
  "Hunter's Bow": "huntersbow",
  "Sturdy Crossbow": "sturdycrossbow",
  "Longshot": "longshot",
  "Wild Bow": "wildbow",
  "Thunderstrike": "thunderstrike",
  "Beastmaster's Pride": "beastmasterspride",
  "Voidwatcher": "dualaxis",
  "Twin Claws": "twinclaws",
  "Tower Shield": "towershield",
  "Soldier's Sword": "soldierssword",
  "Stargazer Spear": "stargazerspear",
  "Aegis Wall": "aegiswall",
  "Fortress Gate": "fortressgate",
  "Retributor": "retributor",
  "Fyrizul": "wraithrevenant",
  "Eternal Vigil": "eternalvigil",
  "World Breaker": "worldbreaker",
};

export function getWeaponImage(name: string): string | null {
  const key = WEAPON_MAP[name] ?? normalizeName(name);
  return lookup(key);
}

// ============================================================
// Item image helpers
// ============================================================

const ITEM_MAP: Record<string, string> = {
  "Minor Potion": "minor_potion",
  "Major Potion": "major_potion",
  "Guardian Angel": "guardianangel",
  "Lucky Charm": "luckycharm",
  "Mystic Rune": "mysticrune",
  "Ability Blocker": "abilityblocker",
  "Smoke Bomb": "reflector",
  "Treasure Map": "compass",
  "Power Scroll": "fiery_scroll",
  "Shield Charm": "reflector",
  "Speed Potion": "shinytablet",
  "Bomb": "explosive",
};

export function getItemImage(name: string): string | null {
  const key = ITEM_MAP[name] ?? normalizeName(name);
  return lookup(key);
}

/** Look up item image by stable content ID (itemId). Falls back to name-based lookup. */
export function getItemImageById(itemId: string): string | null {
  // The ITEM_MAP values often match itemId values (e.g., "minor_potion").
  // Try direct lookup first, then normalize.
  const key = ITEM_MAP[itemId] ?? itemId;
  return lookup(key);
}

/** Look up weapon image by stable content ID (weaponId). Falls back to name-based lookup. */
export function getWeaponImageById(weaponId: string): string | null {
  // Weapon IDs like "bd_common_1" don't directly map to asset filenames,
  // so we normalize. The WEAPON_MAP is still name-based for now.
  const key = normalizeName(weaponId);
  return lookup(key) ?? lookup(weaponId);
}

/** Look up monster image by stable numeric ID. */
export function getMonsterImageById(monsterId: number, name?: string): string | null {
  // Monsters are keyed by name in MONSTER_MAP; the numeric ID is stable
  // but not directly mapped to filenames. Fall back to name-based lookup.
  if (name) return getMonsterImage(name);
  return null;
}

// ============================================================
// Enchantment icon helpers
// ============================================================

const ENCHANT_MAP: Record<string, string> = {
  Swift: "swift",
  Mighty: "mighty",
  Vampiric: "vampiric",
  Explosive: "explosive",
  Precise: "precise",
  Defensive: "guardian",
  Ethereal: "arcane",
  Chaotic: "cosmic",
  Divine: "divine",
  Toxic: "toxic_scroll",
};

export function getEnchantIcon(name: string): string | null {
  const key = ENCHANT_MAP[name] ?? normalizeName(name);
  return lookup(key);
}

// ============================================================
// Room image helpers
// ============================================================

const ROOM_MAP: Record<string, string> = {
  combat: "club_room",
  merchant: "diamond_room",
  rest: "heart_room",
  elite_combat: "spade_room",
  mini_boss: "spade_elite_room",
  final_boss: "final_boss_room",
  split: "door",
};

export function getRoomImage(roomType: string): string | null {
  const key = ROOM_MAP[roomType] ?? normalizeName(roomType);
  return lookup(key);
}

export function getShopkeeperRoomImage(): string | null {
  return lookup("shopkeeper_room");
}

// ============================================================
// Effect image helpers
// ============================================================

export function getEffectImage(name: string): string | null {
  return lookup(`${name}_effect`) ?? lookup(name);
}

// ============================================================
// Dice image helpers
// ============================================================

export function getDiceImage(value: number): string | null {
  return lookup(`die${value}`);
}

// ============================================================
// Misc asset helpers
// ============================================================

export function getLogoImage(): string | null {
  // The brand asset is assets/logo.png. Try the brand alias first (for
  // future skybreak_logo.* files), then fall back to the actual file name.
  return lookup("skybreak_logo") ?? lookup("logo");
}

export function getCardBackImage(): string | null {
  return lookup("card_back");
}

export function getDoorImage(): string | null {
  return lookup("door");
}

export function getGoldCoinImage(): string | null {
  return lookup("gold_coin");
}

export function getShopkeeperImage(): string | null {
  return lookup("shopkeeper");
}

export function getTargetDummyImage(): string | null {
  return lookup("targetdummy");
}

export function getChestClosedImage(): string | null {
  return lookup("chest_closed");
}

export function getChestOpenImage(): string | null {
  return lookup("chest_open");
}

export function getForgeImage(): string | null {
  return lookup("forge");
}

export function getAchievementBadgeImage(): string | null {
  return lookup("achievement_badge");
}

export function getShopCounterImage(): string | null {
  return lookup("shop_counter");
}

export function getDiceUpgradeImage(): string | null {
  return lookupPath("assets/items/dice.PNG");
}

// ============================================================
// Music helpers
// ============================================================

export function getMusicTrack(name: string): string | null {
  return lookup(`${name}_theme`) ?? lookup(name);
}

export type MusicTrackName =
  | "title"
  | "tier1"
  | "tier2"
  | "tier3"
  | "combat"
  | "boss"
  | "merchant"
  | "victory"
  | "defeat";

// ============================================================
// Sound effect helpers
// ============================================================

export function getSound(category: string, name: string): string | null {
  const key = `${category}/${name}`;
  const url = lookupPath(`assets/sounds/${category}/${name}.mp3`);
  if (url) return url;
  return lookup(normalizeName(name));
}

export type SfxCategory = "combat" | "results" | "rooms" | "ui";

// ============================================================
// Export the full map for debugging
// ============================================================

export function getAllAssetUrls(): Record<string, string> {
  return { ...assetMap };
}
