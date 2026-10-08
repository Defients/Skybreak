import type { GameMode, Difficulty, SimulationConfig } from "./simulation";
import type { GameEvent, RandomEvent } from "./events";
import type { HeroState, HeroClassName, HeroPosition, HeroId } from "./heroes";
import type { CombatState } from "./combat";
import type { ItemInstance } from "./inventory";
import type { RunStats, ScoreResult, AppliedRuling } from "./ui";
import type { DeckManager, Suit } from "./cards";

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
  /** Stable content identifier (e.g., "t1_00_merchant"), independent of array index. */
  roomId?: string;
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

/**
 * Immutable record of one hero's original configuration at run creation.
 * Written once by initializeGame and never mutated afterwards. Used by
 * Ascent Capsules to reproduce the run's exact starting conditions —
 * unlike APCs, this survives combat consumption and APC transformation.
 */
export interface StartingHeroConfig {
  heroId: HeroId;
  className: HeroClassName;
  suit: Suit;
  position: HeroPosition;
  specialization: string;
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

  /**
   * The run's original party configuration, recorded at initializeGame time.
   * Absent in saves that predate this field — consumers must treat absence
   * as "unknown" (not reconstructible), never guess from mutable state.
   */
  startingParty?: StartingHeroConfig[];

  combat?: CombatState;

  merchant?: MerchantState;

  stats: RunStats;

  log: GameEvent[];

  settings: SimulationConfig;

  rulings: AppliedRuling[];

  score?: ScoreResult;

  welcomeBonusPending?: boolean;
  /** Seeded welcome dice already rolled; retained across save/resume. */
  welcomeBonusRolls?: { heroId: number; die1: number; die2: number }[];
  welcomeBonusWeaponChoices?: Record<string, string>;

  deckManager?: DeckManager;
}

export interface SaveData {
  version: string;
  gameState: GameState;
  savedAt: string;
  name: string;
}
