import { useRef, useEffect } from "react";

interface TrailPoint {
  x: number;
  y: number;
  age: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  maxLife: number;
  size: number;
  rotation: number;
  rotationSpeed: number;
  color: string;
}

interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  color: string;
}

const PALETTE = [
  { r: 34, g: 211, b: 238 },
  { r: 20, g: 184, b: 166 },
  { r: 139, g: 92, b: 246 },
  { r: 217, g: 70, b: 239 },
  { r: 212, g: 175, b: 55 },
];

const FAST_PALETTE = [
  { r: 139, g: 92, b: 246 },
  { r: 217, g: 70, b: 239 },
  { r: 34, g: 211, b: 238 },
];

const MAX_TRAIL_POINTS = 60;
const MAX_SPARKS = 20;
const MAX_SHOCKWAVES = 3;
const TRAIL_LIFE = 45;

function pickColor(speed: number): { r: number; g: number; b: number } {
  const pool = speed > 8 ? FAST_PALETTE : PALETTE;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function CosmoCursor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const dprRef = useRef<number>(1);

  const pointerRef = useRef({ x: -100, y: -100, vx: 0, vy: 0, speed: 0, inside: false });
  const ringRef = useRef({ x: -100, y: -100 });
  const dotRef = useRef({ x: -100, y: -100 });
  const trailRef = useRef<TrailPoint[]>([]);
  const sparksRef = useRef<Spark[]>([]);
  const shockwavesRef = useRef<Shockwave[]>([]);
  const clickPulseRef = useRef(0);
  const idleTimeRef = useRef(0);
  const lastFrameRef = useRef(0);

  useEffect(() => {
    if (window.matchMedia("(hover: none)").matches) return;
    if (window.matchMedia("(max-width: 768px)").matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      dprRef.current = dpr;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    const handleMove = (e: MouseEvent) => {
      const p = pointerRef.current;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.vx = dx;
      p.vy = dy;
      p.speed = Math.sqrt(dx * dx + dy * dy);
      p.x = e.clientX;
      p.y = e.clientY;
      p.inside = true;
      trailRef.current.push({ x: e.clientX, y: e.clientY, age: 0 });
      if (trailRef.current.length > MAX_TRAIL_POINTS) {
        trailRef.current.shift();
      }
      idleTimeRef.current = 0;
    };

    const handleDown = (e: MouseEvent) => {
      clickPulseRef.current = 1;
      const c = pickColor(0);
      const colorStr = `rgba(${c.r}, ${c.g}, ${c.b}, `;
      shockwavesRef.current.push({
        x: e.clientX,
        y: e.clientY,
        radius: 0,
        maxRadius: 60 + Math.random() * 30,
        alpha: 0.6,
        color: colorStr,
      });
      const sparkCount = 12 + Math.floor(Math.random() * 8);
      for (let i = 0; i < sparkCount; i++) {
        const angle = (Math.PI * 2 * i) / sparkCount + Math.random() * 0.3;
        const spd = 2 + Math.random() * 4;
        const sc = pickColor(5);
        sparksRef.current.push({
          x: e.clientX,
          y: e.clientY,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          age: 0,
          maxLife: 30 + Math.random() * 20,
          size: 2 + Math.random() * 3,
          rotation: Math.random() * Math.PI,
          rotationSpeed: (Math.random() - 0.5) * 0.2,
          color: `rgba(${sc.r}, ${sc.g}, ${sc.b}, `,
        });
      }
      if (sparksRef.current.length > MAX_SPARKS) {
        sparksRef.current.splice(0, sparksRef.current.length - MAX_SPARKS);
      }
      if (shockwavesRef.current.length > MAX_SHOCKWAVES) {
        shockwavesRef.current.splice(0, shockwavesRef.current.length - MAX_SHOCKWAVES);
      }
    };

    const handleLeave = () => {
      pointerRef.current.inside = false;
    };

    const handleEnter = () => {
      pointerRef.current.inside = true;
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mousedown", handleDown);
    window.addEventListener("mouseleave", handleLeave);
    window.addEventListener("mouseenter", handleEnter);

    const render = (time: number) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dt = lastFrameRef.current ? Math.min((time - lastFrameRef.current) / 16.67, 3) : 1;
      lastFrameRef.current = time;

      ctx.clearRect(0, 0, w, h);

      const p = pointerRef.current;
      const ring = ringRef.current;
      const dot = dotRef.current;
      const sparks = sparksRef.current;
      const shockwaves = shockwavesRef.current;
      const trail = trailRef.current;

      const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

      ring.x = lerp(ring.x, p.x, 0.22 * dt);
      ring.y = lerp(ring.y, p.y, 0.22 * dt);
      dot.x = lerp(dot.x, p.x, 0.4 * dt);
      dot.y = lerp(dot.y, p.y, 0.4 * dt);

      const speed = p.speed;
      p.speed *= 0.92;

      idleTimeRef.current += dt;
      const isIdle = idleTimeRef.current > 30 && p.inside;
      const breathe = isIdle ? (Math.sin(time * 0.003) + 1) * 0.5 : 0;

      for (let i = trail.length - 1; i >= 0; i--) {
        trail[i].age += dt;
        if (trail[i].age >= TRAIL_LIFE) {
          trail.splice(0, i + 1);
          break;
        }
      }

      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (trail.length >= 2) {
        const speedFactor = Math.min(speed / 15, 1);
        const cr = Math.round(lerp(34, 139, speedFactor));
        const cg = Math.round(lerp(211, 92, speedFactor));
        const cb = Math.round(lerp(238, 246, speedFactor));

        for (let pass = 0; pass < 2; pass++) {
          const widthMul = pass === 0 ? 1.0 : 0.4;
          const alphaMul = pass === 0 ? 1.0 : 0.5;
          const offset = pass === 1 ? 1.5 : 0;

          ctx.beginPath();
          for (let i = 0; i < trail.length; i++) {
            const tp = trail[i];
            const lifeRatio = tp.age / TRAIL_LIFE;
            const fade = 1 - lifeRatio;
            const w = (2.5 * fade + 0.3) * widthMul;
            const a = fade * 0.35 * alphaMul;

            if (i > 0) {
              const prev = trail[i - 1];
              const prevFade = 1 - prev.age / TRAIL_LIFE;
              const avgFade = (fade + prevFade) * 0.5;
              const avgW = ((2.5 * avgFade + 0.3) * widthMul);
              const avgA = avgFade * 0.35 * alphaMul;

              ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${avgA})`;
              ctx.lineWidth = avgW;
              ctx.beginPath();
              ctx.moveTo(prev.x + offset, prev.y + offset);
              ctx.lineTo(tp.x + offset, tp.y + offset);
              ctx.stroke();
            }
          }
        }

        const head = trail[trail.length - 1];
        const headFade = 1 - head.age / TRAIL_LIFE;
        if (headFade > 0.5) {
          const hg = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 4);
          hg.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${headFade * 0.3})`);
          hg.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
          ctx.fillStyle = hg;
          ctx.beginPath();
          ctx.arc(head.x, head.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      for (let i = sparks.length - 1; i >= 0; i--) {
        const sp = sparks[i];
        sp.age += dt;
        if (sp.age >= sp.maxLife) {
          sparks.splice(i, 1);
          continue;
        }
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        sp.vx *= 0.94;
        sp.vy *= 0.94;
        sp.rotation += sp.rotationSpeed * dt;

        const lifeRatio = sp.age / sp.maxLife;
        const alpha = (1 - lifeRatio) * 0.6;
        const sz = sp.size * (1 - lifeRatio * 0.5);

        ctx.save();
        ctx.translate(sp.x, sp.y);
        ctx.rotate(sp.rotation);
        ctx.strokeStyle = `${sp.color}${alpha})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(0, -sz * 1.5);
        ctx.lineTo(0, sz * 1.5);
        ctx.moveTo(-sz * 1.5, 0);
        ctx.lineTo(sz * 1.5, 0);
        ctx.stroke();
        ctx.restore();
      }

      for (let i = shockwaves.length - 1; i >= 0; i--) {
        const sw = shockwaves[i];
        sw.radius += 2.5 * dt;
        const progress = sw.radius / sw.maxRadius;
        sw.alpha = 0.4 * (1 - progress);
        if (progress >= 1) {
          shockwaves.splice(i, 1);
          continue;
        }
        ctx.strokeStyle = `${sw.color}${sw.alpha})`;
        ctx.lineWidth = 1.5 * (1 - progress * 0.5);
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = `${sw.color}${sw.alpha * 0.4})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.radius * 0.8, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (p.inside) {
        const pulse = clickPulseRef.current;
        clickPulseRef.current *= 0.88;

        const ringRadius = 7 + pulse * 5 + breathe * 1;
        const ringGlow = 0.25 + speed * 0.01 + pulse * 0.2;
        const ringWidth = 1 + speed * 0.015 + pulse * 1;

        const speedFactor = Math.min(speed / 15, 1);
        const cr = Math.round(lerp(34, 139, speedFactor));
        const cg = Math.round(lerp(211, 92, speedFactor));
        const cb = Math.round(lerp(238, 246, speedFactor));
        const ringColor = `rgba(${cr}, ${cg}, ${cb}, `;

        ctx.strokeStyle = `${ringColor}${Math.min(ringGlow, 0.6)})`;
        ctx.lineWidth = ringWidth;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ringRadius, 0, Math.PI * 2);
        ctx.stroke();

        const dotGrad = ctx.createRadialGradient(dot.x, dot.y, 0, dot.x, dot.y, 3);
        dotGrad.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0.5)`);
        dotGrad.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
        ctx.fillStyle = dotGrad;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.5 + pulse * 0.3})`;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, 1 + pulse * 1, 0, Math.PI * 2);
        ctx.fill();

        const tickAngles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
        const tickLen = 2.5 + pulse * 2;
        const tickInner = ringRadius + 2;
        ctx.strokeStyle = `${ringColor}${ringGlow * 0.4})`;
        ctx.lineWidth = 0.8;
        for (const a of tickAngles) {
          const cosA = Math.cos(a);
          const sinA = Math.sin(a);
          ctx.beginPath();
          ctx.moveTo(ring.x + cosA * tickInner, ring.y + sinA * tickInner);
          ctx.lineTo(ring.x + cosA * (tickInner + tickLen), ring.y + sinA * (tickInner + tickLen));
          ctx.stroke();
        }
      }

      ctx.globalCompositeOperation = "source-over";

      animationRef.current = requestAnimationFrame(render);
    };

    animationRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mousedown", handleDown);
      window.removeEventListener("mouseleave", handleLeave);
      window.removeEventListener("mouseenter", handleEnter);
    };
  }, []);

  return <canvas ref={canvasRef} className="cosmo-cursor-canvas" />;
}
