import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Sword, Backpack, Info, Bot, User, ScrollText, X } from "lucide-react";
import { useGameStore } from "../../app/gameStore";
import { useHybridStore } from "../../app/hybridStore";
import { getLivingHeroes } from "../../engine/rulesEngine";
import { suggestCombatAction } from "../../engine/aiAdvisor";
import { useAudio } from "../../audio/useAudio";
import { EffectOverlay } from "../ui/EffectOverlay";
import { InlineDieIcon } from "../ui/DieRollAnimation";
import type { GameEvent } from "../../types/events";
import {
  getMonsterImage,
  getMonsterSpecialIcon,
  getTierBackground,
  getFogImage,
  getStarsImage,
  getItemImage,
  getItemImageById,
  getGoldCoinImage,
  getCardBackImage,
} from "../../assets/assetRegistry";
import { HeroIcon } from "../ui/HeroIcon";
import { PetIcon } from "../ui/PetIcon";
import { formatLogSummary, getEventTypeStyle } from "../../utils/logFormatter";
import { formatAbilityText } from "../../utils/formatAbilityText";
import { ExplainTurnIcon } from "../combat/ExplainTurn";
import { PhysicalInputPanel } from "../combat/PhysicalInputPanel";
import { resolveItemData } from "../../data/items";
import { suitSymbol, isRedSuit, getApcColors, APC_COLORS } from "../../types/cards";
import { CLASS_TEXT_COLORS } from "../../utils/nameResolver";
import { getMonsterById, MONSTERS, SUMMON_DATA } from "../../data/monsters";
import { aiPlayHeroTurn } from "../../engine/aiController";

const HEAD_COLORS: Record<string, string> = {
  Lion: "#f59e0b",
  Goat: "#86efac",
  Snake: "#4ade80",
};

function colorizeHeads(text: string) {
  const parts = text.split(/(Lion|Goat|Snake)/g);
  return parts.map((part, i) => {
    if (HEAD_COLORS[part]) {
      return <span key={i} className="font-semibold" style={{ color: HEAD_COLORS[part] }}>{part}</span>;
    }
    return <span key={i}>{part}</span>;
  });
}

function colorizeApc(text: string) {
  const parts = text.split(/(APC|Black|Red|Heroes|Monster)/g);
  return parts.map((part, i) => {
    if (part === "APC") {
      return <span key={i} style={{ color: "#22d3ee" }}>APC</span>;
    }
    if (part === "Black") {
      return <span key={i} className="font-bold text-spire-white">Black</span>;
    }
    if (part === "Red") {
      return <span key={i} className="font-bold text-red-400">Red</span>;
    }
    if (part === "Heroes") {
      return <span key={i} className="font-bold text-cyan-300">Heroes</span>;
    }
    if (part === "Monster") {
      return <span key={i} className="font-bold text-red-400">Monster</span>;
    }
    return <span key={i}>{part}</span>;
  });
}

const ENVIRONMENT_EMOJIS: Record<string, string> = {
  "Training Ground": "⚔️",
  "Library": "📚",
  "Armory": "🛡️",
  "Elemental Chamber": "🌪️",
};

interface ItemEntry {
  name: string;
  itemId?: string;
  quantity: number;
  effect?: string;
}

function ItemDropdown({ items, onUse, onOpenChange }: { items: ItemEntry[]; onUse: (itemName: string) => void; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    onOpenChange?.(next);
  };

  return (
    <div className="relative">
      <button
        type="button"
        className="input w-full text-xs flex items-center justify-between cursor-pointer"
        onClick={() => toggle()}
      >
        <span>Use Item...</span>
        <span className={`text-spire-muted text-[10px] transition-transform ${open ? "rotate-180" : ""}`}>▼</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-80" onClick={() => { setOpen(false); onOpenChange?.(false); }} />
          <div className="absolute top-full left-0 mt-1 z-[90] glass-panel rounded-lg border border-spire-border/60 shadow-panel overflow-hidden max-h-64 overflow-y-auto min-w-[200px] w-max">
            {items.map((item, idx) => {
              const itemData = resolveItemData(item);
              const effect = itemData?.effect ?? item.effect ?? "";
              const itemImg = getItemImageById(item.itemId ?? "") ?? getItemImage(item.name);
              return (
                <button
                  key={idx}
                  type="button"
                  className="w-full text-left px-2.5 py-2 transition-colors text-xs hover:bg-spire-accent/10 flex items-start gap-2 border-b border-spire-border/20 last:border-0"
                  onClick={() => {
                    onUse(item.name);
                    setOpen(false);
                    onOpenChange?.(false);
                  }}
                >
                  {itemImg && (
                    <img src={itemImg} alt={item.name} className="w-7 h-7 rounded object-cover border border-spire-border/50 flex-shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-spire-white truncate">{item.name}</span>
                      {item.quantity > 1 && <span className="text-spire-muted text-[10px] flex-shrink-0">x{item.quantity}</span>}
                    </div>
                    {effect && (
                      <div className="text-[10px] text-spire-muted leading-snug mt-0.5">{formatAbilityText(effect)}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function CombatLogTooltip({ event, state }: { event: GameEvent; state: any }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number; flip: boolean }>({ x: 0, y: 0, flip: false });
  const style = getEventTypeStyle(event.type);
  const time = new Date(event.timestamp).toLocaleTimeString("en-US", { hour12: false, minute: "2-digit", second: "2-digit" });

  const actor = event.actorId
    ? state?.party?.heroes?.find((h: any) => h.id === event.actorId)
    : null;
  const actorName: string = String(actor?.specialization
    ?? (state?.combat?.monster?.id === event.actorId ? state.combat.monster.name : null)
    ?? event.actorId
    ?? "System");

  const handleEnter = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const flip = rect.left < 280;
    setPos({ x: flip ? rect.right + 8 : rect.left, y: rect.top - 4, flip });
    setShow(true);
  };

  return (
    <div
      className="relative cursor-help flex-shrink-0 inline-flex"
      onMouseEnter={handleEnter}
      onMouseLeave={() => setShow(false)}
    >
      <Info className="w-3 h-3 text-spire-muted/40 hover:text-spire-accent transition-colors" />
      {show && createPortal(
        <div
          className="fixed z-[100] w-64 pointer-events-none animate-fade-in"
          style={
            pos.flip
              ? { left: pos.x, top: pos.y }
              : { left: pos.x - 256, top: pos.y }
          }
        >
          <div className="glass-panel rounded-xl border border-spire-border/60 shadow-panel p-3 space-y-2">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-spire-border/30 pb-2">
              <span className={`${style.color} text-sm font-medium flex items-center gap-1.5`}>
                <span>{style.icon}</span>
                {event.type.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
              </span>
              <span className="text-[9px] text-spire-muted/60 tabular-nums">{time}</span>
            </div>

            {/* Actor */}
            {event.actorId ? (
              <div className="flex items-center gap-1.5 text-[10px]">
                <span className="text-spire-muted/60 uppercase tracking-wider">Actor</span>
                <span className="text-spire-white font-medium">{String(actorName)}</span>
              </div>
            ) : null}

            {/* Summary */}
            <div className="text-[11px] text-spire-white/80 leading-relaxed">
              {formatLogSummary(event.summary, state, event.type)}
            </div>

            {/* Ability description (for DICE_ROLLED with Action) */}
            {event.details?.description ? (
              <div className="border-t border-spire-border/30 pt-2 space-y-1">
                <div className="text-[9px] text-spire-muted/60 uppercase tracking-wider">Ability</div>
                <div className="text-[11px] text-spire-white/85 leading-relaxed">
                  {formatAbilityText(String(event.details.description))}
                </div>
              </div>
            ) : null}

          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

interface Props {
  onBack: () => void;
}

export function CombatView({ onBack }: Props) {
  const state = useGameStore((s) => s.state);
  const doHeroAction = useGameStore((s) => s.doHeroAction);
  const doHeroActionPhysical = useGameStore((s) => s.doHeroActionPhysical);
  const doMonsterTurnPhysical = useGameStore((s) => s.doMonsterTurnPhysical);
  const doEndTurn = useGameStore((s) => s.doEndTurn);
  const doUseItem = useGameStore((s) => s.doUseItem);
  const doResolveRoom = useGameStore((s) => s.doResolveRoom);
  const doBeginCombat = useGameStore((s) => s.doBeginCombat);
  const doForceCombatResult = useGameStore((s) => s.doForceCombatResult);
  const { playMusic, stopMusic, stopAllSfx, playSfx } = useAudio();
  const lastLogSeqRef = useRef(0);
  const lastEffectSeqRef = useRef(0);
  const [combatStarted, setCombatStarted] = useState(false);
  const combatStartedRef = useRef(false);
  const [defeatCountdown, setDefeatCountdown] = useState<number | null>(null);
  const [openDropdownHeroId, setOpenDropdownHeroId] = useState<string | null>(null);
  const [flashingApcIds, setFlashingApcIds] = useState<Set<string>>(new Set());
  const [combatLogExpanded, setCombatLogExpanded] = useState(false);
  const [showAbilitiesOverlay, setShowAbilitiesOverlay] = useState(false);
  const combatStatusRef = useRef<HTMLDivElement>(null);
  const [logHeight, setLogHeight] = useState(400);
  const logHeightRef = useRef(400);
  const handleLogResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = logHeightRef.current;
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientY - startY;
      const newHeight = Math.max(200, Math.min(window.innerHeight - 80, startHeight + delta));
      logHeightRef.current = newHeight;
      setLogHeight(newHeight);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.userSelect = "none";
  }, []);
  const lastMatchSeqRef = useRef(0);
  const [heroPulseDuration, setHeroPulseDuration] = useState(6);
  const heroesTurnStartRef = useRef<number | null>(null);
  const heroesScrollRef = useRef<HTMLDivElement>(null);
  const heroCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [flippedCards, setFlippedCards] = useState<{ rank: string; suit: string; display: string }[] | null>(null);
  const [isFirstFlip, setIsFirstFlip] = useState(false);
  const [cardFlipFading, setCardFlipFading] = useState(false);
  const lastCardFlipSeqRef = useRef(0);
  const cardBackUrl = getCardBackImage();

  const isCompanionMode = state?.settings.mode === "companion";
  const isHybridMode = state?.settings.mode === "hybrid";
  const isSandboxMode = state?.settings.mode === "sandbox";
  const isSimulationMode = state?.settings.mode === "simulation";
  const isPhysicalMode = state?.settings.rngMode === "physical";
  const aiControlledHeroes = useHybridStore((s) => s.aiControlledHeroes);
  const toggleHeroAI = useHybridStore((s) => s.toggleHeroAI);

  // Hybrid mode: auto-play AI-controlled hero turns via the canonical AI decision.
  const executeAIHeroTurn = useCallback((heroId: string, monsterId: string) => {
    const storeState = useGameStore.getState();
    const s = storeState.state;
    const rng = storeState.rng;
    if (!s?.combat || !rng) return;
    const combatStrategy = s.settings.combatStrategy ?? "balanced";
    const decision = aiPlayHeroTurn(s, rng, heroId, combatStrategy);
    if (decision.action === "use_item") {
      doUseItem(heroId, decision.itemName!, decision.targetId ?? heroId);
    } else if (decision.action === "end_turn") {
      doEndTurn(heroId);
    } else {
      doHeroAction(heroId, "attack", decision.targetId ?? monsterId);
    }
  }, [doHeroAction, doUseItem, doEndTurn]);

  useEffect(() => {
    if (!isHybridMode || !combatStarted || !state?.combat) return;
    if (state.combat.activeSide !== "heroes" || state.combat.combatResult) return;
    const nextHeroId = state.combat.heroTurnOrder.find(id =>
      !state.combat!.completedHeroTurns.includes(id) &&
      getLivingHeroes(state).some(h => h.id === id)
    );
    if (nextHeroId && aiControlledHeroes[nextHeroId]) {
      const timer = setTimeout(() => {
        executeAIHeroTurn(nextHeroId, state.combat!.monster.id);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isHybridMode, combatStarted, state, aiControlledHeroes, executeAIHeroTurn]);

  useEffect(() => {
    if (state?.combat) {
      const isBoss = state.combat.isMiniBoss || state.combat.isFinalBoss;
      playMusic(isBoss ? "boss" : "combat");
    }
  }, [state?.combat?.isMiniBoss, state?.combat?.isFinalBoss, playMusic]);

  useEffect(() => {
    if (state?.combat?.combatResult !== undefined) {
      stopMusic();
    }
  }, [state?.combat?.combatResult, stopMusic]);

  // Auto-start combat when page loads (skip in simulation mode — hook handles it)
  useEffect(() => {
    if (isSimulationMode) return;
    if (!combatStartedRef.current && state?.combat && state.combat.combatResult === undefined) {
      combatStartedRef.current = true;
      doBeginCombat();
      setCombatStarted(true);
    }
  }, [isSimulationMode, state?.combat, state?.combat?.combatResult, doBeginCombat]);

  // In simulation mode, mark combat as started once the hook has begun it
  useEffect(() => {
    if (!isSimulationMode || combatStartedRef.current) return;
    if (state?.combat && (state.combat.turnCount > 0 || state.combat.activeSide === "heroes")) {
      combatStartedRef.current = true;
      setCombatStarted(true);
    }
  }, [isSimulationMode, state?.combat?.turnCount, state?.combat?.activeSide]);

  // Track latest combat event for effect overlay + SFX
  const combatEvents = state?.combat ? state.log.filter(e =>
    ["DAMAGE_APPLIED", "HEAL_APPLIED", "ABILITY_TRIGGERED", "HERO_DIED", "MONSTER_DEFEATED", "COMBAT_ENDED"].includes(e.type)
  ) : [];
  const lastCombatEvent = combatEvents.length > 0 ? combatEvents[combatEvents.length - 1] : null;
  const lastEventSeq = lastCombatEvent?.sequence ?? 0;

  useEffect(() => {
    if (!combatStarted) return;
    if (lastEventSeq > lastLogSeqRef.current && lastCombatEvent) {
      lastLogSeqRef.current = lastEventSeq;
      const summary = lastCombatEvent.summary.toLowerCase();
      if (lastCombatEvent.type === "DAMAGE_APPLIED") {
        if (summary.includes("hero") || summary.includes("party")) {
          playSfx("combat", "hero_hit");
        } else {
          playSfx("combat", "monster_hit");
        }
        if (summary.includes("critical") || summary.includes("crit")) {
          playSfx("combat", "critical_hit");
        }
      } else if (lastCombatEvent.type === "HEAL_APPLIED") {
        playSfx("combat", "heal");
      } else if (lastCombatEvent.type === "ABILITY_TRIGGERED") {
        playSfx("combat", "magic_attack");
      } else if (lastCombatEvent.type === "MONSTER_DEFEATED" || lastCombatEvent.type === "COMBAT_ENDED") {
        if (summary.includes("victory") || summary.includes("defeated")) {
          playSfx("results", "victory");
        }
      } else if (lastCombatEvent.type === "HERO_DIED") {
        playSfx("combat", "hero_hit");
      }
    }
  }, [lastEventSeq, lastCombatEvent, playSfx, combatStarted]);

  // Auto-continue countdown on defeat (skip in simulation mode — hook handles it)
  useEffect(() => {
    if (isSimulationMode) return;
    if (state?.combat?.combatResult === "defeat" && defeatCountdown === null) {
      setDefeatCountdown(10);
    }
  }, [isSimulationMode, state?.combat?.combatResult, defeatCountdown]);

  useEffect(() => {
    if (defeatCountdown === null) return;
    if (defeatCountdown <= 0) {
      stopAllSfx();
      playSfx("ui", "transition");
      doResolveRoom();
      onBack();
      return;
    }
    const timer = setTimeout(() => setDefeatCountdown(defeatCountdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [defeatCountdown, playSfx, doResolveRoom, onBack, stopAllSfx]);

  // Watch for CARD_FLIPPED events to show card flip overlay
  const cardFlipEvents = state?.combat ? state.log.filter(e => e.type === "CARD_FLIPPED") : [];
  const lastCardFlipEvent = cardFlipEvents.length > 0 ? cardFlipEvents[cardFlipEvents.length - 1] : null;
  const lastCardFlipSeq = lastCardFlipEvent?.sequence ?? 0;

  useEffect(() => {
    if (!combatStarted || !state?.combat) return;
    if (lastCardFlipSeq <= lastCardFlipSeqRef.current) return;
    lastCardFlipSeqRef.current = lastCardFlipSeq;
    if (!lastCardFlipEvent) return;

    const cardDisplays = (lastCardFlipEvent.details?.cards as string[]) ?? [];
    if (cardDisplays.length === 0) return;

    const parsed = cardDisplays.map((display) => {
      const match = display.match(/^(\d+|[JQKA])(.+)/);
      return { rank: match?.[1] ?? "?", suit: match?.[2] ?? "", display };
    });

    const isFirst = cardFlipEvents.length === 1 && state.combat.round === 1;
    setIsFirstFlip(isFirst);
    setCardFlipFading(false);
    setFlippedCards(parsed);
    const showDuration = isFirst ? 4000 : 2000;
    const fadeDuration = 500;
    const fadeTimeout = window.setTimeout(() => setCardFlipFading(true), showDuration);
    const removeTimeout = window.setTimeout(() => {
      setFlippedCards(null);
      setCardFlipFading(false);
    }, showDuration + fadeDuration);
    return () => {
      window.clearTimeout(fadeTimeout);
      window.clearTimeout(removeTimeout);
    };
  }, [lastCardFlipSeq, lastCardFlipEvent, combatStarted, state?.combat, cardFlipEvents.length, state?.combat?.round]);

  // Watch for MATCH_DETECTED events to flash matched APCs
  const matchEvents = state?.combat ? state.log.filter(e => e.type === "MATCH_DETECTED") : [];
  const lastMatchEvent = matchEvents.length > 0 ? matchEvents[matchEvents.length - 1] : null;
  const lastMatchSeq = lastMatchEvent?.sequence ?? 0;

  // Spacebar to start combat from pre-combat overlay (skip in simulation mode)
  useEffect(() => {
    if (isSimulationMode || combatStarted || !state?.combat || state.combat.combatResult !== undefined) return;
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        playSfx("combat", "attack");
        combatStartedRef.current = true;
        doBeginCombat();
        setCombatStarted(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [combatStarted, state?.combat, state?.combat?.combatResult, playSfx, doBeginCombat]);

  useEffect(() => {
    if (!combatStarted || !state?.combat) return;
    if (lastMatchSeq <= lastMatchSeqRef.current) return;
    lastMatchSeqRef.current = lastMatchSeq;
    if (!lastMatchEvent) return;

    const matchedRanks: string[] = (lastMatchEvent.details?.matchedApcs as string[]) ?? [];
    const actorId = lastMatchEvent.details?.actorId as string | undefined;
    const flashIds = new Set<string>();

    if (actorId) {
      // Hero match — flash matching APCs on that hero
      const hero = state.party.heroes.find(h => h.id === actorId);
      if (hero) {
        hero.apcs.forEach(apc => {
          if (matchedRanks.includes(apc.rank)) {
            flashIds.add(apc.id);
          }
        });
      }
    } else {
      // Monster match — flash matching APCs on the monster
      state.combat.monster.apcs.forEach(apc => {
        if (matchedRanks.length > 0 && matchedRanks.includes(apc.rank)) {
          flashIds.add(apc.id);
        } else if (matchedRanks.length === 0) {
          // Monster events don't include matchedApcs — flash all APCs that match the description
          flashIds.add(apc.id);
        }
      });
    }

    if (flashIds.size > 0) {
      setFlashingApcIds(flashIds);
      const timeout = window.setTimeout(() => setFlashingApcIds(new Set()), 1200);
      return () => window.clearTimeout(timeout);
    }
  }, [lastMatchSeq, lastMatchEvent, combatStarted, state]);

  const isHeroPhase = !!state?.combat && state.combat.activeSide === "heroes" && state.combat.combatResult === undefined;

  useEffect(() => {
    if (isHeroPhase) {
      if (heroesTurnStartRef.current === null) {
        heroesTurnStartRef.current = Date.now();
        setHeroPulseDuration(6);
      }
      const interval = setInterval(() => {
        if (heroesTurnStartRef.current === null) return;
        const elapsed = (Date.now() - heroesTurnStartRef.current) / 1000;
        const newDur = Math.max(1.5, 6 - elapsed * 0.08);
        setHeroPulseDuration(newDur);
      }, 500);
      return () => clearInterval(interval);
    } else {
      heroesTurnStartRef.current = null;
      setHeroPulseDuration(6);
    }
  }, [isHeroPhase]);

  const combatMaybe = state?.combat;
  const livingHeroes = state ? getLivingHeroes(state) : [];
  const isCombatOver = combatMaybe?.combatResult !== undefined;

  // Collect new combat events for the effect overlay
  // (declared before the early return so the hook count is stable)
  const newEffectEvents = combatStarted ? combatEvents.filter(e => e.sequence > lastEffectSeqRef.current) : [];
  useEffect(() => {
    if (newEffectEvents.length > 0) {
      lastEffectSeqRef.current = newEffectEvents[newEffectEvents.length - 1].sequence;
    }
  }, [newEffectEvents]);

  // Spacebar to continue after combat ends
  useEffect(() => {
    if (!isCombatOver) return;
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        stopAllSfx();
        playSfx("ui", "transition");
        doResolveRoom();
        onBack();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isCombatOver, stopAllSfx, playSfx, doResolveRoom, onBack]);

  // ESC to close any open overlay
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        setShowAbilitiesOverlay(false);
        setOpenDropdownHeroId(null);
        setCombatLogExpanded(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const currentHeroId = isHeroPhase && combatMaybe ? combatMaybe.heroTurnOrder.find(id =>
    !combatMaybe.completedHeroTurns.includes(id) &&
    livingHeroes.some(h => h.id === id)
  ) : undefined;

  useEffect(() => {
    if (!currentHeroId) return;
    const container = heroesScrollRef.current;
    const card = heroCardRefs.current.get(currentHeroId);
    if (!container || !card) return;
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
    if (isDesktop) return;
    const containerRect = container.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const scrollLeft = container.scrollLeft + (cardRect.left - containerRect.left) - (containerRect.width - cardRect.width);
    container.scrollTo({ left: scrollLeft, behavior: "smooth" });
  }, [currentHeroId]);

  useEffect(() => {
    if (isCombatOver && combatStatusRef.current) {
      setCombatLogExpanded(true);
      const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
      if (!isDesktop) {
        setTimeout(() => {
          combatStatusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
      }
    }
  }, [isCombatOver]);

  if (!state || !state.combat) {
    return (
      <div className="text-center py-20">
        <p className="text-spire-muted">No active combat.</p>
      </div>
    );
  }

  const combat = state.combat;
  const monster = combat.monster;

  // Companion mode: compute suggestion for the current hero
  const companionSuggestion = isCompanionMode && currentHeroId
    ? suggestCombatAction(state, currentHeroId)
    : null;

  const recentEvents = state.log.filter(e =>
    ["TURN_STARTED", "CARD_FLIPPED", "MATCH_DETECTED", "DICE_ROLLED", "DAMAGE_APPLIED", "HEAL_APPLIED", "TOKEN_ADDED", "HERO_DIED", "MONSTER_DEFEATED", "COMBAT_ENDED", "ABILITY_TRIGGERED"].includes(e.type)
  ).slice(-50).reverse();

  const monsterImageUrl = getMonsterImage(monster.name);
  const monsterSpecialIcon = monster.specialState && monster.specialState["specialName"] ? getMonsterSpecialIcon(String(monster.specialState["specialName"])) : null;
  const fogUrl = getFogImage();
  const starsUrl = getStarsImage();
  const goldCoinUrl = getGoldCoinImage();

  const combatBg = getTierBackground(state.spire.tier);

  return (
    <div className="relative">
      <EffectOverlay
        newEvents={newEffectEvents.map(e => ({ type: e.type, summary: e.summary, sequence: e.sequence, targetIds: e.targetIds, actorId: e.actorId }))}
      />
      {combatBg && (
        <div
          className="bg-image-overlay bg-image-blur"
          style={{ backgroundImage: `url(${combatBg})`, opacity: 0.1 }}
        />
      )}
      {fogUrl && (
        <div
          className="bg-image-overlay"
          style={{ backgroundImage: `url(${fogUrl})`, opacity: 0.05 }}
        />
      )}

      {/* Start Combat overlay */}
      {!combatStarted && !isCombatOver && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 animate-fade-in">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-lg" />
          {combatBg && (
            <div
              className="absolute inset-0 bg-cover bg-center opacity-20"
              style={{ backgroundImage: `url(${combatBg})` }}
            />
          )}
          <div className="relative glass-panel rounded-2xl border border-spire-danger/30 shadow-panel p-3 sm:p-6 max-w-md w-full mx-2 sm:mx-4 max-h-[95vh] overflow-y-auto space-y-3 sm:space-y-5 animate-combat-panel-in"
            style={{
              boxShadow: "0 0 40px rgba(244, 63, 94, 0.15), 0 8px 32px rgba(0, 0, 0, 0.6)",
            }}
          >
            {/* Monster image with overlaid info */}
            <div className="relative w-full h-32 sm:h-64 rounded-2xl overflow-hidden border-2 border-spire-danger/40 shadow-lg shadow-spire-danger/20">
              {monsterImageUrl ? (
                <img
                  src={monsterImageUrl}
                  alt={monster.name}
                  className="w-full h-full object-cover"
                  style={{ objectPosition: "top center" }}
                />
              ) : (
                <div className="w-full h-full bg-spire-bg/60" />
              )}
              {/* Dark gradient overlay for text readability */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

              {/* Elite/boss badge — top right */}
              {(combat.isElite || combat.isMiniBoss || combat.isFinalBoss) && (
                <div className="absolute top-3 right-3 flex flex-col items-end gap-2">
                  <div className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider"
                    style={{
                      background: combat.isFinalBoss
                        ? "linear-gradient(135deg, rgba(212,175,55,0.9), rgba(245,158,11,0.8))"
                        : combat.isMiniBoss
                          ? "linear-gradient(135deg, rgba(139,92,246,0.9), rgba(217,70,239,0.8))"
                          : "linear-gradient(135deg, rgba(244,63,94,0.9), rgba(190,18,60,0.8))",
                      boxShadow: "0 2px 12px rgba(0,0,0,0.5)",
                    }}
                  >
                    {combat.isFinalBoss ? "👑 Final Boss" : combat.isMiniBoss ? "💀 Mini-Boss" : "⚔ Elite"}
                  </div>
                  {monsterSpecialIcon && (
                    <img src={monsterSpecialIcon} alt="Monster special icon" className="w-10 h-10 rounded-lg bg-black/50 backdrop-blur-sm border border-spire-border/50 p-1 object-contain" />
                  )}
                </div>
              )}
              {!(combat.isElite || combat.isMiniBoss || combat.isFinalBoss) && monsterSpecialIcon && (
                <img src={monsterSpecialIcon} alt="Monster special icon" className="absolute top-3 right-3 w-10 h-10 rounded-lg bg-black/50 backdrop-blur-sm border border-spire-border/50 p-1 object-contain" />
              )}

              {/* Card rank — top left */}
              <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg text-xs font-bold bg-black/60 backdrop-blur-sm border border-spire-border/50">
                {monster.sourceCard.display}
              </div>

              {/* Monster name — bottom overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-2 sm:p-4">
                <h2 className={`text-lg sm:text-2xl font-display drop-shadow-lg ${monster.name === "Sapling" ? "text-green-400" : "text-spire-danger"}`}>{monster.name}</h2>
                <div className="text-[10px] sm:text-xs text-spire-muted">{monster.type}</div>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {(() => {
                const sameType = MONSTERS.filter(m => m.type === monster.type);
                const minHp = Math.min(...sameType.map(m => m.baseHp));
                const maxHpVal = Math.max(...sameType.map(m => m.baseHp));
                const range = maxHpVal - minHp;
                const hpScale = range > 0
                  ? 1 + ((monster.maxHp - minHp) / range) * 0.4 - 0.2
                  : 1;
                return (
                  <div className="glass-card p-2 sm:p-3 text-center">
                    <div className="text-[10px] uppercase tracking-wider text-spire-muted/60">HP</div>
                    <div
                      className="font-bold text-spire-danger tabular-nums"
                      style={{ fontSize: `calc(1rem * ${hpScale.toFixed(2)})` }}
                    >
                      {monster.maxHp}
                    </div>
                  </div>
                );
              })()}
              <div className="glass-card p-2 sm:p-3 text-center">
                <div className="text-[10px] uppercase tracking-wider text-spire-muted/60">Gold Reward</div>
                <div className="flex items-center justify-center gap-1.5">
                  {goldCoinUrl && <img src={goldCoinUrl} alt="Gold" className="w-4 h-4 sm:w-5 sm:h-5 drop-shadow-[0_0_6px_rgba(212,175,55,0.4)]" />}
                  <span className="text-base sm:text-lg font-bold text-spire-gold tabular-nums">{monster.goldReward}g</span>
                </div>
              </div>
            </div>

            {/* Monster abilities */}
            {(() => {
              const monsterData = getMonsterById(monster.monsterId);
              if (!monsterData) return null;
              return (
                <div className="space-y-2 sm:space-y-3">
                  {/* Special ability */}
                  {monsterData.specialName && (
                    <div className="glass-card p-2 sm:p-3 border border-purple-500/20" style={{ boxShadow: "0 0 12px rgba(139,92,246,0.08)" }}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm flex-shrink-0">✦</span>
                        <span className="text-xs font-display font-bold text-purple-300 tracking-wide">{monsterData.specialName}</span>
                      </div>
                      <p className="text-[11px] text-spire-white/70 leading-relaxed pl-6">{colorizeHeads(monsterData.specialDescription)}</p>
                    </div>
                  )}

                  {/* Roll table */}
                  <div className="glass-card p-2 sm:p-3">
                    <div className="text-[10px] uppercase tracking-wider text-spire-muted/60 mb-2 sm:mb-2.5 flex items-center gap-1.5">
                      <span>🎲</span> Monster Roll Table
                    </div>
                    <div className="space-y-1.5 sm:space-y-2">
                      {monsterData.rollTable.map((entry, i) => {
                        const rollNum = typeof entry.roll === "number" ? entry.roll : parseInt(String(entry.roll));
                        const isHighRoll = rollNum >= 5;
                        const isLowRoll = rollNum <= 2;
                        const dieColor = isHighRoll
                          ? "bg-red-500/20 border-red-400/40 text-red-300"
                          : isLowRoll
                            ? "bg-emerald-500/15 border-emerald-400/30 text-emerald-300"
                            : "bg-spire-bg/80 border-spire-border/40 text-spire-gold";
                        const effectLower = entry.effect.toLowerCase();
                        const isDamage = effectLower.includes("damage") || effectLower.includes("deal");
                        const isHeal = effectLower.includes("heal");
                        const isSummon = effectLower.includes("summon") || effectLower.includes("spawn");
                        const isBuff = effectLower.includes("gain") || effectLower.includes("shield") || effectLower.includes("apc");
                        const actionIcon = isDamage ? "⚔️" : isHeal ? "💚" : isSummon ? "👹" : isBuff ? "⬆️" : "✨";
                        return (
                          <div key={i} className="flex items-start gap-2.5 text-[11px] leading-snug">
                            <span className={`flex-shrink-0 w-6 h-6 rounded-md border flex items-center justify-center text-[10px] font-extrabold tabular-nums ${dieColor}`}>
                              {entry.roll}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] flex-shrink-0">{actionIcon}</span>
                                <span className="font-medium text-spire-white/90">{entry.name}</span>
                              </div>
                              <div className="text-spire-muted pl-4">{formatAbilityText(entry.effect)}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Phases */}
                  {monsterData.phases && monsterData.phases.length > 0 && (
                    <div className="glass-card p-2 sm:p-3 border border-amber-500/20">
                      <div className="text-[10px] uppercase tracking-wider text-spire-muted/60 mb-2 flex items-center gap-1.5">
                        <span>📊</span> Phases
                      </div>
                      <div className="space-y-1.5 sm:space-y-2">
                        {monsterData.phases.map((phase, i) => (
                          <div key={i} className="text-[11px]">
                            <div className="font-medium text-amber-300/80">{phase.name} <span className="text-spire-muted/50 font-normal">({phase.hpRange})</span></div>
                            <ul className="pl-3 mt-0.5 space-y-0.5">
                              {phase.effects.map((eff, j) => (
                                <li key={j} className="text-spire-white/60 leading-snug">• {eff}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Environment */}
            <div className="glass-card p-2 sm:p-3 flex items-center gap-2.5">
              <span className="text-sm sm:text-base flex-shrink-0">{ENVIRONMENT_EMOJIS[combat.environment.name] ?? "🌍"}</span>
              <div className="min-w-0">
                <div className="text-xs font-medium text-cyan-400/80 truncate">{combat.environment.name}</div>
                <div className="text-[10px] text-spire-muted leading-snug">{colorizeApc(combat.environment.effect)}</div>
              </div>
            </div>

            {/* Start button */}
            <button
              className="btn-primary w-full text-sm sm:text-base py-2.5 sm:py-3.5 animate-pulse"
              onClick={() => {
                playSfx("combat", "attack");
                combatStartedRef.current = true;
                doBeginCombat();
                setCombatStarted(true);
              }}
            >
              ⚔️ Start Combat
            </button>
          </div>
        </div>
      )}

      {combatStarted && (
      <div className="relative z-10 flex flex-col lg:flex-row lg:gap-4 gap-4 lg:items-start">
      {/* Heroes — below monster on mobile, left column on desktop */}
      <div className="lg:w-[23%] lg:flex-shrink-0 order-2 lg:order-1 space-y-1">
        <h2 className="hidden lg:block text-sm font-display gold-text uppercase tracking-widest pb-0 lg:pt-3" style={{ borderBottom: "1px solid rgba(26, 26, 58, 0.4)" }}>Party</h2>
        <div ref={heroesScrollRef} className="flex lg:flex-col gap-2 lg:justify-between overflow-x-auto lg:overflow-visible no-scrollbar lg:space-y-1 pb-2 lg:pb-0 lg:h-full">
        {state.party.heroes.map((hero) => {
          const hasTurned = combat.completedHeroTurns.includes(hero.id);
          const isCurrentHero = hero.id === currentHeroId;
          const canAct = isCurrentHero && !hasTurned && hero.alive;
          return (
            <div key={hero.id} ref={(el) => { if (el) heroCardRefs.current.set(hero.id, el); else heroCardRefs.current.delete(hero.id); }} data-combat-target={hero.id} className={`glass-card p-4 relative flex-shrink-0 w-[200px] sm:w-[240px] lg:w-auto ${openDropdownHeroId === hero.id ? "z-30" : ""} ${!hero.alive ? "opacity-40 grayscale" : hasTurned ? "opacity-50" : ""} ${isCurrentHero ? "ring-2 ring-spire-accent/40" : ""}`}>
              <div className="flex items-center gap-2.5 mb-2">
                <HeroIcon hero={hero} size={36} isCurrentHero={isCurrentHero} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-display font-medium truncate ${CLASS_TEXT_COLORS[hero.className] ?? "text-spire-white"}`}>
                      {hero.specialization}
                    </span>
                    {hasTurned && <span className="text-xs text-spire-muted flex-shrink-0">✓</span>}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] uppercase tracking-wider text-spire-muted/60">{hero.className}</div>
                    <span className="text-xs text-spire-white font-medium tabular-nums">{hero.currentHp}/{hero.maxHp}</span>
                  </div>
                  <div className="hp-bar mt-1">
                    <div className="hp-bar-fill bg-gradient-to-r from-spire-danger to-spire-success"
                      style={{ width: `${(hero.currentHp / hero.maxHp) * 100}%` }} />
                  </div>
                </div>
              </div>
              <div className="flex gap-1.5 mb-2">
                {hero.apcs.map((apc, i) => {
                  const apcColor = getApcColors(apc.suit as any);
                  return (
                    <div
                      key={i}
                      className={`w-10 h-14 rounded-lg border-2 flex flex-col items-center justify-center shadow-lg transition-all duration-200 ${apc.matched ? "opacity-30 line-through" : ""} ${flashingApcIds.has(apc.id) ? "animate-apc-matched" : ""}`}
                      style={{
                        ...(apc.temporary ? { borderStyle: "dashed", borderColor: "rgba(245, 158, 11, 0.6)" } : {}),
                        background: apcColor.background,
                        borderColor: apc.temporary ? undefined : apcColor.borderColor,
                      }}
                    >
                      <span
                        className="font-bold leading-none"
                        style={{
                          fontSize: "1.25rem",
                          fontWeight: 900,
                          fontFamily: "'Arial Black', 'Helvetica Neue', sans-serif",
                          color: apcColor.color,
                          WebkitTextStroke: "1px rgba(0,0,0,0.8)",
                          textShadow: "0 1px 2px rgba(0,0,0,0.9)",
                        }}
                      >{apc.rank}</span>
                      <span
                        className="leading-none mt-0.5"
                        style={{
                          fontSize: "0.75rem",
                          color: apcColor.color,
                          opacity: 0.7,
                          WebkitTextStroke: "0.5px rgba(0,0,0,0.8)",
                        }}
                      >{suitSymbol(apc.suit as any)}</span>
                    </div>
                  );
                })}
              </div>
              {hero.tokens.length > 0 && (
                <div className="flex gap-1 mb-2 flex-wrap">
                  {hero.tokens.map((t, i) => (
                    <span key={i} className="token-badge bg-spire-border text-xs">
                      {t.type === "shield" ? "🔵" : t.type === "target" ? "🔴" : t.type === "buff" ? "⚫" : t.type === "debuff" ? "🟡" : "🟢"}
                    </span>
                  ))}
                </div>
              )}
              {(hero.pet || hero.secondPet) && (
                <div className="flex gap-2 mb-2 items-center flex-wrap">
                  {hero.pet && <PetIcon pet={hero.pet} size={18} />}
                  {hero.secondPet && <PetIcon pet={hero.secondPet} size={18} />}
                </div>
              )}
              {/* Hybrid mode: AI toggle button */}
              {isHybridMode && hero.alive && (
                <button
                  className={`text-[10px] px-2 py-0.5 rounded mb-1.5 transition-colors ${
                    aiControlledHeroes[hero.id]
                      ? "bg-purple-500/20 text-purple-300 border border-purple-400/30"
                      : "bg-spire-bg/40 text-spire-muted border border-spire-border/30"
                  }`}
                  onClick={() => toggleHeroAI(hero.id)}
                >
                  {aiControlledHeroes[hero.id] ? (
                    <span className="flex items-center gap-1"><Bot className="w-3 h-3" /> AI Auto</span>
                  ) : (
                    <span className="flex items-center gap-1"><User className="w-3 h-3" /> Manual</span>
                  )}
                </button>
              )}
              {/* Companion mode: AI suggestion banner */}
              {isCompanionMode && canAct && companionSuggestion && (
                <div className="mb-2 p-2 rounded-lg bg-cyan-500/10 border border-cyan-400/20 text-[10px] text-cyan-300 leading-snug">
                  <span className="font-medium">💡 AI Suggests:</span> {companionSuggestion.reason}
                </div>
              )}
              {canAct && isPhysicalMode && (
                <PhysicalInputPanel
                  actorName={hero.name}
                  onSubmit={(cards, rolls) => {
                    playSfx("combat", "attack");
                    doHeroActionPhysical(hero.id, "attack", monster.id, cards, rolls);
                  }}
                  onSkip={() => {
                    playSfx("combat", "attack");
                    doHeroAction(hero.id, "attack", monster.id);
                  }}
                />
              )}
              {canAct && !isPhysicalMode && (
                <div className="flex gap-2 items-stretch">
                  <button
                    className={`btn-primary text-xs px-3 flex-shrink-0 ${
                      isCompanionMode && companionSuggestion?.action === "attack"
                        ? "ring-2 ring-cyan-400/50 animate-pulse"
                        : ""
                    }`}
                    onClick={() => {
                      playSfx("combat", "attack");
                      doHeroAction(hero.id, "attack", monster.id);
                    }}
                  >
                    Take Turn
                  </button>
                  {hero.items.length > 0 && (
                    <div className="flex-1">
                      <ItemDropdown
                        items={hero.items}
                        onOpenChange={(isOpen) => setOpenDropdownHeroId(isOpen ? hero.id : null)}
                        onUse={(itemName) => {
                          playSfx("ui", "button_click");
                          doUseItem(hero.id, itemName, hero.id);
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        </div>
      </div>

      {/* Monster panel + Summons — first on mobile, center column on desktop */}
      <div className="lg:flex-1 order-1 lg:order-2 space-y-2">
        <div className="glass-panel p-4 sm:p-6 text-center relative overflow-hidden" data-combat-target={monster.id}>
          {/* Abilities button — top right */}
          <button
            type="button"
            className="absolute top-3 right-3 z-20 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg glass-panel border border-spire-border/50 hover:border-spire-accent/50 text-xs text-spire-muted hover:text-spire-accent transition-all duration-200 shadow-md"
            onClick={() => setShowAbilitiesOverlay(true)}
          >
            <ScrollText className="w-3.5 h-3.5" />
            <span>Abilities</span>
          </button>
          {/* Card flip overlay */}
          {flippedCards && (
            <div
              className={`absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px] animate-fade-in pointer-events-none transition-opacity duration-500 ${cardFlipFading ? "opacity-0" : "opacity-100"}`}
            >
              <div className="text-[10px] text-spire-muted uppercase tracking-wider mb-3">Cards Flipped</div>
              <div className="flex gap-3 sm:gap-4">
                {flippedCards.map((card, i) => {
                  const red = card.suit === "♥" || card.suit === "♦" || card.suit === "♥️" || card.suit === "♦️" || card.suit === "hearts" || card.suit === "diamonds";
                  return (
                    <div
                      key={i}
                      className="animate-card-flip-stagger"
                      style={{ animationDelay: `${i * (isFirstFlip ? 0.4 : 0.15)}s`, animationDuration: isFirstFlip ? "1.4s" : undefined, transformStyle: "preserve-3d", perspective: "600px" }}
                    >
                      <div className="w-16 h-24 sm:w-20 sm:h-28 rounded-lg border-2 flex flex-col items-center justify-center shadow-2xl"
                        style={{
                          background: red
                            ? "linear-gradient(135deg, rgba(244,63,94,0.2) 0%, rgba(5,5,12,0.95) 100%)"
                            : "linear-gradient(135deg, rgba(34,211,238,0.15) 0%, rgba(5,5,12,0.95) 100%)",
                          borderColor: red ? APC_COLORS.redBorder : APC_COLORS.blackBorder,
                        }}
                      >
                        <span
                          className="font-bold leading-none"
                          style={{
                            fontSize: "1.5rem",
                            fontWeight: 900,
                            fontFamily: "'Arial Black', 'Helvetica Neue', sans-serif",
                            color: red ? APC_COLORS.red : APC_COLORS.black,
                            WebkitTextStroke: "1px rgba(0,0,0,0.8)",
                            textShadow: "0 1px 2px rgba(0,0,0,0.9)",
                          }}
                        >{card.rank}</span>
                        <span
                          className="leading-none mt-1"
                          style={{
                            fontSize: "1rem",
                            color: red ? APC_COLORS.red : APC_COLORS.black,
                            opacity: 0.7,
                          }}
                        >{card.suit}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {starsUrl && (
            <div
              className="absolute inset-0 opacity-10 bg-cover bg-center"
              style={{ backgroundImage: `url(${starsUrl})` }}
            />
          )}
          <div className="relative z-10">
          <div className="text-xs text-spire-muted uppercase tracking-wider mb-2">
            {combat.isElite ? "Elite " : ""}{combat.isMiniBoss ? "Mini-Boss " : ""}{combat.isFinalBoss ? "Final Boss " : ""}Combat
          </div>
          {monsterImageUrl && (
            <div className="relative flex justify-center mb-3">
              <img
                src={monsterImageUrl}
                alt={monster.name}
                className="w-24 h-24 sm:w-32 sm:h-32 rounded-xl object-cover object-top border-2 border-spire-danger/40 shadow-lg shadow-spire-danger/20"
              />
              {monsterSpecialIcon && (
                <img src={monsterSpecialIcon} alt="Monster special icon" className="absolute top-1 right-1 w-7 h-7 rounded-lg bg-black/60 backdrop-blur-sm border border-spire-border/50 p-1 object-contain" />
              )}
            </div>
          )}
          <h2 className={`text-xl sm:text-2xl font-display mb-2 ${monster.name === "Sapling" ? "text-green-400" : "text-spire-danger"}`}>{monster.name}</h2>
          {monster.phase && (
            <div className="text-sm text-spire-gold mb-2">{monster.phase}</div>
          )}
          <div className="text-sm text-spire-muted mb-4">
            {monster.sourceCard.display} · {monster.type}
          </div>

          <div className="hp-bar mb-2 max-w-md mx-auto">
            <div className="hp-bar-fill bg-spire-danger"
              style={{ width: `${(monster.currentHp / monster.maxHp) * 100}%` }} />
          </div>
          <div className="text-lg font-medium">{monster.currentHp}/{monster.maxHp} HP</div>

          <div className="flex justify-center gap-2 mt-4">
            {monster.apcs.map((apc, i) => {
              const apcColor = getApcColors(apc.suit as any);
              return (
                <div
                  key={i}
                  className={`w-12 h-16 sm:w-14 sm:h-20 rounded-lg border-2 flex flex-col items-center justify-center shadow-lg transition-all duration-200 ${apc.matched ? "opacity-30 line-through" : ""} ${flashingApcIds.has(apc.id) ? "animate-apc-matched" : ""}`}
                  style={{
                    ...(apc.temporary ? { borderStyle: "dashed", borderColor: "rgba(245, 158, 11, 0.6)" } : {}),
                    background: apcColor.background,
                    borderColor: apc.temporary ? undefined : apcColor.borderColor,
                  }}
                >
                  <span
                    className="font-bold leading-none"
                    style={{
                      fontSize: "1.5rem",
                      fontWeight: 900,
                      fontFamily: "'Arial Black', 'Helvetica Neue', sans-serif",
                      color: apcColor.color,
                      WebkitTextStroke: "1px rgba(0,0,0,0.8)",
                      textShadow: "0 1px 2px rgba(0,0,0,0.9)",
                    }}
                  >{apc.rank}</span>
                  <span
                    className="leading-none mt-1"
                    style={{
                      fontSize: "0.875rem",
                      color: apcColor.color,
                      opacity: 0.7,
                      WebkitTextStroke: "0.5px rgba(0,0,0,0.8)",
                    }}
                  >{suitSymbol(apc.suit as any)}</span>
                </div>
              );
            })}
          </div>

          {monster.tokens.length > 0 && (
            <div className="flex justify-center gap-1 mt-3 flex-wrap">
              {monster.tokens.map((t, i) => (
                <span key={i} className="token-badge bg-spire-border text-xs">
                  {t.type === "shield" ? "🔵" : t.type === "target" ? "🔴" : t.type === "buff" ? "⚫" : t.type === "debuff" ? "🟡" : "🟢"}
                </span>
              ))}
            </div>
          )}

          {monster.untargetable && (
            <div className="text-spire-warning text-sm mt-2">👻 Untargetable</div>
          )}
          {monster.immune && (
            <div className="text-spire-warning text-sm mt-2">🛡️ Immune</div>
          )}
          </div>
        </div>

      {/* Summons + Environment + Combat status — below monster */}
      <div className="space-y-2">

        {/* Summons */}
        {combat.summons.length > 0 && (
          <div className="glass-card p-4">
            <div className="text-xs text-spire-muted uppercase tracking-wider mb-2">Summons</div>
            <div className="flex gap-3 flex-wrap">
              {combat.summons.map((summon) => {
                const summonData = SUMMON_DATA[summon.name];
                return (
                  <div key={summon.id} className={`text-xs relative group/summon ${summon.alive ? "" : "opacity-30 line-through"}`}>
                    <span className={`font-medium cursor-help ${summon.name === "Sapling" ? "text-green-400" : "text-spire-danger"}`}>{summon.name}</span>
                    <span className="text-spire-muted"> ({summon.currentHp}/{summon.maxHp} HP)</span>
                    {summonData && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-[80] w-56 pointer-events-none opacity-0 group-hover/summon:opacity-100 transition-opacity duration-200">
                        <div className="glass-panel rounded-xl border border-spire-border/60 shadow-panel p-3 space-y-2">
                          <div className="flex items-center gap-2 border-b border-spire-border/30 pb-1.5">
                            <span className={`text-sm font-display font-bold ${summon.name === "Sapling" ? "text-green-400" : "text-spire-danger"}`}>{summon.name}</span>
                            <span className="text-[9px] uppercase tracking-wider text-spire-muted/60">Summon</span>
                          </div>
                          <p className="text-[11px] text-spire-white/70 leading-relaxed">{summonData.description}</p>
                          <div className="flex items-center gap-3 text-[10px] pt-1 border-t border-spire-border/30">
                            <span className="text-spire-muted">HP: <span className="text-spire-white tabular-nums">{summonData.hp}</span></span>
                            <span className="text-spire-muted">DMG/Turn: <span className={`tabular-nums ${summonData.damage > 0 ? "text-spire-danger" : "text-spire-muted/50"}`}>{summonData.damage}</span></span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Environment */}
        <div className="glass-card p-4 text-center">
          <span className="text-base mr-1.5">{ENVIRONMENT_EMOJIS[combat.environment.name] ?? "🌍"}</span>
          <span className="text-sm gold-text font-medium">{combat.environment.name}</span>
          <span className="text-xs text-spire-muted"> — {colorizeApc(combat.environment.effect)}</span>
        </div>

        {/* Combat status */}
        <div ref={combatStatusRef} className="glass-card p-4 text-center">
          <div className="flex justify-center gap-3 sm:gap-6 text-xs sm:text-sm flex-wrap">
            <span>Round: <span className="gold-text font-medium">{combat.round}</span></span>
            <span>Turns: <span className="gold-text font-medium">{combat.turnCount}</span></span>
            <span>Active Side: {combat.activeSide === "heroes" ? (
              <span
                className="gold-text font-medium"
                style={{ animation: `hpBlink ${heroPulseDuration}s ease-in-out infinite` }}
              >{combat.activeSide}</span>
            ) : (
              <span className="gold-text font-medium">{combat.activeSide}</span>
            )}</span>
          </div>

          {combat.activeSide === "monster" && !isCombatOver && (
            <div className="mt-3 text-sm text-spire-warning animate-pulse">
              ⚙️ Monster is taking its turn...
            </div>
          )}

          {isCombatOver && (
            <div className="mt-4">
              <div className={`text-xl font-display mb-3 ${combat.combatResult === "victory" ? "text-spire-success" : "text-spire-danger"}`}>
                {combat.combatResult === "victory" ? "🏆 Victory!" : combat.combatResult === "defeat" ? "💀 Defeat" : "🏃 Retreat"}
              </div>
              <button className="btn-gold" onClick={() => { stopAllSfx(); playSfx("ui", "transition"); doResolveRoom(); onBack(); }}>
                {combat.combatResult === "defeat" && defeatCountdown !== null && defeatCountdown > 0
                  ? `Continue (${defeatCountdown}) →`
                  : "Continue →"}
              </button>
              <div className="hidden sm:block text-[10px] text-spire-muted/50 mt-1.5 uppercase tracking-wider">
                Press <kbd className="px-1 py-0.5 rounded border border-spire-border/40 bg-spire-bg/60 text-spire-muted/70 text-[9px] font-mono">Space</kbd> to continue
              </div>
            </div>
          )}

          {/* Sandbox mode: force combat result buttons */}
          {isSandboxMode && !isCombatOver && combatStarted && (
            <div className="mt-3 pt-3 border-t border-spire-border/20">
              <div className="text-[10px] uppercase tracking-wider text-spire-muted mb-1.5">🧪 Sandbox: Force Result</div>
              <div className="flex justify-center gap-2">
                <button className="btn-primary text-[10px] px-2 py-1 bg-spire-success hover:bg-spire-success/80" onClick={() => doForceCombatResult("victory")}>
                  Force Victory
                </button>
                <button className="btn-primary text-[10px] px-2 py-1 bg-spire-danger hover:bg-spire-danger/80" onClick={() => doForceCombatResult("defeat")}>
                  Force Defeat
                </button>
                <button className="btn-ghost text-[10px] px-2 py-1" onClick={() => doForceCombatResult("retreat")}>
                  Force Retreat
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
      </div>

      {/* Right: Combat Log */}
      <div className={`lg:w-[23%] lg:flex-shrink-0 order-4 lg:order-3 lg:sticky lg:top-14 lg:self-start lg:h-[calc(100vh-3.5rem)] lg:flex lg:flex-col lg:overflow-hidden`}>
        <h2 className="hidden lg:block text-sm font-display gold-text uppercase tracking-widest pb-2 lg:pt-3 text-center" style={{ borderBottom: "1px solid rgba(26, 26, 58, 0.4)" }}>Combat Log</h2>
        <button
          className="lg:hidden w-full text-left text-xs font-medium text-spire-muted uppercase tracking-wider py-2 px-3 rounded-lg bg-spire-bg/40 border border-spire-border/30 flex items-center justify-between"
          onClick={() => setCombatLogExpanded(!combatLogExpanded)}
        >
          <span>📜 Combat Log ({recentEvents.length})</span>
          <span className={`transition-transform ${combatLogExpanded ? "rotate-180" : ""}`}>▼</span>
        </button>
        <div
          className={`glass-panel-transparent p-2 sm:p-4 overflow-y-auto space-y-2 relative ${combatLogExpanded ? "max-h-[300px]" : "max-h-[80px]"} lg:flex-1 lg:min-h-0 lg:mt-1`}
          style={{ maxHeight: typeof window !== "undefined" && window.innerWidth >= 1024 ? `${Math.min(logHeight, window.innerHeight - 200)}px` : undefined }}
        >
          {cardBackUrl && (
            <div className="absolute inset-0 pointer-events-none opacity-[0.04] bg-cover bg-center" style={{ backgroundImage: `url(${cardBackUrl})` }} />
          )}
          <div className="relative z-10">
          {recentEvents.length === 0 ? (
            <div className="text-xs text-spire-muted text-center py-4">Combat just started</div>
          ) : (
            recentEvents.map((event) => {
              const isDiceRoll = event.type === "DICE_ROLLED";
              const rawRoll = isDiceRoll ? (event.details?.rawRoll as number) ?? 1 : 0;
              const style = getEventTypeStyle(event.type);
              return (
                <div key={event.id} className="text-xs border-b border-spire-border/20 pb-2 last:border-0 flex items-start gap-1">
                  <span className={`${style.color} flex-shrink-0`}>{style.icon}</span>
                  <div className="flex-1 min-w-0">
                    {isDiceRoll && <InlineDieIcon finalValue={rawRoll} />}{" "}
                    <span className="text-spire-white/90">{formatLogSummary(event.summary, state, event.type)}</span>
                  </div>
                  {(event.type === "ABILITY_TRIGGERED" || event.summary.includes("Action:")) && <CombatLogTooltip event={event} state={state} />}
                  <ExplainTurnIcon event={event} />
                </div>
              );
            })
          )}
          </div>
        </div>
        {/* Desktop drag-to-resize handle */}
        <div
          className="hidden lg:flex items-center justify-center h-1.5 cursor-ns-resize hover:h-3 hover:bg-spire-accent/10 transition-all duration-150 group flex-shrink-0"
          onMouseDown={handleLogResizeStart}
        >
          <div className="w-10 h-1 rounded-full bg-spire-border/40 group-hover:bg-spire-accent/50 transition-colors" />
        </div>
      </div>
      </div>
      )}

      {/* Monster Abilities Overlay */}
      {showAbilitiesOverlay && combatStarted && (() => {
        const monsterData = getMonsterById(monster.monsterId);
        if (!monsterData) return null;
        return createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 animate-fade-in"
            onClick={() => setShowAbilitiesOverlay(false)}
          >
            <div className="absolute inset-0 bg-black/80 backdrop-blur-lg" />
            {combatBg && (
              <div
                className="absolute inset-0 bg-cover bg-center opacity-15"
                style={{ backgroundImage: `url(${combatBg})` }}
              />
            )}
            <div
              className="relative glass-panel rounded-2xl border border-spire-danger/30 shadow-panel max-w-lg w-full mx-2 sm:mx-4 max-h-[90vh] overflow-y-auto"
              style={{ boxShadow: "0 0 40px rgba(244, 63, 94, 0.12), 0 8px 32px rgba(0, 0, 0, 0.6)" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                type="button"
                className="absolute top-3 right-3 z-10 w-8 h-8 rounded-lg glass-panel border border-spire-border/50 hover:border-spire-danger/50 flex items-center justify-center text-spire-muted hover:text-spire-danger transition-all duration-200"
                onClick={() => setShowAbilitiesOverlay(false)}
              >
                <X className="w-4 h-4" />
              </button>

              <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
                {/* Header */}
                <div className="flex items-center gap-3 sm:gap-4 border-b border-spire-border/30 pb-4">
                  {monsterImageUrl && (
                    <img
                      src={monsterImageUrl}
                      alt={monster.name}
                      className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover object-top border-2 border-spire-danger/40 shadow-lg shadow-spire-danger/20 flex-shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <h2 className={`text-lg sm:text-xl font-display ${monster.name === "Sapling" ? "text-green-400" : "text-spire-danger"}`}>{monster.name}</h2>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[10px] uppercase tracking-wider text-spire-muted/60">{monster.type}</span>
                      <span className="text-[10px] text-spire-muted/40">·</span>
                      <span className="text-[10px] text-spire-muted/60">{monster.sourceCard.display}</span>
                      {monster.phase && (
                        <>
                          <span className="text-[10px] text-spire-muted/40">·</span>
                          <span className="text-[10px] text-spire-gold">{monster.phase}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {monsterSpecialIcon && (
                    <img src={monsterSpecialIcon} alt="Monster special icon" className="w-10 h-10 rounded-lg bg-black/50 backdrop-blur-sm border border-spire-border/50 p-1 object-contain flex-shrink-0" />
                  )}
                </div>

                {/* Special Ability */}
                {monsterData.specialName && (
                  <div className="glass-card p-3 sm:p-4 border border-purple-500/20" style={{ boxShadow: "0 0 16px rgba(139,92,246,0.1)" }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-base flex-shrink-0">✦</span>
                      <span className="text-sm font-display font-bold text-purple-300 tracking-wide">{monsterData.specialName}</span>
                    </div>
                    <p className="text-xs sm:text-[13px] text-spire-white/70 leading-relaxed pl-7">{colorizeHeads(monsterData.specialDescription)}</p>
                  </div>
                )}

                {/* Roll Table */}
                <div className="glass-card p-3 sm:p-4">
                  <div className="text-xs uppercase tracking-wider text-spire-muted/60 mb-3 flex items-center gap-1.5">
                    <span>🎲</span> Monster Roll Table
                  </div>
                  <div className="space-y-2.5 sm:space-y-3">
                    {monsterData.rollTable.map((entry, i) => {
                      const rollNum = typeof entry.roll === "number" ? entry.roll : parseInt(String(entry.roll));
                      const isHighRoll = rollNum >= 5;
                      const isLowRoll = rollNum <= 2;
                      const dieColor = isHighRoll
                        ? "bg-red-500/20 border-red-400/40 text-red-300"
                        : isLowRoll
                          ? "bg-emerald-500/15 border-emerald-400/30 text-emerald-300"
                          : "bg-spire-bg/80 border-spire-border/40 text-spire-gold";
                      const effectLower = entry.effect.toLowerCase();
                      const isDamage = effectLower.includes("damage") || effectLower.includes("deal");
                      const isHeal = effectLower.includes("heal");
                      const isSummon = effectLower.includes("summon") || effectLower.includes("spawn");
                      const isBuff = effectLower.includes("gain") || effectLower.includes("shield") || effectLower.includes("apc");
                      const actionIcon = isDamage ? "⚔️" : isHeal ? "💚" : isSummon ? "👹" : isBuff ? "⬆️" : "✨";
                      return (
                        <div key={i} className="flex items-start gap-3 text-xs sm:text-[13px] leading-snug">
                          <span className={`flex-shrink-0 w-7 h-7 rounded-md border flex items-center justify-center text-[11px] font-extrabold tabular-nums ${dieColor}`}>
                            {entry.roll}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] flex-shrink-0">{actionIcon}</span>
                              <span className="font-medium text-spire-white/90">{entry.name}</span>
                            </div>
                            <div className="text-spire-muted pl-5 mt-0.5">{formatAbilityText(entry.effect)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Phases */}
                {monsterData.phases && monsterData.phases.length > 0 && (
                  <div className="glass-card p-3 sm:p-4 border border-amber-500/20">
                    <div className="text-xs uppercase tracking-wider text-spire-muted/60 mb-3 flex items-center gap-1.5">
                      <span>📊</span> Phases
                    </div>
                    <div className="space-y-3">
                      {monsterData.phases.map((phase, i) => (
                        <div key={i} className="text-xs sm:text-[13px]">
                          <div className="font-medium text-amber-300/80">
                            {phase.name} <span className="text-spire-muted/50 font-normal">({phase.hpRange})</span>
                          </div>
                          <ul className="pl-4 mt-1 space-y-1">
                            {phase.effects.map((eff, j) => (
                              <li key={j} className="text-spire-white/60 leading-snug">• {eff}</li>
                            ))}
                          </ul>
                          {phase.rollOverrides && phase.rollOverrides.length > 0 && (
                            <div className="mt-2 pl-4 space-y-1">
                              <div className="text-[10px] uppercase tracking-wider text-amber-400/40">Roll Overrides</div>
                              {phase.rollOverrides.map((ov, j) => (
                                <div key={j} className="flex items-center gap-2 text-[11px]">
                                  <span className="flex-shrink-0 w-5 h-5 rounded border border-amber-400/30 bg-amber-500/10 text-amber-300 flex items-center justify-center font-bold tabular-nums">{ov.roll}</span>
                                  <span className="font-medium text-amber-200/70">{ov.name}</span>
                                  <span className="text-spire-muted">— {formatAbilityText(ov.effect)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        );
      })()}
    </div>
  );
}
