export type GameEventType =
  | "GAME_STARTED"
  | "SEED_SET"
  | "PARTY_CREATED"
  | "ROOM_REVEALED"
  | "SPLIT_CHOICE"
  | "MERCHANT_ENTERED"
  | "ITEM_BOUGHT"
  | "ITEM_SOLD"
  | "REST_CHOICE"
  | "COMBAT_STARTED"
  | "MONSTER_REVEALED"
  | "ENVIRONMENT_REVEALED"
  | "APC_ASSIGNED"
  | "TURN_STARTED"
  | "CARD_FLIPPED"
  | "MATCH_DETECTED"
  | "ABILITY_TRIGGERED"
  | "DICE_ROLLED"
  | "AI_DECISION"
  | "DAMAGE_CALCULATED"
  | "DAMAGE_APPLIED"
  | "HEAL_APPLIED"
  | "TOKEN_ADDED"
  | "TOKEN_REMOVED"
  | "STATUS_ADDED"
  | "STATUS_REMOVED"
  | "ITEM_USED"
  | "HERO_DIED"
  | "HERO_REVIVED"
  | "MONSTER_DEFEATED"
  | "COMBAT_ENDED"
  | "REWARD_GRANTED"
  | "TIER_ADVANCED"
  | "FINAL_BOSS_STARTED"
  | "VICTORY"
  | "DEFEAT"
  | "RULE_AMBIGUITY"
  | "MANUAL_OVERRIDE"
  | "STATE_VALIDATION_WARNING";

export interface GameEvent {
  id: string;
  type: GameEventType;
  timestamp: number;
  sequence: number;
  actorId?: string;
  targetIds?: string[];
  summary: string;
  details?: Record<string, unknown>;
  stateDiff?: Record<string, unknown>;
  visibleToPlayer: boolean;
}

export interface RandomEvent {
  step: number;
  type: "d6" | "d6-physical" | "2d6" | "2d6-physical" | "shuffle" | "draw" | "chooseRandom" | "assignD6";
  label: string;
  result: unknown;
}
