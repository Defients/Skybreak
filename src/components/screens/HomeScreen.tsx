import { useState, useEffect, useRef, useCallback } from "react";
import React from "react";
import { useGameStore } from "../../app/gameStore";
import { getAutosave } from "../../engine/saveLoad";
import type { SaveData } from "../../types/gameState";
import { formatTier, formatDifficulty } from "../../utils/format";
import { ALL_CLASSES, CLASS_DATA, getSpecialization } from "../../data/classes";
import type { HeroClassName, ClassData, Specialization } from "../../types/heroes";
import type { Suit } from "../../types/cards";
import type { Difficulty, GameMode } from "../../types/simulation";
import { generateSeed } from "../../utils/ids";
import type { PartySetupChoice } from "../../engine/gameState";
import type { ScreenName } from "../../app/App";
import { useAudio } from "../../audio/useAudio";
import { EntityImage } from "../ui/EntityImage";
import { getRandomLoadingLine } from "../../data/loadingLines";
import { FloatingBubbles } from "../ui/FloatingBubbles";
import {
  getMenuBackground,
  getLogoImage,
  getHeroPortrait,
  getClassIcon,
  getSpecImage,
  getWeaponImage,
  getItemImage,
  getDiceImage,
  getTargetDummyImage,
} from "../../assets/assetRegistry";
import { getCommonWeapon, getWeaponsByClass } from "../../data/weapons";
import { ITEMS, STARTING_ITEMS } from "../../data/items";
import { formatAbilityText } from "../../utils/formatAbilityText";
import type { ReactNode } from "react";

const SUITS: { suit: Suit; label: string; symbol: string; color: string }[] = [
  { suit: "clubs", label: "Clubs", symbol: "♣️", color: "text-suit-clubs" },
  { suit: "diamonds", label: "Diamonds", symbol: "♦️", color: "text-suit-diamonds" },
  { suit: "hearts", label: "Hearts", symbol: "❤️", color: "text-suit-hearts" },
  { suit: "spades", label: "Spades", symbol: "♠️", color: "text-suit-spades" },
];

const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard", "nightmare"];
const MODES: GameMode[] = ["playable", "simulation", "companion", "hybrid", "sandbox"];

const DIFFICULTY_INFO: Record<Difficulty, { icon: string; desc: string; color: string }> = {
  easy: { icon: "🌱", desc: "Enemies have reduced HP and deal less damage. Forgiving for learning the ropes.", color: "text-green-400" },
  normal: { icon: "⚔️", desc: "Balanced experience. Enemies use full stats as written in the ruleset.", color: "text-spire-white" },
  hard: { icon: "🔥", desc: "Enemies gain +20% HP and +1 damage. Elite rooms are more frequent.", color: "text-orange-400" },
  nightmare: { icon: "💀", desc: "Enemies gain +40% HP, +2 damage, and act with tactical AI. Only for the brave.", color: "text-red-400" },
};

const MODE_INFO: Record<GameMode, { icon: string; desc: string; color: string }> = {
  playable: { icon: "🎮", desc: "Full interactive experience. Make all decisions for your party in real-time.", color: "text-spire-accent" },
  simulation: { icon: "🤖", desc: "AI controls both sides. Watch runs play out automatically for analysis.", color: "text-purple-400" },
  companion: { icon: "📖", desc: "AI suggests moves while you retain final control. Great for learning.", color: "text-cyan-400" },
  hybrid: { icon: "🔀", desc: "Mix of manual and AI control. Toggle control per-hero during combat.", color: "text-amber-400" },
  sandbox: { icon: "🧪", desc: "Full freedom. Override any rule, edit state, and experiment freely.", color: "text-spire-gold" },
};

const DICE_ICONS = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

const CLASS_ACCENT: Record<HeroClassName, string> = {
  Bladedancer: "from-rose-950/40 to-spire-card",
  Manipulator: "from-violet-950/40 to-spire-card",
  Tracker: "from-emerald-950/40 to-spire-card",
  Guardian: "from-cyan-950/40 to-spire-card",
};

const CLASS_TEXT_COLOR: Record<HeroClassName, string> = {
  Bladedancer: "text-rose-400",
  Manipulator: "text-violet-400",
  Tracker: "text-emerald-400",
  Guardian: "text-cyan-400",
};

const CLASS_ICON_EMOJI: Record<HeroClassName, string> = {
  Bladedancer: "⚔️",
  Manipulator: "🔮",
  Tracker: "🏹",
  Guardian: "🛡️",
};

interface HomeScreenProps {
  onNavigate?: (screen: ScreenName) => void;
}

export function HomeScreen({ onNavigate }: HomeScreenProps = {}) {
  const startNewRun = useGameStore((s) => s.startNewRun);
  const { playMusic, playSfx } = useAudio();
  const [seed, setSeed] = useState(generateSeed());
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [mode, setMode] = useState<GameMode>("playable");
  const [selections, setSelections] = useState<(HeroClassName | null)[]>([null, null, null]);
  const [suits, setSuits] = useState<(Suit | null)[]>([null, null, null]);
  const [showSetup, setShowSetup] = useState(false);
  const [expandedHero, setExpandedHero] = useState<number | null>(null);
  const [openDropdownIndex, setOpenDropdownIndex] = useState<number | null>(null);
  const [tappedTooltip, setTappedTooltip] = useState<string | null>(null);
  const [loadingLine] = useState(() => getRandomLoadingLine());
  const [showBetaNotice, setShowBetaNotice] = useState(false);
  const [showStrategyHint, setShowStrategyHint] = useState(false);
  const [autoSelectStep, setAutoSelectStep] = useState(0);
  const [autosaveData, setAutosaveData] = useState<SaveData | null>(null);
  const autoSelectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doLoadState = useGameStore((s) => s.doLoadState);

  const menuBg = getMenuBackground();
  const logoUrl = getLogoImage();
  const targetDummyUrl = getTargetDummyImage();

  useEffect(() => {
    playMusic("title");
  }, [playMusic]);

  useEffect(() => {
    if (localStorage.getItem("skyward_beta_dismissed")) return;
    const timer = setTimeout(() => setShowBetaNotice(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const auto = getAutosave();
    if (auto && auto.gameState.phase !== "victory" && auto.gameState.phase !== "defeat") {
      setAutosaveData(auto);
    } else {
      setAutosaveData(null);
    }
  }, []);

  const handleContinueRun = () => {
    if (!autosaveData) return;
    playSfx("ui", "button_click");
    doLoadState(autosaveData.gameState);
    onNavigate?.("dashboard");
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        setShowSetup(false);
        setShowStrategyHint(false);
        setExpandedHero(null);
        setOpenDropdownIndex(null);
        setTappedTooltip(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const hasDuplicates = selections.filter((s, i) => s !== null && selections.indexOf(s) !== i).length > 0;
  const canStart = selections.every((s) => s !== null) && suits.every((s) => s !== null) && !hasDuplicates;

  const clearAutoSelectTimer = useCallback(() => {
    if (autoSelectTimerRef.current) {
      clearTimeout(autoSelectTimerRef.current);
      autoSelectTimerRef.current = null;
    }
  }, []);

  // Auto-select heroes one at a time when simulation mode is active
  useEffect(() => {
    if (!showSetup || mode !== "simulation") {
      clearAutoSelectTimer();
      setAutoSelectStep(0);
      return;
    }

    if (autoSelectStep >= 3) {
      // All heroes selected — start the run after a brief delay
      clearAutoSelectTimer();
      autoSelectTimerRef.current = setTimeout(() => {
        handleStart();
      }, 1500);
      return;
    }

    const step = autoSelectStep;
    clearAutoSelectTimer();
    autoSelectTimerRef.current = setTimeout(() => {
      const allSuits: Suit[] = ["clubs", "diamonds", "hearts", "spades"];
      const available = ALL_CLASSES.filter(c => !selections.slice(0, step).includes(c));
      const picked = available[Math.floor(Math.random() * available.length)];
      const suit = allSuits[Math.floor(Math.random() * 4)];
      playSfx("ui", "menu_open");
      setSelections(prev => {
        const next = [...prev];
        next[step] = picked;
        return next;
      });
      setSuits(prev => {
        const next = [...prev];
        next[step] = suit;
        return next;
      });
      setAutoSelectStep(s => s + 1);
    }, 2000);

    return () => clearAutoSelectTimer();
  }, [showSetup, mode, autoSelectStep, selections, clearAutoSelectTimer]);

  const handleStart = () => {
    const choices: PartySetupChoice[] = selections.map((className, i) => ({
      className: className!,
      suit: suits[i]!,
      position: (i + 1) as 1 | 2 | 3,
    }));
    startNewRun({ seed, difficulty, mode }, choices);
    onNavigate?.("dashboard");
  };

  if (!showSetup) {
    return (
      <>
      <div className="flex flex-col items-center justify-center min-h-[80vh] gap-12 animate-fade-in relative">
        {menuBg && (
          <div
            className="bg-image-overlay"
            style={{ backgroundImage: `url(${menuBg})`, opacity: 0.06 }}
          />
        )}
        <FloatingBubbles />
        <div className="relative z-10 flex flex-col items-center gap-8 sm:gap-12 px-2">
        <div className="text-center space-y-4">
          {logoUrl ? (
            <div className="relative inline-block">
              <img
                src={logoUrl}
                alt="Skybreak"
                className="max-w-md w-full h-auto mx-auto animate-logo-float"
                style={{ filter: "drop-shadow(0 0 32px rgba(34, 211, 238, 0.2))" }}
              />
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: "radial-gradient(ellipse at center, rgba(34, 211, 238, 0.06) 0%, transparent 70%)",
                }}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-3">
                <span className="text-spire-accent text-2xl">⟁</span>
                <h1 className="text-5xl font-display gold-text tracking-wide cosmo-text-glow-gold">
                  Skybreak
                </h1>
                <span className="text-spire-accent text-2xl">⟁</span>
              </div>
              <div
                className="mx-auto h-px"
                style={{
                  width: "60%",
                  background: "linear-gradient(90deg, transparent 0%, rgba(34, 211, 238, 0.3) 50%, transparent 100%)",
                }}
              />
            </div>
          )}
          <p className="text-spire-muted text-sm sm:text-lg tracking-[0.15em] sm:tracking-[0.2em] font-tactical uppercase px-4">A Tabletop Dungeon Crawl</p>
          <p className="text-spire-muted/60 text-[10px] sm:text-xs tracking-[0.3em] font-tactical uppercase px-4">An Astrizda Game</p>
        </div>

        <div className="glass-card p-4 sm:p-8 max-w-[2700px] text-center space-y-7 cosmo-edge-glow mx-4" style={{ width: "calc(100% - 2rem)", maxWidth: "101%", fontFamily: "Roboto, sans-serif" }}>
          <p className="text-spire-white leading-relaxed text-sm sm:text-lg">
            Turn an ordinary deck of cards into an epic adventure.<br />Using only a <span className="font-bold text-spire-accent" style={{ textShadow: "0 0 10px rgba(34, 211, 238, 0.4)" }}>standard 54-card deck</span> and <span className="font-bold text-spire-accent" style={{ textShadow: "0 0 10px rgba(34, 211, 238, 0.4)" }}>two dice</span>, assemble three Heroes, battle your way through the Astrilith, gather powerful loot, and ascend toward the final confrontation with <span className="text-fuchsia-400 font-medium font-tactical" style={{ textShadow: "0 0 12px rgba(217, 70, 239, 0.5), 0 0 24px rgba(217, 70, 239, 0.2)", animation: "vyridianGlow 2.5s ease-in-out infinite" }}>Vyridian</span>, the <span className="text-purple-400 font-medium">Astril Conductor</span>.
          </p>
          <div className="flex items-center justify-center gap-4 py-3">
            <div className="h-px w-16 sm:w-24 bg-gradient-to-r from-transparent to-amber-400/50" />
            <p className="text-lg sm:text-3xl font-tactical tracking-[0.15em] sm:tracking-[0.25em] uppercase whitespace-nowrap text-amber-300"
              style={{ textShadow: "0 0 12px rgba(251,191,36,0.4), 0 2px 4px rgba(0,0,0,0.5)" }}
            >
              Every deck becomes a new ascent
            </p>
            <div className="h-px w-16 sm:w-24 bg-gradient-to-l from-transparent to-amber-400/50" />
          </div>
          <div className="flex flex-col gap-4 w-full">
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center w-full sm:w-auto">
              <button
                className="group relative w-full sm:w-auto text-3xl sm:text-4xl font-bold tracking-[0.15em] px-12 sm:px-18 py-6 sm:py-5 rounded-xl overflow-hidden transition-all duration-300 hover:scale-[1.03] active:scale-[0.98]"
                style={{
                  background: "linear-gradient(135deg, rgba(34, 211, 238, 0.98) 0%, rgba(14, 116, 144, 0.95) 50%, rgba(34, 211, 238, 0.98) 100%)",
                  boxShadow: "0 8px 36px rgba(34, 211, 238, 0.5), 0 0 80px rgba(34, 211, 238, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.25)",
                  border: "2px solid rgba(125, 232, 255, 0.5)",
                  letterSpacing: "0.12em",
                }}
                onClick={() => {
                  playSfx("ui", "menu_open");
                  if (!localStorage.getItem("skyward_strategy_hint_dismissed")) {
                    setShowStrategyHint(true);
                  } else {
                    setShowSetup(true);
                  }
                }}
              >
                <span
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{
                    background: "linear-gradient(135deg, rgba(125, 232, 255, 1) 0%, rgba(56, 189, 248, 1) 50%, rgba(125, 232, 255, 1) 100%)",
                  }}
                />
                <span className="relative z-10" style={{ fontFamily: '"pvpFont", sans-serif', animation: "newRunGlow 3s ease-in-out infinite" }}>New Run</span>
              </button>
              {autosaveData && (
                <button
                  className="group relative w-full sm:w-auto text-lg sm:text-xl font-bold tracking-[0.1em] px-6 sm:px-8 py-4 sm:py-3.5 rounded-xl overflow-hidden transition-all duration-300 hover:scale-[1.03] active:scale-[0.98] border-2 border-spire-gold/50"
                  style={{
                    background: "linear-gradient(135deg, rgba(212, 175, 55, 0.18) 0%, rgba(180, 140, 30, 0.14) 50%, rgba(212, 175, 55, 0.18) 100%)",
                    boxShadow: "0 4px 24px rgba(212, 175, 55, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.12)",
                  }}
                  onClick={handleContinueRun}
                >
                  <span className="relative z-10 flex flex-col items-center gap-0.5">
                    <span className="gold-text" style={{ fontFamily: '"pvpFont", sans-serif', textShadow: "0 0 14px rgba(212, 175, 55, 0.5), 0 0 28px rgba(212, 175, 55, 0.2)" }}>Continue Run</span>
                    <span className="text-[10px] sm:text-[11px] font-normal text-spire-muted/90 tracking-normal">
                      {formatTier(autosaveData.gameState.spire.tier)} · Room {autosaveData.gameState.spire.roomIndex + 1}/{autosaveData.gameState.spire.rooms.length} · {formatDifficulty(autosaveData.gameState.meta.difficulty)}
                    </span>
                  </span>
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-5 text-[11px] sm:text-xs text-spire-muted/70 font-tactical tracking-wider">
              <span className="flex items-center gap-1.5"><span className="text-sm">🕒</span> 45–90 min</span>
              <span className="hidden sm:inline text-spire-border/50">·</span>
              <span className="flex items-center gap-1.5"><span className="text-sm">👥</span> 1–4 Players</span>
              <span className="hidden sm:inline text-spire-border/50">·</span>
              <span className="flex items-center gap-1.5"><span className="text-sm">🃏</span> Standard Deck</span>
              <span className="hidden sm:inline text-spire-border/50">·</span>
              <span className="flex items-center gap-1.5"><span className="text-sm">🎲</span> 2 Dice</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center w-full sm:w-auto">
              {onNavigate && (
                <button
                  className="btn-ghost text-base sm:text-lg px-6 sm:px-8 py-3.5 sm:py-3 w-full sm:w-auto inline-flex items-center justify-center gap-2.5"
                  onClick={() => {
                    playSfx("ui", "button_click");
                    onNavigate("batch");
                  }}
                >
                  {targetDummyUrl && (
                    <img src={targetDummyUrl} alt="Batch Simulation" className="w-6 h-6 object-contain" />
                  )}
                  Batch Simulation
                </button>
              )}
              {onNavigate && (
                <button
                  className="btn-ghost text-base sm:text-lg px-6 sm:px-8 py-3.5 sm:py-3 w-full sm:w-auto inline-flex items-center justify-center gap-2.5"
                  onClick={() => {
                    playSfx("ui", "button_click");
                    onNavigate("strategy_lab");
                  }}
                >
                  <span className="text-xl">🧪</span>
                  Strategy Lab
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 max-w-2xl w-full px-4">
          <FeatureCard icon="⚔️" title="Tactical Combat" desc="Strategic encounters where every decision matters." />
          <FeatureCard icon="🃏" title="Standard Deck" desc="Play with any ordinary 54-card deck." />
          <FeatureCard icon="🎲" title="Dice Driven" desc="Dice influence combat, loot, and critical moments." />
          <FeatureCard icon="🏆" title="Endless Replayability" desc="Every climb generates new encounters and decisions." />
          <FeatureCard icon="🛡️" title="Unique Heroes" desc="Build your party from distinct heroes with different strengths." />
          <FeatureCard icon="📦" title="Loot & Progression" desc="Discover powerful equipment and grow stronger as you climb." />
        </div>

        <div className="glass-card p-4 sm:p-6 max-w-2xl mx-4 space-y-4 cosmo-edge-glow">
          <div className="text-center space-y-3">
            <div className="text-lg font-tactical gold-text tracking-wide cosmo-text-glow-gold">🃏 Play With a Real Deck of Cards</div>
            <p className="text-spire-muted text-sm leading-relaxed">
              No proprietary cards required. <span className="font-semibold">Skybreak</span> is designed around ordinary tabletop components: a standard 54-card deck, two six-sided dice, and the will to climb.<br />Fully playable offline — the digital version is a 1:1 mirror of the tabletop ruleset.
            </p>
            <div className="flex justify-center gap-3">
              <span className="text-[10px] uppercase tracking-wider text-spire-muted bg-spire-bg/40 border border-spire-border/30 rounded-full px-3 py-1">54-Card Deck</span>
              <span className="text-[10px] uppercase tracking-wider text-spire-muted bg-spire-bg/40 border border-spire-border/30 rounded-full px-3 py-1">2d6 Dice</span>
              <span className="text-[10px] uppercase tracking-wider text-spire-muted bg-spire-bg/40 border border-spire-border/30 rounded-full px-3 py-1">No App Required</span>
            </div>
            <button
              className="inline-block text-sm text-spire-accent hover:text-spire-gold transition-colors font-medium cursor-pointer"
              onClick={() => {
                playSfx("ui", "button_click");
                onNavigate?.("wiki-rules");
              }}
            >
              Read the full rules →
            </button>
            <p className="text-spire-muted/60 text-xs leading-relaxed pt-2 border-t border-spire-border/20">
              Skybreak is the first playable journey into <span className="text-spire-muted">Astrizda</span> — a larger fantasy universe of ancient structures, fractured powers, and impossible thresholds.
            </p>
          </div>
        </div>
        </div>
      </div>

      {/* Canon Bible §30 — atmospheric loading line */}
      <p className="text-center text-spire-muted/40 text-xs italic py-4 px-4" style={{ fontFamily: 'Cinzel, serif' }}>
        {loadingLine}
      </p>

      {showBetaNotice && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => { localStorage.setItem("skyward_beta_dismissed", "1"); setShowBetaNotice(false); }}
          />
          <div className="relative glass-panel rounded-2xl border border-amber-500/40 shadow-panel p-5 sm:p-7 max-w-md w-full mx-2 space-y-4"
            style={{ boxShadow: "0 0 40px rgba(245, 158, 11, 0.15), 0 8px 32px rgba(0, 0, 0, 0.6)" }}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">🚧</span>
              <h2 className="text-lg font-display text-amber-400 tracking-wide" style={{ textShadow: "0 0 12px rgba(245, 158, 11, 0.3)" }}>
                Beta Notice
              </h2>
            </div>
            <p className="text-spire-white/90 text-sm leading-relaxed">
              This game is in <span className="text-amber-400 font-medium">beta</span> as of July 1st, 2026 and is actively in development.
              Bugs are expected and the game might not even fully work.
            </p>
            <div className="flex justify-end">
              <button
                className="px-5 py-2 rounded-lg text-sm font-medium bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 hover:border-amber-400/60 transition-colors"
                onClick={() => { localStorage.setItem("skyward_beta_dismissed", "1"); setShowBetaNotice(false); }}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {showStrategyHint && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => { setShowStrategyHint(false); setShowSetup(true); }}
          />
          <div className="relative glass-panel rounded-2xl border border-cyan-400/40 shadow-panel p-5 sm:p-7 max-w-md w-full mx-2 space-y-4"
            style={{ boxShadow: "0 0 40px rgba(34, 211, 238, 0.12), 0 8px 32px rgba(0, 0, 0, 0.6)" }}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">🧠</span>
              <h2 className="text-lg font-display text-cyan-300 tracking-wide" style={{ textShadow: "0 0 12px rgba(34, 211, 238, 0.3)" }}>
                New here?
              </h2>
            </div>
            <p className="text-spire-white/90 text-sm leading-relaxed">
              If it's your first time, the <span className="text-cyan-300 font-medium">Basic Strategy Guide</span> covers party picks, combat basics, and what to buy — takes about 2 minutes to read.
              <br /><br />
              There's also a <span className="text-spire-gold font-medium">Full Strategy Guide</span> with class deep-dives, enchantment synergies, and boss tactics if you want to go deeper.
            </p>
            <div className="flex flex-col sm:flex-row justify-end gap-2.5 pt-1">
              <button
                className="px-5 py-2.5 rounded-lg text-sm font-medium bg-spire-bg/60 border border-spire-border/40 text-spire-muted hover:text-spire-white hover:border-spire-border/70 transition-colors"
                onClick={() => { setShowStrategyHint(false); setShowSetup(true); }}
              >
                Maybe later
              </button>
              <button
                className="px-5 py-2.5 rounded-lg text-sm font-medium bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/30 hover:border-cyan-400/60 transition-colors"
                onClick={() => {
                  setShowStrategyHint(false);
                  localStorage.setItem("skyward_strategy_hint_dismissed", "1");
                  onNavigate?.("wiki-strategy");
                }}
              >
                📖 Read the Strategy Guide
              </button>
            </div>
            <label className="flex items-center gap-2 text-xs text-spire-muted/60 cursor-pointer select-none pt-1">
              <input
                type="checkbox"
                className="accent-cyan-400 w-3.5 h-3.5"
                defaultChecked={false}
                onChange={(e) => {
                  if (e.target.checked) {
                    localStorage.setItem("skyward_strategy_hint_dismissed", "1");
                  } else {
                    localStorage.removeItem("skyward_strategy_hint_dismissed");
                  }
                }}
              />
              Don't show this again
            </label>
          </div>
        </div>
      )}
      </>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-slide-up">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-display gold-text">Create Your Party</h2>
        <p className="text-spire-muted text-sm">Choose your heroes, assign suits, and review their full abilities</p>
      </div>

      {/* Config bar */}
      <div className="glass-card p-4 relative z-30">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <div>
            <label className="block text-sm text-spire-muted mb-1.5">Seed</label>
            <div className="flex gap-2">
              <input className="input flex-1" value={seed} onChange={(e) => setSeed(e.target.value)} />
              <button className="btn-ghost px-3" onClick={() => { playSfx("ui", "button_click"); setSeed(generateSeed()); }}>🎲</button>
            </div>
          </div>
          <div>
            <label className="block text-sm text-spire-muted mb-1.5">Difficulty</label>
            <Dropdown
              value={difficulty}
              placeholder="Select difficulty"
              onChange={(v) => setDifficulty(v as Difficulty)}
              options={DIFFICULTIES.map((d) => ({
                value: d,
                label: d.charAt(0).toUpperCase() + d.slice(1),
                icon: DIFFICULTY_INFO[d].icon,
                desc: DIFFICULTY_INFO[d].desc,
                color: DIFFICULTY_INFO[d].color,
              }))}
            />
          </div>
          <div>
            <label className="block text-sm text-spire-muted mb-1.5">Mode</label>
            <Dropdown
              value={mode}
              placeholder="Select mode"
              onChange={(v) => setMode(v as GameMode)}
              options={MODES.map((m) => ({
                value: m,
                label: m.charAt(0).toUpperCase() + m.slice(1),
                icon: MODE_INFO[m].icon,
                desc: MODE_INFO[m].desc,
                color: MODE_INFO[m].color,
              }))}
            />
          </div>
        </div>
      </div>

      {/* Hero cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {selections.map((sel, i) => {
          const isExpanded = expandedHero === i;
          const portraitUrl = sel ? getHeroPortrait(sel) : null;
          const specName = sel && suits[i] ? getSpecialization(sel, suits[i] as any) : null;
          const specUrl = specName ? getSpecImage(specName) : null;
          const classData = sel ? CLASS_DATA[sel] : null;
          const isBlackSuit = suits[i] === "clubs" || suits[i] === "spades";
          const currentSpec = sel && suits[i]
            ? (isBlackSuit ? classData!.specializations.black : classData!.specializations.red)
            : null;
          const subtext = currentSpec ? currentSpec.desc : (classData ? classData.role : null);
          const weapon = sel ? getCommonWeapon(sel) : null;
          const weaponUrl = weapon ? getWeaponImage(weapon.name) : null;
          const startingItemName = sel ? STARTING_ITEMS[sel] : null;
          const startingItem = startingItemName ? ITEMS[startingItemName] : null;
          const itemUrl = startingItem ? getItemImage(startingItem.name) : null;
          const allWeapons = sel ? getWeaponsByClass(sel) : [];

          return (
          <div
            key={i}
            className={`glass-card relative transition-all duration-300 ${openDropdownIndex === i ? "z-50" : ""}`}
          >
            {/* Header */}
            <div className={`bg-gradient-to-b ${sel ? CLASS_ACCENT[sel] : "from-spire-bg/40 to-spire-card"} px-4 pt-4 pb-3 border-b border-spire-border/40`}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-spire-gold">Hero {i + 1}</h3>
              </div>
            </div>

            <div className="p-4 space-y-3">
              {/* Selection controls */}
              <div className="space-y-3">
                {/* Portrait + spec image */}
                {sel && (
                  <div className="flex items-center gap-3">
                    {portraitUrl && (
                      <EntityImage
                        src={portraitUrl}
                        fallback="🎭"
                        alt={sel}
                        className="w-16 h-16 rounded-full overflow-hidden border-2 border-spire-border shrink-0"
                        imgClassName="w-full h-full object-cover object-top"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-spire-white truncate">{sel}</div>
                      {specName && (
                        <div className="text-xs text-spire-gold truncate">{specName}</div>
                      )}
                      {subtext && (
                        <div className="text-[10px] text-spire-muted leading-tight line-clamp-2">{subtext}</div>
                      )}
                    </div>
                    {/* Spec icon: desktop only (inline), mobile shows it below red text */}
                    {specUrl && (
                      <div className="hidden sm:block">
                        <EntityImage
                          src={specUrl}
                          fallback="✨"
                          alt={specName || "Spec"}
                          className="w-12 h-12 rounded-lg overflow-hidden border border-spire-border shrink-0"
                          imgClassName="w-full h-full object-cover object-top"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Class selector */}
                <div>
                  <label className="block text-xs text-spire-muted mb-1">Class</label>
                  <Dropdown
                    value={sel ?? ""}
                    placeholder="Select..."
                    iconOnly={true}
                    onChange={(v) => {
                      playSfx("ui", "button_click");
                      const newSels = [...selections];
                      newSels[i] = v as HeroClassName;
                      setSelections(newSels);
                    }}
                    onToggle={(isOpen) => setOpenDropdownIndex(isOpen ? i : null)}
                    options={[
                      { value: "", label: "Select...", icon: "❓", color: "text-spire-muted" },
                      ...ALL_CLASSES.map((c) => {
                        const usedElsewhere = selections.some((s, idx) => s === c && idx !== i);
                        return {
                          value: c,
                          label: `${c} (${CLASS_DATA[c].baseHp} HP)`,
                          icon: CLASS_ICON_EMOJI[c],
                          desc: CLASS_DATA[c].role,
                          color: CLASS_TEXT_COLOR[c],
                          disabled: usedElsewhere,
                          disabledNote: usedElsewhere ? "taken" : undefined,
                        };
                      }),
                    ]}
                  />
                </div>

                {/* Specialization selector */}
                <div>
                  <label className="block text-xs text-spire-muted mb-1">Specialization</label>
                  {/* Mobile: black spec name above buttons */}
                  {sel && (
                    <div className="sm:hidden text-center text-[11px] font-medium text-spire-white mb-1.5 truncate">
                      {getSpecialization(sel, "clubs" as any)}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { color: "black", suit: "clubs" as Suit, symbols: "♣️ ♠️", label: "Black" },
                      { color: "red", suit: "diamonds" as Suit, symbols: "♦️ ❤️", label: "Red" },
                    ]).map((opt) => {
                      const isBlack = opt.color === "black";
                      const spec = sel ? getSpecialization(sel, (isBlack ? "clubs" : "diamonds") as any) : "";
                      const isSelected = sel && suits[i] !== null && (suits[i] === "clubs" || suits[i] === "spades") === isBlack;
                      return (
                        <button
                          key={opt.color}
                          disabled={!sel}
                          className={`p-2.5 rounded-lg text-xs border transition-all duration-200 flex flex-col items-center justify-center ${
                            isSelected
                              ? isBlack
                                ? "border-slate-400 bg-slate-700/40 shadow-[0_0_12px_rgba(148,163,184,0.3)]"
                                : "border-red-400 bg-red-500/20 shadow-[0_0_12px_rgba(239,68,68,0.3)]"
                              : sel
                                ? isBlack
                                  ? "border-slate-500/30 bg-slate-900/20 hover:bg-slate-800/30"
                                  : "border-red-500/30 bg-red-950/20 hover:bg-red-900/30"
                                : "border-spire-border"
                          } ${!sel ? "opacity-50 cursor-not-allowed" : ""} ${sel && !isSelected ? (isBlack ? "animate-[specGlowBlack_3s_ease-in-out_infinite]" : "animate-[specGlowRed_3s_ease-in-out_infinite]") : ""}`}
                          onClick={() => {
                            playSfx("ui", "button_click");
                            const newSuits = [...suits];
                            newSuits[i] = opt.suit;
                            setSuits(newSuits);
                          }}
                          title={sel ? `${opt.label}: ${spec}` : "Select class first"}
                        >
                          <div className={`text-base text-center ${isBlack ? "text-spire-white" : "text-spire-gold"}`}>{opt.symbols}</div>
                          {/* Desktop: spec name inside button */}
                          {sel && <div className="hidden sm:block text-[10px] text-spire-muted truncate mt-0.5 text-center">{spec}</div>}
                        </button>
                      );
                    })}
                  </div>
                  {/* Mobile: red spec name below buttons */}
                  {sel && (
                    <div className="sm:hidden text-center text-[11px] font-medium text-red-400 mt-1.5 truncate">
                      {getSpecialization(sel, "diamonds" as any)}
                    </div>
                  )}
                  {/* Mobile: spec icon below red text */}
                  {specUrl && (
                    <div className="sm:hidden flex justify-center mt-1.5">
                      <EntityImage
                        src={specUrl}
                        fallback="✨"
                        alt={specName || "Spec"}
                        className="w-9 h-9 rounded-lg overflow-hidden border border-spire-border shrink-0"
                        imgClassName="w-full h-full object-cover object-top"
                      />
                    </div>
                  )}
                </div>

                {/* Quick stats */}
                {classData && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 sm:gap-2">
                    <StatPill label="HP" value={`${classData.baseHp}`} icon="❤️" />
                    <StatPill label="Rank" value={classData.rank} icon="🃏" />
                    <StatPill label="Gold" value={`${classData.startingGold}`} icon="🪙" />
                  </div>
                )}

                {/* Starting weapon */}
                {weapon && (
                  <div className="bg-spire-bg/40 rounded-lg p-2.5 border border-spire-border/30 space-y-1.5">
                    <div className="text-[10px] uppercase tracking-wider text-spire-muted text-center sm:hidden">Starting Weapon</div>
                    {/* Mobile: icon only with tap tooltip */}
                    <div
                      className="sm:hidden flex items-center justify-center gap-2 cursor-pointer relative"
                      onClick={() => setTappedTooltip(tappedTooltip === `weapon-${i}` ? null : `weapon-${i}`)}
                    >
                      {weaponUrl && (
                        <EntityImage
                          src={weaponUrl}
                          fallback="🗡️"
                          alt={weapon.name}
                          className="w-12 h-12 rounded overflow-hidden border border-spire-border/50 shrink-0"
                          imgClassName="w-full h-full object-contain"
                        />
                      )}
                      {tappedTooltip === `weapon-${i}` && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-[110] w-48 glass-panel rounded-lg border border-spire-border/60 shadow-panel p-2.5">
                          <div className="text-xs font-medium text-spire-white truncate">{weapon.name}</div>
                          <div className="text-[10px] text-spire-muted mt-0.5">{formatAbilityText(weapon.effect)}</div>
                        </div>
                      )}
                    </div>
                    {/* Desktop: full layout with icon + name + effect */}
                    <div className="hidden sm:flex items-center gap-2">
                      {weaponUrl && (
                        <EntityImage
                          src={weaponUrl}
                          fallback="🗡️"
                          alt={weapon.name}
                          className="w-8 h-8 rounded overflow-hidden border border-spire-border/50 shrink-0"
                          imgClassName="w-full h-full"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-spire-white truncate">{weapon.name}</div>
                        <div className="text-[10px] text-spire-muted truncate">{formatAbilityText(weapon.effect)}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Starting item */}
                {startingItem && (
                  <div className="bg-spire-bg/40 rounded-lg p-2.5 border border-spire-border/30 space-y-1.5">
                    <div className="text-[10px] uppercase tracking-wider text-spire-muted text-center sm:hidden">Starting Item</div>
                    {/* Mobile: icon only with tap tooltip */}
                    <div
                      className="sm:hidden flex items-center justify-center gap-2 cursor-pointer relative"
                      onClick={() => setTappedTooltip(tappedTooltip === `item-${i}` ? null : `item-${i}`)}
                    >
                      {itemUrl && (
                        <EntityImage
                          src={itemUrl}
                          fallback="📦"
                          alt={startingItem.name}
                          className="w-12 h-12 rounded overflow-hidden border border-spire-border/50 shrink-0"
                          imgClassName="w-full h-full object-contain"
                        />
                      )}
                      {tappedTooltip === `item-${i}` && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-[110] w-48 glass-panel rounded-lg border border-spire-border/60 shadow-panel p-2.5">
                          <div className="text-xs font-medium text-spire-white truncate">{startingItem.name}</div>
                          <div className="text-[10px] text-spire-muted mt-0.5">{formatAbilityText(startingItem.effect)}</div>
                        </div>
                      )}
                    </div>
                    {/* Desktop: full layout with icon + name + effect */}
                    <div className="hidden sm:flex items-center gap-2">
                      {itemUrl && (
                        <EntityImage
                          src={itemUrl}
                          fallback="📦"
                          alt={startingItem.name}
                          className="w-8 h-8 rounded overflow-hidden border border-spire-border/50 shrink-0"
                          imgClassName="w-full h-full"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-spire-white truncate">{startingItem.name}</div>
                        <div className="text-[10px] text-spire-muted truncate">{formatAbilityText(startingItem.effect)}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Expand button */}
                {sel && (
                  <button
                    className="w-full text-xs text-spire-accent hover:text-spire-white transition-colors py-1.5 border border-spire-border/30 rounded-lg hover:border-spire-accent/40"
                    onClick={() => {
                      playSfx("ui", "button_click");
                      setExpandedHero(i);
                    }}
                  >
                    ▼ Show Full Abilities
                  </button>
                )}
              </div>
            </div>
          </div>
          );
        })}
      </div>

      {/* Ability breakdown overlay */}
      {expandedHero !== null && selections[expandedHero] && (
        <AbilityOverlay
          heroIndex={expandedHero}
          className={selections[expandedHero]!}
          suit={suits[expandedHero]}
          onClose={() => {
            playSfx("ui", "button_click");
            setExpandedHero(null);
          }}
        />
      )}

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 pb-4">
        <button className="btn-ghost w-full sm:w-auto" onClick={() => { playSfx("ui", "button_click"); setShowSetup(false); }}>← Back</button>
        <button
          className="btn-ghost w-full sm:w-auto"
          onClick={() => {
            playSfx("ui", "button_click");
            const allSuits: Suit[] = ["clubs", "diamonds", "hearts", "spades"];
            setSelections(["Bladedancer", "Manipulator", "Tracker"]);
            setSuits([
              allSuits[Math.floor(Math.random() * 4)],
              allSuits[Math.floor(Math.random() * 4)],
              allSuits[Math.floor(Math.random() * 4)],
            ]);
          }}
        >
          🎯 Select for Me
        </button>
        <button
          className="btn-ghost w-full sm:w-auto"
          onClick={() => {
            playSfx("ui", "button_click");
            const allSuits: Suit[] = ["clubs", "diamonds", "hearts", "spades"];
            const shuffled = [...ALL_CLASSES].sort(() => Math.random() - 0.5);
            setSelections([shuffled[0], shuffled[1], shuffled[2]]);
            setSuits([
              allSuits[Math.floor(Math.random() * 4)],
              allSuits[Math.floor(Math.random() * 4)],
              allSuits[Math.floor(Math.random() * 4)],
            ]);
          }}
        >
          🎲 Randomize
        </button>
        {hasDuplicates && (
          <div className="text-xs text-spire-warning">Duplicate classes detected — each hero must have a unique class.</div>
        )}
        <button
          className="btn-gold w-full sm:w-auto"
          disabled={!canStart}
          onClick={() => {
            playSfx("ui", "transition");
            handleStart();
          }}
        >
          {canStart ? "⚔️ Begin Ascent" : "Select all heroes"}
        </button>
      </div>
    </div>
  );
}

const RARITY_COLOR: Record<string, string> = {
  Common: "text-spire-muted",
  Rare: "text-spire-accent",
  Epic: "text-spire-gold",
  Legendary: "text-spire-warning",
};

interface DropdownOption {
  value: string;
  label: string;
  icon?: string;
  desc?: string;
  color?: string;
  disabled?: boolean;
  disabledNote?: string;
}

function Dropdown({
  value,
  options,
  onChange,
  placeholder,
  onToggle,
  iconOnly = false,
}: {
  value: string;
  options: DropdownOption[];
  onChange: (val: string) => void;
  placeholder: string;
  onToggle?: (isOpen: boolean) => void;
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    onToggle?.(next);
  };

  return (
    <div className="relative">
      <button
        type="button"
        className={`input w-full text-sm flex items-center cursor-pointer ${iconOnly ? "justify-center sm:justify-between" : "justify-between"}`}
        onClick={() => toggle()}
      >
        <span className={`flex items-center gap-2 min-w-0 ${iconOnly ? "justify-center sm:justify-start" : ""}`}>
          {selected?.icon && <span className="text-base flex-shrink-0">{selected.icon}</span>}
          <span className={`truncate font-medium ${selected?.color ?? "text-spire-white"} ${iconOnly ? "hidden sm:inline" : ""}`} style={selected?.color ? { textShadow: "0 0 8px currentColor" } : undefined}>{selected?.label ?? placeholder}</span>
        </span>
        <span className={`text-spire-muted text-xs transition-transform flex-shrink-0 ${iconOnly ? "ml-2 sm:ml-0" : ""} ${open ? "rotate-180" : ""}`}>▼</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); onToggle?.(false); }} />
          <div className="absolute top-full left-0 right-0 mt-1 z-[100] min-w-[260px] glass-panel rounded-lg border border-spire-border/60 shadow-panel overflow-hidden max-h-72 overflow-y-auto">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={opt.disabled}
                className={`w-full text-left px-3 py-2.5 transition-colors text-sm flex items-start gap-2.5
                  ${opt.disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-spire-accent/10"}
                  ${opt.value === value ? "bg-spire-accent/15" : ""}`}
                onClick={() => {
                  if (opt.disabled) return;
                  onChange(opt.value);
                  setOpen(false);
                  onToggle?.(false);
                }}
              >
                {opt.icon && <span className="text-base flex-shrink-0 mt-0.5">{opt.icon}</span>}
                <div className="min-w-0 flex-1">
                  <div className={`font-medium truncate ${opt.color ?? "text-spire-white"}`}>
                    {opt.label}
                    {opt.disabled && opt.disabledNote && <span className="text-spire-muted text-[10px] ml-1.5">{opt.disabledNote}</span>}
                  </div>
                  {opt.desc && <div className="text-[10px] text-spire-muted leading-snug mt-0.5">{opt.desc}</div>}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: ReactNode }) {
  return (
    <div className="glass-card p-5 text-center space-y-2.5">
      <div className="text-3xl" style={{ filter: "drop-shadow(0 0 8px rgba(34, 211, 238, 0.2))" }}>{icon}</div>
      <div className="text-sm font-medium text-spire-gold cosmo-text-glow-gold">{title}</div>
      <div className="text-xs text-spire-muted leading-relaxed">{desc}</div>
    </div>
  );
}

function StatPill({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="bg-spire-bg/50 rounded-lg px-2.5 py-1.5 border border-spire-border/30 flex items-center justify-between sm:block sm:text-center sm:px-0 sm:py-2.5 sm:overflow-hidden">
      <span className="text-[9px] text-spire-muted uppercase tracking-wider sm:block">{label}</span>
      <span className="text-xs font-medium text-spire-white sm:mt-0.5">
        {icon && <span className="mr-0.5">{icon}</span>}{value}
      </span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-widest text-spire-muted font-medium border-b border-spire-border/30 pb-1">
      {children}
    </div>
  );
}

function SpecCard({
  label,
  spec,
  isActive,
  accentColor,
  onClick,
}: {
  label: string;
  spec: { name: Specialization; ability: string };
  isActive: boolean;
  accentColor: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-lg p-2.5 border transition-all duration-200 ${
        isActive
          ? `${accentColor} bg-spire-accent/10 shadow-glow`
          : "border-spire-border/20 bg-spire-bg/20 opacity-50 hover:opacity-70 hover:border-spire-border/40 cursor-pointer"
      }`}
    >
      <div className={`text-[10px] mb-1 ${isActive ? "text-spire-gold" : "text-spire-muted"}`}>{label}</div>
      <div className={`text-xs font-medium mb-1 ${isActive ? "text-spire-white" : "text-spire-muted"}`}>
        {spec.name}
      </div>
      <div className={`text-[10px] leading-snug ${isActive ? "text-spire-white/80" : "text-spire-muted"}`}>
        {formatAbilityText(spec.ability)}
      </div>
    </button>
  );
}


function AbilityOverlay({
  heroIndex,
  className,
  suit,
  onClose,
}: {
  heroIndex: number;
  className: HeroClassName;
  suit: Suit | null;
  onClose: () => void;
}) {
  const classData = CLASS_DATA[className];
  const initialIsBlack = suit === "clubs" || suit === "spades";
  const [selectedSpec, setSelectedSpec] = useState<"black" | "red">(initialIsBlack ? "black" : "red");
  const isBlackSpec = selectedSpec === "black";
  const activeSpec = isBlackSpec ? classData.specializations.black : classData.specializations.red;
  const specName = activeSpec.name;
  const portraitUrl = getHeroPortrait(className);
  const specUrl = getSpecImage(specName);
  const allWeapons = getWeaponsByClass(className);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal panel */}
      <div
        className="relative glass-card w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`bg-gradient-to-b ${CLASS_ACCENT[className]} px-5 py-4 border-b border-spire-border/40 shrink-0`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {portraitUrl && (
                <EntityImage
                  src={portraitUrl}
                  fallback="🎭"
                  alt={className}
                  className="w-12 h-12 rounded-full overflow-hidden border-2 border-spire-border shrink-0"
                  imgClassName="w-full h-full object-cover object-top"
                />
              )}
              <div>
                <div className="text-sm font-medium text-spire-white">
                  {CLASS_ICON_EMOJI[className]} {className}
                </div>
                <div className="text-xs text-spire-gold">
                  Hero {heroIndex + 1} · {specName}
                </div>
              </div>
              {specUrl && (
                <EntityImage
                  src={specUrl}
                  fallback="✨"
                  alt={specName || "Spec"}
                  className="w-10 h-10 rounded-lg overflow-hidden border border-spire-gold/30 shrink-0"
                  imgClassName="w-full h-full object-cover object-top"
                />
              )}
            </div>
            <button
              className="text-spire-muted hover:text-spire-white transition-colors text-xl px-2"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto p-5 space-y-5">
          {/* Specialization abilities */}
          <div className="space-y-2">
            <SectionLabel>Specializations</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              <SpecCard
                label="Black (♣️♠️)"
                spec={classData.specializations.black}
                isActive={isBlackSpec}
                accentColor="border-spire-accent"
                onClick={() => setSelectedSpec("black")}
              />
              <SpecCard
                label="Red (♦️❤️)"
                spec={classData.specializations.red}
                isActive={!isBlackSpec}
                accentColor="border-spire-gold"
                onClick={() => setSelectedSpec("red")}
              />
            </div>
            <div className="text-[10px] text-spire-muted bg-spire-bg/30 rounded p-2 leading-relaxed">
              {classData.abilityTrigger}
            </div>
          </div>

          {/* Roll table */}
          <div className="space-y-2">
            <SectionLabel>Roll Table (d6)</SectionLabel>
            <div className="space-y-1.5">
              {classData.rollTable.map((entry, idx) => {
                const rollNum = typeof entry.roll === "number" ? entry.roll : idx + 1;
                const dieUrl = getDiceImage(rollNum);
                return (
                  <div
                    key={idx}
                    className="flex items-start gap-2.5 bg-spire-bg/40 rounded-lg p-2 border border-spire-border/20 hover:border-spire-border/40 transition-colors"
                  >
                    <div className="flex items-center justify-center w-8 h-8 rounded-md bg-spire-surface border border-spire-border/50 shrink-0">
                      {dieUrl ? (
                        <EntityImage
                          src={dieUrl}
                          fallback={DICE_ICONS[rollNum - 1] ?? String(rollNum)}
                          alt={`Die ${rollNum}`}
                          className="w-7 h-7"
                          imgClassName="w-full h-full object-contain"
                        />
                      ) : (
                        <span className="text-lg">{DICE_ICONS[rollNum - 1] ?? rollNum}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-spire-gold">{entry.effect}</div>
                      <div className="text-[11px] text-spire-muted leading-snug">{formatAbilityText(entry.description)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Unique mechanic */}
          <div className="space-y-2">
            <SectionLabel>Unique Mechanic</SectionLabel>
            <div className="bg-spire-accent/10 border border-spire-accent/30 rounded-lg p-3 text-xs text-spire-white leading-relaxed">
              <span className="text-spire-accent font-medium">⚡ </span>
              {formatAbilityText(classData.uniqueMechanic)}
            </div>
          </div>

          {/* Weapon arsenal */}
          <div className="space-y-2">
            <SectionLabel>Weapon Arsenal</SectionLabel>
            <div className="space-y-1.5">
              {(["Common", "Rare", "Epic", "Legendary"] as const).map((rarity) => {
                const weapons = allWeapons.filter(w => w.rarity === rarity);
                if (weapons.length === 0) return null;
                return (
                  <div key={rarity}>
                    <div className={`text-[10px] font-medium mb-1 ${RARITY_COLOR[rarity]}`}>{rarity}</div>
                    {weapons.map(w => {
                      const wUrl = getWeaponImage(w.name);
                      const isBlackWeapon = w.suit === "♣️" || w.suit === "♠️";
                      const isRedWeapon = w.suit === "♦️" || w.suit === "❤️";
                      const isGrayed = (isBlackWeapon && !isBlackSpec) || (isRedWeapon && isBlackSpec);
                      return (
                        <div key={w.id} className={`flex items-center gap-2 bg-spire-bg/30 rounded-md p-1.5 mb-1 border border-spire-border/20 transition-opacity duration-200 ${isGrayed ? "opacity-40" : ""}`}>
                          {wUrl && (
                            <EntityImage
                              src={wUrl}
                              fallback="🗡️"
                              alt={w.name}
                              className="w-6 h-6 rounded overflow-hidden border border-spire-border/40 shrink-0"
                              imgClassName="w-full h-full"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-medium text-spire-white truncate">{w.name}</div>
                            <div className="text-[10px] text-spire-muted truncate">{formatAbilityText(w.effect)}</div>
                          </div>
                          {w.suit && <span className="text-xs shrink-0">{w.suit}</span>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
