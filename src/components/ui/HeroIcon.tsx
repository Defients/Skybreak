import { getHeroPortrait, getSpecImage, getWeaponImage, getEnchantIcon } from "../../assets/assetRegistry";
import { CLASS_DATA } from "../../data/classes";
import { WEAPON_RARITY_DATA } from "../../data/weapons";
import { WEAPONS } from "../../data/weapons";
import { ENCHANTMENTS } from "../../data/enchantments";
import type { HeroState } from "../../types/heroes";
import type { WeaponRarity, EnchantmentName } from "../../types/inventory";
import { CLASS_TEXT_COLORS } from "../../utils/nameResolver";
import { formatAbilityText } from "../../utils/formatAbilityText";
import { Tooltip } from "./Tooltip";

interface HeroIconProps {
  hero: HeroState;
  size?: number;
  isCurrentHero?: boolean;
  className?: string;
  hideWeapon?: boolean;
  hideSpecTooltip?: boolean;
}

const RARITY_COLORS: Record<WeaponRarity, string> = {
  Common: "text-spire-muted",
  Rare: "text-blue-300",
  Epic: "text-fuchsia-300",
  Legendary: "text-amber-300",
};

export function HeroIcon({ hero, size = 36, isCurrentHero = false, className = "", hideWeapon = false, hideSpecTooltip = false }: HeroIconProps) {
  const portraitUrl = getHeroPortrait(hero.className);
  const specUrl = getSpecImage(hero.specialization);
  const weaponUrl = getWeaponImage(hero.weapon.name);
  const iconSize = Math.round(size * 0.5);

  const classData = CLASS_DATA[hero.className];
  const specData =
    classData.specializations.black.name === hero.specialization
      ? classData.specializations.black
      : classData.specializations.red;
  const weaponData = WEAPONS.find((w) => w.name === hero.weapon.name);
  const rarityData = WEAPON_RARITY_DATA[hero.weapon.rarity];

  const specTooltip = (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        {specUrl && (
          <img src={specUrl} alt={hero.specialization} className="w-8 h-8 rounded object-cover" />
        )}
        <div>
          <div className={`text-sm font-bold ${CLASS_TEXT_COLORS[hero.className] ?? "text-spire-white"}`}>
            {hero.specialization}
          </div>
          <div className="text-[10px] text-spire-muted">Specialization</div>
        </div>
      </div>
      <div className="text-[11px] text-spire-white/85 leading-snug border-t border-spire-border/30 pt-1.5">
        {formatAbilityText(specData.ability)}
      </div>
      <div className="text-[10px] text-spire-muted/70 border-t border-spire-border/20 pt-1">
        {classData.name} · {classData.role}
      </div>
    </div>
  );

  const enchantUrl = hero.enchantment ? getEnchantIcon(hero.enchantment.name) : null;
  const enchantData = hero.enchantment ? ENCHANTMENTS[hero.enchantment.name as EnchantmentName] : null;

  const enchantTooltip = hero.enchantment && enchantData ? (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {enchantUrl && (
          <img src={enchantUrl} alt={hero.enchantment.name} className="w-8 h-8 rounded object-cover border border-cyan-400/30" style={{ boxShadow: "0 0 8px rgba(34, 211, 238, 0.15)" }} />
        )}
        <div>
          <div className="text-sm font-bold text-cyan-300" style={{ textShadow: "0 0 8px rgba(34, 211, 238, 0.2)" }}>
            {hero.enchantment.name}
          </div>
          <div className="text-[10px] text-spire-muted">Enchantment{enchantData.slotFree ? " · Slot-Free" : ""}</div>
        </div>
      </div>
      <div className="text-[11px] text-spire-white/85 leading-snug border-t border-spire-border/30 pt-1.5">
        {formatAbilityText(hero.enchantment.effect)}
      </div>
      {hero.enchantment.name === "Chaotic" && (
        <div className="border-t border-spire-border/20 pt-1.5 space-y-0.5">
          <div className="text-[9px] uppercase tracking-wider text-spire-muted/60 mb-1">Roll Table</div>
          {[
            { roll: 1, effect: "+2 damage" },
             { roll: 2, effect: "Heal self 2 HP" },
             { roll: 3, effect: "Enemy loses 1 APC" },
             { roll: 4, effect: "Gain 1 shield" },
             { roll: 5, effect: "Deal damage twice" },
             { roll: 6, effect: "All allies gain Haste" },
           ].map((e) => (
            <div key={e.roll} className="flex items-center gap-1.5 text-[10px]">
              <span className="w-4 h-4 rounded bg-cyan-500/15 border border-cyan-400/30 text-cyan-300 flex items-center justify-center font-bold text-[9px]">{e.roll}</span>
              <span className="text-spire-white/70">{e.effect}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  ) : null;

  const weaponTooltip = (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        {weaponUrl && (
          <img src={weaponUrl} alt={hero.weapon.name} className="w-8 h-8 rounded object-cover border border-spire-border/50" />
        )}
        <div>
          <div className={`text-sm font-bold ${RARITY_COLORS[hero.weapon.rarity] ?? "text-spire-white"}`}>
            {hero.weapon.name}
          </div>
          <div className="text-[10px] text-spire-muted">
            {hero.weapon.rarity} · {rarityData?.powerLevel ?? ""}
          </div>
        </div>
      </div>
      <div className="text-[11px] text-spire-white/85 leading-snug border-t border-spire-border/30 pt-1.5">
        {formatAbilityText(weaponData?.effect ?? hero.weapon.effect)}
      </div>
      {hero.enchantment && (
        <div className="text-[10px] text-cyan-400/80 border-t border-spire-border/20 pt-1">
          ✨ {hero.enchantment.name}: {hero.enchantment.effect}
        </div>
      )}
    </div>
  );

  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      {/* Class portrait (base) */}
      {portraitUrl && (
        <img
          src={portraitUrl}
          alt={hero.className}
          className={`rounded-full object-cover object-top border ${isCurrentHero ? "border-spire-accent" : "border-spire-border"}`}
          style={{
            width: size,
            height: size,
            ...(isCurrentHero
              ? {
                  boxShadow: "0 0 12px rgba(34, 211, 238, 0.6), 0 0 24px rgba(34, 211, 238, 0.3)",
                  animation: "pulseGlow 2s ease-in-out infinite",
                }
              : undefined),
          }}
        />
      )}

      {/* Enchant icon (above weapon, bottom-right, with tooltip) */}
      {!hideWeapon && hero.enchantment && enchantUrl && enchantTooltip && (
        <Tooltip
          content={enchantTooltip}
          side="right"
          wrapperClassName="absolute rounded cursor-help overflow-visible"
          wrapperStyle={{ width: Math.round(iconSize * 0.8), height: Math.round(iconSize * 0.8), right: -2, bottom: iconSize - 2, zIndex: 3 }}
        >
          <div className="w-full h-full overflow-hidden rounded border border-cyan-400/30" style={{ boxShadow: "0 0 6px rgba(34, 211, 238, 0.2)" }}>
            <img src={enchantUrl} alt={hero.enchantment.name} className="w-full h-full object-cover" />
          </div>
        </Tooltip>
      )}

      {/* Weapon icon (bottom-right, with tooltip) */}
      {!hideWeapon && (
        <Tooltip
          content={weaponTooltip}
          side="right"
          wrapperClassName="absolute rounded border border-spire-border/60 bg-spire-card cursor-help overflow-visible"
          wrapperStyle={{ width: iconSize, height: iconSize, right: -4, bottom: -2, zIndex: 1 }}
        >
          <div className="w-full h-full overflow-hidden rounded">
            {weaponUrl ? (
              <img src={weaponUrl} alt={hero.weapon.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-spire-muted/30" style={{ fontSize: iconSize * 0.5 }}>
                ⚔
              </div>
            )}
          </div>
        </Tooltip>
      )}

      {/* Spec icon (top-left, no box, with tooltip) */}
      {hideSpecTooltip ? (
        <div className="absolute rounded overflow-hidden" style={{ width: iconSize, height: iconSize, left: -2, top: -2, zIndex: 2 }}>
          {specUrl ? (
            <img src={specUrl} alt={hero.specialization} className="w-full h-full object-cover" />
          ) : (
            <div
              className={`w-full h-full flex items-center justify-center font-bold ${CLASS_TEXT_COLORS[hero.className] ?? "text-spire-white"}`}
              style={{ fontSize: iconSize * 0.45 }}
            >
              {hero.specialization.charAt(0)}
            </div>
          )}
        </div>
      ) : (
        <Tooltip
          content={specTooltip}
          side="right"
          wrapperClassName="absolute rounded cursor-help overflow-visible"
          wrapperStyle={{ width: iconSize, height: iconSize, left: -2, top: -2, zIndex: 2 }}
        >
          <div className="w-full h-full overflow-hidden rounded">
            {specUrl ? (
              <img src={specUrl} alt={hero.specialization} className="w-full h-full object-cover" />
            ) : (
              <div
                className={`w-full h-full flex items-center justify-center font-bold ${CLASS_TEXT_COLORS[hero.className] ?? "text-spire-white"}`}
                style={{ fontSize: iconSize * 0.45 }}
              >
                {hero.specialization.charAt(0)}
              </div>
            )}
          </div>
        </Tooltip>
      )}
    </div>
  );
}
