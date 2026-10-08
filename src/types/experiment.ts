import type { GameEvent } from "./events";
import type { RunStats, ScoreResult } from "./ui";
import type { HeroClassName, Specialization, HeroPosition } from "./heroes";
import type { Suit } from "./cards";
import type { PartySetupChoice } from "../engine/gameState";
import type { Difficulty } from "./simulation";
import type {
  CombatStrategy,
  MerchantStrategy,
  RestStrategy,
  SplitStrategy,
  ItemUsageStrategy,
  WeaponUpgradeStrategy,
  PartyMode,
} from "./batch";

/**
 * Stage 3 — canonical experiment contracts.
 *
 * The central rule: a run's EXECUTION STATUS (did the simulator succeed?)
 * is strictly separated from its GAMEPLAY OUTCOME (did the party win?).
 * Technical failures never count as gameplay defeats.
 */

/** How the simulator finished executing a run. */
export type ExecutionStatus =
  /** The engine reached a terminal gameplay phase. `outcome` is authoritative. */
  | "completed"
  /** An unexpected exception was thrown during execution. */
  | "error"
  /** A safety ceiling was hit (room limit, combat iteration limit, stuck progression). */
  | "timeout"
  /** The starting configuration/state was invalid; the run never really began. */
  | "invalid"
  /** Cooperative cancellation aborted the run before completion. */
  | "cancelled"
  /** Execution was interrupted without a result (worker crash, page unload). */
  | "interrupted";

/** A real gameplay outcome. Only present when status === "completed". */
export type GameplayOutcome = "victory" | "defeat" | "retreat";

export type TelemetryLevel = "minimal" | "standard" | "deep";

/** How much of the requested telemetry is actually present. */
export type TelemetryCompleteness =
  | "complete"       // everything the level promises was captured
  | "summary-only"   // aggregates present; detail was never collected
  | "partial"        // detail exists but was truncated (e.g. bounded log)
  | "missing"        // metric not collected / not applicable
  | "invalid";       // run failed; gameplay metrics are not meaningful

export type ExperimentKind = "batch" | "strategy-lab";

/**
 * Experiment lifecycle. Legal transitions are enforced by the coordinator:
 *   created → queued → running → completed | failed | cancelled | interrupted
 *   running → pause-requested → paused → running (resume)
 *   running → cancel-requested → cancelled
 *   interrupted → running (resume) | incompatible (fingerprint mismatch)
 */
export type ExperimentStatus =
  | "created"
  | "queued"
  | "running"
  | "pause-requested"
  | "paused"
  | "cancel-requested"
  | "cancelled"
  | "interrupted"
  | "completed"
  | "failed"
  | "incompatible";

export interface RunDiagnostics {
  /** Game phase when the run ended or was terminated. */
  phase: string;
  roomIndex: number;
  tier: number;
  roomType?: string;
  /** Rooms processed before termination. */
  roomIterations: number;
  /** Combat steps executed in the last combat (0 if none). */
  combatIterations: number;
  /** Machine-readable failure category for non-completed runs. */
  errorCategory?:
    | "room-limit"
    | "combat-iteration-limit"
    | "stuck-progression"
    | "exception"
    | "invalid-config"
    | "invalid-state"
    | "cancelled"
    | "worker-crash";
  errorMessage?: string;
  /** True when retrying the identical task is safe (transient/interrupt). */
  retrySafe: boolean;
}

export interface PartyMemberRecord {
  className: HeroClassName;
  suit: Suit;
  specialization: string;
}

/** Genuine per-hero telemetry — never party aggregates attributed to a class. */
export interface HeroRunRecord {
  heroId: string;
  className: HeroClassName;
  specialization: Specialization | string;
  suit: Suit;
  position: HeroPosition;
  alive: boolean;
  currentHp: number;
  maxHp: number;
  /** Damage dealt by this hero (and its pets), from stats.damageByHero. */
  damageDealt: number;
  /** Damage taken by this hero, from stats.damageReceivedByHero. */
  damageReceived: number;
  /** Effective healing received, from stats.healingByHero. */
  healingReceived: number;
  itemsUsed: number;
  /** Times this hero died during the run (may exceed 1 with revivals). */
  deaths: number;
}

export interface EncounterRecord {
  /** Sequence index of the encounter within the run. */
  index: number;
  monsterName: string;
  isElite: boolean;
  isMiniBoss: boolean;
  isFinalBoss: boolean;
  /** "victory" | "defeat" | "retreat" — the COMBAT_ENDED result. */
  result: GameplayOutcome;
  /** Rounds elapsed in this encounter (TURN_STARTED events in the span). */
  rounds: number;
  /** Hero damage dealt during this encounter. */
  damageDealtByHeroes: number;
  /** Hero deaths during this encounter. */
  heroDeaths: number;
  /** True when the encounter span is fully retained in the bounded log. */
  complete: boolean;
}

/**
 * One executed run. `status` says whether the SIMULATOR succeeded;
 * `outcome` says whether the PARTY won (only when status === "completed").
 *
 * Legacy field names (runIndex, seed, score, stats, heroesAlive,
 * totalTurns, roomsCleared, partyComposition, combatLog, runSummary)
 * are preserved for backward compatibility with existing UI/tests.
 */
export interface RunRecord {
  /** Stable identity: `${experimentId}:${comboId}:${cohortIndex}` or run-scoped. */
  runId: string;
  experimentId?: string;
  comboId?: string;
  /** -1 for batch runs; combo position for strategy-lab runs. */
  comboIndex: number;
  /** Position within the comparison cohort (== runIndex for batch). */
  cohortIndex: number;
  runIndex: number;
  seed: string;

  status: ExecutionStatus;
  /** Gameplay outcome — present iff status === "completed". */
  outcome?: GameplayOutcome;
  /** Name of the monster that caused a legitimate defeat. */
  defeatedBy?: string;

  /** Final score — present iff status === "completed". */
  score?: ScoreResult;
  /** Finalized run stats — present iff status === "completed". */
  stats?: RunStats;
  heroesAlive?: number;
  totalTurns?: number;
  roomsCleared?: number;

  partyComposition: PartyMemberRecord[];
  /** Standard+ telemetry: per-hero records. */
  heroes?: HeroRunRecord[];
  /** Standard+ telemetry: per-encounter records. */
  encounters?: EncounterRecord[];
  /** Deep telemetry (or standard, bounded): the retained event log.
   *  Never claim completeness — check telemetryCompleteness. */
  combatLog?: GameEvent[];
  rngHistorySummary?: { totalSteps: number; retainedEvents: number };

  runSummary: string;
  diagnostics?: RunDiagnostics;
  telemetryLevel: TelemetryLevel;
  telemetryCompleteness: TelemetryCompleteness;
  /** Engine/behavior fingerprint this result was produced under. */
  engineFingerprint: string;
  durationMs?: number;
}

/** The per-run simulation policy actually passed to the canonical engine. */
export interface SimRunPolicy {
  difficulty: Difficulty;
  partyMode: PartyMode;
  partyChoices?: PartySetupChoice[];
  combatStrategy: CombatStrategy;
  merchantStrategy: MerchantStrategy;
  restStrategy: RestStrategy;
  splitStrategy: SplitStrategy;
  itemUsageStrategy: ItemUsageStrategy;
  weaponUpgradeStrategy: WeaponUpgradeStrategy;
}

/** A unit of schedulable work — one simulated game. */
export interface RunTask {
  runId: string;
  experimentId?: string;
  comboIndex: number;
  comboId?: string;
  cohortIndex: number;
  runIndex: number;
  seed: string;
  policy: SimRunPolicy;
  telemetryLevel: TelemetryLevel;
  /** Optional safety-limit overrides (testing / resource governance). */
  limits?: { maxRooms?: number; maxCombatIterations?: number };
}
