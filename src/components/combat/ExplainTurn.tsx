/**
 * Explain This Turn — a combat outcome explanation surface.
 *
 * Derives explanations from structured GameEvent data, not invented
 * narration. The primary source is DAMAGE_APPLIED events, which carry
 * a full DamageBreakdown in details.breakdown.
 *
 * The component renders as a clickable info icon next to damage events
 * in the combat log, and an expandable panel showing the mechanical
 * causes of the damage.
 */

import { useState } from "react";
import type { GameEvent } from "../../types/events";
import type { DamageBreakdown } from "../../types/combat";

interface ExplainTurnProps {
  event: GameEvent;
}

/**
 * Extract the DamageBreakdown from a DAMAGE_APPLIED event, if present.
 */
function getDamageBreakdown(event: GameEvent): DamageBreakdown | null {
  if (event.type !== "DAMAGE_APPLIED") return null;
  const breakdown = event.details?.breakdown;
  if (!breakdown || typeof breakdown !== "object") return null;
  return breakdown as DamageBreakdown;
}

/**
 * Render a single damage modifier row.
 */
function ModifierRow({
  label,
  value,
  type,
}: {
  label: string;
  value: number;
  type: "bonus" | "reduction";
}) {
  if (value === 0) return null;
  const sign = value > 0 ? "+" : "";
  const color = type === "bonus"
    ? value > 0 ? "text-green-400" : "text-red-400"
    : "text-orange-400";
  return (
    <div className="flex justify-between text-[11px] py-0.5">
      <span className="text-spire-muted">{label}</span>
      <span className={`font-mono tabular-nums ${color}`}>{sign}{value}</span>
    </div>
  );
}

/**
 * The main explanation panel for a DAMAGE_APPLIED event.
 * Shows the full damage breakdown: base, bonuses, reductions, final.
 */
export function DamageExplanation({ event }: ExplainTurnProps) {
  const breakdown = getDamageBreakdown(event);
  if (!breakdown) {
    // Non-damage event — show any available details.
    return (
      <div className="space-y-1.5 min-w-[200px]">
        <div className="text-[10px] text-spire-muted/60 uppercase tracking-wider">Event Details</div>
        {event.details && Object.keys(event.details).length > 0 ? (
          <div className="space-y-1">
            {Object.entries(event.details).slice(0, 6).map(([key, value]) => (
              <div key={key} className="flex justify-between text-[11px] gap-3">
                <span className="text-spire-muted">{key}</span>
                <span className="text-spire-white/80 font-mono text-right truncate max-w-[140px]">
                  {typeof value === "object" ? "…" : String(value)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[11px] text-spire-muted italic">No structured details available.</div>
        )}
      </div>
    );
  }

  const totalBonus = breakdown.weaponBonus + breakdown.enchantmentBonus +
    breakdown.tokenBonus + breakdown.environmentBonus + breakdown.matchBonus;
  const totalReduction = breakdown.shieldReduction + breakdown.armorReduction +
    breakdown.defenseReduction;

  return (
    <div className="space-y-2 min-w-[240px] max-w-[300px]">
      <div className="text-[10px] text-spire-muted/60 uppercase tracking-wider">Damage Breakdown</div>

      {/* Base damage */}
      <div className="flex justify-between text-[11px] py-0.5 border-b border-spire-border/20 pb-1">
        <span className="text-spire-muted">Base damage</span>
        <span className="font-mono tabular-nums text-spire-white">{breakdown.base}</span>
      </div>

      {/* Bonuses */}
      {totalBonus !== 0 && (
        <div className="space-y-0.5">
          <div className="text-[9px] text-green-400/60 uppercase tracking-wider">Bonuses</div>
          <ModifierRow label="Weapon" value={breakdown.weaponBonus} type="bonus" />
          <ModifierRow label="Enchantment" value={breakdown.enchantmentBonus} type="bonus" />
          <ModifierRow label="Tokens" value={breakdown.tokenBonus} type="bonus" />
          <ModifierRow label="Environment" value={breakdown.environmentBonus} type="bonus" />
          <ModifierRow label="Match" value={breakdown.matchBonus} type="bonus" />
        </div>
      )}

      {/* Reductions */}
      {totalReduction !== 0 && (
        <div className="space-y-0.5">
          <div className="text-[9px] text-orange-400/60 uppercase tracking-wider">Reductions</div>
          <ModifierRow label="Shield" value={-breakdown.shieldReduction} type="reduction" />
          <ModifierRow label="Armor" value={-breakdown.armorReduction} type="reduction" />
          <ModifierRow label="Defense" value={-breakdown.defenseReduction} type="reduction" />
        </div>
      )}

      {/* Phase through */}
      {breakdown.phaseThrough && (
        <div className="text-[10px] text-purple-300/80 italic">
          ⚡ Damage phased through (ignored shields/armor)
        </div>
      )}

      {/* Notes */}
      {breakdown.notes.length > 0 && (
        <div className="space-y-0.5">
          <div className="text-[9px] text-spire-muted/60 uppercase tracking-wider">Notes</div>
          {breakdown.notes.map((note, i) => (
            <div key={i} className="text-[10px] text-spire-muted italic">{note}</div>
          ))}
        </div>
      )}

      {/* Final damage */}
      <div className="flex justify-between text-[12px] py-1 border-t border-spire-border/30 pt-1.5">
        <span className="text-spire-white font-medium">Final damage</span>
        <span className="font-mono tabular-nums text-spire-gold font-bold">{breakdown.finalDamage}</span>
      </div>
    </div>
  );
}

/**
 * A clickable info icon that toggles the explanation panel.
 * Designed to be embedded in combat log rows.
 */
export function ExplainTurnIcon({ event }: ExplainTurnProps) {
  const [show, setShow] = useState(false);

  // Only show for events that have meaningful structured data.
  const hasBreakdown = event.type === "DAMAGE_APPLIED" && event.details?.breakdown;
  const hasDetails = event.details && Object.keys(event.details).length > 0;
  if (!hasBreakdown && !hasDetails) return null;

  return (
    <span className="relative inline-flex flex-shrink-0">
      <button
        className="text-spire-muted/50 hover:text-spire-accent transition-colors text-[10px] leading-none p-0.5"
        onClick={(e) => {
          e.stopPropagation();
          setShow((prev) => !prev);
        }}
        aria-label="Explain this event"
        title="Explain this event"
      >
        ℹ
      </button>
      {show && (
        <div className="absolute right-0 top-full mt-1 z-[200] glass-panel rounded-lg border border-spire-border/40 p-3 shadow-xl animate-fade-in">
          <DamageExplanation event={event} />
          <button
            className="absolute top-1 right-1.5 text-spire-muted/50 hover:text-spire-white text-[10px]"
            onClick={(e) => { e.stopPropagation(); setShow(false); }}
          >
            ✕
          </button>
        </div>
      )}
    </span>
  );
}
