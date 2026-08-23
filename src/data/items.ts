import type { ItemData, UpgradeData, HealingServiceData, WeaponServiceData, ItemType } from "../types/inventory";

export const ITEMS: Record<ItemType, ItemData> = {
  "Minor Potion": {
    name: "Minor Potion",
    itemId: "minor_potion",
    costs: { t1: 30, t2: 45, t3: 68 },
    effect: "Heal 8 HP instantly",
    stackLimit: 2,
    tags: ["minor_potion", "healing"],
  },
  "Major Potion": {
    name: "Major Potion",
    itemId: "major_potion",
    costs: { t1: 0, t2: 0, t3: 0 },
    effect: "Heal to full instantly",
    stackLimit: 2,
    isJoker: true,
    tags: ["major_potion", "healing"],
  },
  "Guardian Angel": {
    name: "Guardian Angel",
    itemId: "guardian_angel",
    costs: { t1: 100, t2: 150, t3: 225 },
    effect: "Auto-revive at 50% HP",
    stackLimit: 2,
    tags: ["guardian_angel"],
  },
  "Lucky Charm": {
    name: "Lucky Charm",
    itemId: "lucky_charm",
    costs: { t1: 40, t2: 60, t3: 90 },
    effect: "Reroll any die once",
    stackLimit: 2,
    tags: ["lucky_charm"],
  },
  "Mystic Rune": {
    name: "Mystic Rune",
    itemId: "mystic_rune",
    costs: { t1: 40, t2: 60, t3: 90 },
    effect: "Activate spec ability",
    stackLimit: 2,
    tags: ["mystic_rune"],
  },
  "Ability Blocker": {
    name: "Ability Blocker",
    itemId: "ability_blocker",
    costs: { t1: 60, t2: 90, t3: 135 },
    effect: "Negate monster special",
    stackLimit: 1,
    tags: ["ability_blocker"],
  },
  "Smoke Bomb": {
    name: "Smoke Bomb",
    itemId: "smoke_bomb",
    costs: { t1: 80, t2: 120, t3: 180 },
    effect: "Skip one combat room",
    stackLimit: 1,
    tags: ["smoke_bomb"],
  },
  "Treasure Map": {
    name: "Treasure Map",
    itemId: "treasure_map",
    costs: { t1: 80, t2: 120, t3: 180 },
    effect: "Double next room's gold",
    stackLimit: 1,
    tags: ["treasure_map"],
  },
  "Power Scroll": {
    name: "Power Scroll",
    itemId: "power_scroll",
    costs: { t1: 50, t2: 75, t3: 113 },
    effect: "+3 damage next attack",
    stackLimit: 3,
    tags: ["power_scroll"],
  },
  "Shield Charm": {
    name: "Shield Charm",
    itemId: "shield_charm",
    costs: { t1: 40, t2: 60, t3: 90 },
    effect: "Gain 2🔵 instantly",
    stackLimit: 2,
    tags: ["shield_charm"],
  },
  "Speed Potion": {
    name: "Speed Potion",
    itemId: "speed_potion",
    costs: { t1: 60, t2: 90, t3: 135 },
    effect: "Take extra turn",
    stackLimit: 1,
    tags: ["speed_potion"],
  },
  "Bomb": {
    name: "Bomb",
    itemId: "bomb",
    costs: { t1: 70, t2: 105, t3: 158 },
    effect: "Deal 5 damage to all enemies",
    stackLimit: 2,
    tags: ["bomb"],
  },
};

export const PERMANENT_UPGRADES: Record<string, UpgradeData> = {
  "HP Increase": {
    name: "HP Increase",
    costs: { t1: 80, t2: 120, t3: 180 },
    effect: "+2 max HP permanent",
    limit: "3 per Hero",
    limitType: "perHero",
    limitCount: 3,
  },
  "Lucky Dice": {
    name: "Lucky Dice",
    costs: { t1: 150, t2: 225, t3: 338 },
    effect: "+1 to all rolls",
    limit: "1 per Hero",
    limitType: "perHero",
    limitCount: 1,
  },
  "Extra Pocket": {
    name: "Extra Pocket",
    costs: { t1: 100, t2: 150, t3: 225 },
    effect: "+1 item capacity",
    limit: "2 per party",
    limitType: "perParty",
    limitCount: 2,
  },
  "Party Fund": {
    name: "Party Fund",
    costs: { t1: 200, t2: 200, t3: 200 },
    effect: "10% merchant discount",
    limit: "1 per game",
    limitType: "perGame",
    limitCount: 1,
  },
};

export const HEALING_SERVICES: Record<string, HealingServiceData> = {
  "Patch Up": {
    name: "Patch Up",
    costs: { t1: 20, t2: 30, t3: 45 },
    effect: "Heal one Hero 5 HP",
  },
  "First Aid": {
    name: "First Aid",
    costs: { t1: 40, t2: 60, t3: 90 },
    effect: "Heal one Hero to full",
  },
  "Group Heal": {
    name: "Group Heal",
    costs: { t1: 60, t2: 90, t3: 135 },
    effect: "Heal all Heroes 5 HP",
  },
  "Full Restore": {
    name: "Full Restore",
    costs: { t1: 80, t2: 120, t3: 180 },
    effect: "Heal all Heroes to full",
  },
  "Revive 50%": {
    name: "Revive 50%",
    costs: { t1: 60, t2: 90, t3: 135 },
    effect: "Revive one Hero at 50% HP",
  },
  "Revive Full": {
    name: "Revive Full",
    costs: { t1: 100, t2: 150, t3: 225 },
    effect: "Revive one Hero at full HP",
  },
};

export const WEAPON_SERVICES: Record<string, WeaponServiceData> = {
  Identify: {
    name: "Identify",
    cost: "Free",
    effect: "View weapon abilities",
  },
  Upgrade: {
    name: "Upgrade",
    cost: "50% of next tier cost",
    effect: "Upgrade to next rarity",
  },
  Reforge: {
    name: "Reforge",
    cost: "50% of current cost",
    effect: "Change to different weapon of same tier",
  },
  Repair: {
    name: "Repair",
    cost: "30/45/68g",
    effect: "Remove negative effects",
  },
};

export function getItemCost(name: ItemType, tier: 1 | 2 | 3): number {
  const item = ITEMS[name];
  if (!item) return 0;
  return tier === 1 ? item.costs.t1 : tier === 2 ? item.costs.t2 : item.costs.t3;
}

export function getHealingCost(name: string, tier: 1 | 2 | 3): number {
  const service = HEALING_SERVICES[name];
  if (!service) return 0;
  return tier === 1 ? service.costs.t1 : tier === 2 ? service.costs.t2 : service.costs.t3;
}

export function getUpgradeCost(name: string, tier: 1 | 2 | 3): number {
  const upgrade = PERMANENT_UPGRADES[name];
  if (!upgrade) return 0;
  return tier === 1 ? upgrade.costs.t1 : tier === 2 ? upgrade.costs.t2 : upgrade.costs.t3;
}

export const STARTING_ITEMS: Record<string, ItemType> = {
  Bladedancer: "Minor Potion",
  Manipulator: "Mystic Rune",
  Tracker: "Lucky Charm",
  Guardian: "Shield Charm",
};
