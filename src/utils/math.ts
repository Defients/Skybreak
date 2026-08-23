export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function scaleGold(baseGold: number, tier: number): number {
  return Math.floor(baseGold * Math.pow(1.5, tier));
}

export function scaleMonsterHp(baseHp: number, tier: number): number {
  return baseHp + 3 * tier;
}

export function tierCost(
  costs: { t1: number; t2: number; t3: number },
  tier: 1 | 2 | 3
): number {
  return tier === 1 ? costs.t1 : tier === 2 ? costs.t2 : costs.t3;
}

export function isBelowHalf(hp: number, maxHp: number): boolean {
  return hp < maxHp / 2;
}
