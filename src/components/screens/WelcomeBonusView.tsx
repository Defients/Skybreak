import { useState, useEffect, useCallback, useMemo } from "react";
import { useGameStore } from "../../app/gameStore";
import { useAudio } from "../../audio/useAudio";
import { InteractiveDiceRoller } from "../ui/InteractiveDiceRoller";
import { HeroIcon } from "../ui/HeroIcon";
import {
  getStarsImage,
  getMenuBackground,
  getDiceImage,
  getGoldCoinImage,
  getWeaponImage,
} from "../../assets/assetRegistry";
import { CLASS_TEXT_COLORS } from "../../utils/nameResolver";
import { getWeaponsByClassAndRarity, WEAPONS, WEAPON_RARITY_DATA } from "../../data/weapons";
import type { WeaponData } from "../../types/inventory";
import { formatAbilityText } from "../../utils/formatAbilityText";
import type { HeroState } from "../../types/heroes";
import type { WeaponRarity } from "../../types/inventory";
import type { WelcomeBonusRollResult } from "../../engine/gameState";
import { Tooltip } from "../ui/Tooltip";

interface Props {
  onComplete: () => void;
}

interface HeroRollResult {
  heroId: number;
  heroName: string;
  className: string;
  specialization: string;
  die1: number;
  die2: number;
  total: number;
  reward: string;
  rewardIcon: string;
  rewardRarity: WeaponRarity | null;
  rewardWeaponName: string | null;
  chosenWeaponId: string | null;
  skipped: boolean;
}

function getRewardInfo(total: number, hero: HeroState): { text: string; icon: string; rarity: WeaponRarity | null; weaponName: string | null } {
  if (total >= 11) {
    return { text: "Choose a Rare Weapon", icon: "sword", rarity: "Rare", weaponName: null };
  } else if (total >= 9) {
    return { text: "Choose a Common Weapon + 20g", icon: "sword", rarity: "Common", weaponName: null };
  } else if (total >= 6) {
    return { text: "Choose a Common Weapon", icon: "sword", rarity: "Common", weaponName: null };
  } else {
    return { text: "20 Gold", icon: "gold", rarity: null, weaponName: null };
  }
}

function getRewardWeapons(total: number, className: string): WeaponData[] {
  if (total >= 11) {
    return getWeaponsByClassAndRarity(className, "Rare");
  } else if (total >= 6) {
    return getWeaponsByClassAndRarity(className, "Common");
  }
  return [];
}

const PARTICLE_COLORS = ["rgba(34, 211, 238, 0.4)", "rgba(139, 92, 246, 0.4)", "rgba(212, 175, 55, 0.4)"];
const CONFETTI_COLORS = ["#22d3ee", "#8b5cf6", "#d4af37", "#d946ef", "#14b8a6"];

function playMagicalChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
    const baseFreqs = notes.sort(() => Math.random() - 0.5).slice(0, 3);
    const now = ctx.currentTime;

    baseFreqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = i === 0 ? "sine" : "triangle";
      osc.frequency.value = freq * (0.98 + Math.random() * 0.04);

      const start = now + i * 0.08;
      const dur = 0.6 + Math.random() * 0.4;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.15, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur);
    });

    const shimmer = ctx.createOscillator();
    const shimmerGain = ctx.createGain();
    shimmer.type = "sine";
    shimmer.frequency.setValueAtTime(2000 + Math.random() * 1000, now);
    shimmer.frequency.exponentialRampToValueAtTime(4000, now + 0.3);
    shimmerGain.gain.setValueAtTime(0, now);
    shimmerGain.gain.linearRampToValueAtTime(0.04, now + 0.05);
    shimmerGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    shimmer.connect(shimmerGain);
    shimmerGain.connect(ctx.destination);
    shimmer.start(now);
    shimmer.stop(now + 0.5);

    setTimeout(() => ctx.close(), 2000);
  } catch {
    /* ignore */
  }
}

function useCosmicParticles(count: number) {
  return useMemo(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      size: 2 + Math.random() * 4,
      color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
      delay: Math.random() * 8,
      duration: 6 + Math.random() * 6,
    })), [count]);
}

function useTwinkleDots(count: number) {
  return useMemo(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      size: 1 + Math.random() * 2,
      delay: Math.random() * 3,
      duration: 2 + Math.random() * 3,
    })), [count]);
}

function ConfettiBurst({ total }: { total: number }) {
  const pieces = useMemo(() => {
    const count = total >= 11 ? 16 : total >= 9 ? 12 : 0;
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2;
      const dist = 60 + Math.random() * 80;
      return {
        id: i,
        cx: Math.cos(angle) * dist,
        cy: Math.sin(angle) * dist,
        cr: (Math.random() - 0.5) * 720,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        delay: Math.random() * 0.15,
      };
    });
  }, [total]);

  if (pieces.length === 0) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      {pieces.map((p) => (
        <div
          key={p.id}
          className="wb-confetti animate-confetti-burst"
          style={{
            background: p.color,
            animationDelay: `${p.delay}s`,
            "--cx": `${p.cx}px`,
            "--cy": `${p.cy}px`,
            "--cr": `${p.cr}deg`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

const RARITY_COLORS: Record<WeaponRarity, string> = {
  Common: "text-spire-muted",
  Rare: "text-blue-300",
  Epic: "text-fuchsia-300",
  Legendary: "text-amber-300",
};

function RewardDisplay({ reward, icon, rarity, weaponName }: { reward: string; icon: string; rarity: WeaponRarity | null; weaponName: string | null }) {
  const goldCoinUrl = getGoldCoinImage();
  const weaponUrl = weaponName ? getWeaponImage(weaponName) : null;
  const weaponData = weaponName ? WEAPONS.find((w) => w.name === weaponName) : null;
  const rarityData = rarity ? WEAPON_RARITY_DATA[rarity] : null;

  if (icon === "gold" && goldCoinUrl) {
    return (
      <div className="flex items-center justify-center gap-3 animate-reward-bounce">
        <img src={goldCoinUrl} alt="Gold" className="w-10 h-10 drop-shadow-[0_0_8px_rgba(212,175,55,0.4)] gold-sparkle" />
        <span className="text-spire-gold text-lg font-bold">{reward}</span>
      </div>
    );
  }

  const weaponTooltip = weaponData ? (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        {weaponUrl && (
          <img src={weaponUrl} alt={weaponData.name} className="w-8 h-8 rounded object-cover border border-spire-border/50" />
        )}
        <div>
          <div className={`text-sm font-bold ${rarity ? RARITY_COLORS[rarity] : "text-spire-white"}`}>
            {weaponData.name}
          </div>
          <div className="text-[10px] text-spire-muted">
            {rarity} · {rarityData?.powerLevel ?? ""}
          </div>
        </div>
      </div>
      <div className="text-[11px] text-spire-white/85 leading-snug border-t border-spire-border/30 pt-1.5">
        {formatAbilityText(weaponData.effect)}
      </div>
    </div>
  ) : null;

  return (
    <div className="flex items-center justify-center gap-3 animate-reward-bounce">
      {weaponUrl && weaponTooltip ? (
        <Tooltip
          content={weaponTooltip}
          side="top"
          wrapperClassName="relative rounded border border-spire-border/60 bg-spire-card cursor-help overflow-visible"
          wrapperStyle={{ width: 44, height: 44 }}
        >
          <div className="w-full h-full overflow-hidden rounded">
            <img src={weaponUrl} alt={weaponName ?? ""} className="w-full h-full object-contain" />
          </div>
        </Tooltip>
      ) : (
        <span className="text-2xl">⚔️</span>
      )}
      <div className="flex flex-col text-left">
        {rarity && (
          <span className={`text-xs font-bold uppercase tracking-wider ${RARITY_COLORS[rarity]}`}>
            {rarity}
          </span>
        )}
        <span className={`text-sm font-medium ${rarity ? RARITY_COLORS[rarity] : "text-spire-accent"}`}>
          {weaponName ?? reward}
        </span>
        {reward.includes("+ 20g") && (
          <span className="text-[10px] text-spire-gold">+ 20g</span>
        )}
      </div>
    </div>
  );
}

export function WelcomeBonusView({ onComplete }: Props) {
  const state = useGameStore((s) => s.state);
  const doApplyWelcomeBonus = useGameStore((s) => s.doApplyWelcomeBonus);
  const { playMusic } = useAudio();

  const [currentHeroIndex, setCurrentHeroIndex] = useState(0);
  const [results, setResults] = useState<HeroRollResult[]>([]);
  const [phase, setPhase] = useState<"rolling" | "result" | "weaponSelect" | "summary">("rolling");
  const [autoPlay, setAutoPlay] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [rollerKey, setRollerKey] = useState(0);
  const [botMessage, setBotMessage] = useState("");

  const isSimulation = state?.settings?.mode === "simulation";

  const particles = useCosmicParticles(18);
  const twinkleDots = useTwinkleDots(24);

  useEffect(() => {
    playMusic("title");
  }, [playMusic]);

  // Auto-enable autoplay for simulation mode
  useEffect(() => {
    if (isSimulation) {
      setAutoPlay(true);
    }
  }, [isSimulation]);

  const heroes = state?.party?.heroes ?? [];
  const currentHero = heroes[currentHeroIndex];
  const starsUrl = getStarsImage();
  const bgUrl = getMenuBackground();

  const handleRollResult = useCallback((values: number[]) => {
    if (!currentHero) return;
    const [die1, die2] = values;
    const total = die1 + die2;
    const rewardInfo = getRewardInfo(total, currentHero);

    // Playful bot commentary for simulation mode
    if (isSimulation) {
      const messages = total >= 11
        ? ["Jackpot! 🎉", "Incredible roll!", "The bot is thrilled!", "Rare incoming!"]
        : total >= 9
        ? ["Nice roll!", "Solid!", "Not bad at all!", "The bot approves."]
        : total >= 6
        ? ["Decent.", "Gets a weapon.", "Workable.", "The bot nods."]
        : ["Oof.", "Just gold then.", "The bot shrugs.", "Could be worse..." + "\nbut it's not."];
      setBotMessage(messages[Math.floor(Math.random() * messages.length)]);
    }

    const result: HeroRollResult = {
      heroId: currentHero.heroId,
      heroName: currentHero.name,
      className: currentHero.className,
      specialization: currentHero.specialization,
      die1,
      die2,
      total,
      reward: rewardInfo.text,
      rewardIcon: rewardInfo.icon,
      rewardRarity: rewardInfo.rarity,
      rewardWeaponName: rewardInfo.weaponName,
      chosenWeaponId: null,
      skipped: false,
    };

    setResults((prev) => [...prev, result]);
    setPhase("result");
    playMagicalChime();
  }, [currentHero]);

  const handleNext = useCallback(() => {
    const lastResult = results[results.length - 1];
    const needsWeaponSelect = lastResult && lastResult.total >= 6 && !lastResult.chosenWeaponId && !lastResult.skipped;

    if (needsWeaponSelect) {
      setPhase("weaponSelect");
      return;
    }

    if (currentHeroIndex + 1 >= heroes.length) {
      setPhase("summary");
    } else {
      setCurrentHeroIndex((prev) => prev + 1);
      setPhase("rolling");
      setRollerKey((prev) => prev + 1);
    }
  }, [currentHeroIndex, heroes.length, results]);

  const handleSkip = useCallback(() => {
    setSkipped(true);
    // Commit all dice first, then choose rewards in party order, as batch does.
    heroes.forEach(hero => useGameStore.getState().doRollWelcomeBonus(hero.heroId));
    const skipResults: HeroRollResult[] = heroes.map((hero) => {
      const existing = results.find((r) => r.heroId === hero.heroId);
      if (existing) return existing;

      const [d1, d2] = useGameStore.getState().doRollWelcomeBonus(hero.heroId);
      const total = d1 + d2;
      const rewardInfo = getRewardInfo(total, hero);
      const rewardWeapons = getRewardWeapons(total, hero.className);
      const autoChosen = rewardWeapons.length > 0
        ? rewardWeapons.find(w => w.id === useGameStore.getState().doChooseWelcomeWeapon(hero.heroId)) ?? null
        : null;

      return {
        heroId: hero.heroId,
        heroName: hero.name,
        className: hero.className,
        specialization: hero.specialization,
        die1: d1,
        die2: d2,
        total,
        reward: rewardInfo.text,
        rewardIcon: rewardInfo.icon,
        rewardRarity: rewardInfo.rarity,
        rewardWeaponName: autoChosen?.name ?? null,
        chosenWeaponId: autoChosen?.id ?? null,
        skipped: true,
      };
    });
    setResults(skipResults);
    setPhase("summary");
  }, [heroes, results]);

  const handleWeaponSelect = useCallback((weaponId: string) => {
    const lastResult = results[results.length - 1];
    if (!lastResult) return;
    const weaponData = WEAPONS.find((w) => w.id === weaponId);
    if (!weaponData) return;

    setResults((prev) => prev.map((r, i) =>
      i === prev.length - 1
        ? { ...r, chosenWeaponId: weaponId, rewardWeaponName: weaponData.name }
        : r
    ));

    if (currentHeroIndex + 1 >= heroes.length) {
      setPhase("summary");
    } else {
      setCurrentHeroIndex((prev) => prev + 1);
      setPhase("rolling");
      setRollerKey((prev) => prev + 1);
    }
  }, [results, currentHeroIndex, heroes.length]);

  const handleEnterSpire = useCallback(() => {
    const rollResults: WelcomeBonusRollResult[] = results.map((r) => ({
      heroId: r.heroId,
      die1: r.die1,
      die2: r.die2,
      chosenWeaponId: r.chosenWeaponId ?? undefined,
    }));
    doApplyWelcomeBonus(rollResults);
    onComplete();
  }, [results, doApplyWelcomeBonus, onComplete]);

  useEffect(() => {
    if (phase === "result" && autoPlay) {
      // Playful varied timing for simulation mode
      const delay = isSimulation
        ? 800 + Math.random() * 1200  // 0.8s–2s, feels alive
        : 1500;
      const timer = setTimeout(() => handleNext(), delay);
      return () => clearTimeout(timer);
    }
  }, [phase, autoPlay, handleNext, isSimulation]);

  // Auto-pick weapon in simulation/skip mode after weaponSelect loads
  useEffect(() => {
    if (phase === "weaponSelect" && (autoPlay || isSimulation)) {
      const lastResult = results[results.length - 1];
      if (!lastResult || !currentHero) return;
      const weapons = getRewardWeapons(lastResult.total, currentHero.className);
      if (weapons.length > 0) {
        const delay = isSimulation ? 600 + Math.random() * 800 : 800;
        const timer = setTimeout(() => {
          const pickId = useGameStore.getState().doChooseWelcomeWeapon(lastResult.heroId);
          if (pickId) handleWeaponSelect(pickId);
        }, delay);
        return () => clearTimeout(timer);
      }
    }
  }, [phase, autoPlay, isSimulation, results, currentHero, handleWeaponSelect]);

  // Auto-enter the spire in simulation mode after summary loads
  useEffect(() => {
    if (phase === "summary" && isSimulation) {
      const timer = setTimeout(() => handleEnterSpire(), 2000);
      return () => clearTimeout(timer);
    }
  }, [phase, isSimulation, handleEnterSpire]);

  if (!state || !currentHero) {
    if (phase === "summary" || !currentHero) {
      return null;
    }
    return null;
  }

  if (phase === "summary") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 relative">
        {bgUrl && (
          <div className="bg-image-overlay" style={{ backgroundImage: `url(${bgUrl})`, opacity: 0.08 }} />
        )}
        {starsUrl && (
          <div className="bg-image-overlay" style={{ backgroundImage: `url(${starsUrl})`, opacity: 0.15 }} />
        )}
        {particles.map((p) => (
          <div
            key={p.id}
            className="wb-particle animate-float-particle"
            style={{
              left: `${p.left}%`,
              top: `${p.top}%`,
              width: p.size,
              height: p.size,
              background: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
            }}
          />
        ))}
        {twinkleDots.map((d) => (
          <div
            key={d.id}
            className="wb-twinkle-dot animate-twinkle"
            style={{
              left: `${d.left}%`,
              top: `${d.top}%`,
              width: d.size,
              height: d.size,
              background: "rgba(226, 232, 240, 0.6)",
              animationDelay: `${d.delay}s`,
              animationDuration: `${d.duration}s`,
            }}
          />
        ))}
        <div className="relative z-10 max-w-2xl w-full space-y-6 animate-scale-fade">
          <div className="glass-panel p-6 text-center wb-aurora-border">
            <div className="text-3xl mb-2 animate-reward-bounce">🎁</div>
            <h2 className="text-2xl font-display gold-text mb-2">Welcome Bonus Summary</h2>
            <p className="text-spire-muted text-sm">
              {skipped ? "Seeded rewards auto-distributed — no skip penalty" : "All heroes have rolled their bonus rewards"}
            </p>
          </div>

          <div className="space-y-3">
            {results.map((r, i) => {
              const hero = heroes.find((h) => h.heroId === r.heroId);
              const classColor = CLASS_TEXT_COLORS[r.className as keyof typeof CLASS_TEXT_COLORS] ?? "text-spire-white";
              const die1Url = getDiceImage(r.die1);
              const die2Url = getDiceImage(r.die2);
              return (
                <div key={i} className={`glass-card p-3 sm:p-4 reward-card-pop flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4`} style={{ animationDelay: `${i * 0.1}s` }}>
                  {/* Top row on mobile: hero icon + class name + dice */}
                  <div className="flex items-center gap-3 w-full sm:flex-1 sm:min-w-0">
                    {hero && <HeroIcon hero={hero} size={48} hideWeapon hideSpecTooltip />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-base sm:text-xl font-display font-bold ${classColor}`} style={{ textShadow: "0 0 10px currentColor" }}>{r.className}</span>
                        {r.skipped && <span className="text-[10px] text-spire-muted/60 bg-spire-border/30 px-1.5 py-0.5 rounded">SKIPPED</span>}
                      </div>
                      {r.specialization && (
                        <div className="text-xs sm:text-sm text-spire-muted mt-0.5 truncate">{r.specialization}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                      {die1Url ? <img src={die1Url} alt={`${r.die1}`} className="w-6 h-6 sm:w-8 sm:h-8" /> : <span className="text-lg sm:text-xl text-spire-gold">{"⚀⚁⚂⚃⚄⚅"[r.die1 - 1]}</span>}
                      {die2Url ? <img src={die2Url} alt={`${r.die2}`} className="w-6 h-6 sm:w-8 sm:h-8" /> : <span className="text-lg sm:text-xl text-spire-gold">{"⚀⚁⚂⚃⚄⚅"[r.die2 - 1]}</span>}
                      <span className="text-spire-muted text-xs sm:text-sm">=</span>
                      <span className="text-lg sm:text-xl font-bold gold-text tabular-nums">{r.total}</span>
                    </div>
                  </div>
                  {/* Reward: below on mobile, right side on desktop */}
                  <div className="w-full sm:w-auto sm:text-right sm:min-w-[120px] border-t sm:border-t-0 border-spire-border/20 pt-3 sm:pt-0">
                    <RewardDisplay reward={r.reward} icon={r.rewardIcon} rarity={r.rewardRarity} weaponName={r.rewardWeaponName} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-center">
            {isSimulation ? (
              <div className="flex items-center gap-2 text-sm text-spire-accent/70 animate-pulse">
                <span className="text-lg">🤖</span>
                <span>Bot is entering the Astrilith...</span>
              </div>
            ) : (
              <button className="btn-gold px-8 py-3 text-lg font-bold tracking-wider animate-festive-glow" onClick={handleEnterSpire}>
                Enter the Astrilith →
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (phase === "weaponSelect") {
    const lastResult = results[results.length - 1];
    const weaponOptions = lastResult ? getRewardWeapons(lastResult.total, currentHero.className) : [];
    const classColor = CLASS_TEXT_COLORS[currentHero.className as keyof typeof CLASS_TEXT_COLORS] ?? "text-spire-white";

    return (
      <div className="min-h-screen flex items-center justify-center p-6 relative">
        {bgUrl && (
          <div className="bg-image-overlay" style={{ backgroundImage: `url(${bgUrl})`, opacity: 0.08 }} />
        )}
        {starsUrl && (
          <div className="bg-image-overlay" style={{ backgroundImage: `url(${starsUrl})`, opacity: 0.06 }} />
        )}
        {particles.map((p) => (
          <div
            key={p.id}
            className="wb-particle animate-float-particle"
            style={{
              left: `${p.left}%`,
              top: `${p.top}%`,
              width: p.size,
              height: p.size,
              background: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
            }}
          />
        ))}
        {twinkleDots.map((d) => (
          <div
            key={d.id}
            className="wb-twinkle-dot animate-twinkle"
            style={{
              left: `${d.left}%`,
              top: `${d.top}%`,
              width: d.size,
              height: d.size,
              background: "rgba(226, 232, 240, 0.6)",
              animationDelay: `${d.delay}s`,
              animationDuration: `${d.duration}s`,
            }}
          />
        ))}
        <div className="relative z-10 max-w-2xl w-full space-y-5 animate-scale-fade">
          <div className="glass-panel p-5 text-center wb-aurora-border">
            <div className="text-2xl mb-1 animate-reward-bounce">⚔️</div>
            <h2 className="text-xl font-display gold-text mb-1">Choose Your Weapon</h2>
            <p className="text-spire-muted text-xs">
              {lastResult && lastResult.total >= 11 ? "Rare weapon reward" : "Common weapon reward"}
              {lastResult && lastResult.total >= 9 && lastResult.total <= 10 && " + 20g"}
            </p>
          </div>

          <div className="glass-card p-4 flex items-center gap-3">
            <HeroIcon hero={currentHero} size={48} hideWeapon hideSpecTooltip />
            <div className="flex-1">
              <div className="text-sm font-medium text-spire-white">{currentHero.specialization}</div>
              <div className={`text-[10px] uppercase tracking-wider ${classColor}`}>{currentHero.className}</div>
            </div>
            <div className="flex items-center gap-2">
              {lastResult && (
                <>
                  <span className="text-lg font-bold gold-text tabular-nums">{lastResult.total}</span>
                  <span className="text-xs text-spire-muted">rolled</span>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {weaponOptions.map((wd, i) => {
              const weaponUrl = getWeaponImage(wd.name);
              const rarityData = WEAPON_RARITY_DATA[wd.rarity];
              const rarityColor = RARITY_COLORS[wd.rarity] ?? "text-spire-white";
              const tooltipContent = (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    {weaponUrl && (
                      <img src={weaponUrl} alt={wd.name} className="w-8 h-8 rounded object-cover border border-spire-border/50" />
                    )}
                    <div>
                      <div className={`text-sm font-bold ${rarityColor}`}>{wd.name}</div>
                      <div className="text-[10px] text-spire-muted">{wd.rarity} · {rarityData?.powerLevel ?? ""}</div>
                    </div>
                  </div>
                  <div className="text-[11px] text-spire-white/85 leading-snug border-t border-spire-border/30 pt-1.5">
                    {formatAbilityText(wd.effect)}
                  </div>
                </div>
              );
              return (
                <button
                  key={wd.id}
                  className="glass-card p-4 text-left hover:border-spire-accent/50 hover:shadow-glow-cyan transition-all duration-200 group animate-scale-fade cursor-pointer relative overflow-hidden"
                  style={{ animationDelay: `${i * 0.1}s` }}
                  onClick={() => handleWeaponSelect(wd.id)}
                >
                  <div className="flex items-start gap-3">
                    {weaponUrl ? (
                      <Tooltip
                        content={tooltipContent}
                        side="top"
                        wrapperClassName="relative rounded border border-spire-border/60 bg-spire-card cursor-help overflow-visible flex-shrink-0"
                        wrapperStyle={{ width: 48, height: 48 }}
                      >
                        <div className="w-full h-full overflow-hidden rounded">
                          <img src={weaponUrl} alt={wd.name} className="w-full h-full object-contain" />
                        </div>
                      </Tooltip>
                    ) : (
                      <div className="w-12 h-12 flex items-center justify-center text-2xl flex-shrink-0">⚔️</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-bold ${rarityColor}`}>{wd.name}</div>
                      <div className="text-[10px] text-spire-muted uppercase tracking-wider mb-1">{wd.rarity}</div>
                      <div className="text-[11px] text-spire-white/70 leading-snug line-clamp-2">
                        {formatAbilityText(wd.effect)}
                      </div>
                    </div>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-spire-accent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              );
            })}
          </div>

          {isSimulation && (
            <div className="flex items-center justify-center gap-2 text-sm text-spire-accent/60 animate-pulse">
              <span className="text-lg">🤖</span>
              <span>Bot is choosing...</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  const lastResult = results[results.length - 1];
  const showResult = phase === "result" && lastResult && lastResult.heroId === currentHero.heroId;

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative">
      {bgUrl && (
        <div className="bg-image-overlay" style={{ backgroundImage: `url(${bgUrl})`, opacity: 0.08 }} />
      )}
      {starsUrl && (
        <div className="bg-image-overlay" style={{ backgroundImage: `url(${starsUrl})`, opacity: 0.04 }} />
      )}
      {particles.map((p) => (
        <div
          key={p.id}
          className="wb-particle animate-float-particle"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: p.size,
            height: p.size,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
      {twinkleDots.map((d) => (
        <div
          key={d.id}
          className="wb-twinkle-dot animate-twinkle"
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: d.size,
            height: d.size,
            background: "rgba(226, 232, 240, 0.6)",
            animationDelay: `${d.delay}s`,
            animationDuration: `${d.duration}s`,
          }}
        />
      ))}

      <div className="relative z-10 max-w-2xl w-full space-y-5 animate-scale-fade">
        <div className="glass-panel p-5 text-center wb-aurora-border">
          <div className="text-2xl mb-1 animate-reward-bounce">🎁</div>
          <h2 className="text-xl font-display gold-text mb-1">Welcome Bonus</h2>
          <p className="text-spire-muted text-xs">
            Roll 2d6 for each hero to earn starting rewards.<br />
            Hold to charge, drag to aim, release to throw!
          </p>
        </div>

        <div className="flex items-center justify-center gap-2">
          {heroes.map((h, i) => (
            <div
              key={h.id}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all duration-200 ${
                i === currentHeroIndex
                  ? "bg-spire-accent/15 border border-spire-accent/40 shadow-glow-cyan"
                  : i < currentHeroIndex
                  ? "opacity-50"
                  : "opacity-30"
              }`}
            >
              <HeroIcon hero={h} size={24} hideWeapon hideSpecTooltip />
              <span className="text-[10px] text-spire-muted">
                {i < currentHeroIndex ? "✓" : i === currentHeroIndex ? "NOW" : `${i + 1}`}
              </span>
            </div>
          ))}
        </div>

        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center gap-3">
            <HeroIcon hero={currentHero} size={56} hideWeapon hideSpecTooltip />
            <div>
              <div className="text-base font-medium text-spire-white">
                {currentHero.specialization}
              </div>
              <div className={`text-[10px] uppercase tracking-wider ${CLASS_TEXT_COLORS[currentHero.className as keyof typeof CLASS_TEXT_COLORS] ?? "text-spire-muted"}`}>
                {currentHero.className}
              </div>
            </div>
            <div className="ml-auto text-right">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-spire-bg/50 border border-spire-border/40">
                <span className="text-sm font-mono font-bold text-spire-gold">{currentHeroIndex + 1}</span>
                <span className="text-xs text-spire-muted/50">/</span>
                <span className="text-sm font-mono text-spire-muted">{heroes.length}</span>
                <span className="text-[11px] uppercase tracking-wider text-spire-muted/70 ml-1">Hero</span>
              </div>
            </div>
          </div>

          {!showResult ? (
            <InteractiveDiceRoller
              key={rollerKey}
              diceCount={2}
              resolveValues={() => useGameStore.getState().doRollWelcomeBonus(currentHero.heroId)}
              onResult={handleRollResult}
              autoPlay={autoPlay}
            />
          ) : (
            <div className="space-y-4 py-4 relative">
              <div className="flex items-center justify-center gap-3 relative">
                <ConfettiBurst total={lastResult.total} />
                {(() => {
                  const d1Url = getDiceImage(lastResult.die1);
                  const d2Url = getDiceImage(lastResult.die2);
                  return (
                    <>
                      {d1Url ? <img src={d1Url} alt={`${lastResult.die1}`} className="w-12 h-12 animate-dice-settle-in" /> : <span className="text-3xl text-spire-gold animate-dice-settle-in">{"⚀⚁⚂⚃⚄⚅"[lastResult.die1 - 1]}</span>}
                      <span className="text-spire-muted text-xl">+</span>
                      {d2Url ? <img src={d2Url} alt={`${lastResult.die2}`} className="w-12 h-12 animate-dice-settle-in" /> : <span className="text-3xl text-spire-gold animate-dice-settle-in">{"⚀⚁⚂⚃⚄⚅"[lastResult.die2 - 1]}</span>}
                      <span className="text-spire-muted text-xl">=</span>
                      <span className="text-3xl font-bold gold-text animate-total-glow-in tabular-nums">{lastResult.total}</span>
                    </>
                  );
                })()}
              </div>
              <div className="glass-panel p-4 text-center reward-card-pop animate-festive-glow relative">
                <div className="absolute inset-0 wb-sparkle-trail pointer-events-none overflow-hidden rounded-[inherit]" />
                <div className="text-sm font-tactical gold-text uppercase tracking-[0.2em] mb-2 relative z-10 cosmo-text-glow-gold">Reward</div>
                <div className="relative z-10">
                  <RewardDisplay reward={lastResult.reward} icon={lastResult.rewardIcon} rarity={lastResult.rewardRarity} weaponName={lastResult.rewardWeaponName} />
                </div>
              </div>
              {/* Bot commentary for simulation mode */}
              {isSimulation && botMessage && (
                <div className="flex items-center justify-center gap-2 animate-fade-in">
                  <span className="text-lg">🤖</span>
                  <span className="text-sm text-spire-accent/80 italic">{botMessage}</span>
                </div>
              )}
              {!autoPlay && (
                <div className="flex justify-center">
                  <button className="btn-primary px-6 py-2.5 font-medium" onClick={handleNext}>
                    {lastResult.total >= 6
                      ? "Choose Weapon →"
                      : (currentHeroIndex + 1 >= heroes.length ? "View Summary →" : "Next Hero →")}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {!showResult && (
          <div className="flex items-center justify-center gap-3">
            {isSimulation && (
              <div className="flex items-center gap-2 text-sm text-spire-accent/60 animate-pulse">
                <span className="text-lg">🤖</span>
                <span>Bot is rolling...</span>
              </div>
            )}
            {!isSimulation && (
              <>
                <button
                  className={`btn-ghost px-4 py-2 text-sm ${autoPlay ? "border-spire-accent/50 text-spire-accent" : ""}`}
                  onClick={() => setAutoPlay((prev) => !prev)}
                  disabled={phase === "result"}
                >
                  {autoPlay ? "⏸ Stop Autoplay" : "▶ Autoplay"}
                </button>
                <button
                  className="btn-ghost px-4 py-2 text-sm"
                  onClick={handleSkip}
                  disabled={phase === "result"}
                >
                  ⏭ Skip All
                </button>
              </>
            )}
          </div>
        )}

        {!isSimulation && (
          <div className="glass-card p-3 text-center">
            <div className="text-[10px] text-spire-muted/70 leading-relaxed">
              <span className="text-spire-accent/80">Hold</span> to charge · <span className="text-spire-accent/80">Drag</span> to aim · <span className="text-spire-accent/80">Release</span> to throw
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
