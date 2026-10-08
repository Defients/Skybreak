import { useState, useMemo, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  Legend, ResponsiveContainer, Cell, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import { useStrategyLabStore } from "../../app/strategyLabStore";
import { useAudio } from "../../audio/useAudio";
import { useIsMobile } from "../../hooks/useIsMobile";
import { ALL_CLASSES, CLASS_DATA, getSpecialization } from "../../data/classes";
import type { HeroClassName } from "../../types/heroes";
import type { Suit } from "../../types/cards";
import type { Difficulty } from "../../types/simulation";
import type {
  CombatStrategy,
  MerchantStrategy,
  RestStrategy,
  SplitStrategy,
  ItemUsageStrategy,
  WeaponUpgradeStrategy,
} from "../../types/batch";
import type {
  StrategyLabResult,
  ComboResult,
  StrategyLabAxes,
} from "../../types/strategyLab";
import type { GameEvent } from "../../types/events";
import type { PartySetupChoice } from "../../engine/gameState";
import { generateSeed } from "../../utils/ids";
import { generateCrossProduct } from "../../engine/strategyLabEngine";
import { wilsonInterval, pairedCompare } from "../../engine/statistics";
import { ExperimentHistoryPanel } from "../experiment/ExperimentHistoryPanel";
import {
  formatLogSummaryWithNames,
  buildNameMapFromComposition,
} from "../../utils/logFormatter";
import type { NameEntry } from "../../utils/logFormatter";

const SUITS: { suit: Suit; label: string; symbol: string }[] = [
  { suit: "clubs", label: "Clubs", symbol: "♣️" },
  { suit: "diamonds", label: "Diamonds", symbol: "♦️" },
  { suit: "hearts", label: "Hearts", symbol: "❤️" },
  { suit: "spades", label: "Spades", symbol: "♠️" },
];

const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard", "nightmare"];

const COMBAT_OPTS: { value: CombatStrategy; label: string; icon: string }[] = [
  { value: "aggressive", label: "Aggressive", icon: "⚔️" },
  { value: "defensive", label: "Defensive", icon: "🛡️" },
  { value: "balanced", label: "Balanced", icon: "⚖️" },
  { value: "survivalist", label: "Survivalist", icon: "🏃" },
  { value: "random-legal", label: "Random", icon: "🎲" },
];

const MERCHANT_OPTS: { value: MerchantStrategy; label: string; icon: string }[] = [
  { value: "skip", label: "Skip", icon: "🚪" },
  { value: "heal-items", label: "Heal Items", icon: "🧪" },
  { value: "upgrades", label: "Upgrades", icon: "⬆️" },
  { value: "balanced", label: "Balanced", icon: "⚖️" },
];

const REST_OPTS: { value: RestStrategy; label: string; icon: string }[] = [
  { value: "full-heal", label: "Full Heal", icon: "💚" },
  { value: "revive", label: "Revive", icon: "✨" },
  { value: "gold", label: "Gold", icon: "💰" },
  { value: "max-hp", label: "Max HP", icon: "⬆️" },
  { value: "smart", label: "Smart", icon: "🧠" },
];

const SPLIT_OPTS: { value: SplitStrategy; label: string; icon: string }[] = [
  { value: "combat", label: "Combat", icon: "⚔️" },
  { value: "safe", label: "Safe", icon: "🛡️" },
  { value: "random", label: "Random", icon: "🎲" },
];

const ITEM_OPTS: { value: ItemUsageStrategy; label: string; icon: string }[] = [
  { value: "never", label: "Never", icon: "🚫" },
  { value: "conservative", label: "Conservative", icon: "🧪" },
  { value: "aggressive", label: "Aggressive", icon: "⚗️" },
  { value: "always-if-hurt", label: "Always if Hurt", icon: "💉" },
];

const WEAPON_OPTS: { value: WeaponUpgradeStrategy; label: string; icon: string }[] = [
  { value: "never", label: "Never", icon: "🚫" },
  { value: "when-affordable", label: "When Affordable", icon: "⚒️" },
  { value: "prioritize", label: "Prioritize", icon: "⚔️" },
];

const CHART_COLORS = [
  "#d4af37", "#3b82f6", "#10b981", "#f43f5e", "#a855f7",
  "#f59e0b", "#06b6d4", "#ec4899", "#84cc16", "#f97316",
];

const EVENT_TYPE_COLORS: Record<string, string> = {
  GAME_STARTED: "text-spire-muted",
  PARTY_CREATED: "text-spire-accent",
  COMBAT_STARTED: "text-red-400",
  MATCH_DETECTED: "text-blue-300",
  ABILITY_TRIGGERED: "text-purple-300",
  DICE_ROLLED: "text-blue-300",
  DAMAGE_APPLIED: "text-orange-400",
  HEAL_APPLIED: "text-green-300",
  ITEM_USED: "text-cyan-300",
  HERO_DIED: "text-red-500 font-medium",
  HERO_REVIVED: "text-green-400 font-medium",
  MONSTER_DEFEATED: "text-yellow-400 font-medium",
  COMBAT_ENDED: "text-spire-gold",
  REWARD_GRANTED: "text-amber-300",
  TIER_ADVANCED: "text-spire-gold font-medium",
  FINAL_BOSS_STARTED: "text-red-500 font-bold",
  VICTORY: "text-spire-gold font-bold",
  DEFEAT: "text-red-500 font-bold",
};

interface Props {
  onBack: () => void;
}

export function StrategyLabScreen({ onBack }: Props) {
  const {
    config,
    result,
    isRunning,
    isPaused,
    progress,
    progressCounts,
    currentRunLog,
    currentRunSummary,
    storageWarning,
    experimentStatus,
    throughput,
    history,
    historyLoaded,
    setConfig,
    setAxes,
    startLab,
    cancelLab,
    pauseLab,
    resetLab,
    doDownloadJSON,
    doDownloadCSV,
    loadHistory,
    openExperiment,
    resumeExperiment,
    deleteExperiment,
    exportEvidence,
  } = useStrategyLabStore();

  const { playSfx } = useAudio();
  const { isMobile } = useIsMobile();

  useEffect(() => {
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [partyMode, setPartyMode] = useState<"fixed" | "random">(config.partyMode);
  const [selections, setSelections] = useState<(HeroClassName | null)[]>([null, null, null]);
  const [suits, setSuits] = useState<(Suit | null)[]>([null, null, null]);

  const hasDuplicates = selections.filter((s, i) => s !== null && selections.indexOf(s) !== i).length > 0;
  const partyValid = selections.every((s) => s !== null) && suits.every((s) => s !== null) && !hasDuplicates;

  const comboCount = useMemo(() => generateCrossProduct(config.axes).length, [config.axes]);
  const totalRuns = comboCount * config.runsPerCombo;

  if (isRunning) {
    return (
      <RunningView
        progress={progress}
        progressCounts={progressCounts}
        currentRunLog={currentRunLog}
        currentRunSummary={currentRunSummary}
        isPaused={isPaused}
        storageWarning={storageWarning}
        throughput={throughput}
        onBack={onBack}
        onCancel={cancelLab}
        onPause={pauseLab}
      />
    );
  }

  if (result) {
    return (
      <ResultsView
        result={result}
        experimentStatus={experimentStatus}
        experimentId={useStrategyLabStore.getState().experimentId}
        storageWarning={storageWarning}
        onResume={resumeExperiment}
        onBack={onBack}
        onDownloadJSON={doDownloadJSON}
        onDownloadCSV={doDownloadCSV}
        onExportEvidence={exportEvidence}
        onRunAnother={() => { playSfx("ui", "button_click"); resetLab(); }}
      />
    );
  }

  const handleStart = () => {
    let partyChoices: PartySetupChoice[] | undefined;
    if (partyMode === "fixed") {
      if (!partyValid) return;
      partyChoices = selections.map((className, i) => ({
        className: className!,
        suit: suits[i]!,
        position: (i + 1) as 1 | 2 | 3,
      }));
    }
    setConfig({ partyMode, partyChoices });
    playSfx("ui", "transition");
    startLab();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl sm:text-3xl font-display gold-text">Strategy Lab</h2>
          <p className="text-spire-muted text-sm mt-1">Cross-product matrix testing of AI strategy combinations</p>
        </div>
        <button className="btn-ghost text-sm px-4 py-2" onClick={() => { playSfx("ui", "button_click"); onBack(); }}>
          ← Back
        </button>
      </div>

      {/* Mobile warning */}
      {isMobile && (
        <div className="glass-card p-4 border border-red-400/40 bg-red-500/5 rounded-lg flex items-start gap-3">
          <span className="text-2xl flex-shrink-0">⚠️</span>
          <div className="text-xs text-red-200/90 leading-relaxed space-y-1.5">
            <div className="font-bold text-red-300 text-sm">🚫 Not Recommended on Mobile</div>
            <p>
              <span className="font-semibold">Strategy Lab is a heavy developer tool</span> designed for desktop use. It runs dozens to hundreds of headless game simulations and renders complex Recharts dashboards with large data tables, radar charts, heatmaps, and sortable matrices.
            </p>
            <p>
              On a phone this will likely: <span className="text-red-300">freeze the UI</span> for extended periods, consume significant memory/CPU, render charts that are nearly unreadable, and require constant horizontal scrolling. You may also hit browser memory limits on large matrices.
            </p>
            <p className="text-amber-300/80">
              It is not blocked — you can still proceed — but for a usable experience, <span className="font-semibold">switch to a desktop or tablet</span>. You have been warned.
            </p>
          </div>
        </div>
      )}

      {/* Run Settings */}
      <div className="glass-card p-5 space-y-4 relative z-10">
        <h3 className="section-heading">Run Settings</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-spire-muted mb-1.5">Runs Per Combo</label>
            <input
              type="number"
              className="input w-full"
              min={1}
              max={50}
              value={config.runsPerCombo}
              onChange={(e) => setConfig({ runsPerCombo: Math.max(1, Math.min(50, parseInt(e.target.value) || 1)) })}
            />
          </div>
          <div>
            <label className="block text-sm text-spire-muted mb-1.5">Difficulty</label>
            <select
              className="input w-full"
              value={config.difficulty}
              onChange={(e) => setConfig({ difficulty: e.target.value as Difficulty })}
            >
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-spire-muted mb-1.5">Base Seed</label>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={config.baseSeed}
                onChange={(e) => setConfig({ baseSeed: e.target.value })}
              />
              <button
                className="btn-ghost px-3"
                onClick={() => { playSfx("ui", "button_click"); setConfig({ baseSeed: generateSeed() }); }}
              >
                🎲
              </button>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-sm text-spire-muted mb-1.5">Experiment Name</label>
            <input
              className="input w-full"
              placeholder="(optional)"
              value={config.name ?? ""}
              onChange={(e) => setConfig({ name: e.target.value || undefined })}
            />
          </div>
          <div>
            <label className="block text-sm text-spire-muted mb-1.5">Telemetry Level</label>
            <select
              className="input w-full"
              value={config.telemetryLevel ?? "standard"}
              onChange={(e) => setConfig({ telemetryLevel: e.target.value as "minimal" | "standard" | "deep" })}
            >
              <option value="minimal">Minimal — outcomes only</option>
              <option value="standard">Standard — bounded log</option>
              <option value="deep">Deep — full event log</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-spire-muted pb-2 cursor-pointer">
            <input
              type="checkbox"
              className="accent-spire-accent"
              checked={config.sharedCohort ?? false}
              onChange={(e) => setConfig({ sharedCohort: e.target.checked })}
            />
            <span>
              Shared-cohort comparison
              <span className="block text-[10px] text-spire-muted/60">
                Replays the same seed across all combos — differences are attributable to strategy. Initial conditions only; realized randomness still diverges.
              </span>
            </span>
          </label>
        </div>
      </div>

      {/* Party Configuration */}
      <div className="glass-card p-5 space-y-5">
        <h3 className="section-heading">Party Configuration</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            className={`relative flex flex-col items-center gap-2 p-4 sm:p-6 rounded-xl border-2 transition-all duration-300 ${
              partyMode === "random"
                ? "border-spire-accent bg-spire-accent/15 shadow-glow scale-[1.02]"
                : "border-spire-border/40 hover:border-spire-muted/60 hover:bg-spire-border/10"
            }`}
            onClick={() => { playSfx("ui", "button_click"); setPartyMode("random"); }}
          >
            <span className="text-4xl">🎲</span>
            <span className="text-base font-display text-spire-white">Random Parties</span>
            <span className="text-xs text-spire-muted text-center">Each run gets a random party</span>
          </button>
          <button
            className={`relative flex flex-col items-center gap-2 p-4 sm:p-6 rounded-xl border-2 transition-all duration-300 ${
              partyMode === "fixed"
                ? "border-spire-accent bg-spire-accent/15 shadow-glow scale-[1.02]"
                : "border-spire-border/40 hover:border-spire-muted/60 hover:bg-spire-border/10"
            }`}
            onClick={() => { playSfx("ui", "button_click"); setPartyMode("fixed"); }}
          >
            <span className="text-4xl">🎯</span>
            <span className="text-base font-display text-spire-white">Fixed Party</span>
            <span className="text-xs text-spire-muted text-center">Same lineup for every run</span>
          </button>
        </div>

        {partyMode === "fixed" && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            {selections.map((sel, i) => (
              <div key={i} className="bg-spire-bg/40 rounded-lg p-4 border border-spire-border/30 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-spire-accent/20 text-xs text-spire-gold font-bold">{i + 1}</span>
                  <span className="text-sm text-spire-gold font-medium">Hero {i + 1}</span>
                </div>
                <select
                  className="input w-full text-sm"
                  value={sel ?? ""}
                  onChange={(e) => {
                    const newSels = [...selections];
                    newSels[i] = e.target.value as HeroClassName;
                    setSelections(newSels);
                  }}
                >
                  <option value="">Select class...</option>
                  {ALL_CLASSES.map((c) => {
                    const used = selections.some((s, idx) => s === c && idx !== i);
                    return (
                      <option key={c} value={c} disabled={used}>
                        {c} ({CLASS_DATA[c].baseHp} HP){used ? " — taken" : ""}
                      </option>
                    );
                  })}
                </select>
                <div>
                  <label className="block text-[10px] text-spire-muted mb-1.5 uppercase tracking-wide">Specialization</label>
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
                          className={`p-3 rounded-lg text-xs border transition-all duration-200 ${
                            isSelected
                              ? "border-spire-accent bg-spire-accent/20 shadow-glow"
                              : "border-spire-border/30 hover:border-spire-muted hover:bg-spire-border/20"
                          } ${!sel ? "opacity-50 cursor-not-allowed" : ""}`}
                          onClick={() => {
                            playSfx("ui", "button_click");
                            const newSuits = [...suits];
                            newSuits[i] = opt.suit;
                            setSuits(newSuits);
                          }}
                          title={sel ? `${opt.label}: ${spec}` : "Select class first"}
                        >
                          <div className={`text-lg ${isBlack ? "text-spire-white" : "text-spire-gold"}`}>{opt.symbols}</div>
                          {sel && <div className="text-[10px] text-spire-muted truncate mt-1">{spec}</div>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {partyMode === "fixed" && hasDuplicates && (
          <div className="text-xs text-spire-warning flex items-center gap-1.5">
            <span>⚠</span> Duplicate classes detected — each hero must have a unique class.
          </div>
        )}
      </div>

      {/* Strategy Axis Selector */}
      <div className="glass-card p-5 space-y-4 relative z-10">
        <h3 className="section-heading">Strategy Axes — Cross-Product Matrix</h3>
        <p className="text-xs text-spire-muted">Select which strategy values to test. The lab will run every combination across all selected axes.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AxisSelector
            label="Combat"
            options={COMBAT_OPTS}
            selected={config.axes.combat}
            onToggle={(val) => {
              const current = config.axes.combat;
              setAxes({ combat: current.includes(val) ? current.filter((v) => v !== val) : [...current, val] });
            }}
          />
          <AxisSelector
            label="Merchant"
            options={MERCHANT_OPTS}
            selected={config.axes.merchant}
            onToggle={(val) => {
              const current = config.axes.merchant;
              setAxes({ merchant: current.includes(val) ? current.filter((v) => v !== val) : [...current, val] });
            }}
          />
          <AxisSelector
            label="Rest"
            options={REST_OPTS}
            selected={config.axes.rest}
            onToggle={(val) => {
              const current = config.axes.rest;
              setAxes({ rest: current.includes(val) ? current.filter((v) => v !== val) : [...current, val] });
            }}
          />
          <AxisSelector
            label="Split"
            options={SPLIT_OPTS}
            selected={config.axes.split}
            onToggle={(val) => {
              const current = config.axes.split;
              setAxes({ split: current.includes(val) ? current.filter((v) => v !== val) : [...current, val] });
            }}
          />
          <AxisSelector
            label="Item Usage"
            options={ITEM_OPTS}
            selected={config.axes.itemUsage}
            onToggle={(val) => {
              const current = config.axes.itemUsage;
              setAxes({ itemUsage: current.includes(val) ? current.filter((v) => v !== val) : [...current, val] });
            }}
          />
          <AxisSelector
            label="Weapon Upgrade"
            options={WEAPON_OPTS}
            selected={config.axes.weaponUpgrade}
            onToggle={(val) => {
              const current = config.axes.weaponUpgrade;
              setAxes({ weaponUpgrade: current.includes(val) ? current.filter((v) => v !== val) : [...current, val] });
            }}
          />
        </div>

        {/* Combo preview */}
        <div className="flex items-center justify-between bg-spire-bg/40 rounded-lg p-3 border border-spire-border/30">
          <div className="text-sm">
            <span className="text-spire-gold font-medium">{comboCount}</span>
            <span className="text-spire-muted"> combos × </span>
            <span className="text-spire-gold font-medium">{config.runsPerCombo}</span>
            <span className="text-spire-muted"> runs = </span>
            <span className="text-spire-accent font-bold">{totalRuns}</span>
            <span className="text-spire-muted"> total games</span>
          </div>
          {totalRuns > 200 && (
            <span className="text-xs text-amber-400/80">⚠ Large batch — may take a while</span>
          )}
        </div>
      </div>

      {/* Start Button */}
      <div className="flex justify-center pb-4">
        <button
          className="btn-gold text-lg px-8 py-3"
          disabled={(partyMode === "fixed" && !partyValid) || comboCount === 0}
          onClick={handleStart}
        >
          {comboCount === 0 ? "Select at least one strategy per axis" :
           partyMode === "fixed" && !partyValid ? "Select all heroes" :
           `▶️ Run ${totalRuns} Games (${comboCount} combos)`}
        </button>
      </div>

      {/* Experiment History + evidence import */}
      {historyLoaded && (
        <ExperimentHistoryPanel
          experiments={history}
          onOpen={(id) => { playSfx("ui", "button_click"); void openExperiment(id); }}
          onResume={(id) => { playSfx("ui", "button_click"); void resumeExperiment(id); }}
          onDelete={(id) => { void deleteExperiment(id); }}
          onImportFile={(f) => { void useStrategyLabStore.getState().importEvidenceFile(f); }}
        />
      )}
    </div>
  );
}

function AxisSelector<T extends string>({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: { value: T; label: string; icon: string }[];
  selected: T[];
  onToggle: (val: T) => void;
}) {
  const { playSfx } = useAudio();
  return (
    <div className="bg-spire-bg/40 rounded-lg p-3 border border-spire-border/30 space-y-2">
      <div className="text-sm text-spire-gold font-medium">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const isSelected = selected.includes(opt.value);
          return (
            <button
              key={opt.value}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 ${
                isSelected
                  ? "border-spire-accent bg-spire-accent/15 text-spire-white shadow-glow"
                  : "border-spire-border/40 text-spire-muted hover:border-spire-muted/60 hover:bg-spire-border/10"
              }`}
              onClick={() => { playSfx("ui", "button_click"); onToggle(opt.value); }}
            >
              <span className="text-sm">{opt.icon}</span>
              {opt.label}
              {isSelected && <span className="text-spire-accent ml-0.5">✓</span>}
            </button>
          );
        })}
      </div>
      <div className="text-[10px] text-spire-muted/60">{selected.length} selected</div>
    </div>
  );
}

function RunningView({
  progress,
  progressCounts,
  currentRunLog,
  currentRunSummary,
  isPaused,
  storageWarning,
  throughput,
  onBack,
  onCancel,
  onPause,
}: {
  progress: { currentCombo: number; totalCombos: number; currentRun: number; runsPerCombo: number; comboLabel: string } | null;
  progressCounts?: { completed: number; total: number; persisted: number };
  currentRunLog: GameEvent[];
  currentRunSummary: string;
  isPaused?: boolean;
  storageWarning?: string | null;
  throughput?: number;
  onBack: () => void;
  onCancel?: () => void;
  onPause?: () => void;
}) {
  const comboPct = progressCounts
    ? Math.round((progressCounts.completed / Math.max(progressCounts.total, 1)) * 100)
    : progress ? Math.round(((progress.currentCombo + progress.currentRun / progress.runsPerCombo) / progress.totalCombos) * 100) : 0;
  const runPct = progress ? Math.round((progress.currentRun / progress.runsPerCombo) * 100) : 0;

  const handleCancel = () => {
    onCancel?.();
    onBack();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-display gold-text">{isPaused ? "Strategy Lab Paused" : "Running Strategy Lab..."}</h2>
        <div className="flex items-center gap-2">
          {onPause && !isPaused && (
            <button
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-amber-300/40 text-amber-300 hover:bg-amber-500/10 transition-all duration-200"
              onClick={onPause}
            >
              Pause
            </button>
          )}
          <button className="btn-ghost text-sm px-4 py-2" onClick={handleCancel}>← Cancel</button>
        </div>
      </div>

      {storageWarning && (
        <div className="glass-card p-3 border border-amber-400/40 bg-amber-500/10 rounded-lg">
          <div className="text-xs text-amber-200/90">⚠️ {storageWarning}</div>
        </div>
      )}

      <div className="glass-card p-6 space-y-4">
        <div>
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="text-spire-white font-medium">Overall Progress</span>
            <span className="text-spire-gold">
              {progressCounts ? `${progressCounts.completed} / ${progressCounts.total} ` : ""}({comboPct}%)
            </span>
          </div>
          <div className="h-3 bg-spire-bg rounded-full overflow-hidden border border-spire-border/40">
            <div className="h-full bg-gradient-to-r from-spire-accent to-teal-400 transition-all duration-300" style={{ width: `${comboPct}%` }} />
          </div>
          <div className="flex items-center justify-between text-[11px] text-spire-muted/70 mt-1">
            <span>{progressCounts?.persisted ?? 0} committed to storage</span>
            {throughput !== undefined && throughput > 0 && (
              <span className="tabular-nums">{throughput.toFixed(1)} runs/s</span>
            )}
          </div>
        </div>

        {progress && (
          <>
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-spire-muted">Combo {progress.currentCombo + 1} / {progress.totalCombos}: {progress.comboLabel}</span>
                <span className="text-spire-muted">Run {progress.currentRun} / {progress.runsPerCombo}</span>
              </div>
              <div className="h-2 bg-spire-bg rounded-full overflow-hidden border border-spire-border/30">
                <div className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-300" style={{ width: `${runPct}%` }} />
              </div>
            </div>
            <div className="text-xs text-spire-muted">{currentRunSummary}</div>
          </>
        )}
      </div>

      <div className="glass-card p-5">
        <h3 className="section-heading mb-3">Current Run Log (last 15 events)</h3>
        <div className="max-h-64 overflow-y-auto space-y-1.5">
          {currentRunLog.length === 0 ? (
            <div className="text-xs text-spire-muted text-center py-4">Waiting for first run...</div>
          ) : (
            currentRunLog.map((event) => (
              <div key={event.id} className="text-xs border-b border-spire-border/10 pb-0.5 leading-relaxed font-mono">
                <span className="text-spire-muted/50 text-[10px] tabular-nums">#{event.sequence}</span>{" "}
                <span className={EVENT_TYPE_COLORS[event.type] ?? "text-spire-white"}>{event.summary}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

type SortKey = "comboLabel" | "victoryRate" | "avgScore" | "maxScore" | "avgTurns" | "avgRoomsCleared" | "avgHeroesAlive" | "scoreStdDev";
type SortDir = "asc" | "desc";

function ResultsView({
  result,
  experimentStatus,
  experimentId,
  storageWarning,
  onResume,
  onBack,
  onDownloadJSON,
  onDownloadCSV,
  onExportEvidence,
  onRunAnother,
}: {
  result: StrategyLabResult;
  experimentStatus?: string | null;
  experimentId?: string | null;
  storageWarning?: string | null;
  onResume?: (id: string) => void;
  onBack: () => void;
  onDownloadJSON: () => void;
  onDownloadCSV: () => void;
  onExportEvidence?: () => void;
  onRunAnother: () => void;
}) {
  const { playSfx } = useAudio();
  const [sortKey, setSortKey] = useState<SortKey>("victoryRate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedCombo, setSelectedCombo] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"summary" | "table" | "charts" | "classes" | "drilldown">("summary");

  const sortedCombos = useMemo(() => {
    const sorted = [...result.combos];
    sorted.sort((a, b) => {
      let av: number | string, bv: number | string;
      switch (sortKey) {
        case "comboLabel": av = a.comboLabel; bv = b.comboLabel; break;
        case "victoryRate": av = a.aggregate.victoryRate ?? -1; bv = b.aggregate.victoryRate ?? -1; break;
        case "avgScore": av = a.aggregate.avgScore; bv = b.aggregate.avgScore; break;
        case "maxScore": av = a.aggregate.maxScore; bv = b.aggregate.maxScore; break;
        case "avgTurns": av = a.aggregate.avgTurns; bv = b.aggregate.avgTurns; break;
        case "avgRoomsCleared": av = a.aggregate.avgRoomsCleared; bv = b.aggregate.avgRoomsCleared; break;
        case "avgHeroesAlive": av = a.aggregate.avgHeroesAlive; bv = b.aggregate.avgHeroesAlive; break;
        case "scoreStdDev": av = a.scoreStdDev; bv = b.scoreStdDev; break;
        default: av = 0; bv = 0;
      }
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return sorted;
  }, [result.combos, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    playSfx("ui", "button_click");
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const best = result.combos[result.bestComboIndex];
  const worst = result.combos[result.worstComboIndex];
  const consistent = result.combos[result.mostConsistentComboIndex];

  const tabs = [
    { id: "summary" as const, label: "Executive Summary", icon: "📊" },
    { id: "table" as const, label: "Comparison Table", icon: "📋" },
    { id: "charts" as const, label: "Charts", icon: "📈" },
    { id: "classes" as const, label: "Class Analysis", icon: "🎭" },
    { id: "drilldown" as const, label: "Run Drill-Down", icon: "🔍" },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-display gold-text">Strategy Lab Results</h2>
          <p className="text-spire-muted text-sm mt-1">
            {result.combos.length} combos · {result.totalRuns} total runs · {result.config.difficulty}
          </p>
        </div>
        <button className="btn-ghost text-sm px-4 py-2" onClick={() => { playSfx("ui", "button_click"); onBack(); }}>
          ← Back
        </button>
      </div>

      {experimentStatus && experimentStatus !== "completed" && (
        <div className="glass-card p-3 border border-amber-400/40 bg-amber-500/10 rounded-lg flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-amber-200/90">
            ⚠️ This experiment is <span className="font-semibold">{experimentStatus}</span> — the
            comparisons below reflect partial evidence. Do not treat rankings as final.
          </div>
          {onResume && experimentId && (
            <button
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-spire-accent/40 text-spire-accent hover:bg-spire-accent/10 transition-all duration-200"
              onClick={() => { playSfx("ui", "button_click"); onResume(experimentId); }}
            >
              ▶ Resume Experiment
            </button>
          )}
        </div>
      )}
      {storageWarning && (
        <div className="glass-card p-3 border border-amber-400/40 bg-amber-500/10 rounded-lg">
          <div className="text-xs text-amber-200/90">⚠️ {storageWarning}</div>
        </div>
      )}
      {result.config.sharedCohort && (
        <div className="glass-card p-3 border border-spire-accent/30 bg-spire-accent/5 rounded-lg">
          <div className="text-xs text-spire-muted">
            🔬 <span className="font-medium text-spire-accent">Shared-cohort protocol:</span> all
            combos replayed the same per-index seeds — differences are attributable to strategy,
            not initial RNG. Note: realized randomness still diverges once strategies consume
            RNG differently.
          </div>
        </div>
      )}

      {/* Tab Bar */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition-all duration-200 ${
              activeTab === tab.id
                ? "border-spire-accent bg-spire-accent/15 text-spire-white shadow-glow"
                : "border-spire-border/40 text-spire-muted hover:border-spire-muted/60 hover:bg-spire-border/10"
            }`}
            onClick={() => { playSfx("ui", "button_click"); setActiveTab(tab.id); }}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "summary" && (
        <div className="space-y-6">
          {/* Highlight Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <HighlightCard
              icon="🏆"
              title="Best Strategy"
              combo={best.comboLabel}
              metric={`${best.aggregate.victoryRate}%`}
              metricLabel="Victory Rate"
              sub={`Avg Score: ${best.aggregate.avgScore}`}
              color="amber"
            />
            <HighlightCard
              icon="📉"
              title="Worst Strategy"
              combo={worst.comboLabel}
              metric={`${worst.aggregate.victoryRate}%`}
              metricLabel="Victory Rate"
              sub={`Avg Score: ${worst.aggregate.avgScore}`}
              color="red"
            />
            <HighlightCard
              icon="🎯"
              title="Most Consistent"
              combo={consistent.comboLabel}
              metric={`±${consistent.scoreStdDev}`}
              metricLabel="Score Std Dev"
              sub={`Victory Rate: ${consistent.aggregate.victoryRate}%`}
              color="blue"
            />
          </div>

          {/* Quick Stats Grid */}
          <div className="glass-card p-6">
            <h3 className="section-heading mb-4">Overview</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <StatBox label="Total Combos" value={result.combos.length} />
              <StatBox label="Total Runs" value={result.totalRuns} />
              <StatBox label="Avg Victory Rate" value={(() => {
                const rates = result.combos.map(c => c.aggregate.victoryRate).filter((v): v is number => v !== undefined);
                return rates.length ? `${Math.round(rates.reduce((s, v) => s + v, 0) / rates.length)}%` : "N/A";
              })()} />
              <StatBox label="Avg Score" value={Math.round(result.combos.reduce((s, c) => s + c.aggregate.avgScore, 0) / result.combos.length)} />
            </div>
          </div>

          {/* Victory Rate Bar Chart */}
          <div className="glass-card p-6">
            <h3 className="section-heading mb-4">Victory Rate by Strategy Combo</h3>
            <ResponsiveContainer width="100%" height={Math.max(300, result.combos.length * 40)}>
              <BarChart data={result.combos.map((c) => ({ name: c.comboLabel, victoryRate: c.aggregate.victoryRate, avgScore: c.aggregate.avgScore }))} layout="vertical" margin={{ left: 80, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: "#a0a0a0", fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: "#d4af37", fontSize: 11 }} width={160} />
                <RTooltip
                  contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(212,175,55,0.3)", borderRadius: "8px", fontSize: "12px" }}
                  cursor={{ fill: "rgba(212,175,55,0.05)" }}
                />
                <Bar dataKey="victoryRate" name="Victory Rate %" radius={[0, 4, 4, 0]}>
                  {result.combos.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {activeTab === "table" && (
        <div className="glass-card p-4 sm:p-5">
          <h3 className="section-heading mb-3">Head-to-Head Comparison</h3>
          <div className="max-h-[600px] overflow-y-auto overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="sticky top-0 bg-spire-bg/90 backdrop-blur-sm z-10">
                <tr className="text-spire-muted text-xs border-b border-spire-border/40">
                  {([
                    { key: "comboLabel" as SortKey, label: "Strategy Combo", sortable: true },
                    { key: "victoryRate" as SortKey, label: "Win %", sortable: true },
                    { key: "ci", label: "95% CI", sortable: false },
                    { key: "n", label: "n", sortable: false },
                    { key: "avgScore" as SortKey, label: "Avg Score", sortable: true },
                    { key: "maxScore" as SortKey, label: "Max Score", sortable: true },
                    { key: "avgTurns" as SortKey, label: "Avg Turns", sortable: true },
                    { key: "avgRoomsCleared" as SortKey, label: "Avg Rooms", sortable: true },
                    { key: "avgHeroesAlive" as SortKey, label: "Avg Heroes", sortable: true },
                    { key: "scoreStdDev" as SortKey, label: "Score σ", sortable: true },
                  ]).map((col) => (
                    <th
                      key={col.key}
                      className={`text-${col.key === "comboLabel" ? "left" : "right"} py-2 px-2 cursor-pointer hover:text-spire-white transition-colors ${sortKey === col.key ? "text-spire-gold" : ""}`}
                      onClick={() => col.sortable && handleSort(col.key as SortKey)}
                    >
                      {col.label}
                      {sortKey === col.key && <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedCombos.map((cr) => {
                  const origIdx = result.combos.indexOf(cr);
                  const isBest = origIdx === result.bestComboIndex;
                  const isWorst = origIdx === result.worstComboIndex;
                  return (
                    <tr
                      key={cr.comboLabel}
                      className={`border-b border-spire-border/20 hover:bg-spire-accent/5 cursor-pointer transition-colors ${selectedCombo === origIdx ? "bg-spire-accent/10" : ""}`}
                      onClick={() => {
                        playSfx("ui", "button_click");
                        setSelectedCombo(selectedCombo === origIdx ? null : origIdx);
                        setActiveTab("drilldown");
                      }}
                    >
                      <td className="py-2 px-2 text-spire-white text-xs">
                        {isBest && <span className="text-amber-400 mr-1">🏆</span>}
                        {isWorst && <span className="text-red-400 mr-1">📉</span>}
                        {cr.comboLabel}
                      </td>
                      <td className="py-2 px-2 text-right">
                        <span className={(cr.aggregate.victoryRate ?? -1) >= 50 ? "text-green-400 font-medium" : (cr.aggregate.victoryRate ?? -1) >= 25 ? "text-amber-400" : cr.aggregate.victoryRate === undefined ? "text-spire-muted" : "text-red-400"}>
                          {cr.aggregate.victoryRate !== undefined ? `${cr.aggregate.victoryRate}%` : "N/A"}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right text-spire-muted text-xs tabular-nums">
                        {cr.aggregate.victoryRateCI
                          ? `[${(cr.aggregate.victoryRateCI.low * 100).toFixed(0)}–${(cr.aggregate.victoryRateCI.high * 100).toFixed(0)}]`
                          : "—"}
                      </td>
                      <td className="py-2 px-2 text-right text-spire-muted text-xs tabular-nums" title={`${cr.aggregate.errorRuns + cr.aggregate.timeoutRuns + cr.aggregate.invalidRuns} technical failure(s) excluded`}>
                        {cr.aggregate.validRuns}
                      </td>
                      <td className="py-2 px-2 text-right text-spire-gold font-medium">{cr.aggregate.avgScore}</td>
                      <td className="py-2 px-2 text-right text-spire-white">{cr.aggregate.maxScore}</td>
                      <td className="py-2 px-2 text-right text-spire-white">{cr.aggregate.avgTurns}</td>
                      <td className="py-2 px-2 text-right text-spire-white">{cr.aggregate.avgRoomsCleared}</td>
                      <td className="py-2 px-2 text-right text-spire-white">{cr.aggregate.avgHeroesAlive}</td>
                      <td className="py-2 px-2 text-right text-spire-muted">±{cr.scoreStdDev}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paired comparison — only meaningful for shared-cohort runs */}
          <PairedComparisonCard result={result} />
        </div>
      )}

      {activeTab === "charts" && (
        <div className="space-y-6">
          {/* Score Distribution Stacked Bar */}
          <div className="glass-card p-6">
            <h3 className="section-heading mb-4">Score Distribution by Combo</h3>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={result.combos.map((c) => {
                const row: Record<string, number | string> = { name: c.comboLabel };
                c.aggregate.scoreDistribution.forEach((d) => { row[d.range] = d.count; });
                return row;
              })} margin={{ left: 20, right: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fill: "#d4af37", fontSize: 10 }} angle={-35} textAnchor="end" height={70} />
                <YAxis tick={{ fill: "#a0a0a0", fontSize: 11 }} />
                <RTooltip
                  contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(212,175,55,0.3)", borderRadius: "8px", fontSize: "12px" }}
                  cursor={{ fill: "rgba(212,175,55,0.05)" }}
                />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                {result.combos[0]?.aggregate.scoreDistribution.map((d, i) => (
                  <Bar key={d.range} dataKey={d.range} stackId="a" fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Turns vs Rooms Grouped Bar */}
          <div className="glass-card p-6">
            <h3 className="section-heading mb-4">Avg Turns vs Avg Rooms by Combo</h3>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={result.combos.map((c) => ({ name: c.comboLabel, Turns: c.aggregate.avgTurns, Rooms: c.aggregate.avgRoomsCleared }))} margin={{ left: 20, right: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fill: "#d4af37", fontSize: 10 }} angle={-35} textAnchor="end" height={70} />
                <YAxis tick={{ fill: "#a0a0a0", fontSize: 11 }} />
                <RTooltip
                  contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(212,175,55,0.3)", borderRadius: "8px", fontSize: "12px" }}
                  cursor={{ fill: "rgba(212,175,55,0.05)" }}
                />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Bar dataKey="Turns" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Rooms" fill="#a855f7" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Score Breakdown Radar */}
          <div className="glass-card p-6">
            <h3 className="section-heading mb-4">Score Breakdown Radar (Top 5 Combos by Victory Rate)</h3>
            <ResponsiveContainer width="100%" height={450}>
              <RadarChart data={[
                "baseScore", "heroesAliveBonus", "goldBonus", "tier3Bonus", "itemBonus", "perfectCombatBonus",
              ].map((metric) => {
                const row: Record<string, number | string> = { metric };
                [...result.combos]
                  .sort((a, b) => (b.aggregate.victoryRate ?? -1) - (a.aggregate.victoryRate ?? -1))
                  .slice(0, 5)
                  .forEach((c) => { row[c.comboLabel] = (c.avgScoreBreakdown as any)[metric]; });
                return row;
              })}>
                <PolarGrid stroke="rgba(255,255,255,0.1)" />
                <PolarAngleAxis dataKey="metric" tick={{ fill: "#d4af37", fontSize: 11 }} />
                <PolarRadiusAxis tick={{ fill: "#a0a0a0", fontSize: 10 }} />
                <RTooltip
                  contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(212,175,55,0.3)", borderRadius: "8px", fontSize: "12px" }}
                />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                {[...result.combos]
                  .sort((a, b) => (b.aggregate.victoryRate ?? -1) - (a.aggregate.victoryRate ?? -1))
                  .slice(0, 5)
                  .map((c, i) => (
                    <Radar key={c.comboLabel} name={c.comboLabel} dataKey={c.comboLabel} stroke={CHART_COLORS[i % CHART_COLORS.length]} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.15} />
                  ))}
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Heatmap (if exactly 2 axes varied) */}
          {result.combos.length > 1 && (() => {
            const variedAxes = (Object.entries(result.config.axes) as [string, string[]][])
              .filter(([, vals]) => vals.length > 1);
            if (variedAxes.length !== 2) return null;
            const [axis1Name, axis1Vals] = variedAxes[0];
            const [axis2Name, axis2Vals] = variedAxes[1];
            const comboMap = new Map(result.combos.map((c) => [c.comboLabel, c]));
            return (
              <div className="glass-card p-6">
                <h3 className="section-heading mb-4">Victory Rate Heatmap: {axis1Name} × {axis2Name}</h3>
                <div className="overflow-x-auto">
                  <table className="border-collapse">
                    <thead>
                      <tr>
                        <th className="text-xs text-spire-muted p-2 text-left">{axis1Name} \ {axis2Name}</th>
                        {axis2Vals.map((v) => (
                          <th key={v} className="text-xs text-spire-gold p-2 text-center min-w-[80px]">{v}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {axis1Vals.map((v1) => (
                        <tr key={v1}>
                          <td className="text-xs text-spire-gold p-2 text-left font-medium">{v1}</td>
                          {axis2Vals.map((v2) => {
                            const matchingCombo = result.combos.find((c) => {
                              const cCombo = c.combo as any;
                              return cCombo[axis1Name + "Strategy"] === v1 && cCombo[axis2Name + "Strategy"] === v2;
                            });
                            const rate = matchingCombo?.aggregate.victoryRate ?? -1;
                            const bg = rate < 0 ? "rgba(255,255,255,0.02)" :
                              rate >= 75 ? "rgba(16,185,129,0.5)" :
                              rate >= 50 ? "rgba(212,175,55,0.4)" :
                              rate >= 25 ? "rgba(245,158,11,0.4)" :
                              "rgba(239,68,68,0.4)";
                            return (
                              <td key={v2} className="p-2 text-center" style={{ background: bg }}>
                                <span className={`text-sm font-medium ${rate < 0 ? "text-spire-muted/30" : "text-spire-white"}`}>
                                  {rate < 0 ? "—" : `${rate}%`}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {activeTab === "classes" && (
        <div className="space-y-6">
          {/* Win Rate by Class */}
          <div className="glass-card p-6">
            <h3 className="section-heading mb-4">Win Rate by Hero Class (Across All Runs)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={aggregateClassStats(result)} margin={{ left: 20, right: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="className" tick={{ fill: "#d4af37", fontSize: 12 }} />
                <YAxis tick={{ fill: "#a0a0a0", fontSize: 11 }} domain={[0, 100]} />
                <RTooltip
                  contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(212,175,55,0.3)", borderRadius: "8px", fontSize: "12px" }}
                  cursor={{ fill: "rgba(212,175,55,0.05)" }}
                />
                <Bar dataKey="winRate" name="Win Rate %" radius={[4, 4, 0, 0]}>
                  {ALL_CLASSES.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="text-spire-muted text-xs border-b border-spire-border/40">
                    <th className="text-left py-1.5 px-2">Class</th>
                    <th className="text-right py-1.5 px-2" title="Runs containing this class — party-level association, not causation">Party Runs</th>
                    <th className="text-right py-1.5 px-2">Win %</th>
                    <th className="text-right py-1.5 px-2">95% CI</th>
                    <th className="text-right py-1.5 px-2" title="Fraction of hero-appearances ending alive">Indiv. Survival</th>
                    <th className="text-right py-1.5 px-2">Avg Dmg Dealt</th>
                    <th className="text-right py-1.5 px-2">Avg Dmg Taken</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregateClassStats(result).map((s) => (
                    <tr key={s.className} className="border-b border-spire-border/20">
                      <td className="py-1.5 px-2 text-spire-gold">{s.className}</td>
                      <td className="py-1.5 px-2 text-right text-spire-white tabular-nums">{s.appearances}</td>
                      <td className="py-1.5 px-2 text-right text-spire-white tabular-nums">{s.winRate}%</td>
                      <td className="py-1.5 px-2 text-right text-spire-muted text-xs tabular-nums">
                        {s.winRateCI ? `[${(s.winRateCI.low * 100).toFixed(0)}–${(s.winRateCI.high * 100).toFixed(0)}]` : "—"}
                      </td>
                      <td className="py-1.5 px-2 text-right text-spire-white tabular-nums">
                        {s.individualSurvivalRate !== undefined ? `${s.individualSurvivalRate}%` : "—"}
                      </td>
                      <td className="py-1.5 px-2 text-right text-spire-white tabular-nums">{s.avgDamageDealt ?? "—"}</td>
                      <td className="py-1.5 px-2 text-right text-spire-white tabular-nums">{s.avgDamageReceived ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-[10px] text-spire-muted/60 mt-2">
                Win rate is a party-level association — a hero class does not act alone.
                Individual survival/damage are per-hero telemetry and only present when telemetry
                was recorded.
              </div>
            </div>
          </div>

          {/* Class Survival Rate */}
          <div className="glass-card p-6">
            <h3 className="section-heading mb-4">Average Heroes Alive at End by Class</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={aggregateClassStats(result)} margin={{ left: 20, right: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="className" tick={{ fill: "#d4af37", fontSize: 12 }} />
                <YAxis tick={{ fill: "#a0a0a0", fontSize: 11 }} domain={[0, 3]} />
                <RTooltip
                  contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(212,175,55,0.3)", borderRadius: "8px", fontSize: "12px" }}
                  cursor={{ fill: "rgba(212,175,55,0.05)" }}
                />
                <Bar dataKey="avgSurvival" name="Avg Heroes Alive" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Class × Combat Strategy Performance */}
          <div className="glass-card p-6">
            <h3 className="section-heading mb-4">Avg Score by Class × Combat Strategy</h3>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={getClassByCombatStrategyData(result)} margin={{ left: 20, right: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="className" tick={{ fill: "#d4af37", fontSize: 12 }} />
                <YAxis tick={{ fill: "#a0a0a0", fontSize: 11 }} />
                <RTooltip
                  contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(212,175,55,0.3)", borderRadius: "8px", fontSize: "12px" }}
                  cursor={{ fill: "rgba(212,175,55,0.05)" }}
                />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                {getUniqueCombatStrategies(result).map((strat, i) => (
                  <Bar key={strat} dataKey={strat} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[4, 4, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Best Party Compositions */}
          <div className="glass-card p-6">
            <h3 className="section-heading mb-4">Top Party Compositions by Win Rate</h3>
            <PartyCompTable result={result} />
          </div>

          {/* Specialization Performance */}
          <div className="glass-card p-6">
            <h3 className="section-heading mb-4">Win Rate by Specialization</h3>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={aggregateSpecStats(result)} margin={{ left: 20, right: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" tick={{ fill: "#d4af37", fontSize: 10 }} angle={-35} textAnchor="end" height={70} interval={0} />
                <YAxis tick={{ fill: "#a0a0a0", fontSize: 11 }} domain={[0, 100]} />
                <RTooltip
                  contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(212,175,55,0.3)", borderRadius: "8px", fontSize: "12px" }}
                  cursor={{ fill: "rgba(212,175,55,0.05)" }}
                  formatter={(value: any, _name: any, props: any) => [`${value}% (${props?.payload?.appearances ?? 0} runs, ${props?.payload?.className ?? ""})`, "Win Rate"]}
                />
                <Bar dataKey="winRate" name="Win Rate %" radius={[4, 4, 0, 0]}>
                  {aggregateSpecStats(result).map((entry, i) => {
                    const classIdx = ALL_CLASSES.indexOf(entry.className as HeroClassName);
                    return <Cell key={i} fill={CHART_COLORS[classIdx >= 0 ? classIdx : 0]} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Spec Performance Table */}
          <div className="glass-card p-6">
            <h3 className="section-heading mb-4">Specialization Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-spire-muted text-xs border-b border-spire-border/40">
                    <th className="text-left py-2 px-2">Specialization</th>
                    <th className="text-left py-2 px-2">Class</th>
                    <th className="text-right py-2 px-2">Runs</th>
                    <th className="text-right py-2 px-2">Win Rate</th>
                    <th className="text-right py-2 px-2">Avg Score</th>
                    <th className="text-right py-2 px-2">Avg Survival</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregateSpecStats(result).map((s) => (
                    <tr key={`${s.className}-${s.spec}`} className="border-b border-spire-border/20">
                      <td className="py-2 px-2 text-spire-gold font-medium">{s.spec}</td>
                      <td className="py-2 px-2 text-spire-muted">{s.className}</td>
                      <td className="py-2 px-2 text-right text-spire-white">{s.appearances}</td>
                      <td className="py-2 px-2 text-right">
                        <span className={s.winRate >= 50 ? "text-spire-success" : s.winRate >= 30 ? "text-spire-gold" : "text-spire-danger"}>
                          {s.winRate}%
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right text-spire-white">{s.avgScore}</td>
                      <td className="py-2 px-2 text-right text-spire-white">{s.avgSurvival}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === "drilldown" && (
        <div className="space-y-4">
          <div className="glass-card p-4">
            <h3 className="section-heading mb-3">Select a Strategy Combo to Drill Down</h3>
            <select
              className="input w-full"
              value={selectedCombo ?? ""}
              onChange={(e) => { playSfx("ui", "button_click"); setSelectedCombo(e.target.value ? parseInt(e.target.value) : null); }}
            >
              <option value="">— Select a combo —</option>
              {result.combos.map((cr, i) => (
                <option key={i} value={i}>
                  {cr.comboLabel} — {cr.aggregate.victoryRate}% win, {cr.aggregate.avgScore} avg score
                </option>
              ))}
            </select>
          </div>

          {selectedCombo !== null && (
            <ComboDrillDown combo={result.combos[selectedCombo]} comboIndex={selectedCombo} />
          )}
        </div>
      )}

      {/* Download + Actions */}
      <div className="flex justify-center gap-4 pb-4 flex-wrap">
        <button className="btn-primary" onClick={() => { playSfx("ui", "button_click"); onDownloadJSON(); }}>
          📥 Download JSON
        </button>
        <button className="btn-primary" onClick={() => { playSfx("ui", "button_click"); onDownloadCSV(); }}>
          📥 Download CSV
        </button>
        {onExportEvidence && (
          <button
            className="btn-primary"
            onClick={() => { playSfx("ui", "button_click"); onExportEvidence(); }}
            title="Export a versioned evidence package with reproducibility metadata"
          >
            📦 Export Evidence
          </button>
        )}
        <button className="btn-gold" onClick={onRunAnother}>
          🔄 Run Another Lab
        </button>
      </div>
    </div>
  );
}

function HighlightCard({
  icon, title, combo, metric, metricLabel, sub, color,
}: {
  icon: string;
  title: string;
  combo: string;
  metric: string;
  metricLabel: string;
  sub: string;
  color: "amber" | "red" | "blue";
}) {
  const colorClasses = {
    amber: "border-amber-400/40 bg-amber-400/5 text-amber-300",
    red: "border-red-400/40 bg-red-400/5 text-red-300",
    blue: "border-blue-400/40 bg-blue-400/5 text-blue-300",
  };
  return (
    <div className={`glass-card p-5 border ${colorClasses[color]} rounded-xl`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{icon}</span>
        <span className="text-sm font-display text-spire-white">{title}</span>
      </div>
      <div className="text-lg font-bold text-spire-gold mb-1">{combo}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-display gold-text">{metric}</span>
        <span className="text-xs text-spire-muted">{metricLabel}</span>
      </div>
      <div className="text-xs text-spire-muted/70 mt-1">{sub}</div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-box">
      <div className="text-2xl gold-text font-display">{value}</div>
      <div className="text-xs text-spire-muted mt-1">{label}</div>
    </div>
  );
}

function ComboDrillDown({ combo, comboIndex }: { combo: ComboResult; comboIndex: number }) {
  const { playSfx } = useAudio();
  const [selectedRun, setSelectedRun] = useState<number | null>(null);
  const [showLog, setShowLog] = useState(false);

  return (
    <div className="space-y-4">
      {/* Combo Stats */}
      <div className="glass-card p-5">
        <h3 className="section-heading mb-3">{combo.comboLabel}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <StatBox label="Victory Rate" value={`${combo.aggregate.victoryRate}%`} />
          <StatBox label="Avg Score" value={combo.aggregate.avgScore} />
          <StatBox label="Avg Turns" value={combo.aggregate.avgTurns} />
          <StatBox label="Avg Rooms" value={combo.aggregate.avgRoomsCleared} />
        </div>

        {/* Score breakdown */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="bg-spire-bg/40 rounded p-2 border border-spire-border/20">
            <span className="text-spire-muted">Base Score:</span> <span className="text-spire-gold">{combo.avgScoreBreakdown.baseScore}</span>
          </div>
          <div className="bg-spire-bg/40 rounded p-2 border border-spire-border/20">
            <span className="text-spire-muted">Hero Bonus:</span> <span className="text-green-400">{combo.avgScoreBreakdown.heroesAliveBonus}</span>
          </div>
          <div className="bg-spire-bg/40 rounded p-2 border border-spire-border/20">
            <span className="text-spire-muted">Gold Bonus:</span> <span className="text-amber-400">{combo.avgScoreBreakdown.goldBonus}</span>
          </div>
          <div className="bg-spire-bg/40 rounded p-2 border border-spire-border/20">
            <span className="text-spire-muted">Tier3 Bonus:</span> <span className="text-purple-400">{combo.avgScoreBreakdown.tier3Bonus}</span>
          </div>
          <div className="bg-spire-bg/40 rounded p-2 border border-spire-border/20">
            <span className="text-spire-muted">Turn Penalty:</span> <span className="text-red-400">{combo.avgScoreBreakdown.turnPenalty}</span>
          </div>
          <div className="bg-spire-bg/40 rounded p-2 border border-spire-border/20">
            <span className="text-spire-muted">Item Bonus:</span> <span className="text-cyan-400">{combo.avgScoreBreakdown.itemBonus}</span>
          </div>
          <div className="bg-spire-bg/40 rounded p-2 border border-spire-border/20">
            <span className="text-spire-muted">Perfect Combat:</span> <span className="text-spire-gold">{combo.avgScoreBreakdown.perfectCombatBonus}</span>
          </div>
          <div className="bg-spire-bg/40 rounded p-2 border border-spire-border/20">
            <span className="text-spire-muted">Score Std Dev:</span> <span className="text-spire-white">±{combo.scoreStdDev}</span>
          </div>
        </div>
      </div>

      {/* Per-run table */}
      <div className="glass-card p-4">
        <h3 className="section-heading mb-3">Individual Runs ({combo.runs.length})</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-spire-muted text-xs border-b border-spire-border/40">
              <th className="text-left py-2 px-2">#</th>
              <th className="text-left py-2 px-2">Seed</th>
              <th className="text-left py-2 px-2">Outcome</th>
              <th className="text-right py-2 px-2">Score</th>
              <th className="text-right py-2 px-2">Turns</th>
              <th className="text-right py-2 px-2">Rooms</th>
              <th className="text-right py-2 px-2">Heroes</th>
              <th className="text-left py-2 px-2">Party</th>
            </tr>
          </thead>
          <tbody>
            {combo.runs.map((run) => (
              <tr
                key={run.runIndex}
                className={`border-b border-spire-border/20 hover:bg-spire-accent/5 cursor-pointer transition-colors ${selectedRun === run.runIndex ? "bg-spire-accent/10" : ""}`}
                onClick={() => {
                  playSfx("ui", "button_click");
                  setSelectedRun(selectedRun === run.runIndex ? null : run.runIndex);
                  setShowLog(false);
                }}
              >
                <td className="py-2 px-2 text-spire-muted">{run.runIndex + 1}</td>
                <td className="py-2 px-2 text-spire-muted text-xs">{run.seed}</td>
                <td className="py-2 px-2" title={run.diagnostics?.errorMessage}>
                  {run.status === "completed" ? (
                    <>
                      <span className={run.outcome === "victory" ? "text-spire-success" : "text-spire-danger"}>
                        {run.outcome === "victory" ? "🏆 Win" : run.outcome === "retreat" ? "🏳 Retreat" : "💀 Loss"}
                      </span>
                      {run.outcome === "defeat" && run.defeatedBy && (
                        <span className="block text-[10px] text-spire-muted/70 mt-0.5">vs {run.defeatedBy}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-amber-400">⚠ {run.status}</span>
                  )}
                </td>
                <td className="py-2 px-2 text-right text-spire-gold font-medium">{run.score?.finalScore ?? "—"}</td>
                <td className="py-2 px-2 text-right text-spire-white">{run.totalTurns ?? "—"}</td>
                <td className="py-2 px-2 text-right text-spire-white">{run.roomsCleared ?? "—"}</td>
                <td className="py-2 px-2 text-right text-spire-white">{run.heroesAlive ?? "—"}</td>
                <td className="py-2 px-2 text-xs text-spire-muted">
                  {run.partyComposition.map((p) => `${p.className} (${p.specialization})`).join(" + ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {selectedRun !== null && (() => {
          const run = combo.runs.find((r) => r.runIndex === selectedRun);
          if (!run) return null;
          return (
            <div className="mt-4">
              <div className="bg-spire-bg/40 rounded-lg p-3 border border-spire-border/30 mb-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
                  <div><span className="text-spire-muted/60">runId:</span> {run.runId}</div>
                  <div><span className="text-spire-muted/60">seed:</span> {run.seed}</div>
                  <div><span className="text-spire-muted/60">status:</span> {run.status}</div>
                  <div><span className="text-spire-muted/60">cohort:</span> {run.cohortIndex}</div>
                  {run.diagnostics?.errorMessage && (
                    <div className="col-span-2 sm:col-span-4"><span className="text-spire-muted/60">error:</span> <span className="text-red-300">{run.diagnostics.errorMessage}</span></div>
                  )}
                  {run.heroes && run.heroes.length > 0 && (
                    <div className="col-span-2 sm:col-span-4">
                      <span className="text-spire-muted/60">hero stats:</span>{" "}
                      {run.heroes.map((h) => `${h.className} dmg ${h.damageDealt} taken ${h.damageReceived} healed ${h.healingReceived}`).join(" · ")}
                    </div>
                  )}
                </div>
              </div>
              <button
                className="btn-ghost text-xs px-3 py-1.5 mb-2"
                onClick={() => { playSfx("ui", "button_click"); setShowLog(!showLog); }}
              >
                {showLog ? "📋 Hide Combat Log" : "📜 Show Full Combat Log"}
              </button>
              {showLog && (
                <CombatLogViewer
                  events={run.combatLog ?? []}
                  runIndex={selectedRun}
                  partyComposition={run.partyComposition}
                />
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function CombatLogViewer({
  events,
  runIndex,
  partyComposition,
}: {
  events: GameEvent[];
  runIndex: number;
  partyComposition: { className: HeroClassName; suit: Suit; specialization: string }[];
}) {
  const nameMap = useMemo(() => buildNameMapFromComposition(partyComposition), [partyComposition]);
  const [visibleCount, setVisibleCount] = useState(Math.min(50, events.length));

  return (
    <div className="bg-spire-bg/40 rounded-lg p-4 border border-spire-border/30">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm text-spire-gold">Run {runIndex + 1} — Combat Log ({events.length} events)</h4>
        {visibleCount < events.length && (
          <button
            className="text-[10px] text-spire-accent hover:text-spire-gold"
            onClick={() => setVisibleCount(Math.min(visibleCount + 50, events.length))}
          >
            Show more ({events.length - visibleCount} remaining)
          </button>
        )}
      </div>
      <div className="max-h-80 overflow-y-auto space-y-0.5 font-mono">
        {events.slice(0, visibleCount).map((event) => (
          <div key={event.id} className="text-xs border-b border-spire-border/10 pb-0.5 leading-relaxed">
            <span className="text-spire-muted/50 text-[10px] tabular-nums">#{event.sequence}</span>{" "}
            <span className={EVENT_TYPE_COLORS[event.type] ?? "text-spire-white"}>
              {formatLogSummaryWithNames(event.summary, nameMap)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function aggregateClassStats(result: StrategyLabResult) {
  const classAgg = new Map<HeroClassName, {
    appearances: number; victories: number; totalScore: number; totalSurvival: number;
    heroAppearances: number; heroSurvivals: number; totalDamageDealt: number; totalDamageReceived: number;
  }>();
  for (const cls of ALL_CLASSES) {
    classAgg.set(cls, { appearances: 0, victories: 0, totalScore: 0, totalSurvival: 0, heroAppearances: 0, heroSurvivals: 0, totalDamageDealt: 0, totalDamageReceived: 0 });
  }
  for (const combo of result.combos) {
    for (const run of combo.runs) {
      if (run.status !== "completed") continue;
      const isWin = run.outcome === "victory";
      for (const member of run.partyComposition) {
        const entry = classAgg.get(member.className);
        if (!entry) continue;
        entry.appearances++;
        if (isWin) entry.victories++;
        entry.totalScore += run.score?.finalScore ?? 0;
        entry.totalSurvival += run.heroesAlive ?? 0;
      }
      // Genuine per-hero telemetry — individual survival, not party count.
      for (const hero of run.heroes ?? []) {
        const entry = classAgg.get(hero.className as HeroClassName);
        if (!entry) continue;
        entry.heroAppearances++;
        if (hero.alive) entry.heroSurvivals++;
        entry.totalDamageDealt += hero.damageDealt;
        entry.totalDamageReceived += hero.damageReceived;
      }
    }
  }
  return ALL_CLASSES.map((cls) => {
    const e = classAgg.get(cls)!;
    const ci = wilsonInterval(e.victories, e.appearances);
    return {
      className: cls,
      appearances: e.appearances,
      victories: e.victories,
      winRate: e.appearances > 0 ? Math.round((e.victories / e.appearances) * 100) : 0,
      winRateCI: ci ? { low: ci.low, high: ci.high } : undefined,
      avgScore: e.appearances > 0 ? Math.round(e.totalScore / e.appearances) : 0,
      avgSurvival: e.appearances > 0 ? parseFloat((e.totalSurvival / e.appearances).toFixed(1)) : 0,
      individualSurvivalRate: e.heroAppearances > 0 ? Math.round((e.heroSurvivals / e.heroAppearances) * 100) : undefined,
      avgDamageDealt: e.heroAppearances > 0 ? Math.round(e.totalDamageDealt / e.heroAppearances) : undefined,
      avgDamageReceived: e.heroAppearances > 0 ? Math.round(e.totalDamageReceived / e.heroAppearances) : undefined,
    };
  });
}

function aggregateSpecStats(result: StrategyLabResult) {
  const specAgg = new Map<string, { className: string; spec: string; appearances: number; victories: number; totalScore: number; totalSurvival: number }>();
  for (const combo of result.combos) {
    for (const run of combo.runs) {
      if (run.status !== "completed") continue;
      const isWin = run.outcome === "victory";
      for (const member of run.partyComposition) {
        const key = `${member.className}|${member.specialization}`;
        let entry = specAgg.get(key);
        if (!entry) {
          entry = { className: member.className, spec: member.specialization, appearances: 0, victories: 0, totalScore: 0, totalSurvival: 0 };
          specAgg.set(key, entry);
        }
        entry.appearances++;
        if (isWin) entry.victories++;
        entry.totalScore += run.score?.finalScore ?? 0;
        entry.totalSurvival += run.heroesAlive ?? 0;
      }
    }
  }
  return [...specAgg.values()]
    .map((e) => ({
      label: `${e.spec}`,
      className: e.className,
      spec: e.spec,
      appearances: e.appearances,
      winRate: e.appearances > 0 ? Math.round((e.victories / e.appearances) * 100) : 0,
      avgScore: e.appearances > 0 ? Math.round(e.totalScore / e.appearances) : 0,
      avgSurvival: e.appearances > 0 ? parseFloat((e.totalSurvival / e.appearances).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.winRate - a.winRate);
}

function getUniqueCombatStrategies(result: StrategyLabResult): string[] {
  const set = new Set<string>();
  for (const combo of result.combos) {
    set.add(combo.combo.combatStrategy);
  }
  return [...set];
}

function getClassByCombatStrategyData(result: StrategyLabResult) {
  const combatStrategies = getUniqueCombatStrategies(result);
  const data: Record<string, any>[] = [];

  for (const cls of ALL_CLASSES) {
    const row: Record<string, any> = { className: cls };
    for (const strat of combatStrategies) {
      let totalScore = 0;
      let count = 0;
      for (const combo of result.combos) {
        if (combo.combo.combatStrategy !== strat) continue;
        for (const run of combo.runs) {
          if (run.status !== "completed") continue;
          if (run.partyComposition.some((p) => p.className === cls)) {
            totalScore += run.score?.finalScore ?? 0;
            count++;
          }
        }
      }
      row[strat] = count > 0 ? Math.round(totalScore / count) : 0;
    }
    data.push(row);
  }
  return data;
}

function PartyCompTable({ result }: { result: StrategyLabResult }) {
  const compMap = new Map<string, { wins: number; total: number; avgScore: number; scoreSum: number; bestCombo: string }>();

  for (const combo of result.combos) {
    for (const run of combo.runs) {
      const compKey = run.partyComposition.map((p) => `${p.className} (${p.specialization})`).sort().join(" + ");
      if (run.status !== "completed") continue;
      const entry = compMap.get(compKey) ?? { wins: 0, total: 0, avgScore: 0, scoreSum: 0, bestCombo: combo.comboLabel };
      entry.total++;
      if (run.outcome === "victory") entry.wins++;
      entry.scoreSum += run.score?.finalScore ?? 0;
      if (run.outcome === "victory" && (run.score?.finalScore ?? 0) > entry.scoreSum / entry.total) {
        entry.bestCombo = combo.comboLabel;
      }
      compMap.set(compKey, entry);
    }
  }

  const sorted = [...compMap.entries()]
    .map(([comp, stats]) => ({
      comp,
      wins: stats.wins,
      total: stats.total,
      winRate: stats.total > 0 ? Math.round((stats.wins / stats.total) * 100) : 0,
      avgScore: stats.total > 0 ? Math.round(stats.scoreSum / stats.total) : 0,
      bestCombo: stats.bestCombo,
    }))
    .sort((a, b) => b.winRate - a.winRate || b.avgScore - a.avgScore)
    .slice(0, 10);

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-spire-muted text-xs border-b border-spire-border/40">
          <th className="text-left py-2 px-2">#</th>
          <th className="text-left py-2 px-2">Party</th>
          <th className="text-right py-2 px-2">Runs</th>
          <th className="text-right py-2 px-2">Win Rate</th>
          <th className="text-right py-2 px-2">Avg Score</th>
          <th className="text-left py-2 px-2">Best Strategy</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((row, i) => (
          <tr key={row.comp} className="border-b border-spire-border/20">
            <td className="py-2 px-2 text-spire-muted">{i + 1}</td>
            <td className="py-2 px-2 text-spire-white text-xs">{row.comp}</td>
            <td className="py-2 px-2 text-right text-spire-white">{row.total}</td>
            <td className="py-2 px-2 text-right">
              <span className={row.winRate >= 50 ? "text-green-400 font-medium" : row.winRate >= 25 ? "text-amber-400" : "text-red-400"}>
                {row.winRate}%
              </span>
            </td>
            <td className="py-2 px-2 text-right text-spire-gold">{row.avgScore}</td>
            <td className="py-2 px-2 text-xs text-spire-muted">{row.bestCombo}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Paired (shared-cohort) comparison between two combos. Pairs runs by
 * cohortIndex — the same seed was replayed under both strategies, so
 * differences are attributable to strategy, not scenario RNG. Only
 * completed runs form valid pairs; technical failures are excluded.
 * Requires `sharedCohort` in the experiment config.
 */
function PairedComparisonCard({ result }: { result: StrategyLabResult }) {
  const [aIdx, setAIdx] = useState<number | null>(null);
  const [bIdx, setBIdx] = useState<number | null>(null);

  if (!result.config.sharedCohort) {
    return (
      <div className="mt-4 rounded border border-spire-border/30 bg-spire-bg/40 p-3 text-xs text-spire-muted">
        <span className="font-medium text-spire-white">Paired Comparison unavailable.</span>{" "}
        This experiment was not run with a shared cohort, so runs cannot be matched
        seed-for-seed. Enable <span className="text-spire-gold">Shared Cohort</span> in the
        configuration to compare strategies on identical scenarios — unpaired win-rate
        differences include scenario RNG noise and are weaker evidence.
      </div>
    );
  }

  const comparison =
    aIdx !== null && bIdx !== null && aIdx !== bIdx
      ? pairedCompare(result.combos[aIdx].runs, result.combos[bIdx].runs)
      : undefined;

  return (
    <div className="mt-4 rounded border border-spire-border/30 bg-spire-bg/40 p-3" data-testid="paired-comparison">
      <h4 className="text-xs font-semibold text-spire-white mb-2">Paired Comparison (shared cohort)</h4>
      <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
        <select
          className="input text-xs py-1"
          value={aIdx ?? ""}
          onChange={(e) => setAIdx(e.target.value === "" ? null : parseInt(e.target.value))}
          data-testid="paired-select-a"
        >
          <option value="">— Combo A —</option>
          {result.combos.map((c, i) => (
            <option key={i} value={i}>{c.comboLabel}</option>
          ))}
        </select>
        <span className="text-spire-muted">vs</span>
        <select
          className="input text-xs py-1"
          value={bIdx ?? ""}
          onChange={(e) => setBIdx(e.target.value === "" ? null : parseInt(e.target.value))}
          data-testid="paired-select-b"
        >
          <option value="">— Combo B —</option>
          {result.combos.map((c, i) => (
            <option key={i} value={i}>{c.comboLabel}</option>
          ))}
        </select>
      </div>
      {aIdx !== null && aIdx === bIdx && (
        <div className="text-xs text-spire-muted">Select two different combos.</div>
      )}
      {comparison && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <StatBox label="Matched pairs" value={comparison.pairs} />
          <StatBox label="Unmatched A / B" value={`${comparison.unmatchedA} / ${comparison.unmatchedB}`} />
          <StatBox
            label="A wins / B wins / ties"
            value={`${comparison.winDiffs.aWins} / ${comparison.winDiffs.bWins} / ${comparison.winDiffs.ties}`}
          />
          <StatBox
            label="Mean score diff (A−B)"
            value={
              comparison.meanScoreDiff === undefined
                ? "N/A"
                : `${comparison.meanScoreDiff >= 0 ? "+" : ""}${comparison.meanScoreDiff.toFixed(1)}` +
                  (comparison.scoreDiffCI
                    ? ` [${comparison.scoreDiffCI.low.toFixed(0)}, ${comparison.scoreDiffCI.high.toFixed(0)}]`
                    : "")
            }
          />
          <div className="col-span-2 sm:col-span-4 text-[10px] text-spire-muted mt-1">
            {comparison.winRateDiffNote} Pairs share starting seeds; once strategies
            diverge, downstream RNG consumption differs — pairing removes scenario
            variance, not all noise. Runs that failed technically are excluded.
          </div>
        </div>
      )}
      {aIdx === null || bIdx === null ? (
        <div className="text-xs text-spire-muted">Pick two combos to compare head-to-head on identical scenarios.</div>
      ) : null}
    </div>
  );
}
