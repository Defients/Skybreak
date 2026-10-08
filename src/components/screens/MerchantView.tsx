import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useGameStore } from "../../app/gameStore";
import { getLivingHeroes } from "../../engine/rulesEngine";
import { useAudio } from "../../audio/useAudio";
import { useIsMobile } from "../../hooks/useIsMobile";
import {
  getShopkeeperImage,
  getShopkeeperRoomImage,
  getItemImage,
  getWeaponImage,
  getEnchantIcon,
  getForgeImage,
  getGoldCoinImage,
  getClassIcon,
  getHeroPortrait,
} from "../../assets/assetRegistry";
import { Tooltip } from "../ui/Tooltip";
import { InventoryManager } from "../ui/InventoryManager";
import { ITEMS, PERMANENT_UPGRADES, HEALING_SERVICES } from "../../data/items";
import { getSuggestedPurchases, getPricedMerchant, getMerchantPrice, getItemPurchaseRejection } from "../../engine/merchantEngine";
import type { SuggestedPurchase } from "../../engine/merchantEngine";
import { suggestMerchantAction } from "../../engine/aiAdvisor";
import { WEAPONS, WEAPON_RARITY_DATA } from "../../data/weapons";
import { ENCHANTMENTS } from "../../data/enchantments";
import { CLASS_TEXT_COLORS } from "../../utils/nameResolver";
import { formatAbilityText } from "../../utils/formatAbilityText";
import type { HeroClassName } from "../../types/heroes";
import type { HeroState } from "../../types/heroes";
import type { WeaponRarity } from "../../types/inventory";

const VALUABLE_ITEM_STYLES: Record<string, { glow: string; border: string; badge: string; badgeText: string }> = {
  "Guardian Angel": { glow: "shadow-[0_0_15px_rgba(255,215,0,0.2)]", border: "border-amber-400/30", badge: "bg-amber-500/20 text-amber-300", badgeText: "✦ Rare" },
  "Bomb": { glow: "shadow-[0_0_15px_rgba(239,68,68,0.2)]", border: "border-red-400/30", badge: "bg-red-500/20 text-red-300", badgeText: "☠ Offensive" },
  "Smoke Bomb": { glow: "shadow-[0_0_15px_rgba(148,163,184,0.2)]", border: "border-slate-400/30", badge: "bg-slate-500/20 text-slate-300", badgeText: "☁ Utility" },
  "Treasure Map": { glow: "shadow-[0_0_15px_rgba(212,175,55,0.2)]", border: "border-spire-gold/30", badge: "bg-spire-gold/20 text-spire-gold", badgeText: "💰 Greed" },
  "Ability Blocker": { glow: "shadow-[0_0_15px_rgba(139,92,246,0.2)]", border: "border-purple-400/30", badge: "bg-purple-500/20 text-purple-300", badgeText: "✦ Tactical" },
  "Speed Potion": { glow: "shadow-[0_0_15px_rgba(34,211,238,0.2)]", border: "border-cyan-400/30", badge: "bg-cyan-500/20 text-cyan-300", badgeText: "⚡ Haste" },
};

function BuyButton({
  onBuy,
  disabled,
  goldCoinUrl,
  cost,
  lockoutMs = 600,
  disabledReason,
}: {
  onBuy: () => void;
  disabled: boolean;
  goldCoinUrl: string | null;
  cost: number;
  lockoutMs?: number;
  disabledReason?: string | null;
}) {
  const [animating, setAnimating] = useState(false);
  const [locked, setLocked] = useState(false);
  const timerRef = useRef<number>(0);
  const lockRef = useRef<number>(0);

  const handleClick = useCallback(() => {
    if (disabled || locked) return;
    setAnimating(true);
    setLocked(true);
    window.clearTimeout(timerRef.current);
    window.clearTimeout(lockRef.current);
    timerRef.current = window.setTimeout(() => setAnimating(false), 600);
    lockRef.current = window.setTimeout(() => setLocked(false), lockoutMs);
    onBuy();
  }, [disabled, locked, onBuy, lockoutMs]);

  useEffect(() => () => { window.clearTimeout(timerRef.current); window.clearTimeout(lockRef.current); }, []);

  return (
    <button
      className={`relative btn-primary text-[11px] px-2.5 py-1 disabled:opacity-40 disabled:cursor-not-allowed overflow-hidden
        ${animating ? "animate-buy-pop" : ""}`}
      disabled={disabled || locked}
      onClick={handleClick}
      aria-label={`Buy for ${cost} gold`}
      title={disabled ? disabledReason ?? "Check gold, target eligibility, capacity, or purchase limits" : `Buy for ${cost} gold`}
    >
      {animating && goldCoinUrl && (
        <img
          src={goldCoinUrl}
          alt=""
          className="absolute left-1/2 -translate-x-1/2 -top-1 w-3.5 h-3.5 animate-coin-fly pointer-events-none"
        />
      )}
      {locked ? "···" : "Buy"}
    </button>
  );
}

const TIER_INFO: Record<number, { title: string; desc: string; items: string }> = {
  1: { title: "Tier 1 — Lower Astrilith", desc: "Base prices. Common and Rare weapons available. Items and services at their cheapest.", items: "Common & Rare weapons · All consumables · Basic enchantments" },
  2: { title: "Tier 2 — Mid Astrilith", desc: "Offers include the current tier and difficulty price modifiers. Epic weapons unlocked. Stronger enchantments and upgrades become available.", items: "Up to Epic weapons · All supported consumables · Advanced enchantments" },
  3: { title: "Tier 3 — Upper Astrilith", desc: "Highest prices. Legendary weapons unlocked. All items and services at maximum cost. Spend wisely before the final confrontation.", items: "All rarities including Legendary · All consumables · All enchantments" },
};

const LOCKOUT_MS = 700;

function DraggableGold({ gold, goldCoinUrl }: { gold: number; goldCoinUrl: string | null }) {
  const [pos, setPos] = useState({ x: -1, y: 80 });
  const [dragging, setDragging] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number }>({ startX: 0, startY: 0, origX: 0, origY: 0 });

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setPos({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy });
    };
    const handleUp = () => setDragging(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging]);

  const handleDragStart = (e: React.MouseEvent) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    setDragging(true);
  };

  const rightOffset = pos.x < 0 ? 16 : undefined;
  const leftPos = pos.x >= 0 ? pos.x : undefined;
  const topPos = pos.y;

  return (
    <div
      className="fixed z-40 select-none"
      style={{ right: rightOffset, left: leftPos, top: topPos }}
    >
      <div
        className={`glass-panel rounded-2xl border border-spire-gold/30 shadow-glow-gold backdrop-blur-md transition-all duration-200 ${dragging ? "scale-105 cursor-grabbing" : "cursor-grab"}`}
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-3 px-5 py-3.5">
          {goldCoinUrl && (
            <img src={goldCoinUrl} alt="Gold" className="w-7 h-7 drop-shadow-[0_0_6px_rgba(212,175,55,0.4)]" />
          )}
          <div className="flex flex-col">
            <span className="text-[10px] text-spire-muted uppercase tracking-wider leading-none">Party Gold</span>
            <span className="text-spire-gold font-bold text-2xl leading-tight tabular-nums">
              {gold}
              <span className="text-sm text-spire-gold/60 ml-0.5">g</span>
            </span>
          </div>
          {!minimized && (
            <button
              className="ml-1 text-spire-muted/60 hover:text-spire-white text-xs transition-colors"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); setMinimized(true); }}
              title="Minimize"
            >
              ▸
            </button>
          )}
        </div>
        {minimized && (
          <button
            className="w-full text-center text-[10px] text-spire-muted/60 hover:text-spire-white py-1 border-t border-spire-gold/10 transition-colors"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setMinimized(false); }}
          >
            ▾ Expand
          </button>
        )}
      </div>
    </div>
  );
}

interface Props {
  onBack: () => void;
}

export function MerchantView({ onBack }: Props) {
  const state = useGameStore((s) => s.state);
  const doBuyItem = useGameStore((s) => s.doBuyItem);
  const doBuyHealing = useGameStore((s) => s.doBuyHealing);
  const doBuyUpgrade = useGameStore((s) => s.doBuyUpgrade);
  const doBuyWeapon = useGameStore((s) => s.doBuyWeapon);
  const doUpgradeWeapon = useGameStore((s) => s.doUpgradeWeapon);
  const doReforgeWeapon = useGameStore((s) => s.doReforgeWeapon);
  const doRepairWeapon = useGameStore((s) => s.doRepairWeapon);
  const doBuyEnchantment = useGameStore((s) => s.doBuyEnchantment);
  const doAutoBuy = useGameStore((s) => s.doAutoBuy);
  const doLeaveMerchant = useGameStore((s) => s.doLeaveMerchant);
  const { playMusic, playSfx } = useAudio();
  const { isMobile } = useIsMobile();

  useEffect(() => {
    playMusic("merchant");
  }, [playMusic]);

  const shopkeeperUrl = getShopkeeperImage();
  const shopBgUrl = getShopkeeperRoomImage();
  const forgeUrl = getForgeImage();
  const goldCoinUrl = getGoldCoinImage();
  const [selectedHero, setSelectedHero] = useState<string>("");
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showTierTooltip, setShowTierTooltip] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [upgradeConfirmHero, setUpgradeConfirmHero] = useState<HeroState | null>(null);
  const [suggestionUpgradeOpen, setSuggestionUpgradeOpen] = useState(false);
  const upgradeBtnRef = useRef<HTMLButtonElement | null>(null);
  const [autoBuyCooldown, setAutoBuyCooldown] = useState(2);
  const [autoBuyUsed, setAutoBuyUsed] = useState(false);
  const [autoBuySummary, setAutoBuySummary] = useState<null | { goldSpent: number; taxPaid: number; remainingGold: number; purchases: { label: string; count: number }[] }>(null);
  const [showAutoBuyWarning, setShowAutoBuyWarning] = useState(false);
  const [autoBuyAcknowledged, setAutoBuyAcknowledged] = useState(false);
  const [autoLeaveCountdown, setAutoLeaveCountdown] = useState<number | null>(null);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        setShowLeaveConfirm(false);
        setShowAutoBuyWarning(false);
        setUpgradeConfirmHero(null);
        setSuggestionUpgradeOpen(false);
        setShowTierTooltip(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (autoBuyCooldown <= 0) return;
    const timer = setTimeout(() => setAutoBuyCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [autoBuyCooldown]);

  const handleAutoBuyClick = () => {
    if (autoBuyCooldown > 0 || autoBuyUsed || !state) return;
    if (!autoBuyAcknowledged) {
      setShowAutoBuyWarning(true);
      return;
    }
    executeAutoBuy();
  };

  const executeAutoBuy = () => {
    if (autoBuyCooldown > 0 || autoBuyUsed || !state) return;

    const beforeGold = state.party.gold;
    const beforeItems = state.party.heroes.flatMap(h => h.items.map(i => i.name));
    const beforeUpgrades = state.party.heroes.flatMap(h => h.upgrades.map(u => u.name));
    const beforeEnchantments = state.party.heroes.filter(h => h.enchantment).map(h => h.enchantment!.name);
    const beforeWeapons = state.party.heroes.map(h => h.weapon.name);
    const beforeHp = state.party.heroes.map(h => h.currentHp);

    playSfx("results", "level_up");
    doAutoBuy();
    setAutoBuyUsed(true);

    setTimeout(() => {
      const after = useGameStore.getState().state;
      if (!after) return;

      const goldSpent = beforeGold - after.party.gold;
      if (goldSpent <= 0) return;

      const purchases: { label: string; count: number }[] = [];

      const afterItems = after.party.heroes.flatMap(h => h.items.map(i => i.name));
      const afterUpgrades = after.party.heroes.flatMap(h => h.upgrades.map(u => u.name));
      const afterEnchantments = after.party.heroes.filter(h => h.enchantment).map(h => h.enchantment!.name);
      const afterWeapons = after.party.heroes.map(h => h.weapon.name);
      const afterHp = after.party.heroes.map(h => h.currentHp);

      const addedItems = afterItems.filter(name => !beforeItems.includes(name));
      const addedUpgrades = afterUpgrades.filter(name => !beforeUpgrades.includes(name));
      const addedEnchants = afterEnchantments.filter(name => !beforeEnchantments.includes(name));
      const upgradedWeapons = afterWeapons.filter((name, i) => name !== beforeWeapons[i]);
      const healedHeroes = afterHp.filter((hp, i) => hp > beforeHp[i]).length;

      const grouped: Record<string, number> = {};
      for (const name of addedItems) grouped[name] = (grouped[name] ?? 0) + 1;
      for (const name of addedUpgrades) grouped[`⬆ ${name}`] = (grouped[`⬆ ${name}`] ?? 0) + 1;
      for (const name of addedEnchants) grouped[`✦ ${name}`] = (grouped[`✦ ${name}`] ?? 0) + 1;
      for (const name of upgradedWeapons) grouped[`⚔ ${name}`] = (grouped[`⚔ ${name}`] ?? 0) + 1;
      if (healedHeroes > 0) grouped[`✚ Healing (${healedHeroes} hero${healedHeroes > 1 ? "es" : ""})`] = 1;

      for (const [label, count] of Object.entries(grouped)) {
        purchases.push({ label, count });
      }

      const autoBuyEvent = after.log.slice().reverse().find(e => e.summary?.includes("Auto-buy completed"));
      const taxPaid = (autoBuyEvent?.details as any)?.taxPaid ?? 0;

      setAutoBuySummary({
        goldSpent,
        taxPaid,
        remainingGold: after.party.gold,
        purchases,
      });
    }, 100);
  };

  useEffect(() => {
    if (!autoBuyUsed) return;

    let countdown = 3;
    let paused = false;
    let lastInteraction = 0;
    setAutoLeaveCountdown(3);

    const handleInteraction = () => {
      paused = true;
      lastInteraction = Date.now();
    };

    document.addEventListener("click", handleInteraction);
    document.addEventListener("touchstart", handleInteraction);

    const interval = setInterval(() => {
      if (paused) {
        if (Date.now() - lastInteraction >= 1500) {
          paused = false;
        } else {
          return;
        }
      }

      countdown -= 1;
      setAutoLeaveCountdown(countdown);

      if (countdown <= 0) {
        clearInterval(interval);
        setAutoBuySummary(null);
        setAutoLeaveCountdown(null);
        playSfx("ui", "transition");
        doLeaveMerchant();
        onBackRef.current();
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      document.removeEventListener("click", handleInteraction);
      document.removeEventListener("touchstart", handleInteraction);
    };
  }, [autoBuyUsed]);

  const handleAutoBuyWarningConfirm = () => {
    setAutoBuyAcknowledged(true);
    setShowAutoBuyWarning(false);
    executeAutoBuy();
  };

  const isCompanionMode = state?.settings.mode === "companion";
  const companionMerchantSuggestion = isCompanionMode && state ? suggestMerchantAction(state) : null;

  if (!state || !state.merchant) {
    return (
      <div className="text-center py-20">
        <p className="text-spire-muted">No merchant available.</p>
      </div>
    );
  }

  const handleBuyItem = (itemName: string, heroId: string) => {
    playSfx("results", "get_item");
    doBuyItem(itemName, heroId);
  };

  const handleBuyHealing = (serviceName: string, targetHeroId?: string) => {
    playSfx("combat", "heal");
    doBuyHealing(serviceName, targetHeroId);
  };

  const handleBuyUpgrade = (upgradeName: string, heroId: string) => {
    playSfx("results", "level_up");
    doBuyUpgrade(upgradeName, heroId);
  };

  const handleBuyWeapon = (weaponName: string, heroId: string) => {
    playSfx("results", "get_item");
    doBuyWeapon(weaponName, heroId);
  };

  const handleUpgradeWeapon = (heroId: string) => {
    playSfx("results", "level_up");
    doUpgradeWeapon(heroId);
  };

  const handleBuyEnchantment = (enchantmentName: string, heroId: string) => {
    playSfx("results", "get_item");
    doBuyEnchantment(enchantmentName, heroId);
  };

  const suggestions = useMemo(() => state ? getSuggestedPurchases(state) : [], [state]);

  const upgradeEligibleHeroes = useMemo(() => {
    if (!state?.merchant) return [];
    const RARITY_ORD: WeaponRarity[] = ["Common", "Rare", "Epic", "Legendary"];
    return getLivingHeroes(state).filter((h) => {
      const idx = RARITY_ORD.indexOf(h.weapon.rarity);
      if (idx === -1 || idx >= RARITY_ORD.length - 1) return false;
      const nextR = RARITY_ORD[idx + 1];
      if (nextR === "Epic" && state.merchant!.tier < 2) return false;
      if (nextR === "Legendary" && state.merchant!.tier < 3) return false;
      const nrd = WEAPON_RARITY_DATA[nextR];
      if (!nrd || nrd.upgradeCost <= 0) return false;
      return WEAPONS.filter((w) => w.className === h.className && w.rarity === nextR).length > 0;
    });
  }, [state]);

  const handleSuggestionBuy = useCallback((sug: SuggestedPurchase) => {
    switch (sug.type) {
      case "item":
        playSfx("results", "get_item");
        doBuyItem(sug.name, sug.targetHeroId!);
        break;
      case "healing":
        playSfx("combat", "heal");
        doBuyHealing(sug.name, sug.targetHeroId);
        break;
      case "upgrade":
        playSfx("results", "level_up");
        doBuyUpgrade(sug.name, sug.targetHeroId!);
        break;
      case "weapon":
        playSfx("results", "get_item");
        doBuyWeapon(sug.name, sug.targetHeroId!);
        break;
      case "weaponUpgrade":
        playSfx("results", "level_up");
        doUpgradeWeapon(sug.targetHeroId!);
        break;
    }
  }, [playSfx, doBuyItem, doBuyHealing, doBuyUpgrade, doBuyWeapon, doUpgradeWeapon]);

  const baseGoldThreshold = state.spire.tier === 1 ? 50 : state.spire.tier === 2 ? 100 : 200;
  const merchantsVisitedThisTier = state.spire.rooms.filter(
    r => r.type === "merchant" && r.resolved && r.tier === state.spire.tier
  ).length;
  const goldWarningThreshold = baseGoldThreshold + merchantsVisitedThisTier * 15;

  const handleLeave = () => {
    const goldSpent = state.stats?.goldSpent ?? 0;
    const hasExcessGold = state.party.gold > goldWarningThreshold;
    const nothingPurchased = goldSpent === 0;
    if (nothingPurchased || hasExcessGold) {
      setShowLeaveConfirm(true);
    } else {
      playSfx("ui", "transition");
      doLeaveMerchant();
      onBack();
    }
  };

  const handleConfirmLeave = () => {
    playSfx("ui", "transition");
    doLeaveMerchant();
    onBack();
  };

  const merchant = getPricedMerchant(state)!;
  const livingHeroes = getLivingHeroes(state);
  const heroId = selectedHero || livingHeroes[0]?.id || "";
  const selectedHeroState = state.party.heroes.find((h) => h.id === heroId);
  const allHeroesFullHp = state.party.heroes.every((h) => h.alive && h.currentHp >= h.maxHp);
  const hasDeadHeroes = state.party.heroes.some((h) => !h.alive);

  const isHealingDisabled = (svcName: string): boolean => {
    if (svcName.startsWith("Revive") && state.settings.difficulty === "hard") return true;
    if (state.party.gold < (merchant.healingServices.find((s) => s.name === svcName)?.cost ?? 0)) return true;
    if (svcName === "Full Restore" && allHeroesFullHp) return true;
    if (svcName === "Group Heal" && allHeroesFullHp) return true;
    if ((svcName === "Patch Up" || svcName === "First Aid") && selectedHeroState && selectedHeroState.currentHp >= selectedHeroState.maxHp) return true;
    if ((svcName === "Revive 50%" || svcName === "Revive Full") && !hasDeadHeroes) return true;
    return false;
  };

  const getHealingDisabledReason = (svcName: string): string | null => {
    if (svcName.startsWith("Revive") && state.settings.difficulty === "hard") return "death is permanent on Hard";
    if (state.party.gold < (merchant.healingServices.find((s) => s.name === svcName)?.cost ?? 0)) return "not enough gold";
    if ((svcName === "Full Restore" || svcName === "Group Heal") && allHeroesFullHp) return "all full HP";
    if ((svcName === "Patch Up" || svcName === "First Aid") && selectedHeroState && selectedHeroState.currentHp >= selectedHeroState.maxHp) return "hero at full";
    if ((svcName === "Revive 50%" || svcName === "Revive Full") && !hasDeadHeroes) return "no dead heroes";
    return null;
  };

  return (
    <div className="space-y-4 relative">
      {shopBgUrl && (
        <div
          className="bg-image-overlay"
          style={{ backgroundImage: `url(${shopBgUrl})`, opacity: 0.12 }}
        />
      )}
      {/* Draggable Party Gold overlay — desktop only */}
      <div className="hidden lg:block">
        <DraggableGold gold={state.party.gold} goldCoinUrl={goldCoinUrl} />
      </div>
      {/* Fixed bottom gold bar — mobile only */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 safe-bottom">
        <div className="glass-panel border-t border-spire-gold/30 backdrop-blur-md px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {goldCoinUrl && (
              <img src={goldCoinUrl} alt="Gold" className="w-6 h-6 drop-shadow-[0_0_6px_rgba(212,175,55,0.4)]" />
            )}
            <div className="flex flex-col">
              <span className="text-[9px] text-spire-muted uppercase tracking-wider leading-none">Party Gold</span>
              <span className="text-spire-gold font-bold text-xl leading-tight tabular-nums">
                {state.party.gold}<span className="text-xs text-spire-gold/60 ml-0.5">g</span>
              </span>
            </div>
          </div>
          <button className="btn-gold text-sm px-4 py-2" onClick={handleLeave}>
            Leave →
          </button>
        </div>
      </div>
      <div className="relative space-y-4 pb-20 lg:pb-0">
      <InventoryManager />
      <div className="glass-panel p-4 sm:p-5 flex items-center justify-between relative z-50 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          {shopkeeperUrl && (
            <img src={shopkeeperUrl} alt="Shopkeeper" className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg object-cover border border-spire-gold/40" />
          )}
          <div>
            <h2 className="text-lg sm:text-xl font-display gold-text">♦️ Merchant</h2>
            <div
              className="relative inline-block"
              onMouseEnter={() => setShowTierTooltip(true)}
              onMouseLeave={() => setShowTierTooltip(false)}
            >
              <p className="text-sm text-spire-muted mt-0.5 cursor-help underline decoration-dotted underline-offset-2 decoration-spire-border/50" onClick={() => { isMobile && setShowTierTooltip(!showTierTooltip); }}>Tier {merchant.tier} prices</p>
              {showTierTooltip && (
                <div className="absolute top-full left-0 mt-2 z-50 w-64 sm:w-72 glass-panel rounded-xl border border-spire-gold/30 shadow-panel p-3.5 animate-fade-in">
                  <div className="text-sm font-medium text-spire-gold mb-1">{TIER_INFO[merchant.tier]?.title ?? `Tier ${merchant.tier}`}</div>
                  <div className="text-xs text-spire-white/80 leading-relaxed mb-2">{TIER_INFO[merchant.tier]?.desc}</div>
                  <div className="text-[10px] text-spire-muted leading-relaxed border-t border-spire-border/30 pt-2">
                    <span className="text-spire-muted/60 uppercase tracking-wider text-[9px]">Available: </span>
                    {TIER_INFO[merchant.tier]?.items}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {state.settings.mode === "playable" && (
            <Tooltip
              side="bottom"
              wrapperClassName="flex-shrink-0"
              content={
                <div className="space-y-1.5">
                  <div className="text-sm font-medium text-purple-300">⚡ Auto-Buy</div>
                  <div className="text-[11px] text-spire-white/80 leading-relaxed">
                    One-tap purchase that buys everything you need — upgrades, weapons, enchantments, healing, and items — prioritizing permanent upgrades over consumables.
                  </div>
                  <div className="text-[10px] text-amber-300/80 leading-relaxed border-t border-amber-500/20 pt-1.5">
                    💰 A <span className="font-bold text-amber-300">5% laziness tax</span> is applied to every purchase. Inefficient compared to choosing for yourself.
                  </div>
                  {autoBuyCooldown > 0 && (
                    <div className="text-[10px] text-spire-muted leading-relaxed border-t border-spire-border/20 pt-1.5">
                      ⏳ Available in {autoBuyCooldown}s...
                    </div>
                  )}
                  {autoBuyUsed && (
                    <div className="text-[10px] text-green-400/70 leading-relaxed border-t border-spire-border/20 pt-1.5">
                      ✓ Already used this visit.
                    </div>
                  )}
                </div>
              }
            >
              <button
                className={`relative text-sm font-medium px-4 py-2 rounded-lg transition-all duration-200 overflow-hidden ${
                  autoBuyCooldown > 0 || autoBuyUsed
                    ? "bg-spire-bg/50 text-spire-muted/50 cursor-not-allowed"
                    : "text-white hover:scale-[1.03] active:scale-[0.98]"
                }`}
                style={
                  autoBuyCooldown > 0 || autoBuyUsed
                    ? undefined
                    : {
                        background: "linear-gradient(135deg, rgba(168,85,247,0.9) 0%, rgba(126,34,206,0.95) 50%, rgba(168,85,247,0.9) 100%)",
                        boxShadow: "0 4px 18px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.15)",
                        border: "1px solid rgba(196,181,253,0.4)",
                      }
                }
                disabled={autoBuyCooldown > 0 || autoBuyUsed}
                onClick={handleAutoBuyClick}
              >
                {autoBuyCooldown > 0 ? (
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded-full border-2 border-spire-muted/30 border-t-spire-muted/60 animate-spin" />
                    Auto-Buy ({autoBuyCooldown}s)
                  </span>
                ) : autoBuyUsed ? (
                  <span>✓ Auto-Buy Done</span>
                ) : (
                  <span>⚡ Auto-Buy</span>
                )}
              </button>
            </Tooltip>
          )}
          <button className="btn-gold hidden lg:block" onClick={handleLeave}>
            Leave Merchant →
          </button>
        </div>
      </div>

      {/* Hero selector with HP bars — sticky on mobile, normal on desktop */}
      <div className="lg:static sticky top-14 z-40 lg:z-auto lg:top-0">
        <div className="glass-card p-3 sm:p-4 lg:backdrop-blur-none backdrop-blur-md bg-spire-card/95 lg:bg-transparent border-b lg:border-b-0 border-spire-border/40">
          <label className="hidden sm:block text-sm text-spire-muted">Select Hero:</label>
          <div className="flex gap-1.5 sm:gap-2 mt-0 sm:mt-2 sm:flex-wrap sm:overflow-visible sm:pb-0">
            {livingHeroes.map((h) => {
              const hpPct = Math.round((h.currentHp / h.maxHp) * 100);
              const hpColor = hpPct > 60 ? "bg-green-500" : hpPct > 30 ? "bg-yellow-500" : "bg-red-500";
              const classColor = CLASS_TEXT_COLORS[h.className as keyof typeof CLASS_TEXT_COLORS] ?? "text-spire-white";
              const heroPortrait = getHeroPortrait(h.className);
              return (
                <button
                  key={h.id}
                  className={`flex-1 flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-200 min-h-[44px] min-w-0 ${
                    heroId === h.id
                      ? "bg-spire-accent/20 border border-spire-accent/60 shadow-[0_0_12px_rgba(34,211,238,0.25)]"
                      : "bg-spire-bg/60 text-spire-muted border border-spire-border/50 hover:border-spire-muted/60"
                  }`}
                  onClick={() => setSelectedHero(h.id)}
                >
                  {heroPortrait && (
                    <img src={heroPortrait} alt={h.className} className="w-6 h-6 sm:w-7 sm:h-7 rounded-full object-cover object-top border border-spire-border/40 flex-shrink-0" />
                  )}
                  <div className="flex flex-col items-start min-w-0 flex-1">
                    <span className={`text-[11px] sm:text-sm truncate w-full ${classColor} ${heroId === h.id ? "" : "opacity-60"}`}>{h.name}</span>
                    <span className="inline-flex items-center gap-1 text-[9px] opacity-80 w-full">
                      <span className="w-8 sm:w-12 h-1.5 rounded-full bg-spire-border/40 overflow-hidden inline-block align-middle flex-1">
                        <span className={`block h-full ${hpColor}`} style={{ width: `${hpPct}%` }} />
                      </span>
                      <span className="flex-shrink-0">{h.currentHp}/{h.maxHp}</span>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Suggested Items — collapsible recommendation panel */}
      <div className="glass-card">
        <div
          className={`flex items-center justify-between px-5 py-3 select-none transition-colors ${isCompanionMode ? "" : "cursor-pointer hover:bg-spire-card/40"}`}
          onClick={() => !isCompanionMode && setShowSuggestions(!showSuggestions)}
        >
          <div className="flex items-center gap-2.5">
            <span className="text-base">💡</span>
            <span className="font-display text-spire-white text-sm font-medium">
              {isCompanionMode ? "AI Companion Suggestions" : "Suggested Items"}
            </span>
            {suggestions.length > 0 && (
              <span className="text-[10px] text-spire-accent bg-spire-accent/15 px-2 py-0.5 rounded-full font-medium">
                {suggestions.length} recommendation{suggestions.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
          {!isCompanionMode && (
            <span className="text-spire-muted text-xs transition-transform duration-200" style={{ transform: showSuggestions ? "rotate(180deg)" : "" }}>
              ▾
            </span>
          )}
        </div>
        {(showSuggestions || isCompanionMode) && (
          <div className="px-5 pb-4 pt-1 border-t border-spire-border/20">
            {isCompanionMode && companionMerchantSuggestion && (
              <div className="mt-2 mb-1 p-2 rounded-lg bg-cyan-500/10 border border-cyan-400/20 text-[11px] text-cyan-300 leading-snug">
                <span className="font-medium">💡 AI Advisor:</span> {companionMerchantSuggestion.reason}
              </div>
            )}
            {suggestions.length === 0 ? (
              <div className="text-center py-5 text-spire-muted text-sm">
                ✨ You're well-equipped! No urgent recommendations right now.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
                {suggestions.map((sug, i) => (
                  <div
                    key={i}
                    className="group relative p-3 rounded-xl bg-gradient-to-br from-spire-card/80 to-spire-bg/60 border border-spire-accent/25 hover:border-spire-accent/50 transition-all duration-200 hover:scale-[1.02]"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-base leading-none mt-0.5">{sug.categoryIcon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-spire-white font-medium text-sm leading-tight">{sug.name}</div>
                        <div className={`text-[10px] ${sug.categoryColor} mt-0.5 font-medium`}>{sug.categoryLabel}</div>
                      </div>
                    </div>
                    <div className="text-xs text-spire-muted leading-relaxed mt-2">{sug.reason}</div>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-spire-border/20">
                      <span className="text-spire-gold text-xs font-medium flex items-center gap-1">
                        {goldCoinUrl && <img src={goldCoinUrl} alt="g" className="w-3.5 h-3.5 inline-block" />}
                        {sug.cost}
                      </span>
                      {sug.type === "weaponUpgrade" ? (
                        <div className="relative">
                          <button
                            ref={upgradeBtnRef}
                            className="btn-gold text-xs px-3 py-1.5 flex items-center gap-1.5"
                            onClick={() => setSuggestionUpgradeOpen(!suggestionUpgradeOpen)}
                          >
                            <span>Choose Hero</span>
                            <span className="text-[10px]">▾</span>
                          </button>
                          {suggestionUpgradeOpen && upgradeBtnRef.current && createPortal(
                            <>
                              <div className="fixed inset-0 z-[100]" onClick={() => setSuggestionUpgradeOpen(false)} />
                              <div
                                className="fixed z-[101] w-56 glass-panel rounded-xl border border-spire-gold/30 shadow-panel p-2 space-y-1 animate-fade-in"
                                style={{
                                  left: Math.min(upgradeBtnRef.current.getBoundingClientRect().right - 224, window.innerWidth - 240),
                                  top: upgradeBtnRef.current.getBoundingClientRect().bottom + 4,
                                }}
                              >
                                <div className="text-[10px] text-spire-muted uppercase tracking-wider px-2 pb-1 border-b border-spire-border/20">Select Hero to Upgrade</div>
                                {upgradeEligibleHeroes.map((hero) => {
                                  const RARITY_ORD: WeaponRarity[] = ["Common", "Rare", "Epic", "Legendary"];
                                  const idx = RARITY_ORD.indexOf(hero.weapon.rarity);
                                  const nextR = RARITY_ORD[idx + 1];
                                  const nrd = WEAPON_RARITY_DATA[nextR];
                                  const upgCost = getMerchantPrice(state, nrd.upgradeCost);
                                  const canAfford = state.party.gold >= upgCost;
                                  const classIcon = getClassIcon(hero.className);
                                  return (
                                    <button
                                      key={hero.id}
                                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors text-left ${canAfford ? "bg-spire-card/50 hover:bg-spire-gold/20" : "bg-spire-card/30 opacity-50 cursor-not-allowed"}`}
                                      disabled={!canAfford}
                                      onClick={() => { setUpgradeConfirmHero(hero); setSuggestionUpgradeOpen(false); }}
                                    >
                                      {classIcon && <img src={classIcon} alt={hero.className} className="w-5 h-5 rounded-full object-cover border border-spire-border/50 flex-shrink-0" />}
                                      <div className="min-w-0 flex-1">
                                        <div className="text-xs text-spire-white font-medium truncate">{hero.name}</div>
                                        <div className="text-[9px] text-spire-muted">{hero.weapon.rarity} → {nextR}</div>
                                      </div>
                                      <span className="text-spire-gold text-[10px] flex items-center gap-0.5 flex-shrink-0">
                                        {goldCoinUrl && <img src={goldCoinUrl} alt="g" className="w-3 h-3 inline-block" />}
                                        {upgCost}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </>,
                            document.body
                          )}
                        </div>
                      ) : (
                        <BuyButton
                          onBuy={() => handleSuggestionBuy(sug)}
                          disabled={state.party.gold < sug.cost}
                          goldCoinUrl={goldCoinUrl}
                          cost={sug.cost}
                          lockoutMs={LOCKOUT_MS}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Consumable Items — varied card grid */}
      <div className="glass-card p-5">
        <h3 className="section-heading mb-4">🧪 Consumable Items</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {(() => {
            // Reorder so Smoke Bomb is adjacent to Bomb
            const items = [...merchant.items];
            const bombIdx = items.findIndex((it) => it.name === "Bomb");
            const smokeIdx = items.findIndex((it) => it.name === "Smoke Bomb");
            if (bombIdx !== -1 && smokeIdx !== -1 && smokeIdx !== bombIdx + 1) {
              const [smoke] = items.splice(smokeIdx, 1);
              const newBombIdx = items.findIndex((it) => it.name === "Bomb");
              items.splice(newBombIdx + 1, 0, smoke);
            }
            return items.map((item, i) => {
              const itemImg = getItemImage(item.name);
              const itemData = ITEMS[item.name as keyof typeof ITEMS];
              const effect = itemData?.effect ?? "";
              const isFeatured = item.name === "Minor Potion";
              const valuable = VALUABLE_ITEM_STYLES[item.name];
              const soldOut = item.quantity <= 0;
              const rejection = getItemPurchaseRejection(state, item.name, heroId);
              return (
                <div
                  key={i}
                  className={`group relative flex flex-col justify-between p-3 transition-all duration-200 hover:scale-[1.03] cursor-default
                    ${isFeatured ? "col-span-2" : ""}
                    bg-gradient-to-br from-spire-card/80 to-spire-bg/60
                    border ${valuable ? valuable.border : isFeatured ? "border-spire-accent/30" : "border-spire-border/40"} hover:border-spire-accent/40
                    rounded-xl
                    ${valuable ? valuable.glow : ""} ${soldOut ? "opacity-40" : "hover:shadow-glow-cyan/20"}`}
                  style={{ minHeight: "110px" }}
                >
                  {valuable && (
                    <span className={`absolute -top-2 right-1.5 text-[8px] px-1.5 py-0.5 rounded-full ${valuable.badge}`}>
                      {valuable.badgeText}
                    </span>
                  )}
                  <div className="flex items-start gap-2.5">
                    {itemImg && (
                      <img
                        src={itemImg}
                        alt={item.name}
                        className={`${isFeatured ? "w-11 h-11" : "w-9 h-9"} rounded-lg object-cover border border-spire-border/60 flex-shrink-0`}
                      />
                    )}
                    <div className="min-w-0">
                      <div className={`text-spire-white font-medium leading-tight text-sm ${isFeatured ? "text-spire-accent" : ""}`}>{item.name}</div>
                      <div className="text-[10px] text-spire-muted/60 mt-0.5">{soldOut ? "sold out" : `${item.quantity} in stock`}</div>
                    </div>
                  </div>
                  <div className="text-xs text-spire-muted leading-relaxed mt-2">
                    {formatAbilityText(effect)}
                  </div>
                  {itemData?.itemId === "lucky_charm" && <p className="text-[10px] text-spire-warning mt-1">Unavailable: die selection for rerolls is not supported.</p>}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-spire-border/20">
                    <span className="text-spire-gold text-xs font-medium flex items-center gap-1">
                      {goldCoinUrl && <img src={goldCoinUrl} alt="g" className="w-3.5 h-3.5 inline-block" />}
                      {item.cost}
                    </span>
                    <BuyButton
                      onBuy={() => handleBuyItem(item.name, heroId)}
                      disabled={!!rejection}
                      disabledReason={rejection}
                      goldCoinUrl={goldCoinUrl}
                      cost={item.cost}
                      lockoutMs={LOCKOUT_MS}
                    />
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* Healing Services & Permanent Upgrades — side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Healing Services — gradient intensifies from Patch Up to Revive Full */}
        <div className="glass-card p-5">
          <h3 className="section-heading mb-4">✚ Healing Services</h3>
          <div className="space-y-2.5">
            {merchant.healingServices.map((svc, i) => {
              const total = merchant.healingServices.length;
              const intensity = total > 1 ? i / (total - 1) : 0;
              const greenOpacity = 0.05 + intensity * 0.20;
              const borderOpacity = 0.15 + intensity * 0.35;
              const glowOpacity = intensity * 0.15;
              const healingDisabled = isHealingDisabled(svc.name);
              const disabledReason = getHealingDisabledReason(svc.name);
              return (
                <div
                  key={i}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-all duration-200 ${healingDisabled ? "" : "hover:scale-[1.01]"}`}
                  style={{
                    background: `linear-gradient(90deg, rgba(16, 185, 129, ${greenOpacity}) 0%, rgba(5, 5, 12, 0.4) 100%)`,
                    borderColor: `rgba(16, 185, 129, ${borderOpacity})`,
                    boxShadow: intensity > 0.5 ? `0 0 ${intensity * 12}px rgba(16, 185, 129, ${glowOpacity})` : undefined,
                  }}
                >
                  <div className="min-w-0">
                    <div className="text-spire-white font-medium text-sm">{svc.name}</div>
                    <div className="text-xs text-spire-muted mt-0.5">
                      {formatAbilityText(svc.effect)}
                      {disabledReason && <span className="text-red-400/50 ml-1.5">· {disabledReason}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-spire-gold text-xs font-medium flex items-center gap-1">
                      {goldCoinUrl && <img src={goldCoinUrl} alt="g" className="w-3.5 h-3.5 inline-block" />}
                      {svc.cost}
                    </span>
                    <BuyButton
                      onBuy={() => handleBuyHealing(svc.name, heroId)}
                      disabled={healingDisabled}
                      goldCoinUrl={goldCoinUrl}
                      cost={svc.cost}
                      lockoutMs={LOCKOUT_MS}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Permanent Upgrades */}
        <div className="glass-card p-5">
          <h3 className="section-heading mb-4">⬆ Permanent Upgrades</h3>
          <div className="space-y-2.5">
            {merchant.permanentUpgrades.map((upg, i) => {
              const upgData = PERMANENT_UPGRADES[upg.name];
              const limit = upgData?.limit;
              return (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-amber-900/10 to-spire-bg/40 border border-amber-700/20 hover:border-amber-500/30 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-spire-white font-medium text-sm">{upg.name}</div>
                    <div className="text-xs text-spire-muted mt-0.5">
                      {formatAbilityText(upg.effect)}
                      {limit && <span className="text-amber-400/50 ml-1.5">· {limit}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-spire-gold text-xs font-medium flex items-center gap-1">
                      {goldCoinUrl && <img src={goldCoinUrl} alt="g" className="w-3.5 h-3.5 inline-block" />}
                      {upg.cost}
                    </span>
                    <BuyButton
                      onBuy={() => handleBuyUpgrade(upg.name, heroId)}
                      disabled={state.party.gold < upg.cost || (() => {
                        if (!upgData?.limitType || upgData.limitCount === undefined) return false;
                        if (upgData.limitType === "perHero") {
                          const hero = state.party.heroes.find(h => h.id === heroId);
                          return (hero?.upgrades.filter(u => u.name === upg.name).length ?? 0) >= upgData.limitCount;
                        }
                        const partyCount = state.party.heroes.reduce((sum, h) => sum + h.upgrades.filter(u => u.name === upg.name).length, 0);
                        return partyCount >= upgData.limitCount;
                      })()}
                      goldCoinUrl={goldCoinUrl}
                      cost={upg.cost}
                      lockoutMs={LOCKOUT_MS}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Weapons — card grid with rarity styling */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="section-heading flex items-center gap-2">
            {forgeUrl && <img src={forgeUrl} alt="Forge" className="w-5 h-5 rounded" />}
            ⚔ Weapons Forge
          </h3>
          {(() => {
            const RARITY_ORD: WeaponRarity[] = ["Common", "Rare", "Epic", "Legendary"];
            const upgEligible = livingHeroes.filter((h) => {
              const idx = RARITY_ORD.indexOf(h.weapon.rarity);
              if (idx === -1 || idx >= RARITY_ORD.length - 1) return false;
              const nextR = RARITY_ORD[idx + 1];
              if (nextR === "Epic" && merchant.tier < 2) return false;
              if (nextR === "Legendary" && merchant.tier < 3) return false;
              const nrd = WEAPON_RARITY_DATA[nextR];
              if (!nrd || nrd.upgradeCost <= 0) return false;
              return WEAPONS.filter((w) => w.className === h.className && w.rarity === nextR).length > 0;
            });
            if (upgEligible.length === 0) return null;
            const rarityBadge: Record<string, string> = {
              Common: "bg-spire-card text-spire-muted",
              Rare: "bg-blue-900/40 text-blue-300",
              Epic: "bg-fuchsia-900/40 text-fuchsia-300",
              Legendary: "bg-amber-900/40 text-amber-300",
            };
            return (
              <div className="flex items-center gap-0.5 rounded-lg border border-spire-gold/30 overflow-hidden">
                <div className="px-2 py-1.5 bg-spire-gold/15 text-spire-gold text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                  <span>⬆</span>
                </div>
                {upgEligible.map((hero) => {
                  const idx = RARITY_ORD.indexOf(hero.weapon.rarity);
                  const nextR = RARITY_ORD[idx + 1];
                  const nrd = WEAPON_RARITY_DATA[nextR];
                  const upgCost = getMerchantPrice(state, nrd.upgradeCost);
                  const upgWeapons = WEAPONS.filter((w) => w.className === hero.className && w.rarity === nextR);
                  const chosenW = upgWeapons[0];
                  const chosenImg = getWeaponImage(chosenW?.name ?? "");
                  const classIcon = getClassIcon(hero.className);
                  const currentWData = WEAPONS.find((w) => w.id === hero.weapon.weaponId);
                  const currentImg = getWeaponImage(hero.weapon.name);
                  const canAfford = state.party.gold >= upgCost;
                  const compareTooltip = (
                    <div className="space-y-2 w-64">
                      <div className="text-[10px] text-spire-muted uppercase tracking-wider">Weapon Comparison</div>
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-spire-card/60 border border-spire-border/40">
                        {currentImg && <img src={currentImg} alt="" className="w-8 h-8 rounded object-cover border border-spire-border/50" />}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-spire-white truncate">{hero.weapon.name}</div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${rarityBadge[hero.weapon.rarity] ?? rarityBadge.Common}`}>{hero.weapon.rarity}</span>
                            <span className="text-[9px] text-spire-muted">{WEAPON_RARITY_DATA[hero.weapon.rarity]?.powerLevel}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-center text-spire-accent text-xs">↓ Upgrading to ↓</div>
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-spire-accent/10 border border-spire-accent/30">
                        {chosenImg && <img src={chosenImg} alt="" className="w-8 h-8 rounded object-cover border border-spire-accent/40" />}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-spire-white truncate">{chosenW?.name}</div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${rarityBadge[nextR] ?? rarityBadge.Common}`}>{nextR}</span>
                            <span className="text-[9px] text-spire-muted">{nrd.powerLevel}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-[10px] text-spire-white/70 leading-snug border-t border-spire-border/30 pt-1.5">
                        <span className="text-spire-muted">Old: </span>{formatAbilityText(currentWData?.effect ?? hero.weapon.effect)}
                      </div>
                      <div className="text-[10px] text-spire-accent/90 leading-snug">
                        <span className="text-spire-muted">New: </span>{formatAbilityText(chosenW?.effect ?? "")}
                      </div>
                      <div className="border-t border-spire-border/30 pt-2 flex items-center justify-center gap-1.5">
                        {goldCoinUrl && <img src={goldCoinUrl} alt="g" className="w-4 h-4 inline-block gold-sparkle" />}
                        <span className="text-sm font-bold text-spire-gold drop-shadow-[0_0_6px_rgba(255,215,0,0.5)] tracking-wide">{upgCost}g</span>
                      </div>
                    </div>
                  );
                  return (
                    <Tooltip key={hero.id} content={compareTooltip} side="bottom" wrapperClassName="flex-shrink-0">
                      <button
                        className={`flex items-center gap-1.5 px-2 py-1.5 transition-colors ${canAfford ? "bg-spire-card/60 hover:bg-spire-gold/20" : "bg-spire-card/30 opacity-50 cursor-not-allowed"}`}
                        disabled={!canAfford}
                        onClick={() => setUpgradeConfirmHero(hero)}
                      >
                        {classIcon && <img src={classIcon} alt={hero.className} className="w-5 h-5 rounded-full object-cover border border-spire-border/50" />}
                        {chosenImg && <img src={chosenImg} alt={chosenW?.name} className="w-5 h-5 rounded object-cover border border-spire-accent/40" />}
                      </button>
                    </Tooltip>
                  );
                })}
              </div>
            );
          })()}
          {/* Reforge & Repair */}
          {(() => {
            const reforgeEligible = livingHeroes.filter((h) => {
              const sameRarity = WEAPONS.filter((w) => w.className === h.className && w.rarity === h.weapon.rarity && w.id !== h.weapon.weaponId);
              return sameRarity.length > 0;
            });
            const repairEligible = livingHeroes.filter((h) => h.debuffs.length > 0 || h.perTurnFlags["weaponDisabled"] === true);
            if (reforgeEligible.length === 0 && repairEligible.length === 0) return null;
            const repairCosts: Record<number, number> = { 1: 30, 2: 45, 3: 68 };
            const repairCost = getMerchantPrice(state, repairCosts[merchant.tier] ?? 30);
            return (
              <div className="flex items-center gap-1">
                {reforgeEligible.length > 0 && (
                  <div className="flex items-center gap-0.5 rounded-lg border border-blue-400/30 overflow-hidden">
                    <div className="px-2 py-1.5 bg-blue-500/15 text-blue-300 text-[10px] font-bold uppercase tracking-wider">Reforge</div>
                    {reforgeEligible.map((hero) => {
                      const currentWData = WEAPONS.find((w) => w.id === hero.weapon.weaponId);
                      const reforgeCost = getMerchantPrice(state, Math.floor((currentWData?.baseCost ?? 50) * 0.5));
                      const canAfford = state.party.gold >= reforgeCost;
                      const classIcon = getClassIcon(hero.className);
                      return (
                        <button
                          key={hero.id}
                          className={`flex items-center gap-1 px-2 py-1.5 transition-colors ${canAfford ? "bg-spire-card/60 hover:bg-blue-500/20" : "bg-spire-card/30 opacity-50 cursor-not-allowed"}`}
                          disabled={!canAfford}
                          onClick={() => { playSfx("ui", "click"); doReforgeWeapon(hero.id); }}
                          title={`Reforge ${hero.name}'s weapon (${reforgeCost}g)`}
                        >
                          {classIcon && <img src={classIcon} alt={hero.className} className="w-5 h-5 rounded-full object-cover border border-spire-border/50" />}
                          <span className="text-[9px] text-spire-gold">{reforgeCost}g</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {repairEligible.length > 0 && (
                  <div className="flex items-center gap-0.5 rounded-lg border border-green-400/30 overflow-hidden">
                    <div className="px-2 py-1.5 bg-green-500/15 text-green-300 text-[10px] font-bold uppercase tracking-wider">Repair</div>
                    {repairEligible.map((hero) => {
                      const canAfford = state.party.gold >= repairCost;
                      const classIcon = getClassIcon(hero.className);
                      return (
                        <button
                          key={hero.id}
                          className={`flex items-center gap-1 px-2 py-1.5 transition-colors ${canAfford ? "bg-spire-card/60 hover:bg-green-500/20" : "bg-spire-card/30 opacity-50 cursor-not-allowed"}`}
                          disabled={!canAfford}
                          onClick={() => { playSfx("ui", "click"); doRepairWeapon(hero.id); }}
                          title={`Repair ${hero.name} — remove debuffs (${repairCost}g)`}
                        >
                          {classIcon && <img src={classIcon} alt={hero.className} className="w-5 h-5 rounded-full object-cover border border-spire-border/50" />}
                          <span className="text-[9px] text-spire-gold">{repairCost}g</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto pr-1">
          {merchant.weapons.map((w, i) => {
            const weaponImg = getWeaponImage(w.name);
            const weaponData = WEAPONS.find((wd) => wd.name === w.name);
            const effect = weaponData?.effect ?? weaponData?.description ?? "";
            const rarityData = WEAPON_RARITY_DATA[w.rarity as WeaponRarity];
            const rarityColors: Record<string, { border: string; bg: string; text: string }> = {
              Common: { border: "border-spire-border/50", bg: "from-spire-card/60", text: "text-spire-muted" },
              Rare: { border: "border-blue-400/40", bg: "from-blue-900/20", text: "text-blue-300" },
              Epic: { border: "border-fuchsia-400/40", bg: "from-fuchsia-900/20", text: "text-fuchsia-300" },
              Legendary: { border: "border-amber-400/50", bg: "from-amber-900/20", text: "text-amber-300" },
            };
            const rc = rarityColors[w.rarity] ?? rarityColors.Common;
            const classColor = CLASS_TEXT_COLORS[w.className as HeroClassName] ?? "text-spire-white";
            const heroOfClass = state.party.heroes.find(h => h.className === w.className && h.alive);
            const classInParty = !!heroOfClass;
            const isOwned = heroOfClass?.weapon.name === w.name;
            const canBuy = classInParty && !isOwned && state.party.gold >= w.cost;
            return (
              <div
                key={i}
                className={`group relative p-3 rounded-xl bg-gradient-to-br ${rc.bg} to-spire-bg/60 border ${rc.border} transition-all duration-200 ${classInParty ? "hover:scale-[1.02]" : "opacity-40 grayscale"}`}
              >
                <div className="flex items-start gap-2.5">
                  {weaponImg && (
                    <img src={weaponImg} alt={w.name} className="w-10 h-10 rounded-lg object-cover border border-spire-border/60 flex-shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-spire-white font-medium text-sm leading-tight">{w.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-[10px] font-medium ${rc.text}`}>{w.rarity}</span>
                      <span className="text-spire-border/60 text-[10px]">·</span>
                      <span className={`text-[10px] ${classColor}`}>{w.className}</span>
                    </div>
                  </div>
                </div>
                <div className="text-xs text-spire-muted leading-relaxed mt-2">{formatAbilityText(effect)}</div>
                {(w.name === "Swift Blade" || w.name === "Reality Anchor") && <p className="text-[10px] text-spire-warning mt-1">The reroll effect is unavailable; ordinary class actions still work.</p>}
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-spire-border/20">
                  <span className="text-spire-gold text-xs font-medium flex items-center gap-1">
                    {goldCoinUrl && <img src={goldCoinUrl} alt="g" className="w-3.5 h-3.5 inline-block" />}
                    {w.cost}
                  </span>
                  {isOwned ? (
                    <span className="text-[10px] text-green-400/60">Equipped</span>
                  ) : classInParty ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-spire-muted/50">{rarityData.powerLevel}</span>
                      <BuyButton
                        onBuy={() => heroOfClass && handleBuyWeapon(w.name, heroOfClass.id)}
                        disabled={!canBuy}
                        goldCoinUrl={goldCoinUrl}
                        cost={w.cost}
                        lockoutMs={LOCKOUT_MS}
                      />
                    </div>
                  ) : (
                    <span className="text-[10px] text-spire-muted/40 italic">not in party</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Enchantments */}
      {merchant.enchantments.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="section-heading mb-4">✦ Enchantments</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {merchant.enchantments.map((ench, i) => {
              const enchData = ENCHANTMENTS[ench.name as keyof typeof ENCHANTMENTS];
              const effect = enchData?.effect ?? "";
              const enchIcon = getEnchantIcon(ench.name);
              const isSlotFree = enchData?.slotFree;
              return (
                <div
                  key={i}
                  className="group p-3 rounded-xl bg-gradient-to-br from-purple-900/15 to-spire-bg/50 border border-purple-500/20 hover:border-purple-400/40 transition-all duration-200 hover:scale-[1.03]"
                  style={{ minHeight: "85px" }}
                >
                  <div className="flex items-center gap-2">
                    {enchIcon && <img src={enchIcon} alt={ench.name} className="w-7 h-7 rounded-lg object-cover border border-purple-500/30 flex-shrink-0" />}
                    <div className="min-w-0">
                      <div className="text-spire-white font-medium text-sm leading-tight">{ench.name}</div>
                      {isSlotFree && <span className="text-[9px] text-green-400/60">slot-free</span>}
                    </div>
                  </div>
                  <div className="text-xs text-spire-muted leading-relaxed mt-1.5">{formatAbilityText(effect)}</div>
                  {ench.name === "Swift" && <p className="text-[10px] text-spire-warning mt-1">Unavailable: die selection for rerolls is not supported.</p>}
                  <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-purple-500/10">
                    <span className="text-spire-gold text-xs font-medium flex items-center gap-1">
                      {goldCoinUrl && <img src={goldCoinUrl} alt="g" className="w-3.5 h-3.5 inline-block" />}
                      {ench.cost}
                    </span>
                    {(() => {
                      const hero = state.party.heroes.find(h => h.id === heroId);
                      const hasEnchantment = hero?.enchantment != null;
                      const canAfford = state.party.gold >= ench.cost;
                      const disabled = ench.name === "Swift" || hasEnchantment || !canAfford;
                      return (
                        <button
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-200 ${disabled ? "bg-spire-bg/50 text-spire-muted/40 cursor-not-allowed" : "bg-purple-600/80 text-white hover:bg-purple-500 hover:scale-105"}`}
                          disabled={disabled}
                          onClick={() => handleBuyEnchantment(ench.name, heroId)}
                          title={ench.name === "Swift" ? "Reroll selection is unavailable" : hasEnchantment ? "Hero already has an enchantment" : !canAfford ? "Not enough gold" : "Buy enchantment"}
                        >
                          {hasEnchantment ? "Owned" : "Buy"}
                        </button>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      </div>

      {/* Leave confirmation dialog */}
      {showLeaveConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setShowLeaveConfirm(false)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />
          <div
            className="relative rounded-2xl p-6 max-w-sm w-full text-center space-y-4 overflow-hidden"
            style={{
              background: "linear-gradient(145deg, rgba(10, 10, 28, 0.98) 0%, rgba(5, 5, 16, 0.98) 100%)",
              border: "1px solid rgba(212, 175, 55, 0.35)",
              boxShadow: "0 12px 48px rgba(0, 0, 0, 0.6), 0 0 32px rgba(212, 175, 55, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.04)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Decorative top glow */}
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px"
              style={{ background: "linear-gradient(90deg, transparent 0%, rgba(212, 175, 55, 0.5) 50%, transparent 100%)" }}
            />
            <div
              className="absolute -top-20 left-1/2 -translate-x-1/2 w-40 h-40 rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle, rgba(212, 175, 55, 0.08) 0%, transparent 70%)" }}
            />

            <div className="relative">
              <div
                className="text-4xl mb-1"
                style={{ filter: "drop-shadow(0 0 12px rgba(212, 175, 55, 0.3))" }}
              >🪙</div>
              <div
                className="text-xl font-display tracking-wide"
                style={{
                  background: "linear-gradient(135deg, #f5d76e 0%, #d4af37 50%, #f5d76e 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  textShadow: "0 0 16px rgba(212, 175, 55, 0.15)",
                }}
              >Leave the Merchant?</div>
              <div className="text-sm text-spire-white/80 leading-relaxed mt-3">
                You still have <span className="text-spire-gold font-bold text-base" style={{ textShadow: "0 0 8px rgba(212, 175, 55, 0.2)" }}>{state.party.gold}g</span> unspent.
              </div>
              <div className="text-xs text-spire-muted leading-relaxed bg-spire-bg/50 rounded-lg p-3 border border-spire-border/30 mt-3">
                {state.party.gold > goldWarningThreshold
                  ? <>💰 You have a <span className="font-bold text-spire-white">significant</span> amount of gold. Consider investing in permanent upgrades or better weapons.</>
                  : "⚔️ Even a few extra potions or a weapon upgrade can make the difference in the next encounter."}
              </div>
              <div className="flex gap-3 justify-center pt-2">
                <button
                  className="px-5 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
                  style={{
                    background: "linear-gradient(135deg, rgba(212, 175, 55, 0.95) 0%, rgba(160, 120, 20, 0.92) 50%, rgba(212, 175, 55, 0.95) 100%)",
                    boxShadow: "0 4px 16px rgba(212, 175, 55, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
                    border: "1px solid rgba(255, 215, 100, 0.4)",
                  }}
                  onClick={() => setShowLeaveConfirm(false)}
                >
                  ← Keep Shopping
                </button>
                <button
                  className="px-5 py-2.5 rounded-lg font-medium text-sm text-spire-muted border border-spire-border/40 bg-spire-bg/40 hover:bg-spire-bg/60 hover:text-spire-white transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
                  onClick={handleConfirmLeave}
                >
                  Leave Anyway →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Weapon upgrade confirmation modal */}
      {upgradeConfirmHero && (() => {
        const RARITY_ORD: WeaponRarity[] = ["Common", "Rare", "Epic", "Legendary"];
        const idx = RARITY_ORD.indexOf(upgradeConfirmHero.weapon.rarity);
        const nextR = RARITY_ORD[idx + 1];
        const nrd = WEAPON_RARITY_DATA[nextR];
        const upgCost = getMerchantPrice(state, nrd.upgradeCost);
        const upgWeapons = WEAPONS.filter((w) => w.className === upgradeConfirmHero.className && w.rarity === nextR);
        const chosenW = upgWeapons[0];
        const chosenImg = getWeaponImage(chosenW?.name ?? "");
        const currentImg = getWeaponImage(upgradeConfirmHero.weapon.name);
        const classIcon = getClassIcon(upgradeConfirmHero.className);
        const currentWData = WEAPONS.find((w) => w.id === upgradeConfirmHero.weapon.weaponId);
        const canAfford = state.party.gold >= upgCost;
        const rarityBadge: Record<string, string> = {
          Common: "bg-spire-card text-spire-muted",
          Rare: "bg-blue-900/40 text-blue-300",
          Epic: "bg-fuchsia-900/40 text-fuchsia-300",
          Legendary: "bg-amber-900/40 text-amber-300",
        };
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 animate-fade-in"
            onClick={() => setUpgradeConfirmHero(null)}
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div
              className="relative glass-panel rounded-2xl border border-spire-gold/30 shadow-panel p-4 sm:p-6 max-w-md w-full space-y-3 sm:space-y-4 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 sm:gap-3">
                {classIcon && <img src={classIcon} alt={upgradeConfirmHero.className} className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover border border-spire-gold/40 flex-shrink-0" />}
                <div className="min-w-0">
                  <div className="text-base sm:text-lg font-display text-spire-gold truncate">Upgrade Weapon</div>
                  <div className="text-xs sm:text-sm text-spire-white/70 truncate">{upgradeConfirmHero.name} · {upgradeConfirmHero.className}</div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                {/* Current weapon */}
                <div className="flex-1 p-2.5 sm:p-3 rounded-xl bg-spire-card/60 border border-spire-border/40">
                  <div className="text-[10px] text-spire-muted uppercase tracking-wider mb-2">Current</div>
                  <div className="flex items-center gap-2">
                    {currentImg && <img src={currentImg} alt="" className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg object-cover border border-spire-border/50 flex-shrink-0" />}
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-medium text-spire-white truncate">{upgradeConfirmHero.weapon.name}</div>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${rarityBadge[upgradeConfirmHero.weapon.rarity] ?? rarityBadge.Common}`}>{upgradeConfirmHero.weapon.rarity}</span>
                    </div>
                  </div>
                  <div className="text-[10px] text-spire-white/60 leading-snug mt-2">{formatAbilityText(currentWData?.effect ?? upgradeConfirmHero.weapon.effect)}</div>
                </div>

                {/* Arrow */}
                <div className="text-spire-accent text-xl font-bold text-center sm:rotate-0 rotate-90">→</div>

                {/* New weapon */}
                <div className="flex-1 p-2.5 sm:p-3 rounded-xl bg-spire-accent/10 border border-spire-accent/30">
                  <div className="text-[10px] text-spire-accent uppercase tracking-wider mb-2">Upgrading To</div>
                  <div className="flex items-center gap-2">
                    {chosenImg && <img src={chosenImg} alt="" className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg object-cover border border-spire-accent/40 flex-shrink-0" />}
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-medium text-spire-white truncate">{chosenW?.name}</div>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${rarityBadge[nextR] ?? rarityBadge.Common}`}>{nextR}</span>
                    </div>
                  </div>
                  <div className="text-[10px] text-spire-accent/80 leading-snug mt-2">{formatAbilityText(chosenW?.effect ?? "")}</div>
                </div>
              </div>

              <div className="flex flex-col items-center gap-1 pt-1">
                <div className="flex items-center justify-center gap-1.5">
                  {goldCoinUrl && <img src={goldCoinUrl} alt="g" className="w-5 h-5 inline-block gold-sparkle" />}
                  <span className="text-base sm:text-lg font-bold text-spire-gold drop-shadow-[0_0_8px_rgba(255,215,0,0.6)] tracking-wide">{upgCost}g</span>
                </div>
                {!canAfford && <span className="text-[10px] text-red-400/60">Not enough gold</span>}
              </div>

              <div className="flex gap-2 sm:gap-3 justify-center pt-1">
                <button
                  className="btn-ghost px-4 sm:px-5 py-2 text-sm"
                  onClick={() => setUpgradeConfirmHero(null)}
                >
                  ← Cancel
                </button>
                <button
                  className="btn-gold px-4 sm:px-5 py-2 text-sm"
                  disabled={!canAfford}
                  onClick={() => {
                    handleUpgradeWeapon(upgradeConfirmHero.id);
                    setUpgradeConfirmHero(null);
                  }}
                >
                  Confirm →
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Auto-buy first-use warning */}
      {showAutoBuyWarning && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setShowAutoBuyWarning(false)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative glass-panel rounded-2xl border border-purple-500/30 shadow-panel p-5 sm:p-6 max-w-md w-full space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0"
                style={{
                  background: "linear-gradient(135deg, rgba(168,85,247,0.3) 0%, rgba(126,34,206,0.3) 100%)",
                  border: "1px solid rgba(196,181,253,0.3)",
                }}
              >
                <span className="text-xl">⚡</span>
              </div>
              <div>
                <div className="text-lg font-display text-purple-300">Auto-Buy?</div>
                <div className="text-xs text-spire-muted">Quick but costly</div>
              </div>
            </div>

            <div className="space-y-3 text-sm leading-relaxed">
              <p className="text-spire-white/80">
                Auto-Buy will attempt to purchase everything your party needs in one tap — upgrades, weapons, enchantments, healing, and items — prioritizing permanent upgrades.
              </p>

              <div className="rounded-lg bg-amber-900/15 border border-amber-600/25 p-3 space-y-1.5">
                <div className="text-amber-300 font-medium text-xs uppercase tracking-wider">⚠ Before you continue</div>
                <div className="text-[12px] text-amber-200/80">
                  A <span className="font-bold text-amber-300">5% laziness tax</span> is applied to every purchase made through Auto-Buy. This adds up quickly.
                </div>
                <div className="text-[12px] text-amber-200/80">
                  Auto-Buy is <span className="font-bold text-amber-300">not always effective</span> — it may buy items you don't need or miss optimal choices. Choosing manually or using suggested purchases will always be more efficient.
                </div>
              </div>

              <p className="text-[11px] text-spire-muted">
                You won't see this warning again during this visit.
              </p>
            </div>

            <div className="flex gap-3 justify-center pt-1">
              <button
                className="btn-ghost px-5 py-2 text-sm"
                onClick={() => setShowAutoBuyWarning(false)}
              >
                ← Maybe Not
              </button>
              <button
                className="px-5 py-2 text-sm rounded-lg text-white font-medium transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
                style={{
                  background: "linear-gradient(135deg, rgba(168,85,247,0.9) 0%, rgba(126,34,206,0.95) 50%, rgba(168,85,247,0.9) 100%)",
                  boxShadow: "0 4px 18px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.15)",
                  border: "1px solid rgba(196,181,253,0.4)",
                }}
                onClick={handleAutoBuyWarningConfirm}
              >
                Auto-Buy Anyway →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-buy purchase summary */}
      {autoBuySummary && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setAutoBuySummary(null)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative glass-panel rounded-2xl border border-purple-500/30 shadow-panel p-5 sm:p-6 max-w-md w-full space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0"
                style={{
                  background: "linear-gradient(135deg, rgba(168,85,247,0.3) 0%, rgba(126,34,206,0.3) 100%)",
                  border: "1px solid rgba(196,181,253,0.3)",
                }}
              >
                <span className="text-xl">⚡</span>
              </div>
              <div>
                <div className="text-lg font-display text-purple-300">Auto-Buy Complete</div>
                <div className="text-xs text-spire-muted">Here's everything you got</div>
              </div>
            </div>

            {autoBuySummary.purchases.length > 0 ? (
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {autoBuySummary.purchases.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-spire-card/60 border border-spire-border/30"
                  >
                    <span className="text-sm text-spire-white">{p.label}</span>
                    {p.count > 1 && (
                      <span className="text-[10px] text-spire-muted bg-spire-bg/60 px-2 py-0.5 rounded-full">×{p.count}</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-spire-muted text-sm">
                Nothing was purchased — perhaps you're already well-equipped!
              </div>
            )}

            <div className="border-t border-spire-border/30 pt-3 space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-spire-muted">Gold Spent</span>
                <span className="text-spire-gold font-medium flex items-center gap-1">
                  {goldCoinUrl && <img src={goldCoinUrl} alt="g" className="w-3.5 h-3.5 inline-block" />}
                  {autoBuySummary.goldSpent}g
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-amber-400/70">Laziness Tax (5%)</span>
                <span className="text-amber-400 font-medium flex items-center gap-1">
                  {goldCoinUrl && <img src={goldCoinUrl} alt="g" className="w-3.5 h-3.5 inline-block" />}
                  {autoBuySummary.taxPaid}g
                </span>
              </div>
              <div className="flex items-center justify-between text-sm border-t border-spire-border/20 pt-1.5">
                <span className="text-spire-white font-medium">Remaining Gold</span>
                <span className="text-spire-gold font-bold flex items-center gap-1">
                  {goldCoinUrl && <img src={goldCoinUrl} alt="g" className="w-3.5 h-3.5 inline-block" />}
                  {autoBuySummary.remainingGold}g
                </span>
              </div>
            </div>

            <div className="flex justify-center items-center gap-3 pt-1">
              {autoLeaveCountdown !== null && autoLeaveCountdown > 0 && (
                <span className="text-xs text-spire-muted animate-pulse">
                  Auto-leave in {autoLeaveCountdown}s...
                </span>
              )}
              <button
                className="btn-gold px-6 py-2 text-sm"
                onClick={() => {
                  setAutoBuySummary(null);
                  setAutoLeaveCountdown(null);
                  playSfx("ui", "transition");
                  doLeaveMerchant();
                  onBack();
                }}
              >
                Leave Merchant →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating auto-leave countdown (when no summary modal) */}
      {autoBuyUsed && autoLeaveCountdown !== null && autoLeaveCountdown > 0 && !autoBuySummary && (
        <div className="fixed bottom-4 right-4 z-40 glass-panel px-4 py-2.5 rounded-xl border border-purple-500/30 shadow-panel animate-fade-in flex items-center gap-2">
          <span className="text-sm text-purple-300 font-medium">⏱ Auto-leave in {autoLeaveCountdown}s</span>
          <span className="text-[10px] text-spire-muted">tap to pause</span>
        </div>
      )}
    </div>
  );
}
