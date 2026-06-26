"use client";

/**
 * SignalField — the page's quiet signature texture.
 *
 * On light paper: a sparse field of faint navy dots (the noise of the internet).
 * On load, a soft electric-blue band scans across once; as it passes, a small
 * cluster of nodes ignites and wires itself together — the product's noise→signal
 * trick rendered as designed texture, not a tech demo. Afterwards it stays barely
 * alive (slow drift + faint twinkle). Honors prefers-reduced-motion.
 */
import { useEffect, useRef } from "react";

const INK = [10, 22, 51]; // navy noise
const BLUE = [22, 48, 122]; // structural deep blue
const ELECTRIC = [35, 71, 255]; // ignition accent

type Dot = {
  x: number; // normalized 0..1
  y: number;
  r: number;
  baseA: number;
  twk: number;
  drift: number;
  gold: boolean; // "opportunity" node
  lit: number; // 0..1 ignition
};

export default function SignalField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const dots: Dot[] = [];
    const rand = mulberry32(20260626);
    // Loose constellation toward the right side, away from the headline.
    const constellation = [
      { x: 0.7, y: 0.34 },
      { x: 0.8, y: 0.24 },
      { x: 0.87, y: 0.44 },
      { x: 0.76, y: 0.54 },
      { x: 0.64, y: 0.46 },
      { x: 0.83, y: 0.66 },
    ];
    // Quiet noise — kept sparse and low-contrast so it reads as texture on light.
    for (let i = 0; i < 78; i++) {
      dots.push({
        x: rand(),
        y: rand(),
        r: 0.7 + rand() * 1.3,
        baseA: 0.05 + rand() * 0.13,
        twk: rand() * Math.PI * 2,
        drift: 0.3 + rand() * 0.7,
        gold: false,
        lit: 0,
      });
    }
    const focalDots: Dot[] = constellation.map((c) => ({
      x: c.x,
      y: c.y,
      r: 2.2 + rand() * 1,
      baseA: 0.85,
      twk: rand() * Math.PI * 2,
      drift: 0.22,
      gold: true,
      lit: 0,
    }));
    dots.push(...focalDots);
    const focal = focalDots[0]; // the resolved opportunity node

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const start = performance.now();
    const INTRO = reduced ? 0 : 2400;
    let raf = 0;
    let running = true;

    const pos = (d: Dot, t: number) => {
      const dx = reduced ? 0 : Math.sin(t * 0.00011 * d.drift + d.twk) * 6;
      const dy = reduced ? 0 : Math.cos(t * 0.00009 * d.drift + d.twk) * 6;
      return { X: d.x * w + dx, Y: d.y * h + dy };
    };

    const draw = (now: number) => {
      const t = now - start;
      const intro = INTRO === 0 ? 1 : Math.min(t / INTRO, 1);
      const scanX = easeOut(intro) * (w + 200) - 100;

      ctx.clearRect(0, 0, w, h);

      for (const d of focalDots) {
        const reach = reduced ? 1 : scanX > d.x * w - 40 ? 1 : 0;
        d.lit += (reach - d.lit) * 0.07;
      }

      // Constellation lines — drawn in faint navy as nodes light up.
      ctx.lineWidth = 1;
      for (const a of focalDots) {
        if (a === focal) continue;
        const strength = Math.min(a.lit, focal.lit);
        if (strength < 0.02) continue;
        const pa = pos(a, now);
        const pb = pos(focal, now);
        ctx.strokeStyle = rgba(BLUE, 0.05 + strength * 0.14);
        ctx.beginPath();
        ctx.moveTo(pa.X, pa.Y);
        ctx.lineTo(pb.X, pb.Y);
        ctx.stroke();
      }

      for (const d of dots) {
        const { X, Y } = pos(d, now);
        const dist = Math.abs(X - scanX);
        const wave = !reduced && dist < 60 ? (1 - dist / 60) * 0.4 : 0;
        const tw = reduced ? 0 : Math.sin(now * 0.0019 + d.twk) * 0.06;

        if (d.gold) {
          const a = d.baseA * d.lit;
          const pulse = reduced ? 0.85 : 0.7 + Math.sin(now * 0.0017 + d.twk) * 0.3;
          const g = ctx.createRadialGradient(X, Y, 0, X, Y, d.r * 7);
          g.addColorStop(0, rgba(ELECTRIC, a * 0.32 * pulse));
          g.addColorStop(1, rgba(ELECTRIC, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(X, Y, d.r * 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = rgba(ELECTRIC, a);
          ctx.beginPath();
          ctx.arc(X, Y, d.r, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const a = clamp(d.baseA + tw + wave, 0, 0.4);
          ctx.fillStyle = rgba(INK, a);
          ctx.beginPath();
          ctx.arc(X, Y, d.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Leading edge of the scan band — a soft electric vertical light.
      if (!reduced && intro < 1) {
        const band = ctx.createLinearGradient(scanX - 70, 0, scanX + 30, 0);
        band.addColorStop(0, rgba(ELECTRIC, 0));
        band.addColorStop(0.7, rgba(ELECTRIC, 0.04));
        band.addColorStop(1, rgba(ELECTRIC, 0.1));
        ctx.fillStyle = band;
        ctx.fillRect(scanX - 70, 0, 100, h);
      }

      // Pulse ring on the resolved opportunity node.
      if (focal.lit > 0.6) {
        const { X, Y } = pos(focal, now);
        const ringT = reduced ? 0.4 : (now * 0.0011) % 1;
        ctx.strokeStyle = rgba(ELECTRIC, (1 - ringT) * 0.35 * focal.lit);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(X, Y, 6 + ringT * 32, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (running && !reduced) raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    const onVis = () => {
      running = !document.hidden;
      if (running && !reduced) raf = requestAnimationFrame(draw);
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}

function rgba(c: number[], a: number) {
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function easeOut(t: number) {
  return 1 - Math.pow(1 - t, 3);
}
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
