import type { PetState } from "../../types/heroes";
import { Tooltip } from "./Tooltip";

interface PetIconProps {
  pet: PetState;
  size?: number;
  showHp?: boolean;
  className?: string;
}

function WolfSvg({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 20 L8 12 L16 16 L20 10 L24 16 L32 8 L40 16 L44 10 L48 16 L56 12 L52 20 L56 28 L52 36 L48 40 L44 44 L40 48 L32 52 L24 48 L20 44 L16 40 L12 36 L8 28 Z"
        fill="currentColor"
        opacity="0.9"
      />
      <circle cx="24" cy="26" r="2.5" fill="#1a1a2e" />
      <circle cx="40" cy="26" r="2.5" fill="#1a1a2e" />
      <path d="M28 34 L32 38 L36 34" stroke="#1a1a2e" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path d="M30 36 L32 40 L34 36" stroke="#1a1a2e" strokeWidth="1" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function BearSvg({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="18" r="6" fill="currentColor" opacity="0.8" />
      <circle cx="48" cy="18" r="6" fill="currentColor" opacity="0.8" />
      <circle cx="32" cy="34" r="20" fill="currentColor" opacity="0.9" />
      <circle cx="24" cy="30" r="2.5" fill="#1a1a2e" />
      <circle cx="40" cy="30" r="2.5" fill="#1a1a2e" />
      <ellipse cx="32" cy="38" rx="4" ry="3" fill="#1a1a2e" />
      <path d="M28 42 Q32 46 36 42" stroke="#1a1a2e" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function PetIcon({ pet, size = 20, showHp = true, className = "" }: PetIconProps) {
  const isWolf = pet.type === "wolf";
  const colorClass = !pet.alive
    ? "text-spire-muted/40"
    : isWolf
      ? "text-gray-300"
      : "text-amber-600/80";

  const hpPct = pet.maxHp > 0 ? (pet.currentHp / pet.maxHp) * 100 : 0;

  const tooltip = (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className={`text-sm font-bold ${pet.alive ? "text-spire-white" : "text-spire-muted"}`}>
          {pet.name}
        </span>
        {!pet.alive && <span className="text-[10px] text-spire-danger">Dead</span>}
      </div>
      <div className="text-[11px] text-spire-white/80">
        HP: {pet.currentHp}/{pet.maxHp}
      </div>
      <div className="text-[10px] text-spire-muted">
        {isWolf ? "Wolf — Bites the enemy each turn" : "Bear — Mauls the enemy, shields allies"}
      </div>
    </div>
  );

  return (
    <Tooltip content={tooltip} side="top">
      <div className={`inline-flex items-center gap-1 ${!pet.alive ? "opacity-40 grayscale" : ""} ${className}`}>
        <div className={colorClass}>
          {isWolf ? <WolfSvg size={size} /> : <BearSvg size={size} />}
        </div>
        {showHp && (
          <div className="flex flex-col gap-0.5 min-w-[28px]">
            <span className={`text-[10px] font-medium tabular-nums leading-none ${pet.alive ? "text-spire-white" : "text-spire-muted"}`}>
              {pet.currentHp}/{pet.maxHp}
            </span>
            <div className="h-1 rounded-full bg-spire-bg/60 overflow-hidden" style={{ width: 36 }}>
              <div
                className={`h-full rounded-full ${pet.alive ? "bg-gradient-to-r from-spire-danger to-spire-success" : "bg-spire-muted/30"}`}
                style={{ width: `${hpPct}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </Tooltip>
  );
}
