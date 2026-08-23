import type { EnchantmentData, EnchantmentName } from "../types/inventory";

export const ENCHANTMENTS: Record<EnchantmentName, EnchantmentData> = {
  Swift: {
    name: "Swift",
    costs: { t1: 30, t2: 45, t3: 60 },
    effect: "Reroll any 1",
    slotFree: false,
  },
  Mighty: {
    name: "Mighty",
    costs: { t1: 50, t2: 75, t3: 100 },
    effect: "+1 damage on rolls 4–6",
    slotFree: false,
  },
  Vampiric: {
    name: "Vampiric",
    costs: { t1: 70, t2: 105, t3: 140 },
    effect: "Heal 1 HP on rolls 5–6",
    slotFree: false,
  },
  Explosive: {
    name: "Explosive",
    costs: { t1: 90, t2: 135, t3: 180 },
    effect: "On 6, deal half damage to all enemies",
    slotFree: false,
  },
  Precise: {
    name: "Precise",
    costs: { t1: 60, t2: 90, t3: 120 },
    effect: "+1 to all attack rolls",
    slotFree: false,
  },
  Defensive: {
    name: "Defensive",
    costs: { t1: 80, t2: 120, t3: 160 },
    effect: "Gain 1🔵 on rolls 1–2",
    slotFree: false,
  },
  Ethereal: {
    name: "Ethereal",
    costs: { t1: 150, t2: 150, t3: 150 },
    effect: "Attacks phase through shields",
    slotFree: false,
  },
  Chaotic: {
    name: "Chaotic",
    costs: { t1: 120, t2: 120, t3: 120 },
    effect: "Random effect each attack; roll d6",
    slotFree: false,
  },
  Divine: {
    name: "Divine",
    costs: { t1: 200, t2: 200, t3: 200 },
    effect: "On 6, heal lowest HP ally 2 HP",
    slotFree: false,
  },
  Toxic: {
    name: "Toxic",
    costs: { t1: 0, t2: 0, t3: 0 },
    effect: "Applies Poison on successful damage rolls of 5–6 (provisional ruling)",
    slotFree: true,
  },
};

export interface ChaoticEffect {
  roll: number;
  effect: string;
}

export const CHAOTIC_EFFECTS: ChaoticEffect[] = [
  { roll: 1, effect: "+2 damage" },
  { roll: 2, effect: "Heal self 2 HP" },
  { roll: 3, effect: "Enemy loses 1 APC" },
  { roll: 4, effect: "Gain 1🔵" },
  { roll: 5, effect: "Deal damage twice" },
  { roll: 6, effect: "All allies gain ⚫ Haste" },
];

export function getEnchantmentCost(name: EnchantmentName, tier: 1 | 2 | 3): number {
  const ench = ENCHANTMENTS[name];
  if (!ench) return 0;
  return tier === 1 ? ench.costs.t1 : tier === 2 ? ench.costs.t2 : ench.costs.t3;
}

export function getEnchantmentList(): EnchantmentData[] {
  return Object.values(ENCHANTMENTS).filter((e) => !e.slotFree || e.name === "Toxic");
}
