import type { Suit, Rank } from "../types/cards";
import { suitSymbol } from "../types/cards";
import type { TokenType, TokenColor } from "../types/inventory";

export function formatCard(suit: Suit, rank: Rank): string {
  if (rank === "JOKER") return "JOKER";
  return `${rank}${suitSymbol(suit)}`;
}

export function formatHp(current: number, max: number): string {
  return `${current}/${max}`;
}

export function formatGold(amount: number): string {
  return `${amount}g`;
}

export function formatTokenBadge(color: TokenColor): { bg: string; text: string; symbol: string } {
  const styles: Record<TokenColor, { bg: string; text: string; symbol: string }> = {
    blue: { bg: "bg-blue-600", text: "text-white", symbol: "🔵" },
    red: { bg: "bg-red-600", text: "text-white", symbol: "🔴" },
    black: { bg: "bg-gray-800", text: "text-white", symbol: "⚫" },
    yellow: { bg: "bg-yellow-600", text: "text-black", symbol: "🟡" },
    green: { bg: "bg-green-600", text: "text-white", symbol: "🟢" },
    white: { bg: "bg-gray-200", text: "text-black", symbol: "⚪" },
  };
  return styles[color];
}

export function formatTokenType(type: TokenType): string {
  const names: Record<TokenType, string> = {
    shield: "Shield",
    target: "Target",
    buff: "Buff",
    debuff: "Debuff",
    counter: "Counter",
    special: "Special",
  };
  return names[type];
}

export function formatRoomType(type: string): string {
  // Player-facing labels only — internal room type keys are unchanged
  const names: Record<string, string> = {
    merchant: "Wayfarer's Exchange",
    combat: "Encounter",
    rest: "Sanctuary Landing",
    elite_combat: "Elite Encounter",
    mini_boss: "Trial Chamber",
    final_boss: "Vyridian's Judgment",
    split: "Split Path",
  };
  return names[type] ?? type;
}

export function formatRoomSymbol(type: string): string {
  const symbols: Record<string, string> = {
    merchant: "♦️",
    combat: "♣️",
    rest: "❤️",
    elite_combat: "♠️",
    mini_boss: "♠️🌟",
    final_boss: "🏰",
    split: "X/Y",
  };
  return symbols[type] ?? "?";
}

export function formatTier(tier: number): string {
  const names: Record<number, string> = {
    1: "Foundation",
    2: "Ascent",
    3: "Summit",
  };
  return names[tier] ?? `Tier ${tier}`;
}

export function formatDifficulty(difficulty: string): string {
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + "...";
}

export function formatEventSummary(type: string): string {
  const names: Record<string, string> = {
    GAME_STARTED: "Game Started",
    SEED_SET: "Seed Set",
    PARTY_CREATED: "Party Created",
    ROOM_REVEALED: "Room Revealed",
    SPLIT_CHOICE: "Split Path Chosen",
    MERCHANT_ENTERED: "Merchant Entered",
    ITEM_BOUGHT: "Item Bought",
    ITEM_SOLD: "Item Sold",
    REST_CHOICE: "Rest Choice Made",
    COMBAT_STARTED: "Combat Started",
    MONSTER_REVEALED: "Monster Revealed",
    ENVIRONMENT_REVEALED: "Environment Revealed",
    APC_ASSIGNED: "APCs Assigned",
    TURN_STARTED: "Turn Started",
    CARD_FLIPPED: "Cards Flipped",
    MATCH_DETECTED: "Match Detected",
    ABILITY_TRIGGERED: "Ability Triggered",
    DICE_ROLLED: "Dice Rolled",
    AI_DECISION: "AI Decision",
    DAMAGE_CALCULATED: "Damage Calculated",
    DAMAGE_APPLIED: "Damage Applied",
    HEAL_APPLIED: "Healing Applied",
    TOKEN_ADDED: "Token Added",
    TOKEN_REMOVED: "Token Removed",
    STATUS_ADDED: "Status Added",
    STATUS_REMOVED: "Status Removed",
    ITEM_USED: "Item Used",
    HERO_DIED: "Hero Died",
    HERO_REVIVED: "Hero Revived",
    MONSTER_DEFEATED: "Monster Defeated",
    COMBAT_ENDED: "Combat Ended",
    REWARD_GRANTED: "Reward Granted",
    TIER_ADVANCED: "Tier Advanced",
    FINAL_BOSS_STARTED: "Final Boss Started",
    VICTORY: "Victory!",
    DEFEAT: "Defeat",
    RULE_AMBIGUITY: "Rule Ambiguity",
    MANUAL_OVERRIDE: "Manual Override",
    STATE_VALIDATION_WARNING: "Validation Warning",
  };
  return names[type] ?? type;
}
