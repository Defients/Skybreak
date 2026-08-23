import { useState, useRef, useEffect, useCallback } from "react";
import { useGameStore } from "../app/gameStore";
import { getLivingHeroes, getHeroById } from "../engine/rulesEngine";
import { aiPlayHeroTurn, aiPickSplitChoice, aiRestChoice, aiMerchantActions } from "../engine/aiController";
import { useAudio } from "../audio/useAudio";

const SPEED_DELAYS: Record<number, number> = {
  1: 1500,
  2: 800,
  4: 400,
  8: 150,
};

export function useAutoPlay() {
  const state = useGameStore((s) => s.state);
  const rng = useGameStore((s) => s.rng);
  const doResolveSplit = useGameStore((s) => s.doResolveSplit);
  const doStartCombat = useGameStore((s) => s.doStartCombat);
  const doBeginCombat = useGameStore((s) => s.doBeginCombat);
  const doHeroAction = useGameStore((s) => s.doHeroAction);
  const doUseItem = useGameStore((s) => s.doUseItem);
  const doEndTurn = useGameStore((s) => s.doEndTurn);
  const doResolveRoom = useGameStore((s) => s.doResolveRoom);
  const doEnterMerchant = useGameStore((s) => s.doEnterMerchant);
  const doBuyItem = useGameStore((s) => s.doBuyItem);
  const doBuyUpgrade = useGameStore((s) => s.doBuyUpgrade);
  const doBuyHealing = useGameStore((s) => s.doBuyHealing);
  const doLeaveMerchant = useGameStore((s) => s.doLeaveMerchant);
  const doRestChoice = useGameStore((s) => s.doRestChoice);
  const doAdvanceRoom = useGameStore((s) => s.doAdvanceRoom);
  const doConfirmTierTransition = useGameStore((s) => s.doConfirmTierTransition);
  const { playSfx } = useAudio();

  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(2);
  const [stepCount, setStepCount] = useState(0);
  const stepRef = useRef(0);
  const playingRef = useRef(true);
  const speedRef = useRef(2);

  useEffect(() => { playingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  const isSimMode = state?.settings.mode === "simulation";

  const step = useCallback(() => {
    const currentState = useGameStore.getState().state;
    const currentRng = useGameStore.getState().rng;
    if (!currentState || !currentRng) return;

    stepRef.current++;
    setStepCount(stepRef.current);

    if (currentState.phase === "victory" || currentState.phase === "defeat") {
      setIsPlaying(false);
      playSfx("results", currentState.phase === "victory" ? "victory" : "defeat");
      return;
    }

    if (currentState.welcomeBonusPending) {
      return;
    }

    if (currentState.phase === "tier_transition") {
      doConfirmTierTransition();
      return;
    }

    const room = currentState.spire.currentRoom;
    if (!room) return;

    if (room.type === "split" && currentState.spire.splitChoicePending) {
      const choiceIdx = aiPickSplitChoice(currentState, currentRng, "safe");
      doResolveSplit(choiceIdx);
      return;
    }

    if (currentState.phase === "combat") {
      const combat = currentState.combat;
      if (!combat) return;

      if (combat.combatResult) {
        doResolveRoom();
        return;
      }

      if (combat.activeSide === "monster" && combat.turnCount === 0) {
        doBeginCombat();
        return;
      }

      if (combat.activeSide === "heroes") {
        const livingHeroes = getLivingHeroes(currentState);
        const nextHeroId = combat.heroTurnOrder.find(
          (id) => !combat.completedHeroTurns.includes(id) && getHeroById(currentState, id)?.alive
        );
        if (nextHeroId) {
          // Canonical AI decision — sim mode uses the balanced strategy.
          const decision = aiPlayHeroTurn(currentState, currentRng, nextHeroId, "balanced");
          if (decision.action === "attack") {
            doHeroAction(nextHeroId, "attack", decision.targetId ?? combat.monster.id);
          } else if (decision.action === "use_item") {
            doUseItem(nextHeroId, decision.itemName!, decision.targetId ?? nextHeroId);
          } else {
            doEndTurn(nextHeroId);
          }
          return;
        }
        const allDone = combat.heroTurnOrder
          .filter((id) => getHeroById(currentState, id)?.alive)
          .every((id) => combat.completedHeroTurns.includes(id));
        if (allDone) {
          doEndTurn(combat.heroTurnOrder[0]);
          return;
        }
      }
      return;
    }

    if (currentState.phase === "merchant") {
      if (!currentState.merchant) {
        doEnterMerchant();
        return;
      }
      const purchases = aiMerchantActions(currentState, "balanced");
      if (purchases.length > 0) {
        const p = purchases[0];
        if (p.type === "item") {
          doBuyItem(p.name, p.heroId);
        } else if (p.type === "upgrade") {
          doBuyUpgrade(p.name, p.heroId);
        } else if (p.type === "healing") {
          doBuyHealing(p.name, p.heroId);
        }
        return;
      }
      doLeaveMerchant();
      return;
    }

    if (currentState.phase === "rest" || room.type === "rest") {
      const choice = aiRestChoice(currentState, currentRng, "full-heal");
      doRestChoice(choice);
      return;
    }

    if (!room.resolved) {
      if (room.type === "combat" || room.type === "elite_combat") {
        doStartCombat({ isElite: room.type === "elite_combat" });
      } else if (room.type === "mini_boss") {
        doStartCombat({ isMiniBoss: true });
      } else if (room.type === "final_boss") {
        doStartCombat({ isFinalBoss: true });
      } else if (room.type === "merchant") {
        doEnterMerchant();
      }
      return;
    }

    doAdvanceRoom();
  }, [
    doResolveSplit, doStartCombat, doBeginCombat, doHeroAction, doUseItem,
    doEndTurn, doResolveRoom, doEnterMerchant, doBuyItem, doBuyUpgrade,
    doBuyHealing, doLeaveMerchant, doRestChoice, doAdvanceRoom,
    doConfirmTierTransition, playSfx,
  ]);

  useEffect(() => {
    if (!isSimMode || !isPlaying) return;
    const delay = SPEED_DELAYS[speed] ?? 800;
    const timer = setTimeout(() => {
      step();
    }, delay);
    return () => clearTimeout(timer);
  }, [isSimMode, isPlaying, speed, step, stepCount, state]);

  const handleStep = useCallback(() => {
    setIsPlaying(false);
    step();
  }, [step]);

  return {
    isPlaying,
    setIsPlaying,
    speed,
    setSpeed,
    stepCount,
    handleStep,
    isSimMode,
  };
}
