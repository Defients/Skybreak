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
}) as Record<string, string>;

// Build a normalized lookup map: lowercase filename without extension → URL
const assetMap: Record<string, string> = {};
const assetPathMap: Record<string, string> = {};

for (const [path, url] of Object.entries(allAssets)) {
  // Store by full path
  assetPathMap[path] = url;
  // Store by normalized filename (lowercase, no extension)
  const filename = path.split("/").pop() || path;
  const normalized = filename.toLowerCase().replace(/\.[^.]+$/, "");
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
  "Abyssal Ooze": "abyssal_ooze",
  Treant: "treant",
  "Glimmering Sprite": "glimmering_sprite",
  "Shadowy Assassin": "shadowy_assassin",
  Banshee: "banshee",
  "Lunar Witch": "lunar_shade",
  "Arcane Elemental": "arcane_elemental",
  Phoenix: "phoenix",
  Gargoyle: "gargoyle",
  "Cursed Knight": "cursed_knight",
  Minotaur: "minotaur",
  Chimera: "chimera",
  "Ember Drake": "ember_drake",
  "Frost Wyrm": "frost_wyrm",
  "Nano Prototype": "nano_prototype",
  "Laser Turret": "laser_turret",
  Behemoth: "behemoth",
  Cyclops: "cyclops",
  Dragon: "dragon",
  Titan: "titan",
  "Vyridian, the Astril Conductor": "vyridion",
  // Legacy alias — saves created before the Astrizda canon migration
  "Apexus, the Astral Overlord": "vyridion",
};

export function getMonsterImage(name: string): string | null {
  const key = MONSTER_MAP[name] ?? normalizeName(name);
  // Prefer webp for Vyridion
  if (key === "vyridion") {
    const webp = lookupPath("assets/monsters/Vyridion.webp");
    if (webp) return webp;
  }
  return lookup(key);
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
  "Beastmaster's Pride": "beastmastersprid",
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
  return lookup("skyward_ascent_logo");
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
