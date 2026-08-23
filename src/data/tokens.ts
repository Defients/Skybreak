import type { TokenInstance, StatusInstance, TokenType, TokenColor, NamedBuff, NamedDebuff } from "../types/inventory";
import { generateId } from "../utils/ids";

export interface TokenDefinition {
  type: TokenType;
  color: TokenColor;
  name: string;
  symbol: string;
  stackLimit: number;
  duration: string;
  effect: string;
}

export const TOKEN_DEFINITIONS: Record<TokenColor, TokenDefinition> = {
  blue: {
    type: "shield",
    color: "blue",
    name: "Shield",
    symbol: "🔵",
    stackLimit: 5,
    duration: "Until used",
    effect: "Reduces damage by listed value",
  },
  red: {
    type: "target",
    color: "red",
    name: "Target",
    symbol: "🔴",
    stackLimit: 1,
    duration: "3 turns",
    effect: "Target takes +1 damage from all sources",
  },
  black: {
    type: "buff",
    color: "black",
    name: "Buff",
    symbol: "⚫",
    stackLimit: 3,
    duration: "As specified",
    effect: "Specific named positive effect",
  },
  yellow: {
    type: "debuff",
    color: "yellow",
    name: "Debuff",
    symbol: "🟡",
    stackLimit: 3,
    duration: "As specified",
    effect: "Specific named negative effect",
  },
  green: {
    type: "counter",
    color: "green",
    name: "Counter",
    symbol: "🟢",
    stackLimit: 6,
    duration: "Permanent until spent/removed",
    effect: "Tracks a numeric value",
  },
  white: {
    type: "special",
    color: "white",
    name: "Special",
    symbol: "⚪",
    stackLimit: 1,
    duration: "As specified",
    effect: "Unique marker",
  },
};

export const NAMED_BUFFS: Record<NamedBuff, { effect: string; duration: string }> = {
  Haste: { effect: "+1 to next roll", duration: "1 use" },
  Might: { effect: "+2 damage on next attack", duration: "1 use" },
  Focus: { effect: "Reroll any die once", duration: "1 use" },
  Regeneration: { effect: "Heal 1 HP at turn start", duration: "Persistent" },
};

export const NAMED_DEBUFFS: Record<NamedDebuff, { effect: string; duration: string }> = {
  Poison: { effect: "Take 1 damage at turn start", duration: "Persistent" },
  Freeze: { effect: "Must roll 4+ to act", duration: "1 turn" },
  Fear: { effect: "-1 to all rolls", duration: "Persistent" },
  Slow: { effect: "-2 to initiative", duration: "Persistent" },
  Petrify: { effect: "Skip next action", duration: "1 turn" },
  Burn: { effect: "Take 1 damage per turn for 3 turns", duration: "3 turns" },
  Nanobot: { effect: "Take 1 damage when healed", duration: "Persistent" },
  Illusion: { effect: "-2 to rolls for 2 turns", duration: "2 turns" },
  Stun: { effect: "Skip next action", duration: "1 turn" },
};

export function createShieldToken(value: number = 1): TokenInstance {
  return {
    id: generateId("shield"),
    type: "shield",
    color: "blue",
    name: "Shield",
    value,
    stackCount: 1,
    maxStacks: 5,
    duration: -1,
    description: `Reduces damage by ${value}`,
  };
}

export function createTargetToken(): TokenInstance {
  return {
    id: generateId("target"),
    type: "target",
    color: "red",
    name: "Target",
    value: 1,
    stackCount: 1,
    maxStacks: 1,
    duration: 3,
    description: "Takes +1 damage from all sources",
  };
}

export function createCounterToken(value: number = 0): TokenInstance {
  return {
    id: generateId("counter"),
    type: "counter",
    color: "green",
    name: "Counter",
    value,
    stackCount: 1,
    maxStacks: 6,
    duration: -1,
    description: `Counter: ${value}`,
  };
}

export function createBuffToken(name: string, duration: number): TokenInstance {
  return {
    id: generateId(`buff_${name}`),
    type: "buff",
    color: "black",
    name,
    value: 0,
    stackCount: 1,
    maxStacks: 3,
    duration,
    description: NAMED_BUFFS[name as NamedBuff]?.effect ?? "Named buff",
  };
}

export function createDebuffToken(name: string, duration: number): TokenInstance {
  return {
    id: generateId(`debuff_${name}`),
    type: "debuff",
    color: "yellow",
    name,
    value: 0,
    stackCount: 1,
    maxStacks: 3,
    duration,
    description: NAMED_DEBUFFS[name as NamedDebuff]?.effect ?? "Named debuff",
  };
}

export function createBuffStatus(name: NamedBuff, duration: number): StatusInstance {
  return {
    id: generateId(`status_buff_${name}`),
    name,
    type: "buff",
    duration,
    durationType: "uses",
    value: 0,
    description: NAMED_BUFFS[name].effect,
  };
}

export function createDebuffStatus(name: NamedDebuff, duration: number): StatusInstance {
  return {
    id: generateId(`status_debuff_${name}`),
    name,
    type: "debuff",
    duration,
    durationType: "turns",
    value: 0,
    description: NAMED_DEBUFFS[name].effect,
  };
}
