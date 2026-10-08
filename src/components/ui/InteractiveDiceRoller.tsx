import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { getDiceImage } from "../../assets/assetRegistry";
import { useAudio } from "../../audio/useAudio";

interface InteractiveDiceRollerProps {
  diceCount: number;
  onResult: (values: number[]) => void;
  autoPlay?: boolean;
  disabled?: boolean;
  resolveValues?: () => number[];
}

type RollerState = "idle" | "charging" | "dragging" | "rolling" | "settled";

interface DiePhysics {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  bounces: number;
  maxBounces: number;
  face: number;
  settled: boolean;
  rainbow: boolean;
}

const DICE_ICONS = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
const CHARGE_DURATION = 1500;
const ANIMATION_DURATION = 2500;
const GRAVITY = 0.45;
const BOUNCE_DAMPING = 0.55;
const FLOOR_Y = 220;
const MAX_DRAG_RANGE = 180;
const ARENA_BOUNDARY = 320;

function randomFace(): number {
  return Math.floor(Math.random() * 6) + 1;
}

function calculateRollModifiers(
  chargeLevel: number,
  dragDistance: number
): number[] {
  const weights = [1, 1, 1, 1, 1, 1];

  if (dragDistance < 10) {
    weights[5] *= 0.85;
  }

  if (chargeLevel >= 95) {
    weights[3] *= 1.05;
    weights[4] *= 1.05;
    weights[5] *= 1.05;
  }

  const total = weights.reduce((s, w) => s + w, 0);
  return weights.map((w) => w / total);
}

function weightedRoll(weights: number[]): number {
  const r = Math.random();
  let cumulative = 0;
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i];
    if (r < cumulative) return i + 1;
  }
  return 6;
}

function skipRoll(): number[] {
  const weights = [1.1, 1.1, 1.1, 0.8, 0.8, 0.8];
  const total = weights.reduce((s, w) => s + w, 0);
  const normalized = weights.map((w) => w / total);
  return [weightedRoll(normalized), weightedRoll(normalized)];
}

export function InteractiveDiceRoller({
  diceCount,
  onResult,
  autoPlay,
  disabled,
  resolveValues,
}: InteractiveDiceRollerProps) {
  const [state, setState] = useState<RollerState>("idle");
  const [chargeLevel, setChargeLevel] = useState(0);
  const [dragVec, setDragVec] = useState({ dx: 0, dy: 0 });
  const [dice, setDice] = useState<DiePhysics[]>([]);
  const [results, setResults] = useState<number[]>([]);
  const [showRainbow, setShowRainbow] = useState(false);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [arenaWidth, setArenaWidth] = useState(ARENA_BOUNDARY);
  const { playSfx } = useAudio();

  const chargeStartRef = useRef(0);
  const chargeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const animStartRef = useRef(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const arenaRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const finalValuesRef = useRef<number[]>([]);
  const rainbowRef = useRef<boolean[]>([]);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  // Track state in a ref so the auto-play effect can read it without
  // having `state` in its dependency array (which would tear down all
  // timers the moment startCharge flips state to "charging").
  const stateRef = useRef<RollerState>(state);
  stateRef.current = state;
  const autoPlayStartedRef = useRef(false);

  // Refs for chargeLevel and dragVec so callbacks can read latest values
  // without stale closures or dependency churn.
  const chargeLevelRef = useRef(chargeLevel);
  chargeLevelRef.current = chargeLevel;
  const dragVecRef = useRef(dragVec);
  dragVecRef.current = dragVec;

  // Smooth cursor interpolation for auto-play
  const targetCursorRef = useRef({ x: 0, y: 0 });
  const smoothCursorRef = useRef({ x: 0, y: 0 });
  const cursorAnimRef = useRef<number | null>(null);

  const reset = useCallback(() => {
    setState("idle");
    setChargeLevel(0);
    setDragVec({ dx: 0, dy: 0 });
    setDice([]);
    setResults([]);
    setShowRainbow(false);
    autoPlayStartedRef.current = false;
  }, []);

  useEffect(() => {
    if (!arenaRef.current) return;
    const updateWidth = () => {
      if (arenaRef.current) {
        setArenaWidth(arenaRef.current.clientWidth);
      }
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(arenaRef.current);
    return () => observer.disconnect();
  }, []);

  const startCharge = useCallback((clientX: number, clientY: number) => {
    if (disabled || stateRef.current === "rolling" || stateRef.current === "settled") return;
    setState("charging");
    setChargeLevel(0);
    chargeStartRef.current = Date.now();
    dragStartRef.current = { x: clientX, y: clientY };

    if (chargeIntervalRef.current) clearInterval(chargeIntervalRef.current);
    chargeIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - chargeStartRef.current;
      const pct = Math.min(100, (elapsed / CHARGE_DURATION) * 100);
      setChargeLevel(pct);
      if (pct >= 100) {
        if (chargeIntervalRef.current) {
          clearInterval(chargeIntervalRef.current);
          chargeIntervalRef.current = null;
        }
      }
    }, 16);
  }, [disabled]);

  const updateDrag = useCallback((clientX: number, clientY: number) => {
    if (stateRef.current !== "charging" && stateRef.current !== "dragging") return;
    const dx = clientX - dragStartRef.current.x;
    const dy = clientY - dragStartRef.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 5) {
      setState("dragging");
      setDragVec({ dx, dy });
    }
  }, []);

  const releaseRoll = useCallback(() => {
    if (stateRef.current !== "charging" && stateRef.current !== "dragging") return;
    if (chargeIntervalRef.current) {
      clearInterval(chargeIntervalRef.current);
      chargeIntervalRef.current = null;
    }

    playSfx("combat", "dice_roll");

    const charge = chargeLevelRef.current;
    const dv = dragVecRef.current;
    const dragDist = Math.sqrt(dv.dx * dv.dx + dv.dy * dv.dy);
    const weights = calculateRollModifiers(charge, dragDist);

    const values: number[] = [];
    const rainbows: boolean[] = [];
    for (let i = 0; i < diceCount; i++) {
      const isCrayCray = Math.random() < 0.01;
      rainbows.push(isCrayCray);
      if (isCrayCray) {
        values.push(randomFace());
      } else {
        values.push(weightedRoll(weights));
      }
    }
    // The animation may wander; gameplay outcomes belong to the seeded engine.
    finalValuesRef.current = resolveValues ? resolveValues() : values;
    rainbowRef.current = rainbows;
    setShowRainbow(rainbows.some((r) => r));

    const maxBounces = charge < 33 ? 2 : charge < 66 ? 3 : 4;
    const speedMult = 0.5 + (charge / 100) * 1.5;
    const angle = Math.atan2(dv.dy, dv.dx);
    const baseSpeed = 3 + speedMult * 4;

    const newDice: DiePhysics[] = [];
    for (let i = 0; i < diceCount; i++) {
      const spreadAngle = angle + (i - (diceCount - 1) / 2) * 0.3;
      newDice.push({
        x: 40 + i * 30,
        y: 120,
        vx: Math.cos(spreadAngle) * baseSpeed,
        vy: -Math.abs(Math.sin(spreadAngle) * baseSpeed) - 4,
        rotation: 0,
        rotationSpeed: (Math.random() - 0.5) * 30 + 15,
        bounces: 0,
        maxBounces,
        face: randomFace(),
        settled: false,
        rainbow: rainbows[i],
      });
    }
    setDice(newDice);
    setState("rolling");
    animStartRef.current = Date.now();
  }, [diceCount, playSfx, resolveValues]);

  useEffect(() => {
    if (state !== "rolling") return;

    const DIE_SIZE = 48;
    const COLLISION_RADIUS = DIE_SIZE / 2;

    const animate = () => {
      const elapsed = Date.now() - animStartRef.current;
      const t = elapsed / ANIMATION_DURATION;

      setDice((prevDice) => {
        // First: apply physics to non-settled dice
        let next = prevDice.map((d, idx) => {
          if (d.settled) return d;

          let { x, y, vx, vy, rotation, rotationSpeed, bounces } = d;
          x += vx;
          vy += GRAVITY;
          y += vy;
          rotation += rotationSpeed;

          if (y >= FLOOR_Y && vy > 0) {
            y = FLOOR_Y;
            vy = -vy * BOUNCE_DAMPING;
            vx *= 0.8;
            rotationSpeed *= 0.7;
            bounces++;

            if (bounces >= d.maxBounces) {
              const finalVal = finalValuesRef.current[idx] ?? d.face;
              return { ...d, x, y, vx: 0, vy: 0, rotation: 0, bounces, settled: true, face: finalVal };
            }
          }

          if (x < 0) { x = 0; vx = Math.abs(vx) * 0.7; }
          if (x > arenaWidth - DIE_SIZE) { x = arenaWidth - DIE_SIZE; vx = -Math.abs(vx) * 0.7; }

          const cyclingFace = t < 0.85 ? randomFace() : (finalValuesRef.current[idx] ?? d.face);
          return { ...d, x, y, vx, vy, rotation, rotationSpeed, bounces, face: cyclingFace };
        });

        // Second: resolve dice-to-dice collisions
        for (let i = 0; i < next.length; i++) {
          for (let j = i + 1; j < next.length; j++) {
            const a = next[i];
            const b = next[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const minDist = COLLISION_RADIUS * 2;

            if (dist < minDist && dist > 0) {
              const overlap = minDist - dist;
              const nx = dx / dist;
              const ny = dy / dist;

              // Push apart proportionally
              if (a.settled && b.settled) {
                // Both settled: just separate positions
                next[i] = { ...a, x: a.x - nx * overlap / 2 };
                next[j] = { ...b, x: b.x + nx * overlap / 2 };
              } else if (a.settled) {
                // A settled: push b away
                next[j] = {
                  ...b,
                  x: b.x + nx * overlap,
                  y: b.y + ny * overlap,
                  vx: b.vx + nx * 2,
                  vy: b.vy + ny * 2,
                };
              } else if (b.settled) {
                // B settled: push a away
                next[i] = {
                  ...a,
                  x: a.x - nx * overlap,
                  y: a.y - ny * overlap,
                  vx: a.vx - nx * 2,
                  vy: a.vy - ny * 2,
                };
              } else {
                // Both moving: exchange momentum
                next[i] = {
                  ...a,
                  x: a.x - nx * overlap / 2,
                  y: a.y - ny * overlap / 2,
                  vx: a.vx - nx * 1.5,
                  vy: a.vy - ny * 1.5,
                };
                next[j] = {
                  ...b,
                  x: b.x + nx * overlap / 2,
                  y: b.y + ny * overlap / 2,
                  vx: b.vx + nx * 1.5,
                  vy: b.vy + ny * 1.5,
                };
              }
            }
          }
        }

        return next;
      });

      if (elapsed >= ANIMATION_DURATION) {
        // Final settle: resolve any remaining overlaps
        setDice((prevDice) => {
          let settled = prevDice.map((d, i) => ({
            ...d,
            settled: true,
            face: finalValuesRef.current[i] ?? d.face,
            y: FLOOR_Y,
            rotation: 0,
            vx: 0,
            vy: 0,
          }));

          // Resolve final overlaps by pushing apart on x-axis
          for (let pass = 0; pass < 10; pass++) {
            let moved = false;
            for (let i = 0; i < settled.length; i++) {
              for (let j = i + 1; j < settled.length; j++) {
                const dx = settled[j].x - settled[i].x;
                const dist = Math.abs(dx);
                const minDist = DIE_SIZE;
                if (dist < minDist) {
                  const overlap = minDist - dist;
                  const dir = dx >= 0 ? 1 : -1;
                  settled[i] = { ...settled[i], x: settled[i].x - dir * overlap / 2 };
                  settled[j] = { ...settled[j], x: settled[j].x + dir * overlap / 2 };
                  moved = true;
                }
              }
            }
            if (!moved) break;
          }

          return settled;
        });
        setState("settled");
        const vals = finalValuesRef.current;
        setResults(vals);
        const timeout = setTimeout(() => {
          onResultRef.current(vals);
        }, 300);
        return;
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [state, diceCount, arenaWidth]);

  // Refs to latest callbacks for auto-play chaining
  const startChargeRef = useRef(startCharge);
  startChargeRef.current = startCharge;
  const updateDragRef = useRef(updateDrag);
  updateDragRef.current = updateDrag;
  const releaseRollRef = useRef(releaseRoll);
  releaseRollRef.current = releaseRoll;

  // Smooth cursor interpolation — runs during auto-play charging/dragging.
  // Lerps cursorPos toward targetCursorRef every frame and feeds the
  // interpolated position into updateDrag so the drag line glides smoothly.
  useEffect(() => {
    if (!autoPlay || (state !== "charging" && state !== "dragging")) return;

    const animate = () => {
      const target = targetCursorRef.current;
      const current = smoothCursorRef.current;
      const lerp = 0.18;
      const nx = current.x + (target.x - current.x) * lerp;
      const ny = current.y + (target.y - current.y) * lerp;
      smoothCursorRef.current = { x: nx, y: ny };
      setCursorPos({ x: nx, y: ny });

      const rect = arenaRef.current?.getBoundingClientRect();
      if (rect) {
        updateDragRef.current(rect.left + nx, rect.top + ny);
      }

      cursorAnimRef.current = requestAnimationFrame(animate);
    };
    cursorAnimRef.current = requestAnimationFrame(animate);
    return () => {
      if (cursorAnimRef.current) cancelAnimationFrame(cursorAnimRef.current);
    };
  }, [autoPlay, state]);

  useEffect(() => {
    if (autoPlay && !disabled && !autoPlayStartedRef.current && stateRef.current === "idle") {
      autoPlayStartedRef.current = true;
      // Bot plays like a person: think → charge → wander aim → settle → release
      const thinkDelay = 400 + Math.random() * 800;        // 0.4s–1.2s "thinking"
      const chargeTime = 600 + Math.random() * 1000;       // 0.6s–1.6s charging (varied throw power)
      const wanderSteps = 5 + Math.floor(Math.random() * 5); // 5–9 wandering steps
      const wanderInterval = 180 + Math.random() * 120;    // 180ms–300ms per wander step
      const settleTime = 200 + Math.random() * 200;        // 200ms–400ms settle before release

      const timers: ReturnType<typeof setTimeout>[] = [];

      // Phase 1: Start charging (like pressing and holding)
      const t1 = setTimeout(() => {
        const rect = arenaRef.current?.getBoundingClientRect();
        const cx = rect ? rect.left + rect.width / 2 : 200;
        const cy = rect ? rect.top + rect.height / 2 : 200;
        startChargeRef.current(cx, cy);
        // Initialize cursor and target at center of arena
        if (rect) {
          const center = { x: rect.width / 2, y: rect.height / 2 };
          smoothCursorRef.current = { ...center };
          targetCursorRef.current = { ...center };
          setCursorPos(center);
        }
      }, thinkDelay);
      timers.push(t1);

      // Phase 2: Wander — move the aim direction around like a person deciding
      let prevAngle = Math.random() * Math.PI * 2;
      for (let i = 0; i < wanderSteps; i++) {
        const t = setTimeout(() => {
          const rect = arenaRef.current?.getBoundingClientRect();
          const cx = rect ? rect.left + rect.width / 2 : 200;
          const cy = rect ? rect.top + rect.height / 2 : 200;
          // Drift the angle smoothly with some randomness — feels like deliberation
          prevAngle += (Math.random() - 0.5) * Math.PI * 0.8;
          const dist = 35 + Math.random() * 75;
          const targetX = cx + Math.cos(prevAngle) * dist;
          const targetY = cy + Math.sin(prevAngle) * dist;
          if (rect) {
            targetCursorRef.current = { x: targetX - rect.left, y: targetY - rect.top };
          }
        }, thinkDelay + chargeTime + i * wanderInterval);
        timers.push(t);
      }

      // Phase 3: Settle — final deliberate aim direction before release
      const tSettle = setTimeout(() => {
        const rect = arenaRef.current?.getBoundingClientRect();
        const cx = rect ? rect.left + rect.width / 2 : 200;
        const cy = rect ? rect.top + rect.height / 2 : 200;
        // Pick a final direction — slightly more committed than the wander steps
        const angle = Math.random() * Math.PI * 2;
        const dist = 45 + Math.random() * 55;
        const targetX = cx + Math.cos(angle) * dist;
        const targetY = cy + Math.sin(angle) * dist;
        if (rect) {
          targetCursorRef.current = { x: targetX - rect.left, y: targetY - rect.top };
        }
      }, thinkDelay + chargeTime + wanderSteps * wanderInterval);
      timers.push(tSettle);

      // Phase 4: Release — let go and throw the dice
      const tRelease = setTimeout(() => {
        releaseRollRef.current();
      }, thinkDelay + chargeTime + wanderSteps * wanderInterval + settleTime);
      timers.push(tRelease);

      return () => timers.forEach(clearTimeout);
    }
  }, [autoPlay, disabled]);

  useEffect(() => {
    return () => {
      if (chargeIntervalRef.current) clearInterval(chargeIntervalRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (cursorAnimRef.current) cancelAnimationFrame(cursorAnimRef.current);
    };
  }, []);

  // Window-level listeners during charging/dragging so the drag persists
  // even when the mouse leaves the container bounds (e.g. over buttons below).
  // Skipped entirely in autoPlay mode — the bot controls the roll, not the player.
  useEffect(() => {
    if (autoPlay) return;
    if (state !== "charging" && state !== "dragging") return;

    const onWinMouseMove = (e: MouseEvent) => {
      const rect = arenaRef.current?.getBoundingClientRect();
      if (rect) {
        setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }
      updateDrag(e.clientX, e.clientY);
    };
    const onWinMouseUp = () => {
      releaseRoll();
    };
    const onWinTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      const rect = arenaRef.current?.getBoundingClientRect();
      if (rect) {
        setCursorPos({ x: t.clientX - rect.left, y: t.clientY - rect.top });
      }
      updateDrag(t.clientX, t.clientY);
    };
    const onWinTouchEnd = () => {
      releaseRoll();
    };

    window.addEventListener("mousemove", onWinMouseMove);
    window.addEventListener("mouseup", onWinMouseUp);
    window.addEventListener("touchmove", onWinTouchMove, { passive: false });
    window.addEventListener("touchend", onWinTouchEnd);
    return () => {
      window.removeEventListener("mousemove", onWinMouseMove);
      window.removeEventListener("mouseup", onWinMouseUp);
      window.removeEventListener("touchmove", onWinTouchMove);
      window.removeEventListener("touchend", onWinTouchEnd);
    };
  }, [autoPlay, state, updateDrag, releaseRoll]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (autoPlay) return;
    e.preventDefault();
    startCharge(e.clientX, e.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (autoPlay) return;
    e.preventDefault();
    const t = e.touches[0];
    startCharge(t.clientX, t.clientY);
  };

  const dragDist = Math.sqrt(dragVec.dx * dragVec.dx + dragVec.dy * dragVec.dy);
  const isCharging = state === "charging" || state === "dragging";
  const isRolling = state === "rolling";
  const dragAngle = Math.atan2(dragVec.dy, dragVec.dx);
  const hasDrag = dragDist > 5;

  const BTN_SIZE = 88;
  const RING_SIZE = BTN_SIZE + 12;

  return (
    <div
      className="flex flex-col items-center gap-3 select-none relative"
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    >
      <div ref={arenaRef} className="dice-arena">
        {dice.map((d, i) => {
          const dieUrl = getDiceImage(d.face);
          const fallback = DICE_ICONS[d.face - 1];
          const spinClass = d.rainbow ? "dice-wild-spin" : d.settled ? "" : "dice-normal-spin";
          const rainbowClass = d.rainbow ? "dice-rainbow" : "";
          return (
            <div
              key={i}
              className={`dice-physics ${spinClass} ${rainbowClass}`}
              style={{
                left: `${d.x}px`,
                top: `${d.y}px`,
                transform: `rotate(${d.rotation}deg)`,
                transition: d.settled ? "left 0.2s ease-out, top 0.2s ease-out" : "none",
              }}
            >
              {dieUrl ? (
                <img src={dieUrl} alt={`Die ${d.face}`} className="w-12 h-12 object-contain drop-shadow-[0_0_8px_rgba(212,175,55,0.3)]" />
              ) : (
                <span className="text-4xl text-spire-gold leading-none">{fallback}</span>
              )}
            </div>
          );
        })}

        {state === "idle" && dice.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-spire-muted/40 text-sm text-center px-4">
            Hold the ROLL button below to charge, drag to aim, release to throw
          </div>
        )}

        {state === "settled" && results.length > 0 && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-2">
            {results.map((v, i) => (
              <span key={i} className="text-2xl font-bold gold-text animate-dice-settle-in">
                {v}
              </span>
            ))}
            <span className="text-2xl font-bold text-spire-accent animate-dice-settle-in">
              = {results.reduce((s, v) => s + v, 0)}
            </span>
          </div>
        )}
      </div>

      {/* Drag line overlay — spans from button center to cursor (rendered outside arena to avoid overflow clipping) */}
      {isCharging && (
        (() => {
          const arenaRect = arenaRef.current?.getBoundingClientRect();
          const btnRect = buttonRef.current?.getBoundingClientRect();
          if (!arenaRect || !btnRect) return null;
          const btnCx = btnRect.left + btnRect.width / 2;
          const btnCy = btnRect.top + btnRect.height / 2;
          const originX = btnCx;
          const originY = btnCy;
          let endX = cursorPos.x + arenaRect.left;
          let endY = cursorPos.y + arenaRect.top;
          const dx = endX - originX;
          const dy = endY - originY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > MAX_DRAG_RANGE) {
            const ratio = MAX_DRAG_RANGE / dist;
            endX = originX + dx * ratio;
            endY = originY + dy * ratio;
          }
          const clampedDist = Math.min(dist, MAX_DRAG_RANGE);
          const powerPct = Math.round((clampedDist / MAX_DRAG_RANGE) * 100);
          const chargeOpacity = 0.3 + (chargeLevel / 100) * 0.5;
          const arrowSize = 8 + (chargeLevel / 100) * 4;
          const angle = Math.atan2(endY - originY, endX - originX);
          const arrowX1 = endX - arrowSize * Math.cos(angle - Math.PI / 6);
          const arrowY1 = endY - arrowSize * Math.sin(angle - Math.PI / 6);
          const arrowX2 = endX - arrowSize * Math.cos(angle + Math.PI / 6);
          const arrowY2 = endY - arrowSize * Math.sin(angle + Math.PI / 6);
          return createPortal(
            <svg
              className="drag-arrow pointer-events-none"
              style={{
                position: "fixed",
                left: 0,
                top: 0,
                width: "100vw",
                height: "100vh",
                overflow: "visible",
                zIndex: 9999,
              }}
            >
              <defs>
                <linearGradient id="dragLineGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                  <stop offset="0%" stopColor="rgba(34, 211, 238, 0.8)" />
                  <stop offset="50%" stopColor="rgba(139, 92, 246, 0.7)" />
                  <stop offset="100%" stopColor="rgba(212, 175, 55, 0.9)" />
                </linearGradient>
              </defs>
              <line
                x1={originX}
                y1={originY}
                x2={endX}
                y2={endY}
                stroke="url(#dragLineGrad)"
                strokeWidth={2 + chargeLevel / 50}
                strokeDasharray="6,4"
                strokeLinecap="round"
                opacity={chargeOpacity}
              />
              <polygon
                points={`${endX},${endY} ${arrowX1},${arrowY1} ${arrowX2},${arrowY2}`}
                fill="rgba(212, 175, 55, 0.9)"
                opacity={chargeOpacity}
              />
              {dist > 10 && (
                <text
                  x={endX + 12}
                  y={endY - 8}
                  fill="rgba(34, 211, 238, 0.7)"
                  fontSize="11"
                  fontFamily="monospace"
                >
                  {powerPct}%
                </text>
              )}
            </svg>,
            document.body
          );
        })()
      )}

      {/* Circular Roll button with charge ring and direction indicator */}
      <div className="relative" style={{ width: RING_SIZE, height: RING_SIZE }}>
        {/* Charge ring (conic gradient) */}
        {isCharging && (
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(from -90deg, rgba(34, 211, 238, 0.9) 0%, rgba(139, 92, 246, 0.8) ${chargeLevel * 0.5}%, rgba(212, 175, 55, 0.9) ${chargeLevel}%, rgba(255, 255, 255, 0.05) ${chargeLevel}%)`,
              opacity: 0.6 + (chargeLevel / 100) * 0.4,
              filter: "blur(2px)",
            }}
          />
        )}

        {/* Glow ring when charging */}
        {isCharging && (
          <div
            className="absolute inset-0 rounded-full"
            style={{
              boxShadow: `0 0 ${16 + chargeLevel / 3}px rgba(212, 175, 55, ${0.2 + chargeLevel / 200})`,
            }}
          />
        )}

        {/* Direction arrow on button */}
        {isCharging && hasDrag && (
          <div
            className="absolute left-1/2 top-1/2 pointer-events-none z-20"
            style={{
              transform: `translate(-50%, -50%) rotate(${dragAngle}rad)`,
            }}
          >
            <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} style={{ overflow: "visible" }}>
              <polygon
                points={`${RING_SIZE / 2 + BTN_SIZE / 2 + 2},${RING_SIZE / 2} ${RING_SIZE / 2 + BTN_SIZE / 2 - 6},${RING_SIZE / 2 - 5} ${RING_SIZE / 2 + BTN_SIZE / 2 - 6},${RING_SIZE / 2 + 5}`}
                fill="rgba(212, 175, 55, 0.95)"
                style={{ filter: "drop-shadow(0 0 4px rgba(212, 175, 55, 0.5))" }}
              />
            </svg>
          </div>
        )}

        {/* The circular button */}
        <button
          ref={buttonRef}
          className="absolute rounded-full font-bold tracking-wider transition-all duration-150 flex items-center justify-center"
          style={{
            width: BTN_SIZE,
            height: BTN_SIZE,
            left: (RING_SIZE - BTN_SIZE) / 2,
            top: (RING_SIZE - BTN_SIZE) / 2,
            background: isCharging
              ? `radial-gradient(circle, rgba(212, 175, 55, ${0.15 + chargeLevel / 300}) 0%, rgba(10, 10, 28, 0.9) 70%)`
              : "radial-gradient(circle, rgba(212, 175, 55, 0.12) 0%, rgba(10, 10, 28, 0.9) 70%)",
            border: `2px solid ${isCharging ? "rgba(212, 175, 55, 0.6)" : "rgba(212, 175, 55, 0.3)"}`,
            boxShadow: isCharging
              ? `inset 0 0 ${12 + chargeLevel / 4}px rgba(212, 175, 55, ${0.15 + chargeLevel / 300}), 0 0 ${8 + chargeLevel / 5}px rgba(212, 175, 55, ${0.1 + chargeLevel / 250})`
              : "inset 0 0 8px rgba(212, 175, 55, 0.08)",
            cursor: disabled || isRolling || state === "settled" || autoPlay ? "not-allowed" : "pointer",
            fontSize: isCharging ? "11px" : "14px",
            color: isCharging ? "rgba(212, 175, 55, 0.9)" : "rgba(212, 175, 55, 0.8)",
            zIndex: 10,
          }}
          disabled={disabled || isRolling || state === "settled" || !!autoPlay}
        >
          {isRolling ? (
            <span className="animate-pulse text-xs">ROLLING</span>
          ) : isCharging ? (
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-lg font-bold tabular-nums" style={{ color: chargeLevel >= 95 ? "#22d3ee" : "rgba(212, 175, 55, 0.95)" }}>
                {Math.round(chargeLevel)}%
              </span>
              {hasDrag && (
                <span className="text-[9px] text-spire-accent tabular-nums">
                  {Math.round((Math.min(dragDist, MAX_DRAG_RANGE) / MAX_DRAG_RANGE) * 100)}% aim
                </span>
              )}
              {chargeLevel >= 95 && !hasDrag && (
                <span className="text-[8px] text-cyan-400 font-bold">MAX</span>
              )}
            </div>
          ) : state === "settled" ? (
            <span className="text-xs">DONE</span>
          ) : (
            <span>ROLL</span>
          )}
        </button>
      </div>

      {showRainbow && (
        <div className="text-xs font-bold animate-rainbow-glow" style={{ color: "#22d3ee" }}>
          ✦ CRAY CRAY ROLL! ✦
        </div>
      )}
    </div>
  );
}

export { skipRoll, calculateRollModifiers, weightedRoll };
