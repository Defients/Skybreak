/**
 * Combat UI sub-components — extracted from CombatView.tsx
 * for structural decomposition. Self-contained presentational components.
 */

import { useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import type { GameEvent } from "../../types/events";
import {
  getItemImage,
  getItemImageById,
} from "../../assets/assetRegistry";
import { resolveItemData } from "../../data/items";
import { formatLogSummary, getEventTypeStyle } from "../../utils/logFormatter";
import { formatAbilityText } from "../../utils/formatAbilityText";

const HEAD_COLORS: Record<string, string> = {
  Lion: "#f59e0b",
  Goat: "#86efac",
  Snake: "#4ade80",
};

export function colorizeHeads(text: string) {
  const parts = text.split(/(Lion|Goat|Snake)/g);
  return parts.map((part, i) => {
    if (HEAD_COLORS[part]) {
      return <span key={i} className="font-semibold" style={{ color: HEAD_COLORS[part] }}>{part}</span>;
    }
    return <span key={i}>{part}</span>;
  });
}

export function colorizeApc(text: string) {
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

export interface ItemEntry {
  name: string;
  itemId?: string;
  quantity: number;
  effect?: string;
}

export function ItemDropdown({ items, onUse, onOpenChange }: { items: ItemEntry[]; onUse: (itemName: string) => void; onOpenChange?: (open: boolean) => void }) {
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

export function CombatLogTooltip({ event, state }: { event: GameEvent; state: any }) {
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
