import { useState, useEffect, useRef } from "react";
import { getEffectImage } from "../../assets/assetRegistry";

interface EffectOverlayItem {
  id: number;
  image: string;
  alt: string;
  rect: DOMRect | null;
}

export interface EffectEvent {
  type: string;
  summary: string;
  sequence: number;
  targetIds?: string[];
  actorId?: string;
}

interface EffectOverlayProps {
  newEvents: EffectEvent[];
}

const EVENT_EFFECT_MAP: Record<string, string> = {
  DAMAGE_APPLIED: "damage",
  HEAL_APPLIED: "heal",
  ABILITY_TRIGGERED: "special",
  TOKEN_ADDED: "special",
  COMBAT_ENDED: "fireworks",
  MONSTER_DEFEATED: "explosion",
  HERO_DIED: "damage",
};

const SUMMARY_KEYWORD_MAP: { keywords: string[]; effect: string }[] = [
  { keywords: ["critical", "crit", "double damage"], effect: "critical" },
  { keywords: ["fire", "burn", "flame", "ember", "inferno", "lava"], effect: "fire" },
  { keywords: ["frost", "freeze", "frozen", "ice", "blizzard", "glacial"], effect: "frost" },
  { keywords: ["lightning", "shock", "arcane", "spark", "pulse laser", "beam"], effect: "lightning" },
  { keywords: ["explosion", "explosive", "aoe", "all enemies", "all heroes"], effect: "explosion" },
  { keywords: ["heal", "regenerat", "restore", "revive"], effect: "heal" },
  { keywords: ["victory", "defeated", "win"], effect: "fireworks" },
  { keywords: ["ability", "special", "trigger"], effect: "special" },
];

const FULLSCREEN_EVENTS = new Set(["COMBAT_ENDED", "MONSTER_DEFEATED"]);

function resolveEffect(eventType: string, summary: string): string | null {
  const lowerSummary = summary.toLowerCase();
  for (const { keywords, effect } of SUMMARY_KEYWORD_MAP) {
    if (keywords.some((kw) => lowerSummary.includes(kw))) {
      return effect;
    }
  }
  const effectName = EVENT_EFFECT_MAP[eventType];
  if (effectName) return effectName;
  return null;
}

function findTargetRects(targetIds: string[] | undefined, actorId?: string): DOMRect[] {
  const ids: string[] = [];
  if (targetIds && targetIds.length > 0) {
    ids.push(...targetIds);
  } else if (actorId) {
    // Fall back to actorId if no targetIds
    ids.push(actorId);
  }
  if (ids.length === 0) return [];
  const rects: DOMRect[] = [];
  for (const id of ids) {
    const el = document.querySelector(`[data-combat-target="${id}"]`);
    if (el) rects.push(el.getBoundingClientRect());
  }
  return rects;
}

export function EffectOverlay({ newEvents }: EffectOverlayProps) {
  const [overlays, setOverlays] = useState<EffectOverlayItem[]>([]);
  const idCounter = useRef(0);

  useEffect(() => {
    if (newEvents.length === 0) return;

    const newItems: EffectOverlayItem[] = [];
    for (const evt of newEvents) {
      const effectName = resolveEffect(evt.type, evt.summary);
      if (!effectName) continue;

      const image = getEffectImage(effectName);
      if (!image) continue;

      const isFullscreen = FULLSCREEN_EVENTS.has(evt.type) ||
        evt.summary.toLowerCase().includes("all heroes") ||
        evt.summary.toLowerCase().includes("all enemies");

      if (isFullscreen) {
        const id = ++idCounter.current;
        newItems.push({ id, image, alt: effectName, rect: null });
        setTimeout(() => {
          setOverlays((prev) => prev.filter((o) => o.id !== id));
        }, 1200);
      } else {
        const rects = findTargetRects(evt.targetIds, evt.actorId);
        if (rects.length > 0) {
          for (const rect of rects) {
            const id = ++idCounter.current;
            newItems.push({ id, image, alt: effectName, rect });
            setTimeout(() => {
              setOverlays((prev) => prev.filter((o) => o.id !== id));
            }, 1200);
          }
        }
        // No target found and not fullscreen — skip showing the effect
        // rather than displaying it centered in the viewport (which appears
        // below the monster frame on mobile)
      }
    }

    if (newItems.length > 0) {
      setOverlays((prev) => [...prev, ...newItems]);
    }
  }, [newEvents]);

  if (overlays.length === 0) return null;

  return (
    <>
      {/* Fullscreen overlays (centered) */}
      {overlays.filter((o) => o.rect === null).length > 0 && (
        <div className="effect-overlay-container pointer-events-none fixed inset-0 z-[100] flex items-center justify-center">
          {overlays.filter((o) => o.rect === null).map((o) => (
            <img
              key={o.id}
              src={o.image}
              alt={o.alt}
              className="effect-overlay-img animate-effect-pop"
            />
          ))}
        </div>
      )}
      {/* Targeted overlays (positioned over the target element) */}
      {overlays.filter((o) => o.rect !== null).map((o) => {
        const rect = o.rect!;
        return (
          <div
            key={o.id}
            className="effect-overlay-container pointer-events-none fixed z-[100] flex items-center justify-center"
            style={{
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            }}
          >
            <img
              src={o.image}
              alt={o.alt}
              className="effect-overlay-img animate-effect-pop"
              style={{ maxWidth: "100%", maxHeight: "100%" }}
            />
          </div>
        );
      })}
    </>
  );
}
