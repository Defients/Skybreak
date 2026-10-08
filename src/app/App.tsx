import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { useGameStore } from "./gameStore";
import { AppShell } from "../components/layout/AppShell";
import { ErrorBoundary } from "../components/layout/ErrorBoundary";
import { HomeScreen } from "../components/screens/HomeScreen";
import { SimulationControls } from "../components/ui/SimulationControls";
import { useAutoPlay } from "../hooks/useAutoPlay";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { CombatTransition, type CombatTransitionType } from "../components/ui/CombatTransition";
import { getLivingHeroes } from "../engine/rulesEngine";
import { useAudio } from "../audio/useAudio";

const GameDashboard = lazy(() => import("../components/screens/GameDashboard").then(m => ({ default: m.GameDashboard })));
const CombatView = lazy(() => import("../components/screens/CombatView").then(m => ({ default: m.CombatView })));
const MerchantView = lazy(() => import("../components/screens/MerchantView").then(m => ({ default: m.MerchantView })));
const RestView = lazy(() => import("../components/screens/RestView").then(m => ({ default: m.RestView })));
const WelcomeBonusView = lazy(() => import("../components/screens/WelcomeBonusView").then(m => ({ default: m.WelcomeBonusView })));
const RulesReference = lazy(() => import("../components/screens/RulesReference").then(m => ({ default: m.RulesReference })));
const DebugScreen = lazy(() => import("../components/screens/DebugScreen").then(m => ({ default: m.DebugScreen })));
const RunReport = lazy(() => import("../components/screens/RunReport").then(m => ({ default: m.RunReport })));
const TierTransitionView = lazy(() => import("../components/screens/TierTransitionView").then(m => ({ default: m.TierTransitionView })));
const BatchSimulationScreen = lazy(() => import("../components/screens/BatchSimulationScreen").then(m => ({ default: m.BatchSimulationScreen })));
const StrategyLabScreen = lazy(() => import("../components/screens/StrategyLabScreen").then(m => ({ default: m.StrategyLabScreen })));
const WikiScreen = lazy(() => import("../components/screens/WikiScreen").then(m => ({ default: m.WikiScreen })));

function ScreenLoader() {
  return (
    <div role="status" aria-label="Loading screen" className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 rounded-full border-2 border-spire-accent/30 border-t-spire-accent animate-spin" />
    </div>
  );
}

export type ScreenName =
  | "home"
  | "dashboard"
  | "combat"
  | "merchant"
  | "rest"
  | "welcome_bonus"
  | "rules"
  | "debug"
  | "report"
  | "tier_transition"
  | "batch"
  | "strategy_lab"
  | "simulation"
  | "wiki"
  | "wiki-rules"
  | "wiki-strategy";

const SCREEN_TRANSITIONS: Record<ScreenName, string> = {
  home: "animate-fade-in",
  dashboard: "animate-slide-right",
  combat: "animate-zoom-in",
  merchant: "animate-fade-in",
  rest: "animate-scale-fade",
  welcome_bonus: "animate-fade-in",
  rules: "animate-slide-left",
  debug: "animate-slide-left",
  report: "animate-fade-in",
  tier_transition: "animate-scale-fade",
  batch: "animate-fade-in",
  strategy_lab: "animate-fade-in",
  simulation: "animate-fade-in",
  wiki: "animate-slide-left",
  "wiki-rules": "animate-slide-left",
  "wiki-strategy": "animate-slide-left",
};

export function App() {
  useDialogFocus();
  const state = useGameStore((s) => s.state);
  const doResetGame = useGameStore((s) => s.doResetGame);
  const doAdvanceRoom = useGameStore((s) => s.doAdvanceRoom);
  const doResolveRoom = useGameStore((s) => s.doResolveRoom);
  const doHeroAction = useGameStore((s) => s.doHeroAction);
  const doEndTurn = useGameStore((s) => s.doEndTurn);
  const [screen, setScreen] = useState<ScreenName>("home");
  const [homeNavKey, setHomeNavKey] = useState(0);
  const prevScreenRef = useRef<ScreenName>("home");
  const lastActionRef = useRef(0);
  const [combatTransition, setCombatTransition] = useState<CombatTransitionType>(null);
  const pendingScreenRef = useRef<ScreenName | null>(null);
  const prevEffectiveScreenRef = useRef<ScreenName>("home");

  const { isPlaying, setIsPlaying, speed, setSpeed, stepCount, handleStep, isSimMode } = useAutoPlay(!["home", "rules", "wiki", "wiki-rules", "wiki-strategy", "debug", "batch", "strategy_lab"].includes(screen));
  const { stopAllSfx } = useAudio();

  const handleNavigate = useCallback((next: ScreenName) => {
    if (next === "wiki" || next === "wiki-rules" || next === "wiki-strategy") {
      prevScreenRef.current = screen;
    }

    const prevEff = prevEffectiveScreenRef.current;
    const goingToCombat = next === "combat" && prevEff !== "combat";
    const leavingCombat = prevEff === "combat" && next !== "combat";

    if (goingToCombat || leavingCombat) {
      pendingScreenRef.current = next;
      setCombatTransition(goingToCombat ? "enter" : "exit");
      return;
    }

    if (next === "home" && screen === "home") {
      setHomeNavKey(k => k + 1);
    }
    setScreen(next);
  }, [screen]);

  const handleCombatTransitionDone = useCallback(() => {
    setCombatTransition(null);
    const pending = pendingScreenRef.current;
    pendingScreenRef.current = null;
    if (pending) {
      setScreen(pending);
    }
  }, []);

  // Keyboard hotkeys
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;

      if (e.defaultPrevented || document.querySelector('[aria-modal="true"]')) return;
      if (e.key === "ArrowRight") {
        if (screen !== "dashboard" && screen !== "combat") return;
        e.preventDefault();
        const now = Date.now();
        if (now - lastActionRef.current < 400) return;
        lastActionRef.current = now;
        if (state?.phase === "combat" && state.combat) {
          if (state.combat.combatResult) {
            stopAllSfx();
            doResolveRoom();
            handleNavigate("dashboard");
          } else if (state.combat.activeSide === "heroes") {
            const living = getLivingHeroes(state);
            const nextHero = state.combat.heroTurnOrder.find(id =>
              !state.combat!.completedHeroTurns.includes(id) &&
              living.some(h => h.id === id)
            );
            if (nextHero) {
              doHeroAction(nextHero, "attack", state.combat.monster.id);
            }
          }
        } else if (state && screen === "dashboard") {
          const room = state.spire.currentRoom;
          if (room?.resolved) {
            doAdvanceRoom();
          }
        }
      } else if (e.key === "Escape") {
        if (state?.phase === "combat" && state.combat?.activeSide !== "heroes") return;
        if (screen === "wiki" || screen === "wiki-rules" || screen === "wiki-strategy") {
          setScreen(prevScreenRef.current);
        } else if (screen === "combat" || screen === "merchant" || screen === "rest") {
          stopAllSfx();
          handleNavigate("dashboard");
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [state, screen, doAdvanceRoom, doResolveRoom, doHeroAction, doEndTurn, handleNavigate, stopAllSfx]);

  const renderScreen = () => {
    if (screen === "batch") return <BatchSimulationScreen onBack={() => setScreen("home")} />;
    if (screen === "strategy_lab") return <StrategyLabScreen onBack={() => setScreen("home")} />;
    if (screen === "wiki") return <WikiScreen onBack={() => setScreen(state ? prevScreenRef.current : "home")} />;
    if (screen === "wiki-rules") return <WikiScreen initialTab="pcg" onBack={() => setScreen(state ? prevScreenRef.current : "home")} />;
    if (screen === "wiki-strategy") return <WikiScreen initialTab="strategy" onBack={() => setScreen(state ? prevScreenRef.current : "home")} />;
    if (screen === "home") return <HomeScreen onNavigate={handleNavigate} />;

    if (!state) {
      return <HomeScreen onNavigate={handleNavigate} />;
    }

    if (screen === "rules") return <RulesReference onBack={() => setScreen("dashboard")} />;
    if (screen === "debug") return <DebugScreen onBack={() => setScreen("dashboard")} />;

    if (state.phase === "victory" || state.phase === "defeat") {
      return <RunReport state={state} onHome={() => { doResetGame(); setScreen("home"); }} />;
    }

    if (state.welcomeBonusPending) {
      return <WelcomeBonusView onComplete={() => setScreen("dashboard")} />;
    }

    if (state.phase === "merchant") {
      return <MerchantView onBack={() => setScreen("dashboard")} />;
    }

    if (state.phase === "combat") {
      return <CombatView onBack={() => handleNavigate("dashboard")} />;
    }

    if (state.phase === "rest") {
      return <RestView onBack={() => setScreen("dashboard")} />;
    }

    if (state.phase === "tier_transition") {
      return <TierTransitionView />;
    }

    return <GameDashboard onNavigate={handleNavigate} />;
  };

  const showNav = !!(state && state.phase !== "victory" && state.phase !== "defeat");

  const effectiveScreen: ScreenName = (() => {
    if (screen === "batch") return "batch";
    if (screen === "strategy_lab") return "strategy_lab";
    if (screen === "home" || !state) return "home";
    if (screen === "rules") return "rules";
    if (screen === "wiki" || screen === "wiki-rules" || screen === "wiki-strategy") return "wiki";
    if (screen === "debug") return "debug";
    if (state.phase === "victory" || state.phase === "defeat") return "report";
    if (state.welcomeBonusPending) return "welcome_bonus";
    if (state.phase === "merchant") return "merchant";
    if (state.phase === "combat") return "combat";
    if (state.phase === "rest") return "rest";
    if (state.phase === "tier_transition") return "tier_transition";
    return "dashboard";
  })();

  const transitionClass = SCREEN_TRANSITIONS[effectiveScreen] ?? "animate-fade-in";

  useEffect(() => {
    prevEffectiveScreenRef.current = effectiveScreen;
  }, [effectiveScreen]);

  return (
    <ErrorBoundary>
      <AppShell
        state={state}
        screen={screen}
        onNavigate={handleNavigate}
        showNav={showNav}
        isHomePage={effectiveScreen === "home"}
      >
        <div key={effectiveScreen === "home" ? `home-${homeNavKey}` : effectiveScreen} className={`${transitionClass}${combatTransition === "enter" ? " combat-enter-shake" : ""}`}>
          {isSimMode && state && state.phase !== "victory" && state.phase !== "defeat" && !state.welcomeBonusPending && (
            <SimulationControls
              isPlaying={isPlaying}
              onTogglePlay={() => setIsPlaying(!isPlaying)}
              onStep={handleStep}
              speed={speed}
              onSpeedChange={setSpeed}
              stepCount={stepCount}
              phaseLabel={state.phase}
              roundLabel={state.combat ? `Round ${state.combat.round}` : undefined}
            />
          )}
          <Suspense fallback={<ScreenLoader />}>
            {renderScreen()}
          </Suspense>
        </div>
      </AppShell>
      <CombatTransition type={combatTransition} onDone={handleCombatTransitionDone} />
    </ErrorBoundary>
  );
}
