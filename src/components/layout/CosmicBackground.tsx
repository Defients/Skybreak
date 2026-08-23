import { useRef, useEffect } from "react";

interface Star {
  x: number;
  y: number;
  z: number;
  radius: number;
  baseAlpha: number;
  twinklePhase: number;
  twinkleSpeed: number;
  color: string;
  vx: number;
  vy: number;
}

interface EnergyPulse {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  color: string;
  speed: number;
}

const STAR_COLORS = [
  "rgba(226, 232, 240, 1)",
  "rgba(34, 211, 238, 1)",
  "rgba(139, 92, 246, 1)",
  "rgba(20, 184, 166, 1)",
  "rgba(212, 175, 55, 1)",
  "rgba(217, 70, 239, 1)",
];

const PULSE_COLORS = [
  "rgba(34, 211, 238, ",
  "rgba(139, 92, 246, ",
  "rgba(20, 184, 166, ",
];

const STAR_COUNT_DESKTOP = 180;
const STAR_COUNT_TABLET = 120;
const STAR_COUNT_MOBILE = 50;
const MAX_PULSES = 3;

function isMobile(): boolean {
  return window.innerWidth < 768;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getStarCount(): number {
  const w = window.innerWidth;
  if (w < 768) return STAR_COUNT_MOBILE;
  if (w < 1024) return STAR_COUNT_TABLET;
  return STAR_COUNT_DESKTOP;
}

function getConstellationDistance(): number {
  const w = window.innerWidth;
  if (w < 768) return 100;
  return 140;
}

export function CosmicBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const starsRef = useRef<Star[]>([]);
  const pulsesRef = useRef<EnergyPulse[]>([]);
  const lastPulseRef = useRef<number>(0);
  const dprRef = useRef<number>(1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMotion = prefersReducedMotion();
    const mobile = isMobile();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      dprRef.current = dpr;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const initStars = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const stars: Star[] = [];
      const count = getStarCount();
      for (let i = 0; i < count; i++) {
        const z = Math.random() * 0.8 + 0.2;
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          z,
          radius: z * 1.4 + 0.3,
          baseAlpha: z * 0.5 + 0.15,
          twinklePhase: Math.random() * Math.PI * 2,
          twinkleSpeed: Math.random() * 0.015 + 0.003,
          color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
          vx: (Math.random() - 0.5) * 0.08 * z,
          vy: (Math.random() - 0.5) * 0.08 * z,
        });
      }
      starsRef.current = stars;
    };

    resize();
    initStars();

    const handleResize = () => {
      resize();
      initStars();
    };
    window.addEventListener("resize", handleResize);

    const render = (time: number) => {
      const w = window.innerWidth;
      const h = window.innerHeight;

      ctx.clearRect(0, 0, w, h);

      const stars = starsRef.current;
      const pulses = pulsesRef.current;

      for (const star of stars) {
        star.x += star.vx;
        star.y += star.vy;
        star.twinklePhase += star.twinkleSpeed;

        if (star.x < -10) star.x = w + 10;
        if (star.x > w + 10) star.x = -10;
        if (star.y < -10) star.y = h + 10;
        if (star.y > h + 10) star.y = -10;

        const twinkle = (Math.sin(star.twinklePhase) + 1) * 0.5;
        const alpha = star.baseAlpha * (0.4 + twinkle * 0.6);

        const glowRadius = star.radius * 4;
        const gradient = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, glowRadius);
        gradient.addColorStop(0, star.color.replace("1)", `${alpha})`));
        gradient.addColorStop(0.4, star.color.replace("1)", `${alpha * 0.3})`));
        gradient.addColorStop(1, star.color.replace("1)", "0)"));

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(star.x, star.y, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = star.color.replace("1)", `${alpha})`);
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!mobile) {
      for (let i = 0; i < stars.length; i++) {
        const s1 = stars[i];
        if (s1.z < 0.6) continue;
        for (let j = i + 1; j < stars.length; j++) {
          const s2 = stars[j];
          if (s2.z < 0.6) continue;
          const dx = s1.x - s2.x;
          const dy = s1.y - s2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const maxDist = getConstellationDistance();
          if (dist < maxDist) {
            const lineAlpha = (1 - dist / maxDist) * 0.08;
            ctx.strokeStyle = `rgba(34, 211, 238, ${lineAlpha})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(s1.x, s1.y);
            ctx.lineTo(s2.x, s2.y);
            ctx.stroke();
          }
        }
      }

      if (time - lastPulseRef.current > 6000 && pulses.length < MAX_PULSES) {
        lastPulseRef.current = time;
        const colorBase = PULSE_COLORS[Math.floor(Math.random() * PULSE_COLORS.length)];
        pulses.push({
          x: Math.random() * w,
          y: Math.random() * h,
          radius: 0,
          maxRadius: 200 + Math.random() * 200,
          alpha: 0.4,
          color: colorBase,
          speed: 0.4 + Math.random() * 0.3,
        });
      }

      for (let i = pulses.length - 1; i >= 0; i--) {
        const pulse = pulses[i];
        pulse.radius += pulse.speed;
        const progress = pulse.radius / pulse.maxRadius;
        pulse.alpha = 0.4 * (1 - progress);

        if (progress >= 1) {
          pulses.splice(i, 1);
          continue;
        }

        ctx.strokeStyle = `${pulse.color}${pulse.alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(pulse.x, pulse.y, pulse.radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = `${pulse.color}${pulse.alpha * 0.5})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.arc(pulse.x, pulse.y, pulse.radius * 0.85, 0, Math.PI * 2);
        ctx.stroke();
      }
      }

      animationRef.current = requestAnimationFrame(render);
    };

    animationRef.current = requestAnimationFrame(render);

    if (reducedMotion) {
      render(0);
      cancelAnimationFrame(animationRef.current);
      return () => {
        window.removeEventListener("resize", handleResize);
      };
    }

    return () => {
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0" />

      <div className="absolute inset-0 cosmo-grid opacity-40 animate-drift hidden sm:block" />
      <div className="absolute inset-0 cosmo-grid-fine opacity-30 hidden sm:block" />

      <div className="absolute inset-0">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full animate-breathe"
          style={{
            width: "120vmax",
            height: "120vmax",
            background: "radial-gradient(circle, rgba(139, 92, 246, 0.04) 0%, rgba(34, 211, 238, 0.02) 30%, transparent 60%)",
          }}
        />
      </div>

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 hidden sm:block">
        <div
          className="rounded-full border border-cyan-400/[0.04] animate-orbital-spin"
          style={{ width: "80vmax", height: "80vmax" }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-violet-400/[0.03] animate-orbital-spin-rev"
          style={{ width: "60vmax", height: "60vmax" }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-teal-400/[0.03] animate-orbital-spin"
          style={{ width: "40vmax", height: "40vmax", animationDuration: "90s" }}
        />
      </div>

      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full hidden sm:block"
        style={{
          width: "50vmax",
          height: "50vmax",
          background: "conic-gradient(from 0deg, transparent 0deg, rgba(34, 211, 238, 0.015) 60deg, transparent 120deg, rgba(139, 92, 246, 0.015) 180deg, transparent 240deg, rgba(20, 184, 166, 0.01) 300deg, transparent 360deg)",
          animation: "orbitalSpin 120s linear infinite",
        }}
      />

      <div
        className="absolute left-0 right-0 h-px animate-scan-sweep hidden sm:block"
        style={{
          background: "linear-gradient(90deg, transparent 0%, rgba(34, 211, 238, 0.15) 20%, rgba(34, 211, 238, 0.3) 50%, rgba(34, 211, 238, 0.15) 80%, transparent 100%)",
          boxShadow: "0 0 12px rgba(34, 211, 238, 0.15)",
        }}
      />

      <div className="absolute inset-0 cosmo-vignette" />
    </div>
  );
}
