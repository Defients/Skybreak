import React, { useState, useMemo, useRef, useEffect, useCallback, type ReactNode } from "react";
import { marked } from "marked";
import { RULES_INDEX, searchRules, RULE_KEYWORDS } from "../../data/rulesIndex";
import { useAudio } from "../../audio/useAudio";
import {
  getStarsImage,
  getWeaponImage,
  getItemImage,
  getEnchantIcon,
  getGoldCoinImage,
  getClassIcon,
  getMusicTrack,
  getSound,
} from "../../assets/assetRegistry";
import type { MusicTrackName, SfxCategory } from "../../assets/assetRegistry";
import { WEAPONS, WEAPON_RARITY_DATA } from "../../data/weapons";
import { ENCHANTMENTS, CHAOTIC_EFFECTS } from "../../data/enchantments";
import { ITEMS, PERMANENT_UPGRADES, HEALING_SERVICES, WEAPON_SERVICES } from "../../data/items";
import { STRATEGY_SECTIONS, BASIC_TIPS, type StrategyBlock } from "../../data/strategyGuide";
import { CLASS_TEXT_COLORS } from "../../utils/nameResolver";
import { formatAbilityText } from "../../utils/formatAbilityText";
import type { WeaponRarity } from "../../types/inventory";
import type { HeroClassName } from "../../types/heroes";
import gameRulesMarkdown from "../../../SkywardAscent-OfficialRules.md?raw";
import pcgRulesMarkdown from "../../../SkywardAscent-CardGame-Rules.md?raw";

interface Props {
  onBack: () => void;
  initialTab?: Tab;
}

type Tab = "gallery" | "armory" | "audio" | "rules" | "pcg" | "strategy";

// ============================================================
// Asset collection via import.meta.glob
// ============================================================

const allAssets = import.meta.glob("../../../assets/**/*", {
  eager: true,
  as: "url",
}) as Record<string, string>;

interface AssetEntry {
  url: string;
  filename: string;
  path: string;
}

function collectAssets(prefix: string): AssetEntry[] {
  return Object.entries(allAssets)
    .filter(([path]) => path.includes(prefix) && !path.endsWith(".mp3"))
    .map(([path, url]) => {
      const filename = path.split("/").pop() || path;
      return { url, filename, path };
    })
    .sort((a, b) => a.filename.localeCompare(b.filename));
}

const GALLERY_CATEGORIES: { label: string; icon: string; assets: AssetEntry[] }[] = [
  { label: "Heroes", icon: "🛡️", assets: collectAssets("hero_portraits") },
  { label: "Class Icons", icon: "🎖️", assets: collectAssets("/icons/").filter(a => !a.path.includes("/monsters/")) },
  { label: "Specializations", icon: "✨", assets: collectAssets("/specs/") },
  { label: "Monsters", icon: "👹", assets: collectAssets("/monsters/").filter(a => !a.path.includes("/icons/") && !a.path.includes("/specials/")) },
  { label: "Monster Icons", icon: "📐", assets: collectAssets("/monsters/icons/") },
  { label: "Monster Specials", icon: "⚡", assets: collectAssets("/monsters/specials/") },
  { label: "Weapons", icon: "⚔️", assets: collectAssets("/weapons/") },
  { label: "Items", icon: "🎒", assets: collectAssets("/items/") },
  { label: "Enchantments", icon: "🔮", assets: collectAssets("/enchants/") },
  { label: "Rooms", icon: "🚪", assets: collectAssets("/rooms/") },
  { label: "Effects", icon: "💥", assets: collectAssets("/effects/") },
  { label: "Backgrounds", icon: "🌌", assets: collectAssets("/backgrounds/") },
  { label: "Dice", icon: "🎲", assets: collectAssets("/dice/") },
  { label: "Misc", icon: "📦", assets: [
    ...collectAssets("skyward_ascent_logo"),
    ...collectAssets("card_back"),
    ...collectAssets("/door.png"),
    ...collectAssets("gold_coin"),
    ...collectAssets("shopkeeper.png"),
    ...collectAssets("/misc/"),
  ].filter((v, i, arr) => arr.findIndex(x => x.path === v.path) === i) },
];

// ============================================================
// Audio data
// ============================================================

const MUSIC_TRACKS: { name: MusicTrackName; label: string }[] = [
  { name: "title", label: "Title Theme" },
  { name: "tier1", label: "Tier 1 — Foundation" },
  { name: "tier2", label: "Tier 2 — Ascent" },
  { name: "tier3", label: "Tier 3 — Summit" },
  { name: "combat", label: "Combat Theme" },
  { name: "boss", label: "Boss Theme" },
  { name: "merchant", label: "Merchant Theme" },
  { name: "victory", label: "Victory Theme" },
  { name: "defeat", label: "Defeat Theme" },
];

const SFX_CATEGORIES: { category: SfxCategory; label: string; icon: string; files: string[] }[] = [
  {
    category: "combat",
    label: "Combat",
    icon: "⚔️",
    files: ["attack", "critical_hit", "dice_roll", "dodge", "heal", "hero_hit", "magic_attack", "monster_hit"],
  },
  {
    category: "results",
    label: "Results",
    icon: "🏆",
    files: ["defeat", "get_item", "gold_coins", "level_up", "level_up2", "victory"],
  },
  {
    category: "rooms",
    label: "Rooms",
    icon: "🚪",
    files: ["door_open", "heart_room_chime", "merchant_bell", "treasure_open"],
  },
  {
    category: "ui",
    label: "UI",
    icon: "🖱️",
    files: ["button_click", "card_flip", "menu_open", "notification", "transition"],
  },
];

// ============================================================
// Full rules HTML (pre-computed once)
// ============================================================

const rulesHtml = marked.parse(gameRulesMarkdown, { async: false }) as string;
const pcgRulesHtml = marked.parse(pcgRulesMarkdown, { async: false }) as string;

// ============================================================
// Sub-components
// ============================================================

function ImageCard({ entry }: { entry: AssetEntry }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className="group relative rounded-lg overflow-hidden border border-spire-border/40 bg-spire-bg/40 cursor-pointer transition-all duration-200 hover:border-spire-accent/40"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="aspect-square flex items-center justify-center p-2">
        <img
          src={entry.url}
          alt={entry.filename}
          className="max-w-full max-h-full object-contain"
          loading="lazy"
        />
      </div>
      <div className="px-2 py-1.5 text-center">
        <span className="text-[10px] text-spire-muted truncate block">{entry.filename}</span>
      </div>
      {expanded && (
        <div
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center animate-fade-in"
          onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
        >
          <div className="absolute inset-0 bg-black/95 backdrop-blur-md" />
          <div className="relative flex-1 w-full flex items-center justify-center p-4 min-h-0">
            <img
              src={entry.url}
              alt={entry.filename}
              className="w-full h-full object-contain"
            />
          </div>
          <div className="relative pb-4 z-10">
            <span className="text-sm text-spire-muted">{entry.filename}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function GallerySection({ label, icon, assets }: { label: string; icon: string; assets: AssetEntry[] }) {
  const [open, setOpen] = useState(true);
  if (assets.length === 0) return null;
  return (
    <div className="glass-card overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-spire-accent/5 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span className="flex items-center gap-2 text-sm font-medium text-spire-white">
          <span className="text-lg">{icon}</span>
          {label}
          <span className="text-xs text-spire-muted">({assets.length})</span>
        </span>
        <span className="text-spire-muted text-xs">{open ? "▼" : "▶"}</span>
      </button>
      {open && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 p-3">
          {assets.map((entry) => (
            <ImageCard key={entry.path} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function AudioTab() {
  const { volume } = useAudio();
  const [playingTrack, setPlayingTrack] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playingSfx, setPlayingSfx] = useState<string | null>(null);
  const sfxRef = useRef<HTMLAudioElement | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audio.loop = true;
    musicRef.current = audio;

    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => setDuration(audio.duration);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("durationchange", onMeta);

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("durationchange", onMeta);
      musicRef.current = null;
    };
  }, []);

  // Sync volume from AudioManager without recreating the audio element
  useEffect(() => {
    if (musicRef.current) {
      musicRef.current.volume = Math.min(1, volume * 1.4);
    }
  }, [volume]);

  const handlePlayMusic = useCallback((track: MusicTrackName) => {
    const audio = musicRef.current;
    if (!audio) return;
    if (playingTrack === track) {
      if (isPaused) {
        audio.play().catch(() => {});
        setIsPaused(false);
      } else {
        audio.pause();
        setIsPaused(true);
      }
    } else {
      const url = getMusicTrack(track);
      if (!url) return;
      audio.src = url;
      audio.currentTime = 0;
      setCurrentTime(0);
      audio.play().catch(() => {});
      setPlayingTrack(track);
      setIsPaused(false);
    }
  }, [playingTrack, isPaused]);

  const handleStopMusic = useCallback(() => {
    const audio = musicRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setPlayingTrack(null);
    setIsPaused(false);
    setCurrentTime(0);
  }, []);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = musicRef.current;
    if (!audio || !duration) return;
    const t = (parseFloat(e.target.value) / 100) * duration;
    audio.currentTime = t;
    setCurrentTime(t);
  }, [duration]);

  const handlePlaySfx = (category: SfxCategory, file: string) => {
    const key = `${category}/${file}`;
    if (playingSfx === key) {
      if (sfxRef.current) {
        sfxRef.current.pause();
        sfxRef.current = null;
      }
      setPlayingSfx(null);
      return;
    }
    if (sfxRef.current) {
      sfxRef.current.pause();
      sfxRef.current = null;
    }
    const url = getSound(category, file);
    if (!url) return;
    const audio = new Audio(url);
    audio.volume = Math.min(1, volume * 1.4);
    audio.play().catch(() => {});
    audio.addEventListener("ended", () => {
      sfxRef.current = null;
      setPlayingSfx(null);
    });
    sfxRef.current = audio;
    setPlayingSfx(key);
  };

  const currentTrackLabel = playingTrack ? MUSIC_TRACKS.find(t => t.name === playingTrack)?.label ?? playingTrack : null;
  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Music Playback Bar */}
      {playingTrack && (
        <div className="sticky top-0 z-20 glass-panel rounded-xl border border-spire-accent/30 px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 animate-fade-in">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center border border-spire-accent/40 text-spire-accent hover:bg-spire-accent/10 transition-all min-h-[36px]"
              onClick={() => handlePlayMusic(playingTrack as MusicTrackName)}
            >
              {isPaused ? "▶" : "⏸"}
            </button>
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="text-spire-accent text-sm animate-pulse">♪</span>
              <span className="text-spire-accent text-sm animate-pulse" style={{ animationDelay: "0.2s" }}>♪</span>
              <span className="text-spire-accent text-sm animate-pulse" style={{ animationDelay: "0.4s" }}>♪</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-spire-muted">Now Playing</div>
              <div className="text-sm font-medium text-spire-white truncate">{currentTrackLabel}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:flex-1 sm:max-w-xs">
            <span className="text-[10px] text-spire-muted tabular-nums flex-shrink-0">{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={progressPct}
              onChange={handleSeek}
              className="flex-1 h-1.5 accent-spire-accent cursor-pointer"
              style={{
                background: `linear-gradient(to right, rgba(34, 211, 238, 0.6) 0%, rgba(34, 211, 238, 0.6) ${progressPct}%, rgba(26, 26, 58, 0.6) ${progressPct}%, rgba(26, 26, 58, 0.6) 100%)`,
                borderRadius: "999px",
                appearance: "none",
                outline: "none",
              }}
            />
            <span className="text-[10px] text-spire-muted tabular-nums flex-shrink-0">{formatTime(duration)}</span>
          </div>
          <button
            className="flex-shrink-0 w-full sm:w-auto text-spire-danger hover:text-red-300 transition-colors text-sm px-3 py-1.5 rounded-lg border border-spire-danger/30 hover:bg-spire-danger/10 min-h-[32px]"
            onClick={handleStopMusic}
          >
            ⏹ Stop
          </button>
        </div>
      )}

      <div className="glass-card p-4 space-y-3">
        <h3 className="text-sm font-display gold-text flex items-center gap-2">🎵 Music Tracks</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {MUSIC_TRACKS.map((track) => (
            <div
              key={track.name}
              className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-spire-bg/40 border border-spire-border/30"
            >
              <span className="text-sm text-spire-white">{track.label}</span>
              <button
                className={`text-xs px-3 py-1.5 rounded-lg border transition-all min-h-[32px] ${
                  playingTrack === track.name
                    ? "border-spire-accent/40 text-spire-accent bg-spire-accent/10"
                    : "border-spire-accent/40 text-spire-accent hover:bg-spire-accent/10"
                }`}
                onClick={() => handlePlayMusic(track.name)}
              >
                {playingTrack === track.name ? (isPaused ? "▶ Resume" : "⏸ Pause") : "▶ Play"}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-display gold-text flex items-center gap-2">🔊 Sound Effects</h3>
        {SFX_CATEGORIES.map((cat) => (
          <div key={cat.category} className="glass-card p-4 space-y-2">
            <div className="text-xs uppercase tracking-wider text-spire-muted flex items-center gap-1.5">
              <span>{cat.icon}</span>
              {cat.label} <span className="text-spire-muted/60">({cat.files.length})</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {cat.files.map((file) => {
                const key = `${cat.category}/${file}`;
                const isPlaying = playingSfx === key;
                return (
                  <button
                    key={file}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-all min-h-[36px] ${
                      isPlaying
                        ? "border-spire-danger/40 text-spire-danger bg-spire-danger/10"
                        : "bg-spire-bg/40 border-spire-border/30 hover:border-spire-accent/40 text-spire-muted hover:text-spire-white"
                    }`}
                    onClick={() => handlePlaySfx(cat.category, file)}
                  >
                    <span className={isPlaying ? "text-spire-danger" : "text-spire-accent"}>
                      {isPlaying ? "⏹" : "▶"}
                    </span>
                    <span className="truncate">{file.replace(/_/g, " ")}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Keyword color categories
const KEYWORD_COLORS: Record<string, string> = {
  APC: "text-cyan-400 border-cyan-400/30 bg-cyan-400/5",
  Match: "text-cyan-400 border-cyan-400/30 bg-cyan-400/5",
  Damage: "text-red-400 border-red-400/30 bg-red-400/5",
  Death: "text-red-400 border-red-400/30 bg-red-400/5",
  Combat: "text-red-400 border-red-400/30 bg-red-400/5",
  Monster: "text-red-400 border-red-400/30 bg-red-400/5",
  Boss: "text-fuchsia-400 border-fuchsia-400/30 bg-fuchsia-400/5",
  Victory: "text-emerald-400 border-emerald-400/30 bg-emerald-400/5",
  Score: "text-emerald-400 border-emerald-400/30 bg-emerald-400/5",
  Gold: "text-amber-400 border-amber-400/30 bg-amber-400/5",
  Merchant: "text-amber-400 border-amber-400/30 bg-amber-400/5",
  Item: "text-amber-400 border-amber-400/30 bg-amber-400/5",
  Weapon: "text-violet-400 border-violet-400/30 bg-violet-400/5",
  Enchantment: "text-violet-400 border-violet-400/30 bg-violet-400/5",
  Hero: "text-sky-400 border-sky-400/30 bg-sky-400/5",
  Class: "text-sky-400 border-sky-400/30 bg-sky-400/5",
  Ability: "text-sky-400 border-sky-400/30 bg-sky-400/5",
  Shield: "text-blue-400 border-blue-400/30 bg-blue-400/5",
  Token: "text-blue-400 border-blue-400/30 bg-blue-400/5",
  Poison: "text-green-400 border-green-400/30 bg-green-400/5",
  Freeze: "text-cyan-300 border-cyan-300/30 bg-cyan-300/5",
  Fear: "text-purple-400 border-purple-400/30 bg-purple-400/5",
  Burn: "text-orange-400 border-orange-400/30 bg-orange-400/5",
  Stun: "text-yellow-400 border-yellow-400/30 bg-yellow-400/5",
  Tier: "text-spire-gold border-spire-gold/30 bg-spire-gold/5",
  Environment: "text-teal-400 border-teal-400/30 bg-teal-400/5",
  Elite: "text-pink-400 border-pink-400/30 bg-pink-400/5",
  Rest: "text-rose-400 border-rose-400/30 bg-rose-400/5",
  Difficulty: "text-orange-300 border-orange-300/30 bg-orange-300/5",
  Priority: "text-indigo-400 border-indigo-400/30 bg-indigo-400/5",
  Setup: "text-lime-400 border-lime-400/30 bg-lime-400/5",
};

function getKeywordClass(kw: string): string {
  return KEYWORD_COLORS[kw] ?? "text-spire-muted border-spire-border bg-spire-bg/40";
}

// Format rule content: split into sentences, highlight keywords
function FormattedContent({ content, keywords }: { content: string; keywords: string[] }) {
  const sentences = content.split(/(?<=\.)\s+/).filter(s => s.trim().length > 0);

  const highlightKeywords = (text: string) => {
    let parts: (string | { term: string })[] = [text];
    for (const kw of keywords) {
      const newParts: (string | { term: string })[] = [];
      for (const part of parts) {
        if (typeof part !== "string") { newParts.push(part); continue; }
        const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
        let lastIndex = 0;
        let match;
        while ((match = regex.exec(part)) !== null) {
          if (match.index > lastIndex) newParts.push(part.slice(lastIndex, match.index));
          newParts.push({ term: kw });
          lastIndex = match.index + match[0].length;
        }
        if (lastIndex < part.length) newParts.push(part.slice(lastIndex));
      }
      parts = newParts;
    }
    return parts;
  };

  return (
    <div className="space-y-2.5">
      {sentences.map((sentence, i) => {
        const parts = highlightKeywords(sentence);
        const isListItem = /^\d+\)/.test(sentence.trim());
        return (
          <p
            key={i}
            className={`text-sm leading-relaxed ${isListItem ? "pl-4 border-l-2 border-spire-accent/30" : ""}`}
          >
            {parts.map((part, j) => {
              if (typeof part === "string") {
                return <span key={j} className="text-spire-white/90">{part}</span>;
              }
              return (
                <span key={j} className={`font-medium ${getKeywordClass(part.term).split(" ")[0]}`}>
                  {part.term}
                </span>
              );
            })}
          </p>
        );
      })}
    </div>
  );
}

function RulesTab() {
  const [query, setQuery] = useState("");
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [showFullRules, setShowFullRules] = useState(false);
  const fullRulesRef = useRef<HTMLDivElement>(null);

  const results = query ? searchRules(query) : RULES_INDEX;
  const selected = selectedSection ? RULES_INDEX.find(r => r.id === selectedSection) : null;

  const scrollToTop = () => {
    if (fullRulesRef.current) fullRulesRef.current.scrollTop = 0;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <h3 className="text-base font-display gold-text cosmo-text-glow-gold">📖 Rules Reference</h3>
          <span className="text-xs text-spire-muted">({RULES_INDEX.length} sections)</span>
        </div>
        <button
          className={`text-xs px-4 py-2 rounded-lg border transition-all duration-200 min-h-[36px] ${
            showFullRules
              ? "border-spire-accent/40 text-spire-accent bg-spire-accent/10 hover:bg-spire-accent/20"
              : "border-spire-gold/40 text-spire-gold bg-spire-gold/10 hover:bg-spire-gold/20"
          }`}
          onClick={() => { setShowFullRules(!showFullRules); if (!showFullRules) setTimeout(scrollToTop, 50); }}
        >
          {showFullRules ? "📋 Show Summaries" : "📜 Show Full Rules"}
        </button>
      </div>

      {showFullRules ? (
        <div className="glass-card cosmo-edge-glow overflow-hidden">
          <div
            className="px-5 py-3 flex items-center justify-between"
            style={{
              background: "linear-gradient(180deg, rgba(34, 211, 238, 0.06) 0%, transparent 100%)",
              borderBottom: "1px solid rgba(34, 211, 238, 0.12)",
            }}
          >
            <span className="text-sm font-display gold-text">Skyward Ascent — Official Rules v3.1</span>
            <span className="text-xs text-spire-muted">2,128 lines</span>
          </div>
          <div
            ref={fullRulesRef}
            className="p-5 sm:p-6 max-h-[70vh] overflow-y-auto wiki-rules-content"
            dangerouslySetInnerHTML={{ __html: rulesHtml }}
          />
        </div>
      ) : (
        <>
          <div className="glass-card p-4 space-y-3">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-spire-muted text-sm">🔍</span>
              <input
                className="input w-full pl-9"
                placeholder="Search rules..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {RULE_KEYWORDS.slice(0, 15).map((kw) => (
                <button
                  key={kw}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition-all duration-200 ${getKeywordClass(kw)} hover:scale-105`}
                  onClick={() => setQuery(kw)}
                >
                  {kw}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 sm:col-span-4 space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {results.map((rule) => {
                const isActive = selectedSection === rule.id;
                return (
                  <button
                    key={rule.id}
                    className={`w-full text-left p-3 rounded-lg transition-all duration-200 ${
                      isActive
                        ? "bg-spire-accent/15 border border-spire-accent/50 shadow-sm cosmo-edge-glow"
                        : "bg-spire-bg/60 border border-spire-border/50 hover:border-spire-accent/30 hover:bg-spire-bg"
                    }`}
                    onClick={() => setSelectedSection(rule.id)}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                          isActive
                            ? "bg-spire-accent/20 text-spire-accent"
                            : "bg-spire-gold/10 text-spire-gold/70"
                        }`}
                      >
                        §{rule.section}
                      </span>
                      <span className={`text-sm ${isActive ? "text-spire-white" : "text-spire-white/80"}`}>
                        {rule.title}
                      </span>
                    </div>
                  </button>
                );
              })}
              {results.length === 0 && (
                <div className="text-center text-spire-muted text-sm py-8">
                  <div className="text-2xl mb-2 opacity-40">🔍</div>
                  No results found
                </div>
              )}
            </div>

            <div className="col-span-12 sm:col-span-8">
              {selected ? (
                <div className="glass-card cosmo-edge-glow overflow-hidden">
                  <div
                    className="px-5 py-4"
                    style={{
                      background: "linear-gradient(180deg, rgba(34, 211, 238, 0.06) 0%, transparent 100%)",
                      borderBottom: "1px solid rgba(34, 211, 238, 0.12)",
                    }}
                  >
                    <div className="flex items-center gap-2.5 mb-1">
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-spire-gold/15 text-spire-gold">
                        §{selected.section}
                      </span>
                    </div>
                    <h4 className="text-lg font-display gold-text cosmo-text-glow-gold">{selected.title}</h4>
                  </div>
                  <div className="p-5">
                    <FormattedContent content={selected.content} keywords={selected.keywords} />
                    <div className="mt-5 pt-4 border-t border-spire-border/30">
                      <div className="text-[10px] uppercase tracking-widest text-spire-muted/60 mb-2.5">Keywords</div>
                      <div className="flex flex-wrap gap-1.5">
                        {selected.keywords.map((kw) => (
                          <span
                            key={kw}
                            className={`text-xs px-2.5 py-1 rounded-lg border ${getKeywordClass(kw)}`}
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="glass-card p-10 text-center">
                  <div className="text-4xl mb-3 opacity-30">📖</div>
                  <p className="text-spire-muted text-sm">Select a rule section to view details</p>
                  <p className="text-spire-muted/50 text-xs mt-1">{results.length} sections available</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PCGTab() {
  const fullRulesRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Skyward Ascent — Card Game Rules</title>
        <style>
          @page { margin: 0.5in; }
          body { font-family: Georgia, serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #222; line-height: 1.45; font-size: 11pt; }
          h1 { font-size: 1.5em; border-bottom: 2px solid #333; padding-bottom: 4px; margin: 0.5em 0 0.3em; }
          h2 { font-size: 1.2em; border-bottom: 1px solid #aaa; padding-bottom: 2px; margin: 1em 0 0.3em; }
          h3 { font-size: 1.05em; margin: 0.8em 0 0.2em; }
          p { margin: 0.3em 0; }
          ul, ol { margin: 0.3em 0; padding-left: 1.4em; }
          li { margin: 0.1em 0; }
          table { border-collapse: collapse; width: 100%; margin: 6px 0; font-size: 9pt; }
          th, td { border: 1px solid #ccc; padding: 3px 6px; text-align: left; }
          th { background: #f0f0f0; }
          code { background: #f4f4f4; padding: 1px 4px; border-radius: 2px; font-family: monospace; font-size: 9pt; }
          pre { background: #f4f4f4; padding: 8px; border-radius: 4px; overflow-x: auto; font-size: 9pt; margin: 6px 0; }
          blockquote { border-left: 3px solid #aaa; margin: 6px 0; padding: 2px 12px; color: #555; }
          hr { border: none; border-top: 1px solid #ddd; margin: 8px 0; }
          @media print {
            body { padding: 0; max-width: none; font-size: 10pt; line-height: 1.35; }
            h1, h2, h3 { page-break-after: avoid; }
            table, pre, blockquote { page-break-inside: avoid; }
            tr { page-break-inside: avoid; }
            hr { page-break-after: avoid; }
          }
        </style>
      </head>
      <body>${pcgRulesHtml}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <h3 className="text-base font-display gold-text cosmo-text-glow-gold">🃏 Physical Card Game Rules</h3>
        </div>
        <button
          className="text-xs px-4 py-2 rounded-lg border border-spire-gold/40 text-spire-gold bg-spire-gold/10 hover:bg-spire-gold/20 transition-all min-h-[36px]"
          onClick={handlePrint}
        >
          🖨️ Printable Version
        </button>
      </div>
      <div className="glass-card cosmo-edge-glow overflow-hidden">
        <div
          className="px-5 py-3 flex items-center justify-between"
          style={{
            background: "linear-gradient(180deg, rgba(34, 211, 238, 0.06) 0%, transparent 100%)",
            borderBottom: "1px solid rgba(34, 211, 238, 0.12)",
          }}
        >
          <span className="text-sm font-display gold-text">Skyward Ascent — The Card Game Rulebook</span>
        </div>
        <div
          ref={fullRulesRef}
          className="p-5 sm:p-6 max-h-[70vh] overflow-y-auto wiki-rules-content"
          dangerouslySetInnerHTML={{ __html: pcgRulesHtml }}
        />
      </div>
    </div>
  );
}

// ============================================================
// Armory Tab
// ============================================================

const RARITY_STYLES: Record<WeaponRarity, { border: string; text: string; bg: string; glow: string }> = {
  Common: { border: "border-spire-border/50", text: "text-spire-muted", bg: "bg-spire-bg/40", glow: "" },
  Rare: { border: "border-blue-400/40", text: "text-blue-300", bg: "bg-blue-900/10", glow: "shadow-[0_0_12px_rgba(59,130,246,0.1)]" },
  Epic: { border: "border-fuchsia-400/40", text: "text-fuchsia-300", bg: "bg-fuchsia-900/10", glow: "shadow-[0_0_12px_rgba(217,70,239,0.1)]" },
  Legendary: { border: "border-amber-400/50", text: "text-amber-300", bg: "bg-amber-900/10", glow: "shadow-[0_0_16px_rgba(212,175,55,0.15)]" },
};

const RARITY_ORDER: WeaponRarity[] = ["Common", "Rare", "Epic", "Legendary"];
const ALL_CLASSES: HeroClassName[] = ["Bladedancer", "Manipulator", "Tracker", "Guardian"];

const VALUABLE_ITEM_STYLES: Record<string, { border: string; badge: string; badgeText: string }> = {
  "Guardian Angel": { border: "border-amber-400/30", badge: "bg-amber-500/20 text-amber-300", badgeText: "✦ Rare" },
  "Bomb": { border: "border-red-400/30", badge: "bg-red-500/20 text-red-300", badgeText: "☠ Offensive" },
  "Smoke Bomb": { border: "border-slate-400/30", badge: "bg-slate-500/20 text-slate-300", badgeText: "☁ Utility" },
  "Treasure Map": { border: "border-spire-gold/30", badge: "bg-spire-gold/20 text-spire-gold", badgeText: "💰 Greed" },
  "Ability Blocker": { border: "border-purple-400/30", badge: "bg-purple-500/20 text-purple-300", badgeText: "✦ Tactical" },
  "Speed Potion": { border: "border-cyan-400/30", badge: "bg-cyan-500/20 text-cyan-300", badgeText: "⚡ Haste" },
};

function CostRow({ costs, goldCoinUrl }: { costs: { t1: number; t2: number; t3: number }; goldCoinUrl: string | null }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      {[1, 2, 3].map((tier) => {
        const cost = tier === 1 ? costs.t1 : tier === 2 ? costs.t2 : costs.t3;
        return (
          <div key={tier} className="flex items-center gap-1">
            <span className="text-spire-muted/60 text-[10px]">T{tier}</span>
            {goldCoinUrl ? (
              <img src={goldCoinUrl} alt="gold" className="w-3 h-3 inline-block" />
            ) : (
              <span className="text-spire-gold">💰</span>
            )}
            <span className={`font-medium ${cost === 0 ? "text-spire-muted/50" : "text-spire-gold"}`}>{cost === 0 ? "—" : cost}</span>
          </div>
        );
      })}
    </div>
  );
}

function WeaponCard({ weapon, goldCoinUrl }: { weapon: typeof WEAPONS[0]; goldCoinUrl: string | null }) {
  const img = getWeaponImage(weapon.name);
  const rs = RARITY_STYLES[weapon.rarity];
  const classColor = CLASS_TEXT_COLORS[weapon.className as HeroClassName] ?? "text-spire-white";
  const classIcon = getClassIcon(weapon.className);
  const rarityData = WEAPON_RARITY_DATA[weapon.rarity];

  return (
    <div className={`glass-card ${rs.bg} border ${rs.border} ${rs.glow} rounded-xl p-3 space-y-2.5 transition-all duration-200`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-spire-bg/60 border border-spire-border/30 flex items-center justify-center">
          {img ? (
            <img src={img} alt={weapon.name} className="w-full h-full object-contain" />
          ) : (
            <span className="text-2xl opacity-30">⚔️</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-display text-spire-white truncate">{weapon.name}</h4>
            {weapon.suit && <span className="text-sm">{weapon.suit}</span>}
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${rs.bg} ${rs.text} border ${rs.border}`}>
              {weapon.rarity}
            </span>
            <span className={`text-[10px] font-medium flex items-center gap-1 ${classColor}`}>
              {classIcon && <img src={classIcon} alt="" className="w-3 h-3" />}
              {weapon.className}
            </span>
          </div>
        </div>
      </div>
      <p className="text-xs text-spire-white/80 leading-relaxed">{formatAbilityText(weapon.effect)}</p>
      <div className="flex items-center justify-between pt-1.5 border-t border-spire-border/20">
        <CostRow costs={{ t1: weapon.baseCost, t2: weapon.baseCost + weapon.upgradeCost, t3: weapon.baseCost + weapon.upgradeCost * 2 }} goldCoinUrl={goldCoinUrl} />
        <span className="text-[10px] text-spire-muted/50">{rarityData.availableTiers}</span>
      </div>
    </div>
  );
}

function EnchantCard({ name, data, goldCoinUrl }: { name: string; data: typeof ENCHANTMENTS[keyof typeof ENCHANTMENTS]; goldCoinUrl: string | null }) {
  const img = getEnchantIcon(name);
  return (
    <div className="glass-card rounded-xl p-3 space-y-2 border border-spire-border/30 hover:border-spire-violet/30 transition-all duration-200">
      <div className="flex items-center gap-2.5">
        <div className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-spire-bg/60 border border-spire-border/30 flex items-center justify-center">
          {img ? (
            <img src={img} alt={name} className="w-full h-full object-contain" />
          ) : (
            <span className="text-2xl opacity-30">🔮</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-display text-spire-white">{name}</h4>
            {data.slotFree && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-spire-violet/20 text-spire-violet border border-spire-violet/30">Slot-Free</span>
            )}
          </div>
        </div>
      </div>
      <p className="text-xs text-spire-white/80 leading-relaxed">{formatAbilityText(data.effect)}</p>
      {name === "Chaotic" && (
        <div className="grid grid-cols-2 gap-1 pt-1.5 border-t border-spire-border/20">
          {CHAOTIC_EFFECTS.map((ce) => (
            <div key={ce.roll} className="flex items-center gap-1.5 text-[10px]">
              <span className="font-bold text-amber-300 w-4">{ce.roll}</span>
              <span className="text-spire-muted">{ce.effect}</span>
            </div>
          ))}
        </div>
      )}
      <div className="pt-1.5 border-t border-spire-border/20">
        <CostRow costs={data.costs} goldCoinUrl={goldCoinUrl} />
      </div>
    </div>
  );
}

function ItemCard({ name, data, goldCoinUrl }: { name: string; data: typeof ITEMS[keyof typeof ITEMS]; goldCoinUrl: string | null }) {
  const img = getItemImage(name);
  const valuable = VALUABLE_ITEM_STYLES[name];
  return (
    <div className={`glass-card rounded-xl p-3 space-y-2 border ${valuable?.border ?? "border-spire-border/30"} hover:border-spire-accent/30 transition-all duration-200`}>
      <div className="flex items-center gap-2.5">
        <div className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-spire-bg/60 border border-spire-border/30 flex items-center justify-center">
          {img ? (
            <img src={img} alt={name} className="w-full h-full object-contain" />
          ) : (
            <span className="text-2xl opacity-30">🎒</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-display text-spire-white">{name}</h4>
            {valuable && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded ${valuable.badge}`}>{valuable.badgeText}</span>
            )}
            {data.isJoker && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-400/30">Joker</span>
            )}
          </div>
          <span className="text-[10px] text-spire-muted">Stack: {data.stackLimit}</span>
        </div>
      </div>
      <p className="text-xs text-spire-white/80 leading-relaxed">{formatAbilityText(data.effect)}</p>
      <div className="pt-1.5 border-t border-spire-border/20">
        <CostRow costs={data.costs} goldCoinUrl={goldCoinUrl} />
      </div>
    </div>
  );
}

function CompactCard({ name, effect, costs, limit, goldCoinUrl }: { name: string; effect: string; costs?: { t1: number; t2: number; t3: number }; limit?: string; goldCoinUrl: string | null }) {
  return (
    <div className="glass-card rounded-lg p-3 space-y-1.5 border border-spire-border/30 hover:border-spire-accent/20 transition-all duration-200">
      <h4 className="text-sm font-medium text-spire-white">{name}</h4>
      <p className="text-xs text-spire-white/70 leading-relaxed">{formatAbilityText(effect)}</p>
      <div className="flex items-center justify-between pt-1 border-t border-spire-border/20">
        {costs ? <CostRow costs={costs} goldCoinUrl={goldCoinUrl} /> : <span className="text-xs text-spire-gold">{effect.includes("Free") ? "Free" : ""}</span>}
        {limit && <span className="text-[10px] text-spire-muted/60">{limit}</span>}
      </div>
    </div>
  );
}

function CollapsibleSection({ title, icon, count, children }: { title: string; icon: string; count?: number; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="space-y-3">
      <button
        className="w-full flex items-center justify-between group"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2">
          <span className={`text-xs transition-transform duration-200 ${open ? "rotate-90" : "rotate-0"}`}>▶</span>
          <h3 className="section-heading flex-1 text-left" style={{ borderBottom: "none", paddingBottom: 0 }}>
            {icon} {title}
            {count !== undefined && <span className="text-xs text-spire-muted/50 ml-2">({count})</span>}
          </h3>
        </div>
      </button>
      {open && <div className="space-y-3">{children}</div>}
    </div>
  );
}

function ArmoryTab() {
  const goldCoinUrl = getGoldCoinImage();
  const [collapsedClasses, setCollapsedClasses] = useState<Set<string>>(new Set());

  const toggleClass = (cls: string) => {
    setCollapsedClasses(prev => {
      const next = new Set(prev);
      if (next.has(cls)) next.delete(cls);
      else next.add(cls);
      return next;
    });
  };

  const weaponsByClass = useMemo(() => {
    return ALL_CLASSES.map(cls => ({
      className: cls,
      weapons: RARITY_ORDER.flatMap(rarity =>
        WEAPONS.filter(w => w.className === cls && w.rarity === rarity)
      ),
    }));
  }, []);

  return (
    <div className="space-y-6">
      {/* Weapons */}
      <CollapsibleSection title="Weapons" icon="⚔️" count={WEAPONS.length}>
        {weaponsByClass.map(({ className, weapons }) => {
          const isCollapsed = collapsedClasses.has(className);
          return (
            <div key={className} className="space-y-2">
              <button
                className="w-full flex items-center gap-2 group"
                onClick={() => toggleClass(className)}
              >
                <span className={`text-xs transition-transform duration-200 ${isCollapsed ? "rotate-0" : "rotate-90"}`}>▶</span>
                {getClassIcon(className) && <img src={getClassIcon(className)!} alt="" className="w-5 h-5" />}
                <h4 className={`text-sm font-display ${CLASS_TEXT_COLORS[className]}`}>{className}</h4>
                <span className="text-xs text-spire-muted/50">({weapons.length})</span>
              </button>
              {!isCollapsed && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {weapons.map(w => (
                    <WeaponCard key={w.id} weapon={w} goldCoinUrl={goldCoinUrl} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </CollapsibleSection>

      {/* Enchantments */}
      <CollapsibleSection title="Enchantments" icon="🔮" count={Object.keys(ENCHANTMENTS).length}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.entries(ENCHANTMENTS).map(([name, data]) => (
            <EnchantCard key={name} name={name} data={data} goldCoinUrl={goldCoinUrl} />
          ))}
        </div>
      </CollapsibleSection>

      {/* Items */}
      <CollapsibleSection title="Items" icon="🎒" count={Object.keys(ITEMS).length}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.entries(ITEMS).map(([name, data]) => (
            <ItemCard key={name} name={name} data={data} goldCoinUrl={goldCoinUrl} />
          ))}
        </div>
      </CollapsibleSection>

      {/* Permanent Upgrades */}
      <CollapsibleSection title="Permanent Upgrades" icon="⬆️" count={Object.keys(PERMANENT_UPGRADES).length}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Object.entries(PERMANENT_UPGRADES).map(([name, data]) => (
            <CompactCard key={name} name={name} effect={data.effect} costs={data.costs} limit={data.limit} goldCoinUrl={goldCoinUrl} />
          ))}
        </div>
      </CollapsibleSection>

      {/* Healing Services */}
      <CollapsibleSection title="Healing Services" icon="🏥" count={Object.keys(HEALING_SERVICES).length}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.entries(HEALING_SERVICES).map(([name, data]) => (
            <CompactCard key={name} name={name} effect={data.effect} costs={data.costs} goldCoinUrl={goldCoinUrl} />
          ))}
        </div>
      </CollapsibleSection>

      {/* Weapon Services */}
      <CollapsibleSection title="Weapon Services" icon="🔨" count={Object.keys(WEAPON_SERVICES).length}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.entries(WEAPON_SERVICES).map(([name, data]) => (
            <CompactCard key={name} name={name} effect={data.effect} goldCoinUrl={goldCoinUrl} />
          ))}
        </div>
      </CollapsibleSection>
    </div>
  );
}

// ============================================================
// Strategy Tab
// ============================================================

// Category-specific accent colors for visual grouping
const CATEGORY_STYLES: Record<string, { accent: string; border: string; headerBg: string; bullet: string }> = {
  "Party Composition": { accent: "text-sky-400", border: "border-sky-400/20", headerBg: "from-sky-400/8", bullet: "text-sky-400" },
  "Class Guides": { accent: "text-violet-400", border: "border-violet-400/20", headerBg: "from-violet-400/8", bullet: "text-violet-400" },
  "Combat Tactics": { accent: "text-red-400", border: "border-red-400/20", headerBg: "from-red-400/8", bullet: "text-red-400" },
  "Economy": { accent: "text-amber-400", border: "border-amber-400/20", headerBg: "from-amber-400/8", bullet: "text-amber-400" },
  "Synergies": { accent: "text-fuchsia-400", border: "border-fuchsia-400/20", headerBg: "from-fuchsia-400/8", bullet: "text-fuchsia-400" },
  "Progression": { accent: "text-teal-400", border: "border-teal-400/20", headerBg: "from-teal-400/8", bullet: "text-teal-400" },
  "Boss Strategy": { accent: "text-rose-400", border: "border-rose-400/20", headerBg: "from-rose-400/8", bullet: "text-rose-400" },
  "Basics": { accent: "text-cyan-400", border: "border-cyan-400/20", headerBg: "from-cyan-400/8", bullet: "text-cyan-400" },
};

function getCategoryStyle(category: string) {
  return CATEGORY_STYLES[category] ?? { accent: "text-spire-accent", border: "border-spire-accent/20", headerBg: "from-spire-accent/8", bullet: "text-spire-accent" };
}

// Map of class names and specializations to their text colors
const SPEC_CLASS_MAP: Record<string, HeroClassName> = {
  Shadowblade: "Bladedancer", Runeblade: "Bladedancer",
  Timebender: "Manipulator", Illusionist: "Manipulator",
  Huntmaster: "Tracker", Beastcaller: "Tracker",
  Sentinel: "Guardian", Warden: "Guardian",
};
const RARITY_TEXT_COLORS: Record<string, string> = {
  Common: "text-spire-muted",
  Rare: "text-blue-300",
  Epic: "text-fuchsia-300",
  Legendary: "text-amber-300 animate-legendary-glow",
};

const ALL_STRATEGY_CLASS_NAMES = [...Object.keys(CLASS_TEXT_COLORS), ...Object.keys(SPEC_CLASS_MAP)];
const ALL_RARITY_NAMES = Object.keys(RARITY_TEXT_COLORS);

function formatStrategyText(text: string): React.ReactNode {
  if (!text) return text;
  const sortedNames = [...ALL_STRATEGY_CLASS_NAMES].sort((a, b) => b.length - a.length);
  const allTokens = [...sortedNames, ...ALL_RARITY_NAMES].sort((a, b) => b.length - a.length);
  const regex = new RegExp(`(${allTokens.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) => {
    const matchedClass = sortedNames.find(n => n.toLowerCase() === part.toLowerCase());
    if (matchedClass) {
      const cls = (CLASS_TEXT_COLORS as Record<string, string>)[matchedClass] ?? SPEC_CLASS_MAP[matchedClass];
      const color = cls ? (CLASS_TEXT_COLORS as Record<string, string>)[cls] : "text-spire-white";
      return <span key={i} className={`font-semibold ${color}`}>{part}</span>;
    }
    const matchedRarity = ALL_RARITY_NAMES.find(n => n.toLowerCase() === part.toLowerCase());
    if (matchedRarity) {
      return <span key={i} className={`font-semibold ${RARITY_TEXT_COLORS[matchedRarity]}`}>{part}</span>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

function StrategyBlockRenderer({ block, category }: { block: StrategyBlock; category: string }) {
  const catStyle = getCategoryStyle(category);
  const isBasics = category === "Basics";
  const textSize = isBasics ? "text-base" : "text-sm";
  if (block.type === "heading") {
    return (
      <h4 className={`${isBasics ? "text-lg" : "text-sm"} font-display gold-text cosmo-text-glow-gold mt-4 mb-2 flex items-center gap-2`}>
        <span className={`inline-block w-1 h-3.5 rounded-full ${catStyle.accent.replace("text-", "bg-")}`} />
        {block.text}
      </h4>
    );
  }
  if (block.type === "paragraph") {
    return <p className={`${textSize} text-spire-white/85 leading-relaxed mb-2`}>{formatStrategyText(block.text ?? "")}</p>;
  }
  if (block.type === "list" && block.items) {
    return (
      <ul className="space-y-1.5 mb-3">
        {block.items.map((item, i) => (
          <li key={i} className={`${textSize} text-spire-white/85 leading-relaxed flex gap-2`}>
            <span className={`${catStyle.bullet} flex-shrink-0`}>▸</span>
            <span>{formatStrategyText(item)}</span>
          </li>
        ))}
      </ul>
    );
  }
  if (block.type === "table" && block.headers && block.rows) {
    return (
      <div className="overflow-x-auto mb-3 rounded-lg border border-spire-border/30 bg-spire-bg/20">
        <table className="w-full text-xs">
          <thead>
            <tr className={`bg-gradient-to-b ${catStyle.headerBg} to-transparent border-b ${catStyle.border}`}>
              {block.headers.map((h, i) => (
                <th key={i} className={`px-3 py-2 text-left font-medium ${catStyle.accent}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, i) => (
              <tr key={i} className="border-b border-spire-border/20 last:border-0 hover:bg-spire-bg/30 transition-colors">
                {row.map((cell, j) => (
                  <td key={j} className={`px-3 py-2 ${j === 0 ? "font-medium text-spire-white" : "text-spire-white/70"}`}>{formatStrategyText(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (block.type === "tip" && block.text) {
    return (
      <div className={`flex gap-2.5 rounded-lg border border-emerald-400/30 bg-emerald-400/5 px-3 py-2.5 mb-3 ${isBasics ? "py-3.5" : ""}`}>
        <span className={`text-emerald-400 flex-shrink-0 ${isBasics ? "text-base" : "text-sm"}`}>💡</span>
        <p className={`${textSize} text-emerald-100/80 leading-relaxed`}>{formatStrategyText(block.text)}</p>
      </div>
    );
  }
  if (block.type === "warning" && block.text) {
    return (
      <div className={`flex gap-2.5 rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2.5 mb-3 ${isBasics ? "py-3.5" : ""}`}>
        <span className={`text-amber-400 flex-shrink-0 ${isBasics ? "text-base" : "text-sm"}`}>⚠️</span>
        <p className={`${textSize} text-amber-100/80 leading-relaxed`}>{formatStrategyText(block.text)}</p>
      </div>
    );
  }
  return null;
}

function StrategyTab() {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showBasic, setShowBasic] = useState(false);

  const toggle = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const categories = useMemo(() => {
    const seen = new Set<string>();
    return STRATEGY_SECTIONS.filter(s => {
      if (seen.has(s.category)) return false;
      seen.add(s.category);
      return true;
    }).map(s => s.category);
  }, []);

  return (
    <div className="space-y-4">
      {/* Toggle buttons */}
      <div className="flex gap-3">
        <button
          className={`flex-1 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
            showBasic
              ? "bg-cyan-400/15 border border-cyan-400/40 text-cyan-200 cosmo-text-glow-gold"
              : "bg-spire-bg/40 border border-spire-border/30 text-spire-muted hover:text-spire-white hover:border-cyan-400/20"
          }`}
          onClick={() => setShowBasic(true)}
        >
          🌟 Basic Guide
        </button>
        <button
          className={`flex-1 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
            !showBasic
              ? "bg-spire-gold/15 border border-spire-gold/40 text-spire-gold cosmo-text-glow-gold"
              : "bg-spire-bg/40 border border-spire-border/30 text-spire-muted hover:text-spire-white hover:border-spire-gold/20"
          }`}
          onClick={() => setShowBasic(false)}
        >
          🧠 Full Strategy Guide
        </button>
      </div>

      {showBasic ? (
        <div className="glass-card px-4 py-4">
          {BASIC_TIPS.map((block, i) => (
            <StrategyBlockRenderer key={i} block={block} category="Basics" />
          ))}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2.5 mb-1">
            <h3 className="text-base font-display gold-text cosmo-text-glow-gold">🧠 Strategy Guide</h3>
            <span className="text-xs text-spire-muted">({STRATEGY_SECTIONS.length} sections)</span>
          </div>

          {categories.map(category => {
        const sections = STRATEGY_SECTIONS.filter(s => s.category === category);
        const catStyle = getCategoryStyle(category);
        return (
          <div key={category} className="space-y-2">
            {/* Category header */}
            <div className={`flex items-center gap-2 px-1 py-1.5 border-b ${catStyle.border}`}>
              <span className={`text-[10px] font-display uppercase tracking-widest ${catStyle.accent}`}>{category}</span>
              <span className="text-spire-muted/40 text-[10px]">— {sections.length} {sections.length === 1 ? "guide" : "guides"}</span>
            </div>
            {sections.map(section => {
              const isCollapsed = collapsed.has(section.id);
              return (
                <div key={section.id} className="glass-card overflow-hidden">
                  <button
                    className={`w-full flex items-center justify-between px-4 py-3 hover:bg-spire-accent/5 transition-colors border-l-2 ${catStyle.border}`}
                    onClick={() => toggle(section.id)}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium text-spire-white">
                      <span className="text-lg">{section.icon}</span>
                      {section.title}
                    </span>
                    <span className="text-spire-muted text-xs">{isCollapsed ? "▶" : "▼"}</span>
                  </button>
                  {!isCollapsed && (
                    <div className="px-4 pb-4 pt-1">
                      {section.content.map((block, i) => (
                        <StrategyBlockRenderer key={i} block={block} category={section.category} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
        </>
      )}
    </div>
  );
}

// ============================================================
// Main component
// ============================================================

export function WikiScreen({ onBack, initialTab }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab ?? "armory");
  const starsUrl = getStarsImage();
  const { pauseMusic, resumeMusic } = useAudio();

  useEffect(() => {
    pauseMusic();
    return () => resumeMusic();
  }, [pauseMusic, resumeMusic]);

  const totalAssets = useMemo(
    () => GALLERY_CATEGORIES.reduce((sum, cat) => sum + cat.assets.length, 0),
    []
  );

  return (
    <div className="space-y-4 relative">
      {starsUrl && (
        <div
          className="bg-image-overlay"
          style={{ backgroundImage: `url(${starsUrl})`, opacity: 0.08 }}
        />
      )}
      <div className="relative z-10 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-xl font-display gold-text flex items-center gap-2">
            📚 Game Wiki
          </h2>
          <button
            className="btn-ghost text-xs px-4 py-2"
            onClick={onBack}
          >
            ← Back
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-2 flex-wrap">
          <button
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "armory"
                ? "bg-spire-accent/20 border border-spire-accent text-spire-white"
                : "bg-spire-bg/40 border border-spire-border/30 text-spire-muted hover:text-spire-white"
            }`}
            onClick={() => setActiveTab("armory")}
          >
            🗡️ Armory
          </button>
          <button
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "gallery"
                ? "bg-spire-accent/20 border border-spire-accent text-spire-white"
                : "bg-spire-bg/40 border border-spire-border/30 text-spire-muted hover:text-spire-white"
            }`}
            onClick={() => setActiveTab("gallery")}
          >
            🖼️ Gallery <span className="text-xs text-spire-muted">({totalAssets})</span>
          </button>
          <button
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "audio"
                ? "bg-spire-accent/20 border border-spire-accent text-spire-white"
                : "bg-spire-bg/40 border border-spire-border/30 text-spire-muted hover:text-spire-white"
            }`}
            onClick={() => setActiveTab("audio")}
          >
            🎵 Audio <span className="text-xs text-spire-muted">({MUSIC_TRACKS.length + SFX_CATEGORIES.reduce((s, c) => s + c.files.length, 0)})</span>
          </button>
          <button
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "rules"
                ? "bg-spire-accent/20 border border-spire-accent text-spire-white"
                : "bg-spire-bg/40 border border-spire-border/30 text-spire-muted hover:text-spire-white"
            }`}
            onClick={() => setActiveTab("rules")}
          >
            📖 Rules
          </button>
          <button
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "pcg"
                ? "bg-spire-accent/20 border border-spire-accent text-spire-white"
                : "bg-spire-bg/40 border border-spire-border/30 text-spire-muted hover:text-spire-white"
            }`}
            onClick={() => setActiveTab("pcg")}
          >
            🃏 PCG Rules
          </button>
          <button
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "strategy"
                ? "bg-spire-accent/20 border border-spire-accent text-spire-white"
                : "bg-spire-bg/40 border border-spire-border/30 text-spire-muted hover:text-spire-white"
            }`}
            onClick={() => setActiveTab("strategy")}
          >
            🧠 Strategy
          </button>
        </div>

        {/* Tab content */}
        {activeTab === "gallery" && (
          <div className="space-y-3">
            {GALLERY_CATEGORIES.map((cat) => (
              <GallerySection key={cat.label} label={cat.label} icon={cat.icon} assets={cat.assets} />
            ))}
          </div>
        )}

        {activeTab === "armory" && <ArmoryTab />}

        {activeTab === "audio" && <AudioTab />}

        {activeTab === "rules" && <RulesTab />}

        {activeTab === "pcg" && <PCGTab />}

        {activeTab === "strategy" && <StrategyTab />}
      </div>
    </div>
  );
}
