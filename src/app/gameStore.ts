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
  cleanupCombat,
  grantRewards,
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
import { resolveRestChoice, calculateScore, checkVictory, checkDefeat, finalizeRunStats } from "../engine/progressionEngine";
import { validateState } from "../engine/validationEngine";
import { autosave, saveGame } from "../engine/saveLoad";
import { emitEvent } from "../engine/eventLog";
import { generateSeed, resetIdCounter } from "../utils/ids";

function withRng(state: GameState, rng: RngEngine | null): GameState {
  if (!rng) return state;
  return { ...state, rng: rng.serialize() };
}

interface GameStore {
  state: GameState | null;
  rng: RngEngine | null;
  validationWarnings: { id: string; message: string; severity: string }[];

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

  startNewRun: (config, partyChoices) => {
    resetIdCounter();
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
    // Monster goes first per rules 6.2 — auto-execute monster turn
    const afterMonster = executeMonsterTurn(state, rng);
    const finalState = withRng(afterMonster, rng);
    set({ state: finalState });
    autosave(finalState);
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
    let newState = actionState;

    const completedHeroTurns = [...newState.combat!.completedHeroTurns, heroId];
    // Only require living heroes to have completed their turns
    const allDone = newState.combat!.heroTurnOrder
      .filter(id => getHeroById(newState, id)?.alive)
      .every(id => completedHeroTurns.includes(id));

    newState = {
      ...newState,
      stats: { ...newState.stats, totalTurns: newState.stats.totalTurns + 1 },
      combat: {
        ...newState.combat!,
        turnCount: newState.combat!.turnCount + 1,
        completedHeroTurns,
      },
    };

    if (allDone) {
      const combat = { ...newState.combat!, round: newState.combat!.round + 1, completedHeroTurns: [], activeSide: "monster" as const };
      newState = emitEvent(newState, "TURN_STARTED", `Round ${combat.round} begins. Monster's turn.`, {
        details: { round: combat.round },
      });
      newState = { ...newState, combat };
      set({ state: withRng(newState, rng) });
      const { state: monsterState, rng: currentRng } = get();
      if (!monsterState || !currentRng) return;
      const afterMonster = executeMonsterTurn(monsterState, currentRng);
      const monsterFinal = withRng(afterMonster, currentRng);
      set({ state: monsterFinal });
      autosave(monsterFinal);
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
    const newState = useItem(state, heroId, itemName, targetId, rng ?? undefined);
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

    let newState = { ...state };
    const combat = { ...newState.combat! };
    // Add hero to completedHeroTurns if not already (handles skip-attack case)
    if (!combat.completedHeroTurns.includes(heroId)) {
      combat.completedHeroTurns = [...combat.completedHeroTurns, heroId];
    }
    // Only require living heroes to have completed their turns
    const allDone = combat.heroTurnOrder
      .filter(id => getHeroById(newState, id)?.alive)
      .every(id => combat.completedHeroTurns.includes(id));

    if (allDone) {
      combat.round++;
      combat.completedHeroTurns = [];
      combat.activeSide = "monster";
      newState = emitEvent(newState, "TURN_STARTED", `Round ${combat.round} begins. Monster's turn.`, {
        details: { round: combat.round },
      });
      newState = { ...newState, combat };
      set({ state: withRng(newState, rng) });
      // Auto-execute monster turn
      const { state: monsterState, rng: currentRng } = get();
      if (!monsterState || !currentRng) return;
      const afterMonster = executeMonsterTurn(monsterState, currentRng);
      const monsterFinal = withRng(afterMonster, currentRng);
      set({ state: monsterFinal });
      autosave(monsterFinal);
      return;
    }

    newState = { ...newState, combat };
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
    const { state } = get();
    if (!state) return;
    const newState = enterMerchant(state);
    set({ state: newState });
    autosave(newState);
  },

  doBuyItem: (itemName, heroId) => {
    const { state } = get();
    if (!state) return;
    const newState = buyItem(state, itemName, heroId);
    set({ state: newState });
    autosave(newState);
  },

  doBuyHealing: (serviceName, targetHeroId) => {
    const { state } = get();
    if (!state) return;
    const newState = buyHealing(state, serviceName, targetHeroId);
    set({ state: newState });
    autosave(newState);
  },

  doBuyUpgrade: (upgradeName, heroId) => {
    const { state } = get();
    if (!state) return;
    const newState = buyUpgrade(state, upgradeName, heroId);
    set({ state: newState });
    autosave(newState);
  },

  doBuyWeapon: (weaponName, heroId) => {
    const { state } = get();
    if (!state) return;
    const newState = buyWeapon(state, weaponName, heroId);
    set({ state: newState });
    autosave(newState);
  },

  doUpgradeWeapon: (heroId) => {
    const { state } = get();
    if (!state) return;
    const newState = upgradeWeapon(state, heroId);
    set({ state: newState });
    autosave(newState);
  },

  doReforgeWeapon: (heroId) => {
    const { state } = get();
    if (!state) return;
    const newState = reforgeWeapon(state, heroId);
    set({ state: newState });
    autosave(newState);
  },

  doRepairWeapon: (heroId) => {
    const { state } = get();
    if (!state) return;
    const newState = repairWeapon(state, heroId);
    set({ state: newState });
    autosave(newState);
  },

  doBuyEnchantment: (enchantmentName, heroId) => {
    const { state } = get();
    if (!state) return;
    const newState = buyEnchantment(state, enchantmentName, heroId);
    set({ state: newState });
    autosave(newState);
  },

  doAutoBuy: () => {
    const { state } = get();
    if (!state) return;
    const newState = autoBuy(state);
    set({ state: newState });
    autosave(newState);
  },

  doLeaveMerchant: () => {
    const { state } = get();
    if (!state) return;
    const newState = leaveMerchant(state);
    const resolved = markRoomResolved(newState);
    const advanced = advanceRoom(resolved);
    set({ state: advanced });
    autosave(advanced);
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
    const { state } = get();
    if (!state) return;
    if (state.phase !== "tier_transition") return;
    const newState = { ...state, phase: "exploration" as const };
    set({ state: newState });
    autosave(newState);
  },

  doResolveRoom: () => {
    const { state } = get();
    if (!state) return;
    let newState = { ...state };

    if (state.phase === "combat" && state.combat?.combatResult === "victory") {
      newState = grantRewards(newState);
      newState = cleanupCombat(newState);
      newState = markRoomResolved(newState);
      newState = advanceRoom(newState);
    } else if (state.phase === "combat" && state.combat?.combatResult === "defeat") {
      if (checkDefeat(newState)) {
        newState = finalizeRunStats(newState);
        newState = { ...newState, phase: "defeat" };
        newState = emitEvent(newState, "DEFEAT", "The party has been wiped out. The Astrilith claims another group of adventurers.", {
          details: { reason: "party_wipe" },
        });
      } else {
        newState = cleanupCombat(newState);
        newState = markRoomResolved(newState);
        newState = advanceRoom(newState);
      }
    } else if (state.phase === "combat" && state.combat?.combatResult === "retreat") {
      newState = cleanupCombat(newState);
      newState = markRoomResolved(newState);
      newState = advanceRoom(newState);
    }

    if (checkVictory(newState)) {
      newState = finalizeRunStats(newState);
      const score = calculateScore(newState);
      newState = { ...newState, phase: "victory", score };
      newState = emitEvent(newState, "VICTORY", `Judgment survived! The ascent is complete! Final Score: ${score.finalScore}. Title: ${score.title}`, {
        details: { score: score.finalScore, title: score.title },
      });
    }

    set({ state: newState });
    autosave(newState);
  },

  doManualOverride: (path, value) => {
    const { state } = get();
    if (!state) return;
    let newState = { ...state };
    const parts = path.split(".");
    let obj: any = newState;
    for (let i = 0; i < parts.length - 1; i++) {
      obj = obj[parts[i]];
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
    const rng = RngEngine.deserialize(loadedState.rng);
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
    set({ state: null, rng: null, validationWarnings: [] });
  },

  runValidation: () => {
    const { state } = get();
    if (!state) return;
    const result = validateState(state);
    set({ validationWarnings: result.warnings });
  },
}));
