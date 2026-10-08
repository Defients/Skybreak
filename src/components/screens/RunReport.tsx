import { useEffect, useState } from "react";
import type { GameState } from "../../types/gameState";
import { calculateScore } from "../../engine/progressionEngine";
import { getLivingHeroes } from "../../engine/rulesEngine";
import { useAudio } from "../../audio/useAudio";
import { buildRunCapsule, copyCapsuleToClipboard } from "../../engine/runCapsule";
import { getPrimaryVerdict } from "../../engine/vyridianVerdict";
import {
  getVictoryBackground,
  getDefeatBackground,
  getEffectImage,
  getAchievementBadgeImage,
  getHeroPortrait,
  getWeaponImage,
  getItemImage,
} from "../../assets/assetRegistry";
import { CLASS_TEXT_COLORS } from "../../utils/nameResolver";
import type { WeaponRarity, ItemType, EnchantmentName } from "../../types/inventory";
import { WEAPONS, WEAPON_RARITY_DATA } from "../../data/weapons";
import { ITEMS } from "../../data/items";
import { ENCHANTMENTS } from "../../data/enchantments";
import { Tooltip } from "../ui/Tooltip";
import { formatAbilityText } from "../../utils/formatAbilityText";
import { getMonsterTaunt } from "../../data/monsterTaunts";

interface Props {
  state: GameState;
  onHome: () => void;
}

export function RunReport({ state, onHome }: Props) {
  const isVictory = state.phase === "victory";
  const score = calculateScore(state);
  const livingHeroes = getLivingHeroes(state);
  const defeatReason = [...state.log].reverse().find(e => e.type === "DEFEAT")?.summary;
  const { playMusic, playSfx } = useAudio();
  const [capsuleCopied, setCapsuleCopied] = useState(false);
  const verdict = getPrimaryVerdict(state);

  const mvpHero = state.stats.mvpHeroId ? state.party.heroes.find(h => h.id === state.stats.mvpHeroId) : null;
  const bgUrl = isVictory ? getVictoryBackground() : getDefeatBackground();
  const fireworksUrl = isVictory ? getEffectImage("fireworks") : null;
  const badgeUrl = isVictory && score.title ? getAchievementBadgeImage() : null;

  useEffect(() => {
    playMusic(isVictory ? "victory" : "defeat");
    if (isVictory) {
      playSfx("results", "victory");
    } else {
      playSfx("results", "defeat");
    }
  }, [playMusic, playSfx, isVictory]);

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in relative">
      {bgUrl && (
        <div
          className="bg-image-overlay"
          style={{ backgroundImage: `url(${bgUrl})`, opacity: 0.2 }}
        />
      )}
      <div className="relative z-10 space-y-6">
      <div
        className="glass-panel p-4 sm:p-8 text-center relative overflow-hidden"
        style={{
          background: isVictory
            ? "linear-gradient(145deg, rgba(13, 13, 32, 0.72) 0%, rgba(8, 8, 20, 0.68) 100%)"
            : "linear-gradient(145deg, rgba(25, 8, 12, 0.6) 0%, rgba(12, 4, 8, 0.65) 100%)",
          borderColor: isVictory ? "rgba(251, 191, 36, 0.2)" : "rgba(244, 63, 94, 0.2)",
          boxShadow: isVictory
            ? "0 4px 24px rgba(0, 0, 0, 0.4), inset 0 0 30px rgba(251, 191, 36, 0.03)"
            : "0 4px 24px rgba(0, 0, 0, 0.4), inset 0 0 30px rgba(244, 63, 94, 0.04)",
        }}
      >
        {fireworksUrl && (
          <img src={fireworksUrl} alt="Fireworks" className="absolute inset-0 w-full h-full object-cover opacity-30" />
        )}
        <div className="relative z-10">
        <div
          className="text-6xl mb-4"
          style={{
            filter: isVictory
              ? "drop-shadow(0 0 20px rgba(251, 191, 36, 0.4))"
              : "drop-shadow(0 0 20px rgba(244, 63, 94, 0.4))",
            animation: "fadeIn 0.8s ease-out",
          }}
        >
          {isVictory ? "🏆" : "💀"}
        </div>
        <h1
          className={`text-4xl sm:text-5xl font-display mb-3 ${isVictory ? "text-spire-gold" : "text-spire-danger"}`}
          style={
            isVictory
              ? {
                  textShadow: "0 0 24px rgba(251, 191, 36, 0.3), 0 4px 12px rgba(0, 0, 0, 0.5)",
                }
              : {
                  animation: "deadlyDefeat 1.2s ease-out forwards, deathPulse 2s ease-in-out 1.2s infinite",
                }
          }
        >
          {isVictory ? "Victory!" : "Defeat"}
        </h1>
        <p className="text-spire-muted text-sm sm:text-base leading-relaxed max-w-md mx-auto">
          {isVictory
            ? "The judgment is survived. The ascent is complete."
            : livingHeroes.length > 0
              ? defeatReason ?? "The ascent ended before victory. Surviving heroes remain alive."
              : <>The party has fallen.<br />The Astrilith claims another group of adventurers.</>}
        </p>
        {isVictory && score.title && (
          <div className="mt-5 flex items-center justify-center gap-2 text-lg gold-text">
            {badgeUrl && <img src={badgeUrl} alt="Achievement" className="w-8 h-8 rounded-full" style={{ boxShadow: "0 0 12px rgba(251, 191, 36, 0.3)" }} />}
            <span className="font-display" style={{ textShadow: "0 0 12px rgba(251, 191, 36, 0.2)" }}>Title: {score.title}</span>
          </div>
        )}
        </div>
      </div>

      {/* Vyridian's Verdict — cosmetic narrative epilogue */}
      <div className="glass-card p-5 sm:p-7 space-y-3" style={{ borderColor: "rgba(167, 139, 250, 0.15)" }}>
        <h2 className="text-sm font-display text-purple-300/80 tracking-widest uppercase flex items-center gap-2">
          <span className="text-base">✦</span> Vyridian's Verdict
        </h2>
        <div className="text-lg font-display text-purple-200/90" style={{ textShadow: "0 0 12px rgba(167, 139, 250, 0.15)" }}>
          {verdict.title}
        </div>
        <p className="text-sm text-spire-muted leading-relaxed italic">
          {verdict.text}
        </p>
      </div>

      <div className="glass-card p-4 sm:p-6">
        <h2 className="text-lg font-display gold-text mb-4 flex items-center gap-2">📊 Final Score</h2>
        <div className="text-center mb-5">
          <div
            className="text-6xl font-display gold-text"
            style={{
              textShadow: "0 0 24px rgba(251, 191, 36, 0.25), 0 4px 16px rgba(0, 0, 0, 0.4)",
              filter: "drop-shadow(0 2px 8px rgba(251, 191, 36, 0.1))",
            }}
          >
            {score.finalScore}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <ScoreRow label="Base Score" value={score.baseScore} />
          <ScoreRow label="Heroes Alive" value={`${score.heroesAlive} × 1000 = ${score.heroesAliveBonus}`} />
          <ScoreRow label="Gold Remaining" value={`${score.goldRemaining} × 10 = ${score.goldBonus}`} />
          <ScoreRow label="Tier 3 Rooms" value={`${score.tier3RoomsCleared} × 100 = ${score.tier3Bonus}`} />
          <ScoreRow label="Turn Penalty" value={`-${score.turnPenalty} (${score.totalTurns} × 50)`} />
          <ScoreRow label="Items Retained" value={`${score.itemsRetained} × 200 = ${score.itemBonus}`} />
          <ScoreRow label="Perfect Combats" value={`${score.perfectCombats} × 500 = ${score.perfectCombatBonus}`} />
        </div>
      </div>

      <div className="glass-card p-4 sm:p-6"
        style={{
          background: isVictory
            ? "linear-gradient(145deg, rgba(13, 13, 32, 0.72) 0%, rgba(8, 8, 20, 0.68) 100%)"
            : "linear-gradient(145deg, rgba(30, 10, 10, 0.55) 0%, rgba(15, 5, 8, 0.6) 100%)",
          borderColor: isVictory ? undefined : "rgba(244, 63, 94, 0.15)",
        }}
      >
        <h2 className="text-lg font-display gold-text mb-4 flex items-center gap-2">
          {isVictory ? "🏆" : "💀"} Run Statistics
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-center">
          <StatBox label="Total Turns" value={state.stats.totalTurns} />
          <StatBox label="Rooms Cleared" value={state.stats.roomsCleared} />
          <StatBox label="Perfect Combats" value={state.stats.perfectCombats} />
          <StatBox label="Deaths" value={state.stats.deaths} />
          <StatBox label="Revivals" value={state.stats.revivals} />
          <StatBox label="Gold Earned" value={`${state.stats.goldEarned}g`} />
          <StatBox label="Gold Spent" value={`${state.stats.goldSpent}g`} />
          <StatBox label="Items Used" value={state.stats.itemsUsed} />
          <StatBox label="Peak Damage" value={state.stats.biggestDamageEvent} />
        </div>
        {(state.stats.mvpHeroId || state.stats.deadliestMonster || state.stats.bossPhaseReached) && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-center mt-3">
            {mvpHero && <StatBox label="MVP" value={mvpHero.name} />}
            {state.stats.deadliestMonster && <StatBox label="Deadliest Foe" value={state.stats.deadliestMonster} />}
            {state.stats.bossPhaseReached && <StatBox label="Boss Phase Reached" value={state.stats.bossPhaseReached} />}
          </div>
        )}
        {!isVictory && state.stats.biggestDamageDescription && (
          <div className="mt-5 pt-4 border-t border-spire-danger/20">
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-[0.25em] text-spire-danger/60 mb-2">☠️ The Killing Blow</div>
              <div
                className="text-2xl sm:text-3xl font-display font-bold"
                style={{
                  background: "linear-gradient(90deg, #f87171 0%, #fbbf24 50%, #f87171 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  textShadow: "0 0 20px rgba(248, 113, 113, 0.3)",
                  filter: "drop-shadow(0 2px 8px rgba(248, 113, 113, 0.15))",
                }}
              >
                {state.stats.biggestDamageDescription}
              </div>
              <div
                className="mt-4 mx-auto max-w-md px-4 py-3 rounded-lg italic text-sm sm:text-base"
                style={{
                  background: "linear-gradient(135deg, rgba(30, 10, 10, 0.5) 0%, rgba(15, 5, 8, 0.5) 100%)",
                  border: "1px solid rgba(244, 63, 94, 0.2)",
                  color: "rgba(248, 113, 113, 0.85)",
                }}
              >
                <span className="text-lg mr-1">"</span>
                {getMonsterTaunt(state.stats.deadliestMonster)}
                <span className="text-lg ml-1">"</span>
              </div>
              {state.stats.deadliestMonster && (
                <div className="mt-2 text-[10px] uppercase tracking-[0.2em] text-spire-muted/40">
                  — {state.stats.deadliestMonster}
                </div>
              )}
            </div>
          </div>
        )}
        {isVictory && state.stats.biggestDamageDescription && (
          <div className="mt-5 pt-4 border-t border-spire-border/20">
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-[0.25em] text-spire-gold/50 mb-2">⚔️ Mightiest Strike</div>
              <div
                className="text-2xl sm:text-3xl font-display font-bold"
                style={{
                  background: "linear-gradient(90deg, #fbbf24 0%, #fde68a 50%, #fbbf24 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  textShadow: "0 0 20px rgba(251, 191, 36, 0.3)",
                  filter: "drop-shadow(0 2px 8px rgba(251, 191, 36, 0.15))",
                }}
              >
                {state.stats.biggestDamageDescription}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="glass-card p-4 sm:p-6">
        <h2 className="text-lg font-display gold-text mb-4">Final Party</h2>
        <div className="space-y-3">
          {state.party.heroes.map((hero) => {
            const portraitUrl = getHeroPortrait(hero.className);
            const weaponUrl = getWeaponImage(hero.weapon.name);
            const classColor = CLASS_TEXT_COLORS[hero.className] ?? "text-spire-white";
            const rarityColor: Record<WeaponRarity, string> = {
              Common: "text-spire-muted",
              Rare: "text-blue-300",
              Epic: "text-fuchsia-300",
              Legendary: "text-amber-300",
            };
            const rarityBorder: Record<WeaponRarity, string> = {
              Common: "border-spire-border/40",
              Rare: "border-blue-400/30",
              Epic: "border-fuchsia-400/30",
              Legendary: "border-amber-400/30",
            };
            const rarityGlow: Record<WeaponRarity, string> = {
              Common: "",
              Rare: "shadow-[0_0_12px_rgba(96,165,250,0.15)]",
              Epic: "shadow-[0_0_12px_rgba(232,121,249,0.15)]",
              Legendary: "shadow-[0_0_16px_rgba(251,191,36,0.2)]",
            };
            const hpPct = (hero.currentHp / hero.maxHp) * 100;
            const hpColor = hpPct > 60 ? "from-emerald-500 to-green-400" : hpPct > 30 ? "from-amber-500 to-yellow-400" : "from-red-600 to-red-400";
            const weaponData = WEAPONS.find((w) => w.name === hero.weapon.name);
            const rarityData = WEAPON_RARITY_DATA[hero.weapon.rarity];
            const enchantData = hero.enchantment ? ENCHANTMENTS[hero.enchantment.name as EnchantmentName] : null;

            const weaponTooltip = (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  {weaponUrl && (
                    <img src={weaponUrl} alt={hero.weapon.name} className="w-8 h-8 rounded object-cover border border-spire-border/50" />
                  )}
                  <div>
                    <div className={`text-sm font-bold ${rarityColor[hero.weapon.rarity]}`}>{hero.weapon.name}</div>
                    <div className="text-[10px] text-spire-muted">{hero.weapon.rarity} · {rarityData?.powerLevel ?? ""}</div>
                  </div>
                </div>
                <div className="text-[11px] text-spire-white/85 leading-snug border-t border-spire-border/30 pt-1.5">
                  {formatAbilityText(weaponData?.effect ?? hero.weapon.effect)}
                </div>
              </div>
            );

            const enchantTooltip = hero.enchantment && enchantData ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm">✦</span>
                  <div className="text-sm font-bold text-purple-300">{hero.enchantment.name}</div>
                </div>
                <div className="text-[11px] text-spire-white/85 leading-snug border-t border-spire-border/30 pt-1.5">
                  {formatAbilityText(hero.enchantment.effect)}
                </div>
              </div>
            ) : null;

            const itemTooltip = (itemName: string) => {
              const itemData = ITEMS[itemName as ItemType];
              const itemUrl = getItemImage(itemName);
              return (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    {itemUrl && (
                      <img src={itemUrl} alt={itemName} className="w-8 h-8 rounded object-cover border border-spire-border/50" />
                    )}
                    <div className="text-sm font-bold text-spire-white">{itemName}</div>
                  </div>
                  {itemData && (
                    <div className="text-[11px] text-spire-white/85 leading-snug border-t border-spire-border/30 pt-1.5">
                      {formatAbilityText(itemData.effect)}
                    </div>
                  )}
                </div>
              );
            };

            return (
            <div key={hero.id} className={`rounded-xl p-3.5 border transition-all ${hero.alive ? `bg-spire-bg/40 ${rarityBorder[hero.weapon.rarity]} ${rarityGlow[hero.weapon.rarity]}` : "bg-spire-danger/5 border-spire-danger/20"}`}>
              <div className="flex items-center gap-3">
                {/* Portrait */}
                <div className={`relative flex-shrink-0 ${hero.alive ? "" : "grayscale opacity-50"}`}>
                  {portraitUrl && (
                    <img src={portraitUrl} alt={hero.className} className={`w-12 h-12 rounded-lg object-cover object-top border-2 ${hero.alive ? rarityBorder[hero.weapon.rarity] : "border-spire-danger/30"}`} />
                  )}
                  <span className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${hero.alive ? "bg-emerald-500/80" : "bg-red-500/80"}`}>
                    {hero.alive ? "💚" : "💀"}
                  </span>
                </div>

                {/* Name + class */}
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-display font-medium truncate ${classColor}`}>{hero.specialization}</div>
                  <div className="text-[10px] uppercase tracking-wider text-spire-muted/60">{hero.className}</div>
                </div>

                {/* HP */}
                <div className="flex-shrink-0 text-right">
                  {hero.alive ? (
                    <>
                      <div className="text-xs text-spire-white font-medium tabular-nums">{hero.currentHp}/{hero.maxHp}</div>
                      <div className="w-20 h-1.5 rounded-full bg-spire-border/40 overflow-hidden mt-1">
                        <div className={`block h-full rounded-full bg-gradient-to-r ${hpColor}`} style={{ width: `${hpPct}%` }} />
                      </div>
                    </>
                  ) : (
                    <span className="text-xs text-spire-danger font-medium">Dead</span>
                  )}
                </div>
              </div>

              {/* Gear row */}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-spire-border/20">
                {/* Weapon with tooltip */}
                <Tooltip content={weaponTooltip} side="bottom" wrapperClassName="relative rounded border border-spire-border/60 bg-spire-card cursor-help overflow-visible" wrapperStyle={{ width: 20, height: 20 }}>
                  {weaponUrl ? (
                    <img src={weaponUrl} alt={hero.weapon.name} className="w-full h-full object-cover rounded" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-spire-muted/40 text-[10px]">⚔</div>
                  )}
                </Tooltip>
                <span className={`text-[11px] font-medium ${rarityColor[hero.weapon.rarity]}`}>{hero.weapon.name}</span>

                {/* Enchantment with tooltip */}
                {hero.enchantment && enchantTooltip && (
                  <>
                    <span className="text-spire-muted/40 text-[10px]">·</span>
                    <Tooltip content={enchantTooltip} side="bottom" wrapperClassName="relative cursor-help" wrapperStyle={{ width: "auto", height: "auto" }}>
                      <span className="text-[11px] text-purple-300/80 font-medium hover:text-purple-300 transition-colors">✦ {hero.enchantment.name}</span>
                    </Tooltip>
                  </>
                )}

                {/* Items with tooltips */}
                {hero.items.length > 0 && (
                  <>
                    <span className="text-spire-muted/40 text-[10px]">·</span>
                    <div className="flex items-center gap-1">
                      {hero.items.slice(0, 3).map((item, i) => {
                        const itemUrl = getItemImage(item.name);
                        return (
                          <Tooltip key={i} content={itemTooltip(item.name)} side="bottom" wrapperClassName="relative rounded border border-spire-border/60 bg-spire-card cursor-help overflow-visible" wrapperStyle={{ width: 16, height: 16 }}>
                            {itemUrl ? (
                              <img src={itemUrl} alt={item.name} className="w-full h-full object-cover rounded" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-spire-muted/40 text-[8px]">📦</div>
                            )}
                          </Tooltip>
                        );
                      })}
                      {hero.items.length > 3 && <span className="text-[10px] text-spire-muted">+{hero.items.length - 3}</span>}
                    </div>
                  </>
                )}

                {/* Upgrades */}
                {hero.upgrades.length > 0 && (
                  <>
                    <span className="text-spire-muted/40 text-[10px] ml-auto">·</span>
                    <span className="text-[10px] text-cyan-300/70 font-medium">⬆ {hero.upgrades.length}</span>
                  </>
                )}
              </div>
            </div>
            );
          })}
        </div>
      </div>

      <div className="glass-card p-4 sm:p-6">
        <h2 className="text-lg font-display gold-text mb-4 flex items-center gap-2">📋 Run Info</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-sm">
          <ScoreRow label="Seed" value={state.meta.seed} />
          <ScoreRow label="Difficulty" value={state.meta.difficulty} />
          <ScoreRow label="Mode" value={state.meta.mode} />
          <ScoreRow label="Game ID" value={state.meta.gameId} />
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 pb-4">
        <div className="flex gap-3">
          <button
            className="px-5 py-2.5 rounded-lg text-sm font-medium border border-spire-border/40 text-spire-muted hover:border-spire-accent/40 hover:bg-spire-accent/10 transition-all duration-200"
            onClick={async () => {
              playSfx("ui", "button_click");
              const capsule = buildRunCapsule(state);
              const ok = await copyCapsuleToClipboard(capsule);
              if (ok) {
                setCapsuleCopied(true);
                setTimeout(() => setCapsuleCopied(false), 3000);
              }
            }}
            title="Copy a compact reproduction packet (seed, party, difficulty) to clipboard"
          >
            {capsuleCopied ? "✓ Capsule Copied!" : "📋 Copy Ascent Capsule"}
          </button>
        </div>
        <button
          className="btn-gold text-lg px-10 py-3.5"
          style={{
            boxShadow: "0 4px 20px rgba(251, 191, 36, 0.15), 0 0 0 1px rgba(251, 191, 36, 0.1)",
          }}
          onClick={() => { playSfx("ui", "transition"); onHome(); }}
        >
          🏠 New Run
        </button>
      </div>
      </div>
    </div>
  );
}

function ScoreRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between border-b border-spire-border/20 pb-2 transition-colors hover:border-spire-accent/20">
      <span className="text-spire-muted">{label}</span>
      <span className="text-spire-white font-medium tabular-nums">{value}</span>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-box transition-all hover:scale-[1.03]">
      <div className="text-xl gold-text font-medium" style={{ textShadow: "0 0 8px rgba(251, 191, 36, 0.15)" }}>{value}</div>
      <div className="text-xs text-spire-muted mt-1">{label}</div>
    </div>
  );
}
