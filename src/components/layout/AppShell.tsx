import { useState, useRef, useEffect, type ReactNode } from "react";
import type { GameState } from "../../types/gameState";
import type { ScreenName } from "../../app/App";
import { useGameStore } from "../../app/gameStore";
import { formatTier, formatDifficulty } from "../../utils/format";
import type { GameMode } from "../../types/simulation";
import { useAudio } from "../../audio/useAudio";
import { getLogoImage, getGoldCoinImage, getTierBackground } from "../../assets/assetRegistry";
import { CosmicBackground } from "./CosmicBackground";
import { CosmoCursor } from "./CosmoCursor";
import { Tooltip } from "../ui/Tooltip";
import { SaveManagerPanel } from "../ui/SaveManagerPanel";
import { DeffyBadge } from "../ui/DeffyBadge";
import deffyLogo from "../../../assets/deffy.png";

const MODE_BADGE_COLORS: Record<string, string> = {
  simulation: "text-purple-400",
  companion: "text-cyan-400",
  hybrid: "text-amber-400",
  sandbox: "text-spire-gold",
};

const MODE_ICONS: Record<string, string> = {
  simulation: "🤖",
  companion: "📖",
  hybrid: "🔀",
  sandbox: "🧪",
};

const TIER_COLORS: Record<number, string> = {
  1: "#22d3ee",
  2: "#a78bfa",
  3: "#f43f5e",
};

const DIFFICULTY_STYLES: Record<string, string> = {
  easy: "text-emerald-400 font-medium",
  normal: "text-spire-muted",
  hard: "font-bold",
  nightmare: "font-bold",
};

function getDifficultyStyle(difficulty: string): { className: string; style?: React.CSSProperties } {
  const base = DIFFICULTY_STYLES[difficulty] ?? "text-spire-muted";
  if (difficulty === "hard") {
    return { className: `text-xs ${base}`, style: { animation: "hardPulse 2s ease-in-out infinite" } };
  }
  if (difficulty === "nightmare") {
    return { className: `text-xs ${base}`, style: { animation: "nightmareFlicker 1.2s ease-in-out infinite" } };
  }
  return { className: `text-xs ${base}` };
}

interface AppShellProps {
  state: GameState | null;
  screen: ScreenName;
  onNavigate: (screen: ScreenName) => void;
  showNav: boolean;
  isHomePage: boolean;
  children: ReactNode;
}

export function AppShell({ state, screen, onNavigate, showNav, isHomePage, children }: AppShellProps) {
  const { toggleMute, toggleMusicMute, toggleSfxMute, isMuted, isMusicMuted, isSfxMuted, playSfx, volume, setVolume } = useAudio();
  const doResetGame = useGameStore((s) => s.doResetGame);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showHomeConfirm, setShowHomeConfirm] = useState(false);
  const [showVolumeControl, setShowVolumeControl] = useState(false);
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const [showMobileInfo, setShowMobileInfo] = useState(false);
  const [showSaveManager, setShowSaveManager] = useState(false);
  const volumeTimeoutRef = useRef<number | undefined>(undefined);
  const overflowRef = useRef<HTMLDivElement>(null);
  const mobileInfoRef = useRef<HTMLDivElement>(null);
  const logoUrl = getLogoImage();
  const goldCoinUrl = getGoldCoinImage();
  const tierBg = state ? getTierBackground(state.spire.tier) : null;

  const hasProgress = state && state.stats.totalTurns > 0;

  const handleReset = () => {
    if (hasProgress) {
      setShowResetConfirm(true);
    } else {
      playSfx("ui", "button_click");
      doResetGame();
      onNavigate("home");
    }
  };

  const confirmReset = () => {
    playSfx("ui", "button_click");
    doResetGame();
    setShowResetConfirm(false);
    onNavigate("home");
  };

  const handleNavClick = (screen: ScreenName) => {
    playSfx("ui", "button_click");
    onNavigate(screen);
  };

  const handleLogoClick = () => {
    if (!state) {
      onNavigate("home");
      return;
    }
    if (hasProgress) {
      setShowHomeConfirm(true);
    } else {
      playSfx("ui", "button_click");
      doResetGame();
      onNavigate("home");
    }
  };

  const confirmGoHome = () => {
    playSfx("ui", "button_click");
    doResetGame();
    setShowHomeConfirm(false);
    onNavigate("home");
  };

  const handleVolumeEnter = () => {
    if (window.matchMedia("(hover: none)").matches) return;
    if (volumeTimeoutRef.current) window.clearTimeout(volumeTimeoutRef.current);
    setShowVolumeControl(true);
  };

  const handleVolumeLeave = () => {
    if (window.matchMedia("(hover: none)").matches) return;
    volumeTimeoutRef.current = window.setTimeout(() => setShowVolumeControl(false), 300);
  };

  const handleVolumeToggle = () => {
    setShowVolumeControl((prev) => !prev);
  };

  useEffect(() => {
    if (!showOverflowMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setShowOverflowMenu(false);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [showOverflowMenu]);

  useEffect(() => {
    if (!showMobileInfo) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (mobileInfoRef.current && !mobileInfoRef.current.contains(e.target as Node)) {
        setShowMobileInfo(false);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [showMobileInfo]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        setShowResetConfirm(false);
        setShowHomeConfirm(false);
        setShowOverflowMenu(false);
        setShowMobileInfo(false);
        setShowVolumeControl(false);
        setShowSaveManager(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const volumePercent = Math.round(volume * 100);

  const volumeControl = (
    <div className="relative" onMouseEnter={handleVolumeEnter} onMouseLeave={handleVolumeLeave}>
      <button
        className="text-spire-muted hover:text-spire-white transition-colors text-lg px-1.5 py-0.5 rounded min-w-[36px] min-h-[36px] flex items-center justify-center"
        onClick={toggleMute}
        onDoubleClick={handleVolumeToggle}
        title={isMuted ? "Unmute" : "Mute"}
      >
        {isMuted ? "🔇" : volumePercent === 0 ? "🔈" : volumePercent < 50 ? "🔉" : "🔊"}
      </button>
      {showVolumeControl && (
        <div
          className="absolute right-0 top-full mt-2 z-[60] animate-fade-in"
          style={{
            background: "linear-gradient(135deg, rgba(10, 10, 28, 0.97) 0%, rgba(5, 5, 16, 0.97) 100%)",
            border: "1px solid rgba(34, 211, 238, 0.2)",
            borderRadius: "0.625rem",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5), 0 0 12px rgba(34, 211, 238, 0.06)",
            backdropFilter: "blur(12px)",
            padding: "0.75rem",
            minWidth: "200px",
          }}
          onMouseEnter={handleVolumeEnter}
          onMouseLeave={handleVolumeLeave}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider text-spire-muted">Volume</span>
            <span className="text-xs text-spire-white tabular-nums">{isMuted ? 0 : volumePercent}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={isMuted ? 0 : volumePercent}
            onChange={(e) => {
              const v = parseInt(e.target.value) / 100;
              setVolume(v);
              if (v > 0 && isMuted) toggleMute();
            }}
            className="w-full accent-spire-accent cursor-pointer"
            style={{ height: "4px" }}
            aria-label="Volume control"
          />
          <div className="flex justify-between mt-1.5">
            <button
              className="text-[10px] text-spire-muted hover:text-spire-white transition-colors"
              onClick={() => setVolume(0)}
            >
              Mute
            </button>
            <button
              className="text-[10px] text-spire-muted hover:text-spire-white transition-colors"
              onClick={() => setVolume(1)}
            >
              Max
            </button>
          </div>
          <div className="border-t border-spire-border/30 mt-2 pt-2 space-y-1.5">
            <button
              className={`w-full flex items-center justify-between text-xs px-2 py-1.5 rounded-lg transition-colors ${
                isMusicMuted ? "text-spire-muted bg-spire-bg/30" : "text-spire-white hover:bg-spire-accent/10"
              }`}
              onClick={() => { playSfx("ui", "button_click"); toggleMusicMute(); }}
            >
              <span className="flex items-center gap-2">
                <span className="text-sm">{isMusicMuted ? "🎵" : "🎶"}</span>
                <span>Music</span>
              </span>
              <span className={`text-[10px] uppercase tracking-wider ${isMusicMuted ? "text-spire-danger" : "text-emerald-400"}`}>
                {isMusicMuted ? "Off" : "On"}
              </span>
            </button>
            <button
              className={`w-full flex items-center justify-between text-xs px-2 py-1.5 rounded-lg transition-colors ${
                isSfxMuted ? "text-spire-muted bg-spire-bg/30" : "text-spire-white hover:bg-spire-accent/10"
              }`}
              onClick={() => { if (!isSfxMuted) playSfx("ui", "button_click"); toggleSfxMute(); }}
            >
              <span className="flex items-center gap-2">
                <span className="text-sm">{isSfxMuted ? "🔇" : "🔊"}</span>
                <span>SFX</span>
              </span>
              <span className={`text-[10px] uppercase tracking-wider ${isSfxMuted ? "text-spire-danger" : "text-emerald-400"}`}>
                {isSfxMuted ? "Off" : "On"}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col relative">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <CosmoCursor />
      <CosmicBackground />
      {tierBg && (
        <div
          className="bg-image-overlay bg-image-blur"
          style={{ backgroundImage: `url(${tierBg})` }}
        />
      )}
      <div className="relative z-10 flex flex-col flex-1">
      <header role="banner" className="sticky top-0 z-50 overflow-visible safe-x"
        style={{
          background: "linear-gradient(180deg, rgba(8, 8, 20, 0.9) 0%, rgba(5, 5, 12, 0.8) 100%)",
          backdropFilter: "blur(20px) saturate(1.2)",
          borderBottom: "1px solid rgba(34, 211, 238, 0.12)",
          boxShadow: "0 4px 24px rgba(0, 0, 0, 0.4), inset 0 -1px 0 rgba(34, 211, 238, 0.06)",
        }}
      >
        <div className="flex items-center justify-between px-3 sm:px-6 py-2.5">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              className="flex items-center gap-2.5 cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
              onClick={() => handleLogoClick()}
              title="Return to Home"
              aria-label="Return to Home"
            >
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Skyward Ascent"
                  className="h-11 sm:h-16 w-auto absolute top-1/2 -translate-y-1/3 left-1.5 sm:left-4 max-w-[120px] sm:max-w-none object-contain"
                  style={{ filter: "drop-shadow(0 0 12px rgba(34, 211, 238, 0.15))" }}
                />
              ) : (
                <h1 className="text-lg sm:text-xl font-display gold-text tracking-wide cosmo-text-glow-gold flex items-center gap-1.5">
                  <span className="text-spire-accent">⟁</span> Skyward Ascent
                </h1>
              )}
            </button>
            {state && (
              <div className="hidden sm:flex items-center gap-3 border-l border-spire-border/40 pl-3 ml-24 sm:ml-36">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-spire-muted/60">Tier</span>
                  <span className="text-sm font-medium text-spire-gold">{state.spire.tier}</span>
                  <span className="text-xs text-spire-muted">{formatTier(state.spire.tier)}</span>
                </div>
                <span className="text-spire-border/60">·</span>
                {(() => { const ds = getDifficultyStyle(state.meta.difficulty); return (
                  <span className={ds.className} style={{ ...ds.style, fontSize: "0.9rem" }}>{formatDifficulty(state.meta.difficulty)}</span>
                ); })()}
                {state.settings.mode !== "playable" && (
                  <>
                    <span className="text-spire-border/60">·</span>
                    <span className={`text-xs font-medium ${MODE_BADGE_COLORS[state.settings.mode as GameMode] ?? "text-spire-muted"}`}>
                      {MODE_ICONS[state.settings.mode as GameMode] ?? ""} {state.settings.mode}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
            {state && (
              <div className="sm:hidden relative ml-auto mr-2" ref={mobileInfoRef}>
                <button
                  className="text-[13px] px-2 py-1 rounded-lg bg-spire-bg/40 border border-spire-border/30 text-spire-muted hover:text-spire-white transition-colors min-h-[44px] min-w-[44px]"
                  onClick={() => setShowMobileInfo(!showMobileInfo)}
                  aria-label="Game info"
                  aria-expanded={showMobileInfo}
                >
                  <span style={{ color: TIER_COLORS[state.spire.tier] ?? "#d4af37", fontWeight: "bold" }}>T{state.spire.tier}</span>
                  {" · "}
                  {(() => { const ds = getDifficultyStyle(state.meta.difficulty); return (
                    <span className={ds.className.replace("text-xs ", "")} style={ds.style}>{formatDifficulty(state.meta.difficulty).charAt(0)}</span>
                  ); })()}
                  {state.settings.mode !== "playable" && ` · ${MODE_ICONS[state.settings.mode as GameMode] ?? ""}`}
                </button>
                {showMobileInfo && (
                  <div className="absolute left-0 top-full mt-1 z-[60] animate-fade-in glass-panel rounded-lg p-3 space-y-1 text-xs min-w-[180px]">
                    <div className="flex justify-between gap-3">
                      <span className="text-spire-muted">Tier</span>
                      <span className="font-medium" style={{ color: TIER_COLORS[state.spire.tier] ?? "#d4af37", textShadow: `0 0 8px ${TIER_COLORS[state.spire.tier] ?? "#d4af37"}40` }}>{state.spire.tier} — {formatTier(state.spire.tier)}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-spire-muted">Difficulty</span>
                      {(() => { const ds = getDifficultyStyle(state.meta.difficulty); return (
                        <span className={ds.className.replace("text-xs ", "text-sm ")} style={ds.style}>{formatDifficulty(state.meta.difficulty)}</span>
                      ); })()}
                    </div>
                    {state.settings.mode !== "playable" && (
                      <div className="flex justify-between gap-3">
                        <span className="text-spire-muted">Mode</span>
                        <span className={MODE_BADGE_COLORS[state.settings.mode as GameMode] ?? "text-spire-muted"}>
                          {MODE_ICONS[state.settings.mode as GameMode] ?? ""} {state.settings.mode}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between gap-3">
                      <span className="text-spire-muted">Room</span>
                      <span className="text-spire-white tabular-nums">{state.spire.roomIndex + 1}/{state.spire.rooms.length}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

          {state && (
            <div className="flex items-center gap-2 sm:gap-3 text-sm">
              <div className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-lg bg-spire-bg/40 border border-spire-border/30 flex-shrink-0">
                {goldCoinUrl ? (
                  <img src={goldCoinUrl} alt="Gold" className="w-4 h-4 inline-block" />
                ) : (
                  <span>💰</span>
                )}
                <span className="text-spire-gold font-medium tabular-nums">{state.party.gold}</span>
              </div>
              <span className="text-spire-white/80 hidden sm:inline text-xs flex items-center gap-1">
                <span className="text-spire-muted">📍</span>
                <span className="tabular-nums">{state.spire.roomIndex + 1}/{state.spire.rooms.length}</span>
              </span>
              <span className="text-spire-muted hidden lg:inline text-[10px] font-mono">
                {state.meta.seed}
              </span>
              {volumeControl}
              <div className="hidden sm:flex items-center gap-2">
                <div className="relative group">
                  <button
                    className="text-spire-muted hover:text-spire-white transition-colors text-xs px-2.5 py-1 rounded-lg border border-spire-border/40 hover:border-spire-accent/40 min-h-[44px] min-w-[44px]"
                    onClick={() => handleNavClick("wiki")}
                    aria-label="Open game wiki"
                  >
                    📚
                  </button>
                  <div className="absolute top-full right-0 mt-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-[70]">
                    <div className="glass-panel rounded-lg px-3 py-2 border border-spire-accent/30 shadow-panel">
                      <div className="text-xs font-medium text-spire-accent">📚 Game Wiki</div>
                      <div className="text-[10px] text-spire-muted mt-0.5">Browse assets, armory & audio</div>
                    </div>
                  </div>
                </div>
                <div className="relative group">
                  <button
                    className="text-spire-muted hover:text-spire-white transition-colors text-xs px-2.5 py-1 rounded-lg border border-spire-border/40 hover:border-spire-accent/40 min-h-[44px] min-w-[44px]"
                    onClick={() => { playSfx("ui", "button_click"); setShowSaveManager(true); }}
                    aria-label="Open save manager"
                  >
                    💾
                  </button>
                  <div className="absolute top-full right-0 mt-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-[70]">
                    <div className="glass-panel rounded-lg px-3 py-2 border border-spire-accent/30 shadow-panel">
                      <div className="text-xs font-medium text-spire-accent">💾 Save Manager</div>
                      <div className="text-[10px] text-spire-muted mt-0.5">Save, load, export & import runs</div>
                    </div>
                  </div>
                </div>
                <div className="relative group">
                  <button
                    className="text-spire-muted hover:text-spire-white transition-colors text-xs px-2.5 py-1 rounded-lg border border-spire-border/40 hover:border-spire-accent/40 min-h-[44px] min-w-[44px]"
                    onClick={() => handleNavClick("rules")}
                    aria-label="Open rules reference"
                  >
                    📜
                  </button>
                  <div className="absolute top-full right-0 mt-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-[70]">
                    <div className="glass-panel rounded-lg px-3 py-2 border border-spire-accent/30 shadow-panel">
                      <div className="text-xs font-medium text-spire-accent">📜 Rules Reference</div>
                      <div className="text-[10px] text-spire-muted mt-0.5">Search the full ruleset v3.1</div>
                    </div>
                  </div>
                </div>
                <div className="relative group">
                  <button
                    className="text-spire-muted hover:text-spire-white transition-colors text-xs px-2.5 py-1 rounded-lg border border-spire-border/40 hover:border-spire-accent/40 min-h-[44px] min-w-[44px]"
                    onClick={() => handleNavClick("debug")}
                    aria-label="Open debug screen"
                  >
                    🐛
                  </button>
                  <div className="absolute top-full right-0 mt-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-[70]">
                    <div className="glass-panel rounded-lg px-3 py-2 border border-spire-accent/30 shadow-panel">
                      <div className="text-xs font-medium text-spire-accent">🐛 Debug Screen</div>
                      <div className="text-[10px] text-spire-muted mt-0.5">Inspect game state & tokens</div>
                    </div>
                  </div>
                </div>
                <Tooltip
                  side="bottom"
                  wrapperClassName="relative inline-flex"
                  popupStyle={{ left: "calc(50% - 40px)", maxWidth: "340px" }}
                  content={
                    <div className="space-y-1.5">
                      <div className="text-sm font-bold text-spire-danger flex items-center gap-1.5">⟲ Reset Game</div>
                      <div className="text-[11px] text-spire-white/85 leading-snug border-t border-spire-border/30 pt-1.5">
                        {hasProgress
                          ? "Ends your current run and clears all progress. You'll return to the home screen to start a new run."
                          : "Returns to the home screen to start a new run."}
                      </div>
                      {hasProgress && (
                        <div className="text-[10px] text-amber-300/70 border-t border-spire-border/20 pt-1">
                          ⚠️ {state?.stats.totalTurns ?? 0} turn(s) across {state?.stats.roomsCleared ?? 0} room(s) will be lost.
                        </div>
                      )}
                    </div>
                  }
                >
                  <button
                    className="text-spire-muted hover:text-spire-danger transition-colors text-xs px-2.5 py-1 rounded-lg border border-spire-border/40 hover:border-spire-danger/40 min-h-[44px] min-w-[44px]"
                    onClick={handleReset}
                    aria-label="Reset game"
                  >
                    ⟲ Reset
                  </button>
                </Tooltip>
              </div>
              <div className="sm:hidden relative" ref={overflowRef}>
                <button
                  className="text-spire-muted hover:text-spire-white transition-colors text-sm px-2 py-1 rounded-lg border border-spire-border/40 hover:border-spire-accent/40 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  onClick={() => setShowOverflowMenu(!showOverflowMenu)}
                  aria-label="More options"
                  aria-expanded={showOverflowMenu}
                >
                  ⋯
                </button>
                {showOverflowMenu && (
                  <div className="absolute right-0 top-full mt-1 z-[60] animate-fade-in glass-panel rounded-lg p-2 space-y-1 min-w-[140px]">
                    <button
                      className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-spire-accent/10 text-spire-muted hover:text-spire-white transition-colors flex items-center gap-2 min-h-[44px]"
                      onClick={() => { handleNavClick("wiki"); setShowOverflowMenu(false); }}
                      aria-label="Open game wiki"
                    >
                      📚 Wiki
                    </button>
                    <button
                      className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-spire-accent/10 text-spire-muted hover:text-spire-white transition-colors flex items-center gap-2 min-h-[44px]"
                      onClick={() => { playSfx("ui", "button_click"); setShowSaveManager(true); setShowOverflowMenu(false); }}
                      aria-label="Open save manager"
                    >
                      💾 Save
                    </button>
                    <button
                      className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-spire-accent/10 text-spire-muted hover:text-spire-white transition-colors flex items-center gap-2 min-h-[44px]"
                      onClick={() => { handleNavClick("rules"); setShowOverflowMenu(false); }}
                      aria-label="Open rules reference"
                    >
                      📜 Rules
                    </button>
                    <button
                      className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-spire-accent/10 text-spire-muted hover:text-spire-white transition-colors flex items-center gap-2 min-h-[44px]"
                      onClick={() => { handleNavClick("debug"); setShowOverflowMenu(false); }}
                      aria-label="Open debug screen"
                    >
                      🐛 Debug
                    </button>
                    <button
                      className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-spire-danger/10 text-spire-muted hover:text-spire-danger transition-colors flex items-center gap-2 min-h-[44px]"
                      onClick={() => { handleReset(); setShowOverflowMenu(false); }}
                      aria-label="Reset game"
                    >
                      ⟲ Reset
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          {!state && (
            <div className="flex items-center gap-2">
              <div className="relative group">
                <button
                  className="text-spire-muted hover:text-spire-white transition-colors text-xs px-2.5 py-1 rounded-lg border border-spire-border/40 hover:border-spire-accent/40 min-h-[44px] min-w-[44px]"
                  onClick={() => onNavigate("wiki")}
                  aria-label="Open game wiki"
                >
                  📚 Wiki
                </button>
                <div className="absolute top-full right-0 mt-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-[70]">
                  <div className="glass-panel rounded-lg px-3 py-2 border border-spire-accent/30 shadow-panel">
                    <div className="text-xs font-medium text-spire-accent">📚 Game Wiki</div>
                    <div className="text-[10px] text-spire-muted mt-0.5">Browse assets, armory & audio</div>
                  </div>
                </div>
              </div>
              {volumeControl}
            </div>
          )}
        </div>
      </header>

      {showResetConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="reset-modal-title">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowResetConfirm(false)} />
          <div className="relative glass-card w-full max-w-sm p-7 text-center space-y-4 shadow-panel">
            <div className="text-3xl">⚠️</div>
            <h3 id="reset-modal-title" className="text-lg font-display text-spire-white">Reset Game?</h3>
            <p className="text-sm text-spire-muted leading-relaxed">
              You have completed {state?.stats.totalTurns ?? 0} turn(s) across {state?.stats.roomsCleared ?? 0} room(s). All progress will be lost.
            </p>
            <div className="flex gap-3 justify-center pt-3">
              <button
                className="btn-ghost"
                onClick={() => { playSfx("ui", "button_click"); setShowResetConfirm(false); }}
              >
                Cancel
              </button>
              <button
                className="btn-primary bg-spire-danger hover:bg-spire-danger/80"
                onClick={confirmReset}
              >
                ⟲ Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {showHomeConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="home-modal-title">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowHomeConfirm(false)} />
          <div className="relative glass-card w-full max-w-sm p-7 text-center space-y-4 shadow-panel">
            <div className="text-3xl">🏠</div>
            <h3 id="home-modal-title" className="text-lg font-display text-spire-white">Return to Home?</h3>
            <p className="text-sm text-spire-muted leading-relaxed">
              Returning home will end your current run and reset all progress. Are you sure?
            </p>
            <div className="flex gap-3 justify-center pt-3">
              <button
                className="btn-ghost"
                onClick={() => { playSfx("ui", "button_click"); setShowHomeConfirm(false); }}
              >
                Stay Here
              </button>
              <button
                className="btn-primary"
                onClick={confirmGoHome}
              >
                Go Home
              </button>
            </div>
          </div>
        </div>
      )}

      {showSaveManager && (
        <SaveManagerPanel onClose={() => setShowSaveManager(false)} />
      )}

      <main id="main-content" role="main" className="flex-1 p-3 sm:p-4 lg:p-6 max-w-7xl mx-auto w-full">
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {state ? `Tier ${state.spire.tier}, Room ${state.spire.roomIndex + 1} of ${state.spire.rooms.length}, ${state.phase}` : "Home screen"}
        </div>
        {children}
      </main>

      <footer role="contentinfo" className="px-3 sm:px-6 py-3.5 text-center text-xs text-spire-muted/80 safe-bottom safe-x"
        style={{
          borderTop: "1px solid rgba(26, 26, 58, 0.3)",
          background: "linear-gradient(180deg, transparent 0%, rgba(3, 3, 8, 0.4) 100%)",
        }}
      >
        <div className="leading-tight">
          <div>Skyward Ascent Simulator v0.1.0</div>
          <div>Deterministic Tactical Card Game Engine</div>
        </div>
      </footer>
      </div>

      {/* Fixed deffy badge — desktop only, bottom-right corner */}
      <a
        href="https://deffy.me"
        target="_blank"
        rel="noopener noreferrer"
        className="hidden lg:block fixed bottom-3 right-3 z-50 group transition-all duration-300"
        onClick={() => playSfx("ui", "button_click")}
      >
        <img
          src={deffyLogo}
          alt="deffy.me"
          className="w-14 h-14 object-contain opacity-50 group-hover:opacity-80 group-hover:drop-shadow-[0_0_12px_rgba(34,211,238,0.5)] transition-all duration-300"
        />
      </a>
    </div>
  );
}
