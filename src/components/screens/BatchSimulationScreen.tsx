import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useBatchStore } from "../../app/batchStore";
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
  PartyMode,
  ItemUsageStrategy,
  WeaponUpgradeStrategy,
  StrategyPreset,
  BatchResult,
} from "../../types/batch";
import type { GameEvent } from "../../types/events";
import type { PartySetupChoice } from "../../engine/gameState";
import { generateSeed } from "../../utils/ids";
import { getGoldCoinImage } from "../../assets/assetRegistry";
import { Tooltip } from "../ui/Tooltip";
import {
  formatLogSummaryWithNames,
  buildNameMapFromPartyChoices,
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

const GOLD_COIN_URL = getGoldCoinImage() ?? "";
const GOLD_COIN = (
  <img src={GOLD_COIN_URL} alt="g" className="inline-block w-3 h-3 align-text-bottom" />
);

function renderSummaryWithGold(summary: string) {
  const parts = summary.split(/(\d+g\b)/g);
  return parts.map((part, i) => {
    if (/^\d+g$/.test(part)) {
      const num = part.slice(0, -1);
      return (
        <span key={i} className="inline-flex items-center gap-0.5">
          {num}{GOLD_COIN}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  GAME_STARTED: "text-spire-muted",
  SEED_SET: "text-spire-muted",
  PARTY_CREATED: "text-spire-accent",
  ROOM_REVEALED: "text-spire-muted",
  SPLIT_CHOICE: "text-blue-400",
  MERCHANT_ENTERED: "text-amber-400",
  ITEM_BOUGHT: "text-amber-300",
  ITEM_SOLD: "text-amber-300/70",
  REST_CHOICE: "text-green-400",
  COMBAT_STARTED: "text-red-400",
  MONSTER_REVEALED: "text-red-300",
  ENVIRONMENT_REVEALED: "text-cyan-400",
  APC_ASSIGNED: "text-purple-400",
  TURN_STARTED: "text-spire-muted/70",
  CARD_FLIPPED: "text-spire-muted/60",
  MATCH_DETECTED: "text-blue-300",
  ABILITY_TRIGGERED: "text-purple-300",
  DICE_ROLLED: "text-blue-300",
  AI_DECISION: "text-spire-muted/50",
  DAMAGE_CALCULATED: "text-orange-400/70",
  DAMAGE_APPLIED: "text-orange-400",
  HEAL_APPLIED: "text-green-300",
  TOKEN_ADDED: "text-yellow-400",
  TOKEN_REMOVED: "text-yellow-400/70",
  STATUS_ADDED: "text-pink-400",
  STATUS_REMOVED: "text-pink-400/70",
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
  RULE_AMBIGUITY: "text-spire-muted/50",
  MANUAL_OVERRIDE: "text-spire-muted/50",
  STATE_VALIDATION_WARNING: "text-spire-muted/50",
};

function normalizeShieldKey(s: string): string {
  return s.replace(/ x\d+\.?$/, "").replace(/\.$/, "");
}

const SHIELD_RESET_TYPES = new Set(["TURN_STARTED", "COMBAT_STARTED", "COMBAT_ENDED"]);

function consolidateShieldEvents(events: GameEvent[]): GameEvent[] {
  const result: GameEvent[] = [];
  const shieldIdx = new Map<string, number>();

  for (const e of events) {
    if (SHIELD_RESET_TYPES.has(e.type)) {
      shieldIdx.clear();
      result.push(e);
      continue;
    }

    if (e.type === "TOKEN_ADDED" && /shield|🔵/.test(e.summary)) {
      const key = normalizeShieldKey(e.summary);
      const existing = shieldIdx.get(key);
      if (existing !== undefined) {
        const prev = result[existing];
        const count = (prev.details?.__shieldCount as number ?? 1) + 1;
        result[existing] = {
          ...prev,
          summary: key + ` x${count}.`,
          details: { ...prev.details, __shieldCount: count },
        };
        continue;
      }
      result.push(e);
      shieldIdx.set(key, result.length - 1);
    } else {
      result.push(e);
    }
  }
  return result;
}

function renderBeautifiedLog(event: GameEvent, nameMap?: Map<string, NameEntry>) {
  const colorClass = EVENT_TYPE_COLORS[event.type] ?? "text-spire-white";
  const summary = event.summary;

  // Split on Vyridian name for special styling (Apexus kept for legacy logs)
  const apexusParts = summary.split(/((?:Vyridian|Apexus)[^,\s.]*)/g);

  return (
    <>
      <span className="text-spire-muted/50 text-[10px] tabular-nums">#{event.sequence}</span>{" "}
      <span className={colorClass}>
        {apexusParts.map((part, i) => {
          if (/^(?:Vyridian|Apexus)/.test(part)) {
            return (
              <span
                key={i}
                className="text-fuchsia-400 font-semibold"
                style={{ textShadow: "0 0 6px rgba(232,121,249,0.6)" }}
              >
                {part}
              </span>
            );
          }
          if (nameMap) {
            return <span key={i}>{formatLogSummaryWithNames(part, nameMap)}</span>;
          }
          return <span key={i}>{renderSummaryWithGold(part)}</span>;
        })}
      </span>
    </>
  );
}

type KeyEventRarity = "legendary" | "epic" | "rare" | "uncommon" | "common";

const RARITY_STYLES: Record<KeyEventRarity, { border: string; bg: string; text: string; glow: string }> = {
  legendary: { border: "border-amber-400/60", bg: "bg-amber-400/10", text: "text-amber-300", glow: "shadow-[0_0_8px_rgba(251,191,36,0.3)]" },
  epic: { border: "border-fuchsia-400/50", bg: "bg-fuchsia-400/10", text: "text-fuchsia-300", glow: "shadow-[0_0_6px_rgba(232,121,249,0.25)]" },
  rare: { border: "border-blue-400/50", bg: "bg-blue-400/10", text: "text-blue-300", glow: "" },
  uncommon: { border: "border-green-400/40", bg: "bg-green-400/10", text: "text-green-300", glow: "" },
  common: { border: "border-spire-border/30", bg: "bg-spire-bg/60", text: "text-spire-muted", glow: "" },
};

const KEY_EVENT_ICONS: Record<string, { icon: string; label: string; rarity: KeyEventRarity }> = {
  VICTORY: { icon: "🏆", label: "Victory", rarity: "legendary" },
  DEFEAT: { icon: "☠️", label: "Defeat", rarity: "legendary" },
  FINAL_BOSS_STARTED: { icon: "👑", label: "Final Boss Battle", rarity: "epic" },
  HERO_DIED: { icon: "💀", label: "Hero Death", rarity: "epic" },
  HERO_REVIVED: { icon: "✨", label: "Hero Revival", rarity: "rare" },
  MONSTER_DEFEATED: { icon: "⚔️", label: "Monster Defeated", rarity: "uncommon" },
  TIER_ADVANCED: { icon: "🔼", label: "Tier Advanced", rarity: "rare" },
  COMBAT_ENDED: { icon: "🗡️", label: "Combat Ended", rarity: "common" },
  ABILITY_TRIGGERED: { icon: "⚡", label: "Notable Ability", rarity: "rare" },
  REWARD_GRANTED: { icon: "🎁", label: "Rare Reward", rarity: "rare" },
  ITEM_BOUGHT: { icon: "🛒", label: "Notable Purchase", rarity: "uncommon" },
  DAMAGE_APPLIED: { icon: "💥", label: "Big Damage", rarity: "uncommon" },
  HEAL_APPLIED: { icon: "💚", label: "Critical Heal", rarity: "uncommon" },
  ITEM_USED: { icon: "🧪", label: "Item Used", rarity: "uncommon" },
  MATCH_DETECTED: { icon: "🃏", label: "Card Match", rarity: "common" },
  DICE_ROLLED: { icon: "🎲", label: "Dice Rolled", rarity: "common" },
  STATUS_ADDED: { icon: "🔴", label: "Status Applied", rarity: "uncommon" },
  MERCHANT_ENTERED: { icon: "🏪", label: "Merchant Visited", rarity: "common" },
  SPLIT_CHOICE: { icon: "🚪", label: "Path Chosen", rarity: "common" },
  REST_CHOICE: { icon: "🏕️", label: "Rest Taken", rarity: "common" },
};

const KEY_EVENT_PRIORITY: Record<string, number> = {
  VICTORY: 100,
  DEFEAT: 95,
  FINAL_BOSS_STARTED: 90,
  HERO_DIED: 80,
  HERO_REVIVED: 70,
  TIER_ADVANCED: 60,
  MONSTER_DEFEATED: 55,
  ABILITY_TRIGGERED: 45,
  REWARD_GRANTED: 40,
  COMBAT_ENDED: 35,
  ITEM_BOUGHT: 30,
  DAMAGE_APPLIED: 25,
  HEAL_APPLIED: 20,
  ITEM_USED: 18,
  STATUS_ADDED: 15,
  MATCH_DETECTED: 12,
  DICE_ROLLED: 10,
  MERCHANT_ENTERED: 8,
  SPLIT_CHOICE: 6,
  REST_CHOICE: 5,
};

function getEventRarity(e: GameEvent): KeyEventRarity {
  const meta = KEY_EVENT_ICONS[e.type];
  if (meta) return meta.rarity;

  // Rarity based on summary content for filtered events
  const s = e.summary.toLowerCase();

  // Legendary: Vyridian, reality break, black hole (apexus kept for legacy logs)
  if (/vyridian|apexus|reality break|black hole/i.test(e.summary)) return "legendary";
  // Epic: legendary items, chain match x4+, massive damage
  if (/legendary/i.test(e.summary)) return "epic";
  if (e.type === "DAMAGE_APPLIED") {
    const dmg = e.details?.damage as number | undefined;
    if (dmg && dmg >= 25) return "epic";
    if (dmg && dmg >= 15) return "rare";
  }
  if (/chain match x[4-9]/i.test(e.summary)) return "epic";
  // Rare: epic items, critical hits, big heals
  if (/epic|critical|double damage/i.test(e.summary)) return "rare";
  if (e.type === "HEAL_APPLIED") {
    const heal = e.details?.heal as number | undefined;
    if (heal && heal >= 15) return "rare";
  }
  // Uncommon: rare items, upgrades, enchants
  if (/rare|upgrade|enchanted|thunderstrike|longshot|fyrizul/i.test(e.summary)) return "uncommon";
  if (/chain match x3/i.test(e.summary)) return "uncommon";

  return "common";
}

function extractKeyEvents(events: GameEvent[]): GameEvent[] {
  const keyEvents: GameEvent[] = [];

  for (const e of events) {
    if (KEY_EVENT_ICONS[e.type]) {
      keyEvents.push(e);
      continue;
    }
    // Rare weapon acquisitions
    if (e.type === "REWARD_GRANTED" && /weapon|rare|epic|legendary/i.test(e.summary)) {
      keyEvents.push(e);
      continue;
    }
    // Notable ability triggers
    if (e.type === "ABILITY_TRIGGERED") {
      const s = e.summary.toLowerCase();
      if (
        /critical|double damage| AoE|black hole|reality break|phase|vyridian|apexus|stole|treasure|chain match x[3-9]/i.test(e.summary) ||
        s.includes("thunderstrike") ||
        s.includes("longshot") ||
        s.includes("fyrizul")
      ) {
        keyEvents.push(e);
        continue;
      }
    }
    // Notable merchant purchases
    if (e.type === "ITEM_BOUGHT" && /upgrade|enchanted|rare|legendary|epic/i.test(e.summary)) {
      keyEvents.push(e);
      continue;
    }
    // Big damage
    if (e.type === "DAMAGE_APPLIED") {
      const dmg = e.details?.damage as number | undefined;
      if (dmg && dmg >= 10) {
        keyEvents.push(e);
      }
    }
    // Notable heals
    if (e.type === "HEAL_APPLIED") {
      const heal = e.details?.heal as number | undefined;
      if (heal && heal >= 10) {
        keyEvents.push(e);
      }
    }
    // Item usage in combat
    if (e.type === "ITEM_USED" && /bomb|potion|scroll|crystal/i.test(e.summary)) {
      keyEvents.push(e);
    }
    // Chain matches x3+
    if (e.type === "MATCH_DETECTED" && /chain match x[3-9]/i.test(e.summary)) {
      keyEvents.push(e);
    }
    // Status effects on heroes
    if (e.type === "STATUS_ADDED" && /poison|burn|stun|freeze|curse/i.test(e.summary)) {
      keyEvents.push(e);
    }
  }

  // Sort by priority (descending), then take top 3
  keyEvents.sort((a, b) => (KEY_EVENT_PRIORITY[b.type] ?? 0) - (KEY_EVENT_PRIORITY[a.type] ?? 0));
  return keyEvents.slice(0, 3);
}

const COMBAT_STRATEGIES: { value: CombatStrategy; label: string; desc: string; icon: string }[] = [
  { value: "aggressive", label: "Aggressive", desc: "Always attack, use damage items", icon: "⚔️" },
  { value: "defensive", label: "Defensive", desc: "Attack, heal at <50% HP", icon: "🛡️" },
  { value: "balanced", label: "Balanced", desc: "Attack, heal at <30% HP", icon: "⚖️" },
  { value: "survivalist", label: "Survivalist", desc: "Heal at <40%, skip if <20%", icon: "🏃" },
  { value: "random-legal", label: "Random Legal", desc: "Random actions", icon: "🎲" },
];

const MERCHANT_STRATEGIES: { value: MerchantStrategy; label: string; desc: string; icon: string }[] = [
  { value: "skip", label: "Skip", desc: "Leave immediately", icon: "🚪" },
  { value: "heal-items", label: "Heal Items", desc: "Buy potions for hurt heroes", icon: "🧪" },
  { value: "upgrades", label: "Upgrades", desc: "Buy HP upgrades", icon: "⬆️" },
  { value: "balanced", label: "Balanced", desc: "Potions + upgrades", icon: "⚖️" },
];

const REST_STRATEGIES: { value: RestStrategy; label: string; desc: string; icon: string }[] = [
  { value: "full-heal", label: "Full Heal", desc: "Heal all to max", icon: "💚" },
  { value: "revive", label: "Revive", desc: "Revive dead, else heal", icon: "✨" },
  { value: "gold", label: "Gold", desc: "Roll for gold", icon: "💰" },
  { value: "max-hp", label: "Max HP", desc: "+2 max HP to all", icon: "⬆️" },
  { value: "smart", label: "Smart", desc: "Context-aware: revive, heal, max-HP, or gold", icon: "🧠" },
];

const ITEM_USAGE_STRATEGIES: { value: ItemUsageStrategy; label: string; desc: string; icon: string }[] = [
  { value: "never", label: "Never", desc: "Never use items in combat", icon: "🚫" },
  { value: "conservative", label: "Conservative", desc: "Use potions below 30% HP", icon: "🧪" },
  { value: "aggressive", label: "Aggressive", desc: "Use potions below 60% HP", icon: "⚗️" },
  { value: "always-if-hurt", label: "Always if Hurt", desc: "Use potions if below 90% HP", icon: "💉" },
];

const WEAPON_UPGRADE_STRATEGIES: { value: WeaponUpgradeStrategy; label: string; desc: string; icon: string }[] = [
  { value: "never", label: "Never", desc: "Skip weapon upgrades", icon: "🚫" },
  { value: "when-affordable", label: "When Affordable", desc: "Upgrade if gold > cost + 30g buffer", icon: "⚒️" },
  { value: "prioritize", label: "Prioritize", desc: "Upgrade weapons before other purchases", icon: "⚔️" },
];

const SPLIT_STRATEGIES: { value: SplitStrategy; label: string; desc: string; icon: string }[] = [
  { value: "combat", label: "Combat", desc: "Prefer combat/elite rooms", icon: "⚔️" },
  { value: "safe", label: "Safe", desc: "Prefer merchant/rest", icon: "🛡️" },
  { value: "random", label: "Random", desc: "Random choice", icon: "🎲" },
];

interface Props {
  onBack: () => void;
}

function MobileWarningBanner() {
  const { isMobile } = useIsMobile();
  if (!isMobile) return null;
  return (
    <div className="glass-card p-3 border border-amber-400/30 bg-amber-500/5 rounded-lg flex items-start gap-2.5">
      <span className="text-lg flex-shrink-0">⚠️</span>
      <div className="text-xs text-amber-200/80 leading-relaxed">
        <span className="font-medium">Mobile notice:</span> Batch Simulation is optimized for larger screens. Tables and detailed logs may require horizontal scrolling. For the best experience, use a desktop or tablet.
      </div>
    </div>
  );
}

export function BatchSimulationScreen({ onBack }: Props) {
  const {
    config,
    result,
    isRunning,
    progress,
    currentRunLog,
    currentRunSummary,
    setConfig,
    startBatch,
    resetBatch,
    doDownloadJSON,
    doDownloadCSV,
  } = useBatchStore();

  const { playSfx } = useAudio();
  const { isMobile } = useIsMobile();

  const [partyMode, setPartyMode] = useState<PartyMode>(config.partyMode);
  const [selections, setSelections] = useState<(HeroClassName | null)[]>([null, null, null]);
  const [suits, setSuits] = useState<(Suit | null)[]>([null, null, null]);

  const hasDuplicates = selections.filter((s, i) => s !== null && selections.indexOf(s) !== i).length > 0;
  const partyValid = selections.every((s) => s !== null) && suits.every((s) => s !== null) && !hasDuplicates;

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
    startBatch();
  };

  if (isRunning) {
    const runNameMap = config.partyChoices
      ? buildNameMapFromPartyChoices(config.partyChoices)
      : buildNameMapFromComposition(
          ALL_CLASSES.map((cls) => ({ className: cls, specialization: getSpecialization(cls, "clubs") }))
        );
    return (
      <RunningView
        progress={progress}
        currentRunLog={currentRunLog}
        currentRunSummary={currentRunSummary}
        nameMap={runNameMap}
      />
    );
  }

  if (result) {
    return (
      <ResultsView
        result={result}
        onBack={onBack}
        onDownloadJSON={doDownloadJSON}
        onDownloadCSV={doDownloadCSV}
        onRunAnother={() => {
          playSfx("ui", "button_click");
          resetBatch();
        }}
      />
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* Mobile warning banner */}
      <MobileWarningBanner />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl sm:text-3xl font-display gold-text">Batch Simulation</h2>
          <p className="text-spire-muted text-sm mt-1">Run multiple automated games and collect detailed logs</p>
        </div>
        <button className="btn-ghost text-sm px-4 py-2" onClick={() => { playSfx("ui", "button_click"); onBack(); }}>
          ← Back
        </button>
      </div>

      {/* Run Settings */}
      <div className="glass-card p-5 space-y-4 relative z-10">
        <h3 className="section-heading flex items-center gap-1.5">
          Run Settings
          <Tooltip
            content={<span className="text-xs text-spire-muted">Configure how many games to run, the difficulty level, and the random seed for reproducibility.</span>}
            side="top"
          >
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-spire-border/40 text-[10px] text-spire-muted cursor-help">?</span>
          </Tooltip>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-spire-muted mb-1.5">Number of Runs</label>
            <input
              type="number"
              className="input w-full"
              min={1}
              max={1000}
              value={config.runs}
              onChange={(e) => setConfig({ runs: Math.max(1, Math.min(1000, parseInt(e.target.value) || 1)) })}
            />
          </div>
          <div>
            <label className="block text-sm text-spire-muted mb-1.5">Difficulty</label>
            <DifficultyDropdown
              value={config.difficulty}
              onChange={(v) => setConfig({ difficulty: v as Difficulty })}
            />
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
      </div>

      {/* Party Configuration */}
      <div className="glass-card p-5 space-y-5">
        <h3 className="section-heading flex items-center gap-1.5">
          Party Configuration
          <Tooltip
            content={<span className="text-xs text-spire-muted">Choose whether each run uses a random party or a fixed lineup you specify. Fixed parties let you test specific compositions.</span>}
            side="top"
          >
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-spire-border/40 text-[10px] text-spire-muted cursor-help">?</span>
          </Tooltip>
        </h3>

        {/* Mode toggle — large cards */}
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
            <span className="text-xs text-spire-muted text-center">Each run gets a random party composition</span>
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
            <span className="text-xs text-spire-muted text-center">Use the same hero lineup for every run</span>
          </button>
        </div>

        {/* Fixed party editor */}
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

      {/* AI Strategies */}
      <div className="glass-card p-5 space-y-4 relative z-10">
        <h3 className="section-heading flex items-center gap-1.5">
          AI Strategies
          <Tooltip
            content={<span className="text-xs text-spire-muted">Define how the AI plays each run — combat tactics, merchant purchases, rest decisions, path choices, item usage, and weapon upgrades.</span>}
            side="top"
          >
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-spire-border/40 text-[10px] text-spire-muted cursor-help">?</span>
          </Tooltip>
        </h3>
        <PresetBar
          config={config}
          onApply={(preset) => setConfig({
            combatStrategy: preset.combatStrategy,
            merchantStrategy: preset.merchantStrategy,
            restStrategy: preset.restStrategy,
            splitStrategy: preset.splitStrategy,
            itemUsageStrategy: preset.itemUsageStrategy,
            weaponUpgradeStrategy: preset.weaponUpgradeStrategy,
          })}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StrategySelector
            label="Combat Strategy"
            value={config.combatStrategy}
            options={COMBAT_STRATEGIES}
            onChange={(v) => setConfig({ combatStrategy: v as CombatStrategy })}
            tooltip="Determines how AI heroes behave during combat turns — when to attack, heal, or use items."
          />
          <StrategySelector
            label="Merchant Strategy"
            value={config.merchantStrategy}
            options={MERCHANT_STRATEGIES}
            onChange={(v) => setConfig({ merchantStrategy: v as MerchantStrategy })}
            tooltip="Controls what the AI buys when visiting a merchant — potions, upgrades, or both."
          />
          <StrategySelector
            label="Rest Strategy"
            value={config.restStrategy}
            options={REST_STRATEGIES}
            onChange={(v) => setConfig({ restStrategy: v as RestStrategy })}
            tooltip="Decides what action to take at rest rooms — heal, revive, gather gold, or boost max HP."
          />
          <StrategySelector
            label="Split Strategy"
            value={config.splitStrategy}
            options={SPLIT_STRATEGIES}
            onChange={(v) => setConfig({ splitStrategy: v as SplitStrategy })}
            tooltip="Chooses which path to take at split rooms — combat for rewards, or safe for recovery."
          />
          <StrategySelector
            label="Item Usage"
            value={config.itemUsageStrategy}
            options={ITEM_USAGE_STRATEGIES}
            onChange={(v) => setConfig({ itemUsageStrategy: v as ItemUsageStrategy })}
            tooltip="Controls when AI heroes use potions in combat — from never to always when slightly hurt."
          />
          <StrategySelector
            label="Weapon Upgrades"
            value={config.weaponUpgradeStrategy}
            options={WEAPON_UPGRADE_STRATEGIES}
            onChange={(v) => setConfig({ weaponUpgradeStrategy: v as WeaponUpgradeStrategy })}
            tooltip="Whether the AI upgrades weapons at the merchant — never, when affordable, or as a priority."
          />
        </div>
      </div>

      {/* Start Button */}
      <div className="flex justify-center pb-4">
        <button
          className="btn-gold text-lg px-8 py-3"
          disabled={partyMode === "fixed" && !partyValid}
          onClick={handleStart}
        >
          {partyMode === "fixed" && !partyValid ? "Select all heroes" : `▶️ Run ${config.runs} Simulation${config.runs > 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}

const BUILT_IN_PRESETS: StrategyPreset[] = [
  { name: "Speedrunner", icon: "⚡", combatStrategy: "aggressive", merchantStrategy: "skip", restStrategy: "gold", splitStrategy: "combat", itemUsageStrategy: "aggressive", weaponUpgradeStrategy: "prioritize", builtIn: true },
  { name: "Survivor", icon: "🛡️", combatStrategy: "defensive", merchantStrategy: "heal-items", restStrategy: "smart", splitStrategy: "safe", itemUsageStrategy: "conservative", weaponUpgradeStrategy: "when-affordable", builtIn: true },
  { name: "Greedy", icon: "💰", combatStrategy: "aggressive", merchantStrategy: "balanced", restStrategy: "gold", splitStrategy: "combat", itemUsageStrategy: "aggressive", weaponUpgradeStrategy: "when-affordable", builtIn: true },
  { name: "Balanced", icon: "⚖️", combatStrategy: "balanced", merchantStrategy: "balanced", restStrategy: "smart", splitStrategy: "combat", itemUsageStrategy: "conservative", weaponUpgradeStrategy: "when-affordable", builtIn: true },
  { name: "Tank", icon: "🏋️", combatStrategy: "survivalist", merchantStrategy: "upgrades", restStrategy: "full-heal", splitStrategy: "safe", itemUsageStrategy: "always-if-hurt", weaponUpgradeStrategy: "never", builtIn: true },
];

const CUSTOM_PRESETS_KEY = "batch-sim-custom-presets";

function loadCustomPresets(): StrategyPreset[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p: unknown) => p && typeof p === "object" && "name" in p);
  } catch {
    return [];
  }
}

function saveCustomPresets(presets: StrategyPreset[]) {
  try {
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets));
  } catch {
    // ignore
  }
}

function presetsMatch(p: StrategyPreset, config: { combatStrategy: CombatStrategy; merchantStrategy: MerchantStrategy; restStrategy: RestStrategy; splitStrategy: SplitStrategy; itemUsageStrategy: ItemUsageStrategy; weaponUpgradeStrategy: WeaponUpgradeStrategy }): boolean {
  return p.combatStrategy === config.combatStrategy
    && p.merchantStrategy === config.merchantStrategy
    && p.restStrategy === config.restStrategy
    && p.splitStrategy === config.splitStrategy
    && p.itemUsageStrategy === config.itemUsageStrategy
    && p.weaponUpgradeStrategy === config.weaponUpgradeStrategy;
}

const DIFFICULTY_OPTIONS: { value: Difficulty; label: string; desc: string; icon: string; color: string }[] = [
  { value: "easy", label: "Easy", desc: "Forgiving enemies, more gold", icon: "🌱", color: "text-green-400" },
  { value: "normal", label: "Normal", desc: "Balanced challenge", icon: "⚔️", color: "text-spire-white" },
  { value: "hard", label: "Hard", desc: "Permanent death, tougher foes", icon: "🔥", color: "text-orange-400" },
  { value: "nightmare", label: "Nightmare", desc: "Brutal difficulty", icon: "💀", color: "text-red-400" },
];

function DifficultyDropdown({
  value,
  onChange,
}: {
  value: Difficulty;
  onChange: (v: Difficulty) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = DIFFICULTY_OPTIONS.find((o) => o.value === value);

  return (
    <div className="relative">
      <button
        type="button"
        className="input w-full flex items-center justify-between gap-2 cursor-pointer text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-center gap-2 truncate">
          {selected && <span className="text-base">{selected.icon}</span>}
          <span className={`text-sm font-medium ${selected?.color ?? "text-spire-white"}`}>{selected?.label}</span>
          <span className="text-spire-muted/60 text-xs truncate hidden sm:inline">{selected?.desc}</span>
        </span>
        <span className={`text-spire-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-[100] min-w-[260px] glass-panel rounded-lg border border-spire-border/60 shadow-panel overflow-hidden max-h-72 overflow-y-auto">
            {DIFFICULTY_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors duration-150 ${
                  o.value === value
                    ? "bg-spire-accent/15 text-spire-white"
                    : "hover:bg-spire-border/20 text-spire-muted"
                }`}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                <span className="text-base mt-0.5">{o.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${o.value === value ? o.color : "text-spire-muted"}`}>{o.label}</div>
                  <div className="text-xs text-spire-muted/60 truncate">{o.desc}</div>
                </div>
                {o.value === value && <span className="text-spire-accent text-xs mt-1">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PresetBar({
  config,
  onApply,
}: {
  config: { combatStrategy: CombatStrategy; merchantStrategy: MerchantStrategy; restStrategy: RestStrategy; splitStrategy: SplitStrategy; itemUsageStrategy: ItemUsageStrategy; weaponUpgradeStrategy: WeaponUpgradeStrategy };
  onApply: (preset: StrategyPreset) => void;
}) {
  const { playSfx } = useAudio();
  const [customPresets, setCustomPresets] = useState<StrategyPreset[]>(() => loadCustomPresets());
  const [showCustom, setShowCustom] = useState(false);
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [presetName, setPresetName] = useState("");

  const allPresets = [...BUILT_IN_PRESETS, ...customPresets];
  const activePreset = allPresets.find((p) => presetsMatch(p, config));

  const handleApply = (preset: StrategyPreset) => {
    playSfx("ui", "button_click");
    onApply(preset);
  };

  const handleSave = () => {
    const name = presetName.trim();
    if (!name) return;
    const newPreset: StrategyPreset = {
      name,
      icon: "⭐",
      combatStrategy: config.combatStrategy,
      merchantStrategy: config.merchantStrategy,
      restStrategy: config.restStrategy,
      splitStrategy: config.splitStrategy,
      itemUsageStrategy: config.itemUsageStrategy,
      weaponUpgradeStrategy: config.weaponUpgradeStrategy,
    };
    const updated = [...customPresets.filter((p) => p.name !== name), newPreset];
    setCustomPresets(updated);
    saveCustomPresets(updated);
    setPresetName("");
    setShowSavePrompt(false);
    playSfx("ui", "button_click");
  };

  const handleDelete = (name: string) => {
    const updated = customPresets.filter((p) => p.name !== name);
    setCustomPresets(updated);
    saveCustomPresets(updated);
    playSfx("ui", "button_click");
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-spire-muted uppercase tracking-wide mr-1">Presets:</span>
        {BUILT_IN_PRESETS.map((p) => (
          <button
            key={p.name}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 ${
              activePreset?.name === p.name && activePreset.builtIn
                ? "border-spire-accent bg-spire-accent/15 text-spire-white shadow-glow"
                : "border-spire-border/40 text-spire-muted hover:border-spire-muted/60 hover:bg-spire-border/10"
            }`}
            onClick={() => handleApply(p)}
          >
            <span className="text-sm">{p.icon}</span>
            {p.name}
          </button>
        ))}

        {customPresets.length > 0 && (
          <div className="relative">
            <button
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 ${
                showCustom ? "border-spire-accent bg-spire-accent/15 text-spire-white" : "border-spire-border/40 text-spire-muted hover:border-spire-muted/60 hover:bg-spire-border/10"
              }`}
              onClick={() => setShowCustom((s) => !s)}
            >
              <span className="text-sm">⭐</span>
              Custom
              <span className={`transition-transform duration-200 ${showCustom ? "rotate-180" : ""}`}>▾</span>
            </button>
            {showCustom && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowCustom(false)} />
                <div className="absolute top-full left-0 mt-1 z-[100] glass-panel rounded-lg border border-spire-border/60 shadow-panel overflow-hidden min-w-[200px]">
                  {customPresets.map((p) => (
                    <div
                      key={p.name}
                      className={`flex items-center gap-2 px-3 py-2.5 transition-colors duration-150 group ${
                        activePreset?.name === p.name ? "bg-spire-accent/15" : "hover:bg-spire-border/20"
                      }`}
                    >
                      <button
                        className="flex items-center gap-2 flex-1 text-left"
                        onClick={() => { handleApply(p); setShowCustom(false); }}
                      >
                        <span className="text-sm">{p.icon}</span>
                        <span className={`text-sm font-medium ${activePreset?.name === p.name ? "text-spire-white" : "text-spire-muted"}`}>{p.name}</span>
                      </button>
                      <button
                        className="text-spire-muted/40 hover:text-red-400 transition-colors text-xs"
                        onClick={() => handleDelete(p.name)}
                        title="Delete preset"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div className="ml-auto">
          {showSavePrompt ? (
            <div className="flex items-center gap-2">
              <input
                className="input text-xs px-2 py-1 w-36"
                placeholder="Preset name..."
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setShowSavePrompt(false); }}
                autoFocus
              />
              <button className="btn-gold text-xs px-2 py-1" onClick={handleSave}>Save</button>
              <button className="btn-ghost text-xs px-2 py-1" onClick={() => setShowSavePrompt(false)}>Cancel</button>
            </div>
          ) : (
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-spire-border/40 text-spire-muted hover:border-spire-muted/60 hover:bg-spire-border/10 transition-all duration-200"
              onClick={() => { setShowSavePrompt(true); playSfx("ui", "button_click"); }}
            >
              <span className="text-sm">💾</span>
              Save Current
            </button>
          )}
        </div>
      </div>

      {activePreset && (
        <div className="text-xs text-spire-muted/60">
          Active: <span className="text-spire-accent">{activePreset.icon} {activePreset.name}</span>
        </div>
      )}
    </div>
  );
}

function StrategySelector<T extends string>({
  label,
  value,
  options,
  onChange,
  tooltip,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; desc: string; icon: string }[];
  onChange: (v: T) => void;
  tooltip?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <div className="relative">
      <label className="block text-sm text-spire-muted mb-1.5 flex items-center gap-1.5">
        {label}
        {tooltip && (
          <Tooltip
            content={<span className="text-xs text-spire-muted">{tooltip}</span>}
            side="top"
          >
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-spire-border/40 text-[10px] text-spire-muted cursor-help">?</span>
          </Tooltip>
        )}
      </label>
      <button
        type="button"
        className="input w-full flex items-center justify-between gap-2 cursor-pointer text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-center gap-2 truncate">
          {selected && <span className="text-base">{selected.icon}</span>}
          <span className="text-spire-white text-sm font-medium">{selected?.label}</span>
          <span className="text-spire-muted/60 text-xs truncate hidden sm:inline">{selected?.desc}</span>
        </span>
        <span className={`text-spire-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-[100] min-w-[260px] glass-panel rounded-lg border border-spire-border/60 shadow-panel overflow-hidden max-h-72 overflow-y-auto">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors duration-150 ${
                  o.value === value
                    ? "bg-spire-accent/15 text-spire-white"
                    : "hover:bg-spire-border/20 text-spire-muted"
                }`}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                <span className="text-base mt-0.5">{o.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${o.value === value ? "text-spire-white" : "text-spire-muted"}`}>{o.label}</div>
                  <div className="text-xs text-spire-muted/60 truncate">{o.desc}</div>
                </div>
                {o.value === value && <span className="text-spire-accent text-xs mt-1">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function RunningView({
  progress,
  currentRunLog,
  currentRunSummary,
  nameMap,
}: {
  progress: { completed: number; total: number };
  currentRunLog: GameEvent[];
  currentRunSummary: string;
  nameMap: Map<string, NameEntry>;
}) {
  const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-display gold-text">Running Batch Simulation...</h2>
        <p className="text-spire-muted text-sm">Running games headlessly. This may take a moment.</p>
      </div>

      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-spire-white font-medium">Progress</span>
          <span className="text-spire-gold">{progress.completed} / {progress.total} ({pct}%)</span>
        </div>
        <div className="h-3 bg-spire-bg rounded-full overflow-hidden border border-spire-border/40">
          <div
            className="h-full bg-gradient-to-r from-spire-accent to-teal-400 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="text-xs text-spire-muted">{currentRunSummary}</div>
      </div>

      <div className="glass-card p-5">
        <h3 className="section-heading mb-3">Current Run Log (last 15 events)</h3>
        <div className="max-h-64 overflow-y-auto space-y-1.5">
          {currentRunLog.length === 0 ? (
            <div className="text-xs text-spire-muted text-center py-4">Waiting for first run...</div>
          ) : (
            consolidateShieldEvents(currentRunLog).map((event) => (
              <div key={event.id} className="text-xs border-b border-spire-border/10 pb-0.5 leading-relaxed font-mono">
                {renderBeautifiedLog(event, nameMap)}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ResultsView({
  result,
  onBack,
  onDownloadJSON,
  onDownloadCSV,
  onRunAnother,
}: {
  result: BatchResult;
  onBack: () => void;
  onDownloadJSON: () => void;
  onDownloadCSV: () => void;
  onRunAnother: () => void;
}) {
  const { playSfx } = useAudio();
  const stats = result.aggregateStats;
  const [selectedRun, setSelectedRun] = useState<number | null>(null);
  const bestRunIndex = result.runs.reduce((best, r) => r.score.finalScore > best.score.finalScore ? r : best, result.runs[0]).runIndex;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-display gold-text">Batch Results</h2>
          <p className="text-spire-muted text-sm mt-1">
            {stats.totalRuns} runs · <span className={`${DIFFICULTY_OPTIONS.find(o => o.value === result.config.difficulty)?.color ?? "text-spire-muted"} font-medium`}>{result.config.difficulty}</span> · {result.config.combatStrategy}
          </p>
        </div>
      </div>

      {/* Aggregate Stats */}
      <div className="glass-card p-6">
        <h3 className="section-heading mb-4">Aggregate Statistics</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <StatBox label="Victory Rate" value={`${stats.victoryRate}%`} sub={`${stats.victories}W / ${stats.defeats}L`} />
          <StatBox label="Avg Score" value={stats.avgScore} sub={`Max: ${stats.maxScore}`} />
          <StatBox label="Avg Turns" value={stats.avgTurns} sub={`Min: ${stats.minScore}`} />
          <StatBox label="Avg Rooms" value={stats.avgRoomsCleared} sub={`Avg Heroes: ${stats.avgHeroesAlive}`} />
        </div>
      </div>

      {/* Score Distribution */}
      <div className="glass-card p-6">
        <h3 className="section-heading mb-4">Score Distribution</h3>
        <div className="flex gap-3">
          {/* Y-axis labels */}
          <div className="flex flex-col justify-between h-40 text-[10px] text-spire-muted/60 text-right pr-1">
            <span>{stats.totalRuns}</span>
            <span>{Math.round(stats.totalRuns * 0.75)}</span>
            <span>{Math.round(stats.totalRuns * 0.5)}</span>
            <span>{Math.round(stats.totalRuns * 0.25)}</span>
            <span>0</span>
          </div>
          {/* Bars */}
          <div className="flex-1 flex items-end justify-between gap-2 h-40 border-l border-b border-spire-border/30 pl-2 pb-0">
            {stats.scoreDistribution.map((d) => (
              <div key={d.range} className="flex-1 flex flex-col items-center gap-1 justify-end h-full">
                <div className="text-xs text-spire-gold font-medium">{d.count > 0 ? d.count : ""}</div>
                <div
                  className="w-full bg-gradient-to-t from-spire-accent/40 to-spire-accent rounded-t-md transition-all"
                  style={{ height: `${(d.count / Math.max(stats.totalRuns, 1)) * 100}%`, minHeight: d.count > 0 ? "4px" : "0" }}
                />
                <div className="text-[10px] text-spire-muted">{d.range}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Per-Run Table */}
      <div className="glass-card p-4 sm:p-5">
        <h3 className="section-heading mb-3">Per-Run Results</h3>
        <div className="max-h-80 overflow-y-auto overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="sticky top-0 bg-spire-bg/90 backdrop-blur-sm">
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
              {result.runs.map((run) => (
                <tr
                  key={run.runIndex}
                  className="border-b border-spire-border/20 hover:bg-spire-accent/5 cursor-pointer transition-colors"
                  onClick={() => {
                    playSfx("ui", "button_click");
                    setSelectedRun(selectedRun === run.runIndex ? null : run.runIndex);
                  }}
                >
                  <td className="py-2 px-2 text-spire-muted">
                    {run.runIndex === bestRunIndex && <span className="text-amber-400 mr-1">⭐</span>}
                    {run.runIndex + 1}
                  </td>
                  <td className="py-2 px-2 text-spire-muted text-xs">{run.seed}</td>
                  <td className="py-2 px-2" title={run.outcome === "defeat" && run.defeatedBy ? `Wiped to: ${run.defeatedBy}` : undefined}>
                    <span className={run.outcome === "victory" ? "text-spire-success" : "text-spire-danger"}>
                      {run.outcome === "victory" ? "🏆 Win" : "💀 Loss"}
                    </span>
                    {run.outcome === "defeat" && run.defeatedBy && (
                      <span className="block text-[10px] text-spire-muted/70 mt-0.5">vs {run.defeatedBy}</span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right text-spire-gold font-medium">{run.score.finalScore}</td>
                  <td className="py-2 px-2 text-right text-spire-white">{run.totalTurns}</td>
                  <td className="py-2 px-2 text-right text-spire-white">{run.roomsCleared}</td>
                  <td className="py-2 px-2 text-right text-spire-white">{run.heroesAlive}</td>
                  <td className="py-2 px-2 text-xs text-spire-muted">
                    {run.partyComposition.map(p => p.className).join(" + ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selectedRun !== null && (
          <CombatLogViewer
            events={result.runs[selectedRun].combatLog}
            runIndex={selectedRun}
            partyComposition={result.runs[selectedRun].partyComposition}
          />
        )}
      </div>

      {/* Download + Actions */}
      <div className="flex justify-center gap-4 pb-4">
        <button className="btn-primary" onClick={() => { playSfx("ui", "button_click"); onDownloadJSON(); }}>
          📥 Download JSON
        </button>
        <button className="btn-primary" onClick={() => { playSfx("ui", "button_click"); onDownloadCSV(); }}>
          📥 Download CSV
        </button>
        <button className="btn-gold" onClick={onRunAnother}>
          🔄 Run Another Batch
        </button>
      </div>
    </div>
  );
}

function CombatLogViewer({ events, runIndex, partyComposition }: {
  events: GameEvent[];
  runIndex: number;
  partyComposition: { className: HeroClassName; suit: Suit; specialization: string }[];
}) {
  const nameMap = useMemo(() => buildNameMapFromComposition(partyComposition), [partyComposition]);
  const consolidated = useMemo(() => consolidateShieldEvents(events), [events]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [visibleCount, setVisibleCount] = useState(Math.min(20, consolidated.length));
  const rafRef = useRef<number>(0);
  const autoScrollRef = useRef(true);
  const visibleCountRef = useRef(Math.min(20, consolidated.length));
  const eventsLenRef = useRef(consolidated.length);
  const revealTimerRef = useRef<number>(0);
  const keyEvents = useMemo(() => extractKeyEvents(consolidated), [consolidated]);

  // Sync refs when state changes
  useEffect(() => { autoScrollRef.current = autoScroll; }, [autoScroll]);
  useEffect(() => { visibleCountRef.current = visibleCount; }, [visibleCount]);
  useEffect(() => { eventsLenRef.current = consolidated.length; }, [consolidated.length]);

  // Reset when run changes
  useEffect(() => {
    setAutoScroll(true);
    autoScrollRef.current = true;
    setVisibleCount(Math.min(20, consolidated.length));
    visibleCountRef.current = Math.min(20, consolidated.length);
    revealTimerRef.current = 0;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [runIndex, consolidated.length]);

  // Single RAF loop — no deps that change frequently
  useEffect(() => {
    let lastTime = 0;

    const animate = (time: number) => {
      const el = scrollRef.current;
      if (!el) {
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      const dt = lastTime ? Math.min((time - lastTime) / 16.67, 3) : 1;
      lastTime = time;

      if (autoScrollRef.current) {
        const totalEvents = eventsLenRef.current;
        const currentVisible = visibleCountRef.current;
        const allRevealed = currentVisible >= totalEvents;
        const targetScroll = el.scrollHeight - el.clientHeight;
        const atBottom = el.scrollTop >= targetScroll - 1;

        if (!allRevealed && atBottom) {
          // At bottom with more to reveal — gradually reveal events
          revealTimerRef.current += dt * 16.67;
          if (revealTimerRef.current >= 400) {
            revealTimerRef.current = 0;
            const newCount = Math.min(currentVisible + 1, totalEvents);
            visibleCountRef.current = newCount;
            setVisibleCount(newCount);
          }
        } else if (!atBottom) {
          // Smoothly approach the bottom — lerp toward target
          const diff = targetScroll - el.scrollTop;
          if (Math.abs(diff) < 1) {
            el.scrollTop = targetScroll;
          } else {
            el.scrollTop += diff * 0.012 * dt;
          }
        }
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Break auto-scroll only on genuine user input
  const breakAutoScroll = useCallback(() => {
    if (autoScrollRef.current) {
      autoScrollRef.current = false;
      setAutoScroll(false);
    }
  }, []);

  const resumeAutoScroll = useCallback(() => {
    autoScrollRef.current = true;
    setAutoScroll(true);
    revealTimerRef.current = 0;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  return (
    <div className="mt-4 bg-spire-bg/40 rounded-lg p-4 border border-spire-border/30">
      {/* Key Events */}
      {keyEvents.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm text-spire-gold mb-2">⭐ Key Events</h4>
          <div className="flex flex-wrap gap-2">
            {keyEvents.map((e) => {
              const meta = KEY_EVENT_ICONS[e.type] ?? { icon: "📌", label: e.type, rarity: "common" as KeyEventRarity };
              const rarity = getEventRarity(e);
              const rs = RARITY_STYLES[rarity];
              return (
                <span
                  key={e.id}
                  className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded border ${rs.border} ${rs.bg} ${rs.text} ${rs.glow}`}
                >
                  <span className="text-sm">{meta.icon}</span>
                  <span>{formatLogSummaryWithNames(e.summary, nameMap)}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm text-spire-gold">
          Run {runIndex + 1} — Full Combat Log ({consolidated.length} events)
        </h4>
        <div className="flex items-center gap-2">
          {autoScroll ? (
            <span className="text-[10px] text-spire-accent animate-pulse">▶ auto-scrolling</span>
          ) : (
            <button
              className="text-[10px] text-spire-muted hover:text-spire-white border border-spire-border/40 rounded px-2 py-0.5"
              onClick={resumeAutoScroll}
            >
              ▶ Resume auto-scroll
            </button>
          )}
          <span className="text-[10px] text-spire-muted/60">scroll to break</span>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="max-h-60 overflow-y-auto space-y-0.5 font-mono"
        onWheel={breakAutoScroll}
        onTouchStart={breakAutoScroll}
        onKeyDown={breakAutoScroll}
        tabIndex={0}
      >
        {consolidated.slice(0, visibleCount).map((event) => (
          <div key={event.id} className="text-xs border-b border-spire-border/10 pb-0.5 leading-relaxed">
            {renderBeautifiedLog(event, nameMap)}
          </div>
        ))}
        {visibleCount < consolidated.length && (
          <div className="text-[10px] text-spire-muted/50 text-center py-1">
            ... {consolidated.length - visibleCount} more events
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="stat-box">
      <div className="text-2xl gold-text font-display">{value}</div>
      <div className="text-xs text-spire-muted mt-1">{label}</div>
      {sub && <div className="text-[10px] text-spire-muted/70 mt-0.5">{sub}</div>}
    </div>
  );
}
