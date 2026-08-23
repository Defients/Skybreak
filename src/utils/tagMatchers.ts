import type { WeaponInstance, ItemInstance } from "../types/inventory";
import type { HeroState } from "../types/heroes";
import { WEAPONS } from "../data/weapons";
import { ITEMS } from "../data/items";

// ─── Weapon tag matching ───────────────────────────────────────────────────

/**
 * Look up weapon tags from the static data definition by weaponId.
 * Returns the tags from WeaponData, or undefined if not found.
 */
function lookupWeaponTags(weapon: WeaponInstance | undefined): string[] | undefined {
  if (!weapon) return undefined;
  if (weapon.tags && weapon.tags.length > 0) return weapon.tags;
  // Legacy save: weapon instance has no tags — look up by weaponId
  const data = WEAPONS.find(w => w.id === weapon.weaponId);
  return data?.tags;
}

/**
 * Check if a hero's weapon has a given tag.
 * Falls back to name-based matching for legacy saves without tags.
 */
export function weaponHasTag(hero: HeroState | undefined, tag: string): boolean {
  if (!hero?.weapon) return false;
  const tags = lookupWeaponTags(hero.weapon);
  if (tags && tags.includes(tag)) return true;
  // Legacy fallback: name-based matching
  return legacyWeaponNameMatch(hero.weapon.name, tag);
}

/**
 * Check if a weapon instance has a given tag.
 * Falls back to name-based matching for legacy saves without tags.
 */
export function weaponInstanceHasTag(weapon: WeaponInstance | undefined, tag: string): boolean {
  if (!weapon) return false;
  const tags = lookupWeaponTags(weapon);
  if (tags && tags.includes(tag)) return true;
  return legacyWeaponNameMatch(weapon.name, tag);
}

// Legacy name → tag mapping for backward compatibility
const LEGACY_WEAPON_NAME_FRAGMENTS: Record<string, string[]> = {
  swift_blade: ["swift blade"],
  sharp_dagger: ["sharp dagger"],
  frostbite_dagger: ["frostbite dagger"],
  serpents_kiss: ["serpent's kiss"],
  moonshadow_shiv: ["moonshadow shiv"],
  voidcutter: ["voidcutter"],
  starforged_blade: ["starforged"],
  edge_of_eclipse: ["edge of eclipse"],
  crystal_wand: ["crystal wand"],
  scholars_staff: ["scholar's staff"],
  astril_rod: ["astril rod", "astral rod"],
  aetherpulse: ["aetherpulse"],
  celestial_scepter: ["celestial scepter"],
  void_staff: ["void staff"],
  eternal_starweaver: ["eternal starweaver"],
  reality_anchor: ["reality anchor"],
  hunters_bow: ["hunter's bow"],
  sturdy_crossbow: ["sturdy crossbow"],
  longshot: ["longshot"],
  wild_bow: ["wild bow"],
  thunderstrike: ["thunderstrike"],
  beastmasters_pride: ["beastmaster's pride"],
  voidwatcher: ["voidwatcher"],
  twin_claws: ["twin claws"],
  tower_shield: ["tower shield"],
  soldiers_sword: ["soldier's sword"],
  stargazer_spear: ["stargazer spear"],
  aegis_wall: ["aegis wall"],
  fortress_gate: ["fortress gate"],
  retributor: ["retributor"],
  fyrizul: ["fyrizul"],
  eternal_vigil: ["eternal vigil"],
  dual_spec: ["starforged", "eternal starweaver"],
};

function legacyWeaponNameMatch(weaponName: string, tag: string): boolean {
  const fragments = LEGACY_WEAPON_NAME_FRAGMENTS[tag];
  if (!fragments) return false;
  const lower = weaponName.toLowerCase();
  return fragments.some(f => lower.includes(f));
}

// ─── Item tag matching ─────────────────────────────────────────────────────

/**
 * Look up item tags from the static data definition by name (since legacy
 * items are keyed by display name in the ITEMS record).
 */
function lookupItemTags(item: ItemInstance): string[] | undefined {
  if (item.tags && item.tags.length > 0) return item.tags;
  if (item.itemId) {
    // Find by itemId in the ITEMS record
    for (const key of Object.keys(ITEMS)) {
      const data = ITEMS[key as keyof typeof ITEMS];
      if (data.itemId === item.itemId) return data.tags;
    }
  }
  // Legacy fallback: look up by name in ITEMS record
  const data = ITEMS[item.name as keyof typeof ITEMS];
  return data?.tags;
}

/**
 * Check if an item instance has a given tag.
 * Falls back to name-based matching for legacy saves without tags.
 */
export function itemHasTag(item: ItemInstance, tag: string): boolean {
  const tags = lookupItemTags(item);
  if (tags && tags.includes(tag)) return true;
  return legacyItemNameMatch(item.name, tag);
}

// Legacy name → tag mapping for backward compatibility
const LEGACY_ITEM_NAME_FRAGMENTS: Record<string, string[]> = {
  minor_potion: ["minor potion"],
  major_potion: ["major potion"],
  guardian_angel: ["guardian angel"],
  lucky_charm: ["lucky charm"],
  mystic_rune: ["mystic rune"],
  ability_blocker: ["ability blocker"],
  smoke_bomb: ["smoke bomb"],
  treasure_map: ["treasure map"],
  power_scroll: ["power scroll"],
  shield_charm: ["shield charm"],
  speed_potion: ["speed potion"],
  bomb: ["bomb"],
  healing: ["potion"],
};

function legacyItemNameMatch(itemName: string, tag: string): boolean {
  const fragments = LEGACY_ITEM_NAME_FRAGMENTS[tag];
  if (!fragments) return false;
  const lower = itemName.toLowerCase();
  return fragments.some(f => lower.includes(f));
}

/**
 * Find an item in a hero's inventory by tag.
 * Returns the first matching item with quantity > 0, or undefined.
 */
export function findItemByTag(items: ItemInstance[], tag: string): ItemInstance | undefined {
  return items.find(i => i.quantity > 0 && itemHasTag(i, tag));
}

/**
 * Get the stable itemId for an item instance.
 * Falls back to looking up by name for legacy saves.
 */
export function getItemId(item: ItemInstance): string | undefined {
  if (item.itemId) return item.itemId;
  const data = ITEMS[item.name as keyof typeof ITEMS];
  return data?.itemId;
}
