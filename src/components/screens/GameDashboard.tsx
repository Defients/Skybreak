import { useEffect, useRef, useState, useCallback } from "react";
import { useGameStore } from "../../app/gameStore";
import type { ScreenName } from "../../app/App";
import { formatRoomType, formatTier } from "../../utils/format";
import { getLivingHeroes } from "../../engine/rulesEngine";
import { useAudio } from "../../audio/useAudio";
import { suggestSplitChoice } from "../../engine/aiAdvisor";
import { SandboxPanel } from "../ui/SandboxPanel";
import {
  getRoomImage,
  getDoorImage,
  getGoldCoinImage,
  getMonsterImage,
  getTierBackground,
  getCardBackImage,
} from "../../assets/assetRegistry";
import { formatLogSummary, getEventTypeStyle } from "../../utils/logFormatter";
import { Tooltip } from "../ui/Tooltip";
import { resolveItemData } from "../../data/items";
import { getItemImage, getItemImageById } from "../../assets/assetRegistry";
import { suitSymbol, isRedSuit, getApcColors } from "../../types/cards";
import { CLASS_TEXT_COLORS } from "../../utils/nameResolver";
import { HeroIcon } from "../ui/HeroIcon";
import { PetIcon } from "../ui/PetIcon";

const TIER_COLORS: Record<number, string> = {
  1: "#22d3ee",
  2: "#a78bfa",
  3: "#f43f5e",
};

interface Props {
  onNavigate: (screen: ScreenName) => void;
}

export function GameDashboard({ onNavigate }: Props) {
  const state = useGameStore((s) => s.state);
  const doAdvanceRoom = useGameStore((s) => s.doAdvanceRoom);
  const doResolveSplit = useGameStore((s) => s.doResolveSplit);
  const doStartCombat = useGameStore((s) => s.doStartCombat);
  const doResolveRoom = useGameStore((s) => s.doResolveRoom);
  const doEnterMerchant = useGameStore((s) => s.doEnterMerchant);
  const doEnterRest = useGameStore((s) => s.doEnterRest);
  const { playMusic, playSfx } = useAudio();
  const [eventLogExpanded, setEventLogExpanded] = useState(true);
  const [merchantCooldown, setMerchantCooldown] = useState(0);
  const [merchantCooldownStarted, setMerchantCooldownStarted] = useState(false);
  const [logHeight, setLogHeight] = useState(400);
  const handleLogResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = logHeight;
    const onMove = (ev: PointerEvent) => {
      const delta = ev.clientY - startY;
      const newHeight = Math.max(200, Math.min(window.innerHeight - 80, startHeight + delta));
      setLogHeight(newHeight);
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.body.style.userSelect = "none";
  }, [logHeight]);

  useEffect(() => {
    if (state) {
      playMusic(`tier${state.spire.tier}` as any);
    }
  }, [state?.spire.tier, playMusic]);

  if (!state) return null;

  const room = state.spire.currentRoom;
  const livingHeroes = getLivingHeroes(state);
  const recentEvents = state.log.slice(-50).reverse();
  const cardBackUrl = getCardBackImage();
  const isCompanionMode = state.settings.mode === "companion";
  const isSandboxMode = state.settings.mode === "sandbox";
  const splitSuggestion = isCompanionMode && room?.type === "split" && state.spire.splitChoicePending
    ? suggestSplitChoice(state)
    : null;

  const roomImageUrl = room ? getRoomImage(room.type) : null;
  const doorUrl = getDoorImage();
  const goldCoinUrl = getGoldCoinImage();
  const monsterImageUrl = state.combat ? getMonsterImage(state.combat.monster.name) : null;

  const handleRoomAction = () => {
    if (!room) return;

    if (room.type === "split" && state.spire.splitChoicePending) return;

    playSfx("rooms", "door_open");

    if (room.type === "combat" || room.type === "elite_combat") {
      doStartCombat({ isElite: room.type === "elite_combat" });
      onNavigate("combat");
    } else if (room.type === "mini_boss") {
      doStartCombat({ isMiniBoss: true });
      onNavigate("combat");
    } else if (room.type === "final_boss") {
      doStartCombat({ isFinalBoss: true });
      onNavigate("combat");
    } else if (room.type === "merchant") {
      doEnterMerchant();
      onNavigate("merchant");
    } else if (room.type === "rest") {
      doEnterRest();
      onNavigate("rest");
    }
  };

  const canEnterRoom = room && !room.resolved && !(state.phase === "combat" && state.combat?.combatResult);
  const handleRoomActionRef = useRef(handleRoomAction);
  handleRoomActionRef.current = handleRoomAction;

  useEffect(() => {
    if (merchantCooldown <= 0) return;
    const timer = setTimeout(() => setMerchantCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(timer);
  }, [merchantCooldown]);

  useEffect(() => {
    if (room?.type === "merchant" && !room.resolved && !merchantCooldownStarted) {
      setMerchantCooldownStarted(true);
      setMerchantCooldown(3);
    } else if (room?.type !== "merchant" && merchantCooldownStarted) {
      setMerchantCooldownStarted(false);
      setMerchantCooldown(0);
    }
  }, [room?.type, room?.resolved, merchantCooldownStarted]);

  useEffect(() => {
    if (!canEnterRoom || merchantCooldown > 0) return;
    const onKeydown = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        handleRoomActionRef.current();
      }
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [canEnterRoom, merchantCooldown]);

  useEffect(() => {
    if (room?.type !== "split" || !state.spire.splitChoicePending) return;
    const onKeydown = (e: KeyboardEvent) => {
      if (e.code === "ArrowLeft") {
        e.preventDefault();
        doResolveSplit(0);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        doResolveSplit(1);
      }
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [room?.type, state.spire.splitChoicePending, doResolveSplit]);

  return (
    <div className="flex flex-col lg:grid lg:grid-cols-12 lg:gap-4 gap-4">
      {/* Left panel: Party */}
      <div className="lg:col-span-3 space-y-1">
        <h2 className="hidden lg:block text-sm font-display gold-text uppercase tracking-widest pb-0 lg:pt-3" style={{ borderBottom: "1px solid rgba(26, 26, 58, 0.4)" }}>Party</h2>
        <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible no-scrollbar lg:space-y-1 lg:-mt-2 pb-2 lg:pb-0">
        {state.party.heroes.map((hero) => (
          <div key={hero.id} className={`glass-card p-4 relative flex-shrink-0 w-[220px] lg:w-auto ${!hero.alive ? "opacity-40 grayscale" : ""}`}>
            <div className="flex items-center gap-2.5 mb-2">
                <HeroIcon hero={hero} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-display font-medium truncate ${CLASS_TEXT_COLORS[hero.className] ?? "text-spire-white"}`}>
                      {hero.specialization}
                    </span>
                    {!hero.alive && <span className="text-xs text-spire-danger flex-shrink-0">Dead</span>}
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
            <div className="flex gap-1 mb-2 flex-wrap">
              {hero.apcs.map((apc, i) => {
                const apcColor = getApcColors(apc.suit as any);
                return (
                  <span key={i} className={`apc-slot text-xs flex flex-col items-center justify-center ${apcColor.red ? "apc-slot-red" : ""}`}>
                    <span className="font-bold leading-none" style={{ color: apcColor.color }}>{apc.rank}</span>
                    <span className="leading-none mt-0.5" style={{ fontSize: "0.7rem", color: apcColor.color, opacity: 0.7 }}>{suitSymbol(apc.suit as any)}</span>
                  </span>
                );
              })}
            </div>
            {hero.items.length > 0 && (
              <div className="text-xs text-spire-muted mt-1 flex items-center flex-wrap gap-1.5">
                {hero.items.map((item, idx) => {
                  const itemData = resolveItemData(item);
                  const effect = itemData?.effect ?? item.effect;
                  const iUrl = getItemImageById(item.itemId ?? "") ?? getItemImage(item.name);
                  return (
                    <Tooltip
                      key={idx}
                      side="right"
                      content={
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            {iUrl && (
                              <img src={iUrl} alt={item.name} className="w-7 h-7 rounded object-contain border border-spire-border/50" />
                            )}
                            <span className="text-xs font-semibold text-cyan-300">{item.name}</span>
                            {item.quantity > 1 && (
                              <span className="text-[10px] text-spire-muted">x{item.quantity}</span>
                            )}
                          </div>
                          <div className="text-[11px] text-spire-white/80 leading-snug">
                            {effect}
                          </div>
                        </div>
                      }
                    >
                      <span className="cursor-help inline-flex items-center gap-0.5">
                        {iUrl ? (
                          <img src={iUrl} alt={item.name} className="w-5 h-5 object-contain" />
                        ) : (
                          <span className="text-sm">📦</span>
                        )}
                        {item.quantity > 1 && <span className="text-[10px] text-spire-muted">x{item.quantity}</span>}
                      </span>
                    </Tooltip>
                  );
                })}
              </div>
            )}
            {hero.tokens.length > 0 && (
              <div className="flex gap-1 mt-2 flex-wrap">
                {hero.tokens.map((t, i) => (
                  <span key={i} className="token-badge bg-spire-border text-xs">
                    {t.type === "shield" ? "🔵" : t.type === "target" ? "🔴" : t.type === "buff" ? "⚫" : t.type === "debuff" ? "🟡" : "🟢"}
                  </span>
                ))}
              </div>
            )}
            {(hero.pet || hero.secondPet) && (
              <div className="flex gap-2 mt-2 items-center flex-wrap">
                {hero.pet && <PetIcon pet={hero.pet} size={18} />}
                {hero.secondPet && <PetIcon pet={hero.secondPet} size={18} />}
              </div>
            )}
          </div>
        ))}
        </div>
        <div className="glass-card p-4 text-center hidden lg:block mx-auto" style={{ width: "60%" }}>
          <div className="text-lg gold-text font-display flex items-center justify-center gap-1.5">
            {goldCoinUrl ? (
              <img src={goldCoinUrl} alt="Gold" className="w-5 h-5 inline-block" />
            ) : (
              "💰"
            )}
            {state.party.gold}g
          </div>
          <div className="text-xs text-spire-muted mt-0.5">Party Gold</div>
        </div>
      </div>

      {/* Center panel: Room / Spire */}
      <div className={`lg:col-span-6 space-y-4 lg:flex lg:flex-col lg:justify-start ${
        room?.type === "merchant" && !room?.resolved ? "lg:pt-10"
        : room?.type === "combat" || room?.type === "elite_combat" || room?.type === "mini_boss" || room?.type === "final_boss" ? "lg:pt-11"
        : "lg:pt-20"
      }`}>
        <div className="glass-panel p-4 sm:p-8 text-center relative overflow-visible">
          {roomImageUrl && (
            <div
              className="absolute inset-0 opacity-20 bg-cover bg-center overflow-hidden rounded-[inherit]"
              style={{ backgroundImage: `url(${roomImageUrl})` }}
            />
          )}
          <div className="relative z-10">
          <div className="text-xs uppercase tracking-wider mb-2 flex items-center justify-center gap-1.5">
            <span className="text-spire-muted">Tier</span>
            <span className="font-bold" style={{ color: TIER_COLORS[state.spire.tier] ?? "#d4af37", textShadow: `0 0 8px ${TIER_COLORS[state.spire.tier] ?? "#d4af37"}40` }}>{state.spire.tier}</span>
            <span className="text-spire-muted/60">—</span>
            <span className="font-medium" style={{ color: TIER_COLORS[state.spire.tier] ?? "#d4af37" }}>{formatTier(state.spire.tier)}</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-display gold-text mb-3">
            {room ? formatRoomType(room.type) : "Unknown"}
          </h2>
          <div className="text-3xl sm:text-4xl mb-3">{room?.symbol}</div>
          <div className="text-sm text-spire-muted mb-6">
            Room {state.spire.roomIndex + 1} of {state.spire.rooms.length}
          </div>

          {/* Spire progress */}
          <div className="flex justify-center gap-1 sm:gap-2 mb-7 flex-wrap">
            {state.spire.rooms.map((r, i) => {
              const isCurrent = i === state.spire.roomIndex;
              const isPast = r.resolved;
              const isUpcoming = !isCurrent && !isPast;
              const roomTypeInfo: Record<string, { color: string; desc: string }> = {
                combat: { color: "text-red-400", desc: "Fight a monster. Roll dice to attack and defend. Earn gold and loot on victory." },
                elite_combat: { color: "text-red-500", desc: "Tougher enemy with higher HP and damage. Greater rewards await the brave." },
                mini_boss: { color: "text-fuchsia-400", desc: "A powerful foe guarding the tier. Expect special abilities and deadly mechanics." },
                final_boss: { color: "text-fuchsia-500", desc: "The summit trial — Vyridian awaits. Survive the judgment to complete the ascent." },
                merchant: { color: "text-amber-400", desc: "Spend gold on weapons, items, healing, upgrades, and enchantments." },
                rest: { color: "text-emerald-400", desc: "Recover HP, revive fallen heroes, or train for permanent bonuses." },
                split: { color: "text-violet-400", desc: "Choose your path — two room options with different risks and rewards." },
              };
              const info = roomTypeInfo[r.type];
              const roomImg = isUpcoming ? getRoomImage(r.type) : null;

              const dot = (
                <div
                  className={`w-7 h-7 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center text-[10px] sm:text-xs transition-all duration-200 ${
                    isCurrent
                      ? "bg-spire-accent text-white ring-2 ring-spire-accent shadow-md shadow-spire-accent/30"
                      : isPast
                      ? "bg-spire-success/20 text-spire-success border border-spire-success/30"
                      : "bg-spire-bg text-spire-muted border border-spire-border"
                  }`}
                >
                  {r.symbol}
                </div>
              );

              if (isUpcoming && info) {
                return (
                  <Tooltip
                    key={i}
                    side="bottom"
                    content={
                      <div className="space-y-1.5 w-52">
                        <div className="flex items-center gap-2">
                          {roomImg && <img src={roomImg} alt={formatRoomType(r.type)} className="w-8 h-8 rounded object-cover" />}
                          <div>
                            <div className={`text-sm font-bold ${info.color}`}>{formatRoomType(r.type)}</div>
                            <div className="text-[10px] text-spire-muted/70">Room {i + 1} · Tier {r.tier}</div>
                          </div>
                        </div>
                        <div className="text-[11px] text-spire-white/80 leading-relaxed border-t border-spire-border/30 pt-1.5">
                          {info.desc}
                        </div>
                      </div>
                    }
                  >
                    {dot}
                  </Tooltip>
                );
              }

              return <div key={i}>{dot}</div>;
            })}
          </div>

          {room?.type === "split" && state.spire.splitChoicePending ? (
            <div className="space-y-3">
              <p className="text-spire-white">Choose your path:</p>
              <div className="flex justify-center gap-6">
                {room.splitOptions?.map((opt, i) => {
                  const optRoomImg = getRoomImage(opt.type);
                  const isElite = opt.type === "elite_combat" || opt.type === "mini_boss" || opt.type === "final_boss";
                  const isCombat = opt.type === "combat" || isElite;
                  const bgGlow = isElite
                    ? "bg-gradient-to-b from-red-950/80 to-red-950/30 border border-red-500/40"
                    : isCombat
                    ? "bg-gradient-to-b from-red-950/60 to-red-950/20 shadow-[0_0_24px_rgba(239,68,68,0.25)]"
                    : opt.type === "merchant"
                    ? "bg-gradient-to-b from-amber-950/60 to-amber-950/20 shadow-[0_0_24px_rgba(245,158,11,0.25)]"
                    : opt.type === "rest"
                    ? "bg-gradient-to-b from-emerald-950/60 to-emerald-950/20 shadow-[0_0_24px_rgba(16,185,129,0.25)]"
                    : "bg-gradient-to-b from-violet-950/60 to-violet-950/20 shadow-[0_0_24px_rgba(139,92,246,0.25)]";
                  return (
                    <button
                      key={i}
                      className={`group relative hover:scale-105 transition-transform duration-200 rounded-xl p-3 ${bgGlow} ${isCompanionMode && splitSuggestion?.index === i ? "ring-2 ring-cyan-400/50" : ""}`}
                      style={isElite
                        ? { animation: "fearsomeFlicker 4s ease-in-out infinite" }
                        : isCombat
                        ? { animation: "gentleBreath 5s ease-in-out infinite" }
                        : { animation: "pulseGlow 3s ease-in-out infinite" }
                      }
                      onClick={() => doResolveSplit(i)}
                    >
                      {isCompanionMode && splitSuggestion?.index === i && (
                        <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded-full border border-cyan-400/30 whitespace-nowrap z-10">💡 Recommended</span>
                      )}
                      <kbd className={`absolute top-1.5 ${i === 0 ? "left-1.5" : "right-1.5"} px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950/70 border border-cyan-500/40 text-cyan-300/70 group-hover:text-cyan-200 group-hover:border-cyan-400/60 transition-colors z-10`}>
                        {i === 0 ? "←" : "→"}
                      </kbd>
                      {optRoomImg ? (
                        <img src={optRoomImg} alt={formatRoomType(opt.type)} className={`max-h-32 w-auto object-contain ${isElite ? "drop-shadow-[0_0_16px_rgba(239,68,68,0.6)]" : "drop-shadow-[0_0_12px_rgba(34,211,238,0.3)]"}`} />
                      ) : (
                        <div className="h-32 flex items-center justify-center text-4xl">{opt.symbol}</div>
                      )}
                      <div className={`text-sm text-center mt-1 font-medium ${isElite ? "text-red-400 font-bold" : ""}`}>{formatRoomType(opt.type)}</div>
                    </button>
                  );
                })}
              </div>
              {isCompanionMode && splitSuggestion && (
                <p className="text-[10px] text-cyan-300/70 italic">{splitSuggestion.reason}</p>
              )}
            </div>
          ) : state.phase === "combat" && state.combat?.combatResult ? (
            <button className="btn-gold" onClick={() => doResolveRoom()}>
              {state.combat.combatResult === "victory" ? "🏆 Collect Rewards" : "Continue"}
            </button>
          ) : room && !room.resolved ? (
            <div className="flex flex-col items-center gap-1.5">
              <button
                className={`btn-primary transition-all duration-300 ${merchantCooldown > 0 ? "opacity-40 cursor-not-allowed pointer-events-none" : ""}`}
                onClick={handleRoomAction}
                disabled={merchantCooldown > 0}
              >
                {doorUrl ? (
                  <img src={doorUrl} alt="Enter" className="w-5 h-5 inline-block mr-1" />
                ) : null}
                {merchantCooldown > 0 ? `Opening in ${merchantCooldown}...` : "Enter Room →"}
              </button>
              {merchantCooldown === 0 ? (
                <div className="hidden sm:block text-[10px] text-spire-muted/50 mt-1.5 uppercase tracking-wider">
                  Press <kbd className="px-1 py-0.5 rounded border border-spire-border/40 bg-spire-bg/60 text-spire-muted/70 text-[9px] font-mono">Space</kbd> to continue
                </div>
              ) : (
                <div className="hidden sm:block h-[18px] mt-1.5" />
              )}
            </div>
          ) : room?.resolved ? (
            <button className="btn-primary" onClick={() => { playSfx("ui", "transition"); doAdvanceRoom(); }}>
              Advance to Next Room →
            </button>
          ) : null}
          </div>
        </div>

        {/* Combat summary if in combat */}
        {state.combat && (
          <div className="glass-card p-5">
            <h3 className="section-heading mb-3">Active Combat</h3>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {monsterImageUrl && (
                  <img src={monsterImageUrl} alt={state.combat.monster.name} className="w-12 h-12 rounded-lg object-cover object-top border border-spire-danger/40" />
                )}
                <div>
                  <div className="text-lg font-medium">{state.combat.monster.name}</div>
                  <div className="text-sm text-spire-muted">
                    HP: {state.combat.monster.currentHp}/{state.combat.monster.maxHp}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {goldCoinUrl && <img src={goldCoinUrl} alt="Gold reward" className="w-5 h-5 drop-shadow-[0_0_6px_rgba(212,175,55,0.4)]" />}
                <span className="text-spire-gold text-sm font-bold tabular-nums">{state.combat.monster.goldReward}g</span>
              </div>
            </div>
            <div className="hp-bar mt-3">
              <div
                className="hp-bar-fill bg-spire-danger"
                style={{ width: `${(state.combat.monster.currentHp / state.combat.monster.maxHp) * 100}%` }}
              />
            </div>
            <button className="btn-primary mt-3.5 w-full" onClick={() => onNavigate("combat")}>
              Go to Combat →
            </button>
          </div>
        )}
      </div>

      {/* Right panel: Event Log + Sandbox */}
      <div className="lg:col-span-3 space-y-3 lg:sticky lg:top-14 lg:self-start lg:max-h-[calc(100vh-3.5rem)] lg:flex lg:flex-col lg:overflow-hidden">
        {isSandboxMode && <SandboxPanel />}
        <h2 className="hidden lg:block text-sm font-display gold-text uppercase tracking-widest pb-0 lg:pt-3 text-center" style={{ borderBottom: "1px solid rgba(26, 26, 58, 0.4)" }}>Event Log</h2>
        <button
          className="lg:hidden w-full text-left text-xs font-medium text-spire-muted uppercase tracking-wider py-2 px-3 rounded-lg bg-spire-bg/40 border border-spire-border/30 flex items-center justify-between"
          onClick={() => setEventLogExpanded(!eventLogExpanded)}
        >
          <span>📜 Event Log ({recentEvents.length})</span>
          <span className={`transition-transform ${eventLogExpanded ? "rotate-180" : ""}`}>▼</span>
        </button>
        <div className={`glass-panel-transparent p-2 sm:p-4 overflow-y-auto space-y-2 relative ${eventLogExpanded ? "max-h-[300px]" : "hidden"} lg:!block lg:flex-1 lg:min-h-0 lg:mt-0`} style={{ maxHeight: typeof window !== "undefined" && window.innerWidth >= 1024 ? logHeight : undefined }}>
          {cardBackUrl && (
            <div className="absolute inset-0 pointer-events-none opacity-[0.04] bg-cover bg-center" style={{ backgroundImage: `url(${cardBackUrl})` }} />
          )}
          <div className="relative z-10">
          {recentEvents.length === 0 ? (
            <div className="text-xs text-spire-muted text-center py-4">No events yet</div>
          ) : (
            recentEvents.map((event) => {
              const style = getEventTypeStyle(event.type);
              return (
                <div key={event.id} className="text-xs border-b border-spire-border/20 pb-2 last:border-0 leading-relaxed">
                  <span className="text-spire-muted/50 text-[10px] tabular-nums">#{event.sequence}</span>{" "}
                  <span className={`${style.color} mr-1`}>{style.icon}</span>
                  <span className="text-spire-white/90">{formatLogSummary(event.summary, state, event.type)}</span>
                </div>
              );
            })
          )}
          </div>
        </div>
        {/* Desktop drag-to-resize handle */}
        <div
          className="hidden lg:flex items-center justify-center h-1.5 cursor-ns-resize hover:h-3 hover:bg-spire-accent/10 transition-all duration-150 group flex-shrink-0"
          onPointerDown={handleLogResizeStart}
          style={{ touchAction: "none" }}
        >
          <div className="w-10 h-1 rounded-full bg-spire-border/40 group-hover:bg-spire-accent/50 transition-colors" />
        </div>
      </div>
    </div>
  );
}
