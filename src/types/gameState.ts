import type { GameMode, Difficulty, SimulationConfig } from "./simulation";
import type { GameEvent, RandomEvent } from "./events";
import type { HeroState } from "./heroes";
import type { CombatState } from "./combat";
import type { ItemInstance } from "./inventory";
import type { RunStats, ScoreResult, AppliedRuling } from "./ui";
import type { DeckManager } from "./cards";

export type GamePhase =
  | "setup"
  | "exploration"
  | "merchant"
  | "rest"
  | "combat_setup"
  | "combat"
  | "combat_cleanup"
  | "tier_transition"
  | "victory"
  | "defeat";

export type RoomType =
  | "merchant"
  | "combat"
  | "rest"
  | "elite_combat"
  | "mini_boss"
  | "final_boss"
  | "split";

export interface RoomNode {
  index: number;
  type: RoomType;
  symbol: string;
  tier: 1 | 2 | 3;
  resolved: boolean;
  splitOptions?: RoomNode[];
  chosenPath?: number;
}

export interface MerchantState {
  tier: 1 | 2 | 3;
  weapons: { name: string; rarity: string; cost: number; className: string }[];
  items: { name: string; cost: number; quantity: number }[];
  enchantments: { name: string; cost: number }[];
  healingServices: { name: string; cost: number; effect: string }[];
  permanentUpgrades: { name: string; cost: number; effect: string }[];
  weaponServices: { name: string; cost: string; effect: string }[];
  visited: boolean;
}

export interface SpireState {
  tier: 1 | 2 | 3;
  roomIndex: number;
  rooms: RoomNode[];
  currentRoom?: RoomNode;
  splitChoicePending: boolean;
  merchantPriceMultiplier: number;
}

export interface PartyState {
  gold: number;
  sharedInventory: ItemInstance[];
  sharedInventoryLimit: number;
  heroes: HeroState[];
  turnOrder: string[];
  deadHeroIds: string[];
  maxHpBoostUsed?: boolean;
}

export interface RngState {
  seed: string;
  step: number;
  history: RandomEvent[];
}

export interface GameState {
  meta: {
    gameId: string;
    version: string;
    seed: string;
    createdAt: string;
    updatedAt: string;
    mode: GameMode;
    difficulty: Difficulty;
  };

  phase: GamePhase;

  rng: RngState;

  spire: SpireState;

  party: PartyState;

  combat?: CombatState;

  merchant?: MerchantState;

  stats: RunStats;

  log: GameEvent[];

  settings: SimulationConfig;

  rulings: AppliedRuling[];

  score?: ScoreResult;

  welcomeBonusPending?: boolean;

  deckManager?: DeckManager;
}

export interface SaveData {
  version: string;
  gameState: GameState;
  savedAt: string;
  name: string;
}
