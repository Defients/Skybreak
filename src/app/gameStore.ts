import { create } from "zustand";
import type { GameState } from "../types/gameState";
import type { SimulationConfig } from "../types/simulation";
import { RngEngine } from "../utils/random";
import {
  initializeGame,
  createDefaultConfig,
  applyModeDefaults,
  applyWelcomeBonusResults,
  type PartySetupChoice,
  type WelcomeBonusRollResult,
} from "../engine/gameState";
import {
  advanceRoom,
  resolveSplitChoice,
  markRoomResolved,
  getHeroById,
} from "../engine/rulesEngine";
import {
  startCombat,
  flipPeonCards,
  detectMatches,
} from "../engine/combatEngine";
import { executeMonsterTurn } from "../engine/monsterAbilityEngine";
import { executeHeroAction, useItem } from "../engine/heroAbilityEngine";
import {
  enterMerchant,
  buyItem,
  buyHealing,
  buyUpgrade,
  buyWeapon,
  upgradeWeapon,
  reforgeWeapon,
  repairWeapon,
  buyEnchantment,
  autoBuy,
  leaveMerchant,
} from "../engine/merchantEngine";
import { resolveRestChoice, resolveCombatRoom } from "../engine/progressionEngine";
import { validateState } from "../engine/validationEngine";
import { autosave, saveGame } from "../engine/saveLoad";
import { emitEvent, resetEventSequence } from "../engine/eventLog";
import { generateSeed, resetIdCounter } from "../utils/ids";
import { useHybridStore } from "./hybridStore";
import { completeHeroTurn, checkAndSetCombatEnd } from "../engine/combatRunner";

function withRng(state: GameState, rng: RngEngine | null): GameState {
  if (!rng) return state;
  return { ...state, rng: rng.serialize() };
}

/**
 * Bump the session epoch and cancel any pending delayed monster-turn timer.
 * Called on start/reset/load so that a timer scheduled by a previous run can
 * never fire against the new state. The epoch is a monotonic ownership token:
 * a scheduled callback captures the epoch at scheduling time and bails if it
 * has advanced by the time the callback fires.
 */
function bumpSessionEpoch(): void {
  const store = useGameStore;
  const existing = store.getState().monsterTurnTimer;
  if (existing) clearTimeout(existing);
  store.setState({
    sessionEpoch: store.getState().sessionEpoch + 1,
    monsterTurnTimer: null,
  });
}

/**
 * Schedule the delayed monster turn for playable/companion/hybrid modes.
 * Captures the current session epoch; the callback no-ops if the session has
 * moved on (reset/load/new run) before the timer fires. Only one monster-turn
 * timer is ever pending — a previously pending timer is cleared first.
 */
function scheduleMonsterTurn(delay = 800): void {
  const store = useGameStore;
  const existing = store.getState().monsterTurnTimer;
  if (existing) clearTimeout(existing);
  const epoch = store.getState().sessionEpoch;
  const timer = setTimeout(() => {
    // Stale-timer guard: if the session advanced, this callback belongs to a
    // previous run and must not touch the current state.
    if (store.getState().sessionEpoch !== epoch) return;
    const { state: monsterState, rng: currentRng } = store.getState();
    if (!monsterState || !currentRng) return;
    if (monsterState.combat?.activeSide !== "monster") return;
    if (monsterState.combat?.combatResult) return;
    const afterMonster = executeMonsterTurn(monsterState, currentRng);
    const monsterFinal = withRng(afterMonster, currentRng);
    store.setState({ state: monsterFinal, monsterTurnTimer: null });
    autosave(monsterFinal);
  }, delay);
  store.setState({ monsterTurnTimer: timer });
}

interface GameStore {
  state: GameState | null;
  rng: RngEngine | null;
  validationWarnings: { id: string; message: string; severity: string }[];
  // Internal plumbing: a monotonically increasing session epoch guards stale
  // delayed monster-turn timers from mutating a replacement run after a
  // reset/load/new-run. monsterTurnTimer tracks the single pending timer so it
  // can be cancelled on session changes.
  sessionEpoch: number;
  monsterTurnTimer: ReturnType<typeof setTimeout> | null;

  startNewRun: (config: Partial<SimulationConfig>, partyChoices: PartySetupChoice[]) => void;
  doAdvanceRoom: () => void;
  doResolveSplit: (choiceIndex: number) => void;
  doStartCombat: (options?: { isElite?: boolean; isMiniBoss?: boolean; isFinalBoss?: boolean }) => void;
  doBeginCombat: () => void;
  doFlipCards: (actorId: string) => { cards: any[]; matches: any[] };
  doHeroAction: (heroId: string, action: string, targetId?: string) => void;
  doUseItem: (heroId: string, itemName: string, targetId?: string) => void;
  doEndTurn: (heroId: string) => void;
  doMonsterTurn: () => void;
  doEnterMerchant: () => void;
  doBuyItem: (itemName: string, heroId: string) => void;
  doBuyHealing: (serviceName: string, targetHeroId?: string) => void;
  doBuyUpgrade: (upgradeName: string, heroId: string) => void;
  doBuyWeapon: (weaponName: string, heroId: string) => void;
  doUpgradeWeapon: (heroId: string) => void;
  doReforgeWeapon: (heroId: string) => void;
  doRepairWeapon: (heroId: string) => void;
  doBuyEnchantment: (enchantmentName: string, heroId: string) => void;
  doAutoBuy: () => void;
  doLeaveMerchant: () => void;
  doRestChoice: (choice: 1 | 2 | 3 | 4) => void;
  doConfirmTierTransition: () => void;
  doResolveRoom: () => void;
  doManualOverride: (path: string, value: any) => void;
  doForceCombatResult: (result: "victory" | "defeat" | "retreat") => void;
  doLoadState: (state: GameState) => void;
  doSaveGame: (name: string) => boolean;
  doApplyWelcomeBonus: (results: WelcomeBonusRollResult[]) => void;
  doResetGame: () => void;
  runValidation: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  state: null,
  rng: null,
  validationWarnings: [],
  sessionEpoch: 0,
  monsterTurnTimer: null,

  startNewRun: (config, partyChoices) => {
    resetIdCounter();
    resetEventSequence();
    bumpSessionEpoch();
    const fullConfig = applyModeDefaults(createDefaultConfig(config));
    const state = initializeGame(fullConfig, partyChoices);
    const rng = new RngEngine(fullConfig.seed);
    set({ state, rng, validationWarnings: [] });
  },

  doAdvanceRoom: () => {
    const { state, rng } = get();
    if (!state || !rng) return;
    const newState = advanceRoom(state);
    set({ state: newState });
    autosave(newState);
  },

  doResolveSplit: (choiceIndex) => {
    const { state, rng } = get();
    if (!state || !rng) return;
    const newState = resolveSplitChoice(state, choiceIndex, rng);
    const finalState = withRng(newState, rng);
    set({ state: finalState });
    autosave(finalState);
  },

  doStartCombat: (options) => {
    const { state, rng } = get();
    if (!state || !rng) return;

    // Smoke Bomb: skip combat room
    const hasSmokeBomb = state.party.heroes.some(h => h.alive && h.perTurnFlags["smokeBombActive"]);
    if (hasSmokeBomb && !options?.isFinalBoss) {
      let newState = { ...state };
      newState = {
        ...newState,
        party: {
          ...newState.party,
          heroes: newState.party.heroes.map(h =>
            h.alive ? { ...h, perTurnFlags: { ...h.perTurnFlags, smokeBombActive: false } } : h
          ),
        },
      };
      newState = emitEvent(newState, "ABILITY_TRIGGERED", "Smoke Bomb used! Combat room skipped.", {});
      const resolved = markRoomResolved(newState);
      const advanced = advanceRoom(resolved);
      set({ state: advanced });
      autosave(advanced);
      return;
    }

    const combatState = startCombat(state, rng, options);
    const finalState = withRng(combatState, rng);
    set({ state: finalState });
    autosave(finalState);
  },

  doBeginCombat: () => {
    const { state, rng } = get();
    if (!state || !rng || !state.combat) return;
    if (state.combat.activeSide !== "monster") return;
    // Monster goes first per rules 6.2.
    // In simulation mode, execute synchronously (no UI pacing needed).
    // In playable mode, defer so UI can show "Active Side: monster".
    if (state.settings.mode === "simulation") {
      const afterMonster = executeMonsterTurn(state, rng);
      const finalState = withRng(afterMonster, rng);
      set({ state: finalState });
      autosave(finalState);
      return;
    }
    scheduleMonsterTurn();
  },

  doFlipCards: (actorId) => {
    const { state, rng } = get();
    if (!state || !rng) return { cards: [], matches: [] };

    const hero = getHeroById(state, actorId);
    const { state: flipState, cards } = flipPeonCards(state, actorId, rng);

    let apcs: any[] = [];
    if (hero) {
      apcs = hero.apcs;
    } else if (state.combat) {
      apcs = state.combat.monster.apcs;
    }

    const matches = detectMatches(apcs, cards);
    set({ state: withRng(flipState, rng) });
    return { cards, matches };
  },

  doHeroAction: (heroId, action, targetId) => {
    const { state, rng } = get();
    if (!state || !rng || !state.combat) return;
    if (state.combat.activeSide !== "heroes") return;
    if (state.combat.completedHeroTurns.includes(heroId)) return;

    // Enforce turn order: only the next hero in heroTurnOrder may act
    // (unless allowIllegalOverride is enabled for sandbox mode)
    if (!state.settings.allowIllegalOverride) {
      const nextHeroId = state.combat.heroTurnOrder.find(id =>
        !state.combat!.completedHeroTurns.includes(id) &&
        getHeroById(state, id)?.alive
      );
      if (heroId !== nextHeroId) return;
    }

    const { state: actionState } = executeHeroAction(state, rng, heroId, targetId);
    // Canonical post-action terminal check (shared with headless path)
    let newState = checkAndSetCombatEnd(actionState);
    if (newState.combat?.combatResult) {
      const finalState = withRng(newState, rng);
      set({ state: finalState });
      autosave(finalState);
      return;
    }
    // Canonical turn completion (shared with headless path)
    newState = completeHeroTurn(newState, heroId);

    // If all heroes done, execute monster turn.
    // In simulation mode: synchronous (no UI pacing needed).
    // In playable mode: deferred so UI can show "Active Side: monster".
    if (newState.combat?.activeSide === "monster") {
      const monsterReady = withRng(newState, rng);
      set({ state: monsterReady });
      if (state.settings.mode === "simulation") {
        const { state: monsterState, rng: currentRng } = get();
        if (!monsterState || !currentRng) return;
        const afterMonster = executeMonsterTurn(monsterState, currentRng);
        const monsterFinal = withRng(afterMonster, currentRng);
        set({ state: monsterFinal });
        autosave(monsterFinal);
        return;
      }
      scheduleMonsterTurn();
      return;
    }

    const finalState = withRng(newState, rng);
    set({ state: finalState });
    autosave(finalState);
  },

  doUseItem: (heroId, itemName, targetId) => {
    const { state, rng } = get();
    if (!state || !state.combat) return;
    // In sandbox mode, allow item use even when it's not the hero's turn
    if (!state.settings.allowIllegalOverride) {
      if (state.combat.activeSide !== "heroes") return;
      if (state.combat.completedHeroTurns.includes(heroId)) return;
    }
    const itemState = useItem(state, heroId, itemName, targetId, rng ?? undefined);
    // Canonical post-action terminal check (Bomb can kill — shared with headless)
    const newState = checkAndSetCombatEnd(itemState);
    const finalState = withRng(newState, rng);
    set({ state: finalState });
    autosave(finalState);
  },

  doEndTurn: (heroId) => {
    const { state, rng } = get();
    if (!state || !state.combat) return;
    if (state.combat.activeSide !== "heroes") return;
    if (state.combat.completedHeroTurns.includes(heroId)) return;

    // Enforce turn order: only the next hero in heroTurnOrder may end turn
    const nextHeroId = state.combat.heroTurnOrder.find(id =>
      !state.combat!.completedHeroTurns.includes(id) &&
      getHeroById(state, id)?.alive
    );
    if (heroId !== nextHeroId) return;

    // Canonical turn completion (shared with headless path)
    let newState = completeHeroTurn(state, heroId);

    // If all heroes done, execute monster turn.
    // In simulation mode: synchronous. In playable mode: deferred.
    if (newState.combat?.activeSide === "monster") {
      const monsterReady = withRng(newState, rng);
      set({ state: monsterReady });
      if (state.settings.mode === "simulation") {
        const { state: monsterState, rng: currentRng } = get();
        if (!monsterState || !currentRng) return;
        const afterMonster = executeMonsterTurn(monsterState, currentRng);
        const monsterFinal = withRng(afterMonster, currentRng);
        set({ state: monsterFinal });
        autosave(monsterFinal);
        return;
      }
      scheduleMonsterTurn();
      return;
    }

    const finalState = withRng(newState, rng);
    set({ state: finalState });
    autosave(finalState);
  },

  doMonsterTurn: () => {
    const { state, rng } = get();
    if (!state || !rng || !state.combat) return;
    if (state.combat.activeSide !== "monster") return;
    const newState = executeMonsterTurn(state, rng);
    const finalState = withRng(newState, rng);
    set({ state: finalState });
    autosave(finalState);
  },

  doEnterMerchant: () => {
    const { state, rng } = get();
    if (!state) return;
    const newState = enterMerchant(state);
    const finalState = withRng(newState, rng);
    set({ state: finalState });
    autosave(finalState);
  },

  doBuyItem: (itemName, heroId) => {
    const { state, rng } = get();
    if (!state) return;
    const newState = buyItem(state, itemName, heroId);
    const finalState = withRng(newState, rng);
    set({ state: finalState });
    autosave(finalState);
  },

  doBuyHealing: (serviceName, targetHeroId) => {
    const { state, rng } = get();
    if (!state) return;
    const newState = buyHealing(state, serviceName, targetHeroId);
    const finalState = withRng(newState, rng);
    set({ state: finalState });
    autosave(finalState);
  },

  doBuyUpgrade: (upgradeName, heroId) => {
    const { state, rng } = get();
    if (!state) return;
    const newState = buyUpgrade(state, upgradeName, heroId);
    const finalState = withRng(newState, rng);
    set({ state: finalState });
    autosave(finalState);
  },

  doBuyWeapon: (weaponName, heroId) => {
    const { state, rng } = get();
    if (!state) return;
    const newState = buyWeapon(state, weaponName, heroId);
    const finalState = withRng(newState, rng);
    set({ state: finalState });
    autosave(finalState);
  },

  doUpgradeWeapon: (heroId) => {
    const { state, rng } = get();
    if (!state) return;
    const newState = upgradeWeapon(state, heroId);
    const finalState = withRng(newState, rng);
    set({ state: finalState });
    autosave(finalState);
  },

  doReforgeWeapon: (heroId) => {
    const { state, rng } = get();
    if (!state) return;
    const newState = reforgeWeapon(state, heroId);
    const finalState = withRng(newState, rng);
    set({ state: finalState });
    autosave(finalState);
  },

  doRepairWeapon: (heroId) => {
    const { state, rng } = get();
    if (!state) return;
    const newState = repairWeapon(state, heroId);
    const finalState = withRng(newState, rng);
    set({ state: finalState });
    autosave(finalState);
  },

  doBuyEnchantment: (enchantmentName, heroId) => {
    const { state, rng } = get();
    if (!state) return;
    const newState = buyEnchantment(state, enchantmentName, heroId);
    const finalState = withRng(newState, rng);
    set({ state: finalState });
    autosave(finalState);
  },

  doAutoBuy: () => {
    const { state, rng } = get();
    if (!state) return;
    const newState = autoBuy(state);
    const finalState = withRng(newState, rng);
    set({ state: finalState });
    autosave(finalState);
  },

  doLeaveMerchant: () => {
    const { state, rng } = get();
    if (!state) return;
    const newState = leaveMerchant(state);
    const resolved = markRoomResolved(newState);
    const advanced = advanceRoom(resolved);
    const finalState = withRng(advanced, rng);
    set({ state: finalState });
    autosave(finalState);
  },

  doRestChoice: (choice) => {
    const { state, rng } = get();
    if (!state || !rng) return;
    const newState = resolveRestChoice(state, choice, rng);
    const resolved = markRoomResolved(newState);
    const advanced = advanceRoom(resolved);
    const finalState = withRng(advanced, rng);
    set({ state: finalState });
    autosave(finalState);
  },

  doConfirmTierTransition: () => {
    const { state, rng } = get();
    if (!state) return;
    if (state.phase !== "tier_transition") return;
    const newState = { ...state, phase: "exploration" as const };
    const finalState = withRng(newState, rng);
    set({ state: finalState });
    autosave(finalState);
  },

  doResolveRoom: () => {
    const { state, rng } = get();
    if (!state) return;
    // Delegate to the shared terminal resolver so the playable and batch
    // paths have identical combat room resolution semantics.
    const result = resolveCombatRoom(state);
    const finalState = withRng(result.state, rng);
    set({ state: finalState });
    autosave(finalState);
  },

  doManualOverride: (path, value) => {
    const { state } = get();
    if (!state) return;
    // Safe immutable path update: shallow-copy each level of the path to avoid
    // mutating shared nested references from the prior Zustand state. Also
    // blocks __proto__/constructor/prototype path keys to prevent prototype
    // pollution.
    const parts = path.split(".");
    for (const p of parts) {
      if (p === "__proto__" || p === "constructor" || p === "prototype") {
        return;
      }
    }
    let newState: any = { ...state };
    let obj: any = newState;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      // Preserve arrays: spreading an array into an object ({ ...arr })
      // converts it to an object with string keys, breaking .map/.filter.
      // Use [...arr] for arrays, { ...obj } for plain objects.
      obj[key] = Array.isArray(obj[key]) ? [...obj[key]] : { ...obj[key] };
      obj = obj[key];
    }
    obj[parts[parts.length - 1]] = value;
    newState = emitEvent(newState, "MANUAL_OVERRIDE", `Manual override: ${path} = ${JSON.stringify(value)}`, {
      details: { path, value },
    });
    set({ state: newState });
    autosave(newState);
  },

  doForceCombatResult: (result) => {
    const { state } = get();
    if (!state || !state.combat) return;
    const newState = {
      ...state,
      combat: { ...state.combat, combatResult: result },
    };
    const finalState = emitEvent(newState, "COMBAT_ENDED", `Combat force-ended: ${result} (sandbox override).`, {
      details: { result, reason: "sandbox_override" },
    });
    set({ state: finalState });
    autosave(finalState);
  },

  doLoadState: (loadedState) => {
    // Validate the loaded state has the minimum required shape
    if (!loadedState || typeof loadedState !== "object") return;
    if (!loadedState.party || !Array.isArray(loadedState.party.heroes)) return;
    if (!loadedState.meta || !loadedState.spire) return;
    // Invalidate any pending delayed monster-turn timer from the prior run.
    bumpSessionEpoch();
    // Reconstruct RNG from serialized state (or create a fallback)
    let rng: RngEngine;
    try {
      rng = loadedState.rng
        ? RngEngine.deserialize(loadedState.rng)
        : new RngEngine(`fallback-${Date.now()}`);
    } catch {
      rng = new RngEngine(`fallback-${Date.now()}`);
    }
    set({ state: loadedState, rng, validationWarnings: [] });
  },

  doSaveGame: (name) => {
    const { state } = get();
    if (!state) return false;
    return saveGame(state, name);
  },

  doApplyWelcomeBonus: (results) => {
    const { state, rng } = get();
    if (!state || !rng) return;
    const newState = applyWelcomeBonusResults(state, results, rng);
    const finalState = withRng({ ...newState, welcomeBonusPending: false }, rng);
    set({ state: finalState });
    autosave(finalState);
  },

  doResetGame: () => {
    // Reset module-level mutable state to prevent bleed across runs.
    resetEventSequence();
    resetIdCounter();
    // Invalidate any pending delayed monster-turn timer from the prior run.
    bumpSessionEpoch();
    // Reset hybrid AI control state so a new run starts with a clean toggle.
    useHybridStore.getState().resetAIControl();
    set({ state: null, rng: null, validationWarnings: [] });
  },

  runValidation: () => {
    const { state } = get();
    if (!state) return;
    const result = validateState(state);
    set({ validationWarnings: result.warnings });
  },
}));
