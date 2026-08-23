import type { WeaponData, WeaponRarity } from "../types/inventory";

export const WEAPON_RARITY_DATA: Record<WeaponRarity, { baseCost: number; upgradeCost: number; powerLevel: string; availableTiers: string }> = {
  Common: { baseCost: 50, upgradeCost: 0, powerLevel: "Minor", availableTiers: "All tiers" },
  Rare: { baseCost: 100, upgradeCost: 50, powerLevel: "Moderate", availableTiers: "All tiers" },
  Epic: { baseCost: 200, upgradeCost: 100, powerLevel: "Major", availableTiers: "Tier 2+" },
  Legendary: { baseCost: 400, upgradeCost: 200, powerLevel: "Unique", availableTiers: "Tier 3" },
};

export const WEAPONS: WeaponData[] = [
  // Bladedancer - Common
  { id: "bd_common_1", name: "Swift Blade", className: "Bladedancer", rarity: "Common", baseCost: 50, upgradeCost: 0, effect: "Reroll any result of 1", description: "Reroll any result of 1", tags: ["swift_blade"] },
  { id: "bd_common_2", name: "Sharp Dagger", className: "Bladedancer", rarity: "Common", baseCost: 50, upgradeCost: 0, effect: "+1 damage on rolls of 5–6", description: "+1 damage on rolls of 5–6", tags: ["sharp_dagger"] },
  // Bladedancer - Rare
  { id: "bd_rare_1", name: "Frostbite Dagger", className: "Bladedancer", rarity: "Rare", baseCost: 100, upgradeCost: 50, effect: "On 1–2, deal damage then roll again; on 1–3 applies 🟡 Freeze, max 3 stacks", description: "On 1–2, deal damage then roll again; on 1–3 applies Freeze, max 3 stacks", suit: "♣️", tags: ["frostbite_dagger"] },
  { id: "bd_rare_2", name: "Serpent's Kiss", className: "Bladedancer", rarity: "Rare", baseCost: 100, upgradeCost: 50, effect: "Start combat with Toxic enchantment, slot-free", description: "Start combat with Toxic enchantment, slot-free", suit: "♦️", tags: ["serpents_kiss"] },
  // Bladedancer - Epic
  { id: "bd_epic_1", name: "Moonshadow Shiv", className: "Bladedancer", rarity: "Epic", baseCost: 200, upgradeCost: 100, effect: "On 1–4, gain stealth: 1🔵 plus untargetable. On 5–6, break stealth for +3 damage", description: "On 1–4, gain stealth: 1 shield plus untargetable. On 5–6, break stealth for +3 damage", suit: "❤️", tags: ["moonshadow_shiv"] },
  { id: "bd_epic_2", name: "Voidcutter", className: "Bladedancer", rarity: "Epic", baseCost: 200, upgradeCost: 100, effect: "All attacks phase through shields/reduction", description: "All attacks phase through shields/reduction", suit: "♠️", tags: ["voidcutter"] },
  // Bladedancer - Legendary
  { id: "bd_leg_1", name: "Starforged Blade", className: "Bladedancer", rarity: "Legendary", baseCost: 400, upgradeCost: 200, effect: "+1 damage to all attacks and unlock both specializations", description: "+1 damage to all attacks and unlock both specializations", suit: "♠️", tags: ["starforged_blade", "dual_spec"] },
  { id: "bd_leg_2", name: "Edge of Eclipse", className: "Bladedancer", rarity: "Legendary", baseCost: 400, upgradeCost: 200, effect: "Every 3rd attack deals double damage; track with 🟢", description: "Every 3rd attack deals double damage; track with green counter", tags: ["edge_of_eclipse"] },

  // Manipulator - Common
  { id: "mp_common_1", name: "Crystal Wand", className: "Manipulator", rarity: "Common", baseCost: 50, upgradeCost: 0, effect: "Mind Spike improves to 3 damage", description: "Mind Spike improves to 3 damage", tags: ["crystal_wand"] },
  { id: "mp_common_2", name: "Scholar's Staff", className: "Manipulator", rarity: "Common", baseCost: 50, upgradeCost: 0, effect: "Gain +1 temporary APC at combat start", description: "Gain +1 temporary APC at combat start", tags: ["scholars_staff"] },
  // Manipulator - Rare
  { id: "mp_rare_1", name: "Astril Rod", className: "Manipulator", rarity: "Rare", baseCost: 100, upgradeCost: 50, effect: "Telekinesis scales: 1–2 = 3 damage, 3–4 = 4 damage, 5–6 = 5 damage", description: "Telekinesis scales: 1–2 = 3 damage, 3–4 = 4 damage, 5–6 = 5 damage", suit: "♣️", tags: ["astril_rod"] },
  { id: "mp_rare_2", name: "Aetherpulse", className: "Manipulator", rarity: "Rare", baseCost: 100, upgradeCost: 50, effect: "Confused enemies take 1 damage per turn", description: "Confused enemies take 1 damage per turn", suit: "♦️", tags: ["aetherpulse"] },
  // Manipulator - Epic
  { id: "mp_epic_1", name: "Celestial Scepter", className: "Manipulator", rarity: "Epic", baseCost: 200, upgradeCost: 100, effect: "Psychic Drain heals 3 HP and may target allies to heal", description: "Psychic Drain heals 3 HP and may target allies to heal", suit: "❤️", tags: ["celestial_scepter"] },
  { id: "mp_epic_2", name: "Void Staff", className: "Manipulator", rarity: "Epic", baseCost: 200, upgradeCost: 100, effect: "Mind Control affects all enemies with 🟡 Debuffs", description: "Mind Control affects all enemies with debuffs", suit: "♠️", tags: ["void_staff"] },
  // Manipulator - Legendary
  { id: "mp_leg_1", name: "Eternal Starweaver", className: "Manipulator", rarity: "Legendary", baseCost: 400, upgradeCost: 200, effect: "Unlock both specializations; Psionic Storm heals 3 HP", description: "Unlock both specializations; Psionic Storm heals 3 HP", suit: "♠️", tags: ["eternal_starweaver", "dual_spec"] },
  { id: "mp_leg_2", name: "Reality Anchor", className: "Manipulator", rarity: "Legendary", baseCost: 400, upgradeCost: 200, effect: "Once per turn, force any die reroll", description: "Once per turn, force any die reroll", tags: ["reality_anchor"] },

  // Tracker - Common
  { id: "tr_common_1", name: "Hunter's Bow", className: "Tracker", rarity: "Common", baseCost: 50, upgradeCost: 0, effect: "+1 damage versus 🔴 Target enemies", description: "+1 damage versus Target enemies", tags: ["hunters_bow"] },
  { id: "tr_common_2", name: "Sturdy Crossbow", className: "Tracker", rarity: "Common", baseCost: 50, upgradeCost: 0, effect: "Aimed Shot triggers on 3+", description: "Aimed Shot triggers on 3+", tags: ["sturdy_crossbow"] },
  // Tracker - Rare
  { id: "tr_rare_1", name: "Longshot", className: "Tracker", rarity: "Rare", baseCost: 100, upgradeCost: 50, effect: "All attacks generate +10g; critical hits on 6 give +30g", description: "All attacks generate +10g; critical hits on 6 give +30g", suit: "♣️", tags: ["longshot"] },
  { id: "tr_rare_2", name: "Wild Bow", className: "Tracker", rarity: "Rare", baseCost: 100, upgradeCost: 50, effect: "All pets gain +1 damage", description: "All pets gain +1 damage", suit: "♦️", tags: ["wild_bow"] },
  // Tracker - Epic
  { id: "tr_epic_1", name: "Thunderstrike", className: "Tracker", rarity: "Epic", baseCost: 200, upgradeCost: 100, effect: "Aimed Shot: even roll = 🟡 Stun; odd roll = +30g", description: "Aimed Shot: even roll = Stun; odd roll = +30g", suit: "❤️", tags: ["thunderstrike"] },
  { id: "tr_epic_2", name: "Beastmaster's Pride", className: "Tracker", rarity: "Epic", baseCost: 200, upgradeCost: 100, effect: "Both pets may be active simultaneously", description: "Both pets may be active simultaneously", suit: "♠️", tags: ["beastmasters_pride"] },
  // Tracker - Legendary
  { id: "tr_leg_1", name: "Voidwatcher", className: "Tracker", rarity: "Legendary", baseCost: 400, upgradeCost: 200, effect: "Attacks hit all enemies for half damage; Hunter's Mark affects all", description: "Attacks hit all enemies for half damage; Hunter's Mark affects all", suit: "♠️", tags: ["voidwatcher"] },
  { id: "tr_leg_2", name: "Twin Claws", className: "Tracker", rarity: "Legendary", baseCost: 400, upgradeCost: 200, effect: "Pets inherit your weapon enchantments and can critical hit", description: "Pets inherit your weapon enchantments and can critical hit", tags: ["twin_claws"] },

  // Guardian - Common
  { id: "gd_common_1", name: "Tower Shield", className: "Guardian", rarity: "Common", baseCost: 50, upgradeCost: 0, effect: "Start each combat with +1 HP", description: "Start each combat with +1 HP", tags: ["tower_shield"] },
  { id: "gd_common_2", name: "Soldier's Sword", className: "Guardian", rarity: "Common", baseCost: 50, upgradeCost: 0, effect: "Rally heals +1 HP, total 3", description: "Rally heals +1 HP, total 3", tags: ["soldiers_sword"] },
  // Guardian - Rare
  { id: "gd_rare_1", name: "Stargazer Spear", className: "Guardian", rarity: "Rare", baseCost: 100, upgradeCost: 50, effect: "Can attack any target regardless of position", description: "Can attack any target regardless of position", suit: "♣️", tags: ["stargazer_spear"] },
  { id: "gd_rare_2", name: "Aegis Wall", className: "Guardian", rarity: "Rare", baseCost: 100, upgradeCost: 50, effect: "🔵 Shields block +1 damage", description: "Shields block +1 damage", suit: "♦️", tags: ["aegis_wall"] },
  // Guardian - Epic
  { id: "gd_epic_1", name: "Fortress Gate", className: "Guardian", rarity: "Epic", baseCost: 200, upgradeCost: 100, effect: "Immune to first damage each combat; Fortress makes party immune", description: "Immune to first damage each combat; Fortress makes party immune", suit: "❤️", tags: ["fortress_gate"] },
  { id: "gd_epic_2", name: "Retributor", className: "Guardian", rarity: "Epic", baseCost: 200, upgradeCost: 100, effect: "When damaged, deal 1 damage back to attacker", description: "When damaged, deal 1 damage back to attacker", suit: "♠️", tags: ["retributor"] },
  // Guardian - Legendary
  { id: "gd_leg_1", name: "Fyrizul", className: "Guardian", rarity: "Legendary", baseCost: 400, upgradeCost: 200, effect: "All attacks heal party 1 HP; Execute threshold increases to ≤7 HP", description: "All attacks heal party 1 HP; Execute threshold increases to ≤7 HP", suit: "♠️", tags: ["fyrizul"] },
  { id: "gd_leg_2", name: "Eternal Vigil", className: "Guardian", rarity: "Legendary", baseCost: 400, upgradeCost: 200, effect: "Start combat with 3🔵; gain 1🔵 when any ally heals", description: "Start combat with 3 shields; gain 1 shield when any ally heals", tags: ["eternal_vigil"] },
];

export function getWeaponsByClass(className: string): WeaponData[] {
  return WEAPONS.filter((w) => w.className === className);
}

export function getWeaponsByClassAndRarity(className: string, rarity: WeaponRarity): WeaponData[] {
  return WEAPONS.filter((w) => w.className === className && w.rarity === rarity);
}

export function getCommonWeapon(className: string): WeaponData {
  const commons = getWeaponsByClassAndRarity(className, "Common");
  return commons[0];
}

export function getWeaponById(id: string): WeaponData | undefined {
  return WEAPONS.find((w) => w.id === id);
}
