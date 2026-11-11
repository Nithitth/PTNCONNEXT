"use client";

import { useEffect, useRef, useState } from "react";
import { Gem, Hand, MousePointerClick, Sparkles, Zap } from "lucide-react";
import { cx } from "@/components/ui";

/**
 * "ลาวาแก้ว": the home page fidget toy. Translucent red "liquid glass" drops float in a dark panel and
 * melt into each other (an SVG filter on the canvas: goo + glass tint + bright rim + specular shine).
 * - Tap: burst a drop with a shockwave. Press-and-hold: pull the lava to the finger, release to fling.
 * - "รวมเป็นโลโก้": the drops flow into the school's "t" logo; tap to blow it apart.
 * - Left alone for 3 seconds, the glass sets hard and cracks spread through it; the next touch shatters
 *   it into flying shards and it turns liquid again.
 * Runs only while on screen and the tab is visible; it also stops once it's frozen and the cracks are done.
 * Under reduced motion it only moves when the user touches it.
 */

type Pt = { x: number; y: number };
type Drop = Pt & { vx: number; vy: number; r: number; tr: number; base: number; tx?: number; ty?: number };
type Ring = Pt & { r: number; life: number };
type Spark = Pt & { vx: number; vy: number; life: number; red: boolean };
type Shard = Pt & { vx: number; vy: number; rot: number; vr: number; life: number; shape: [number, number][] };
type Engine = { burst: (power: number) => void; toggleLogo: () => boolean };

const COUNT = 46; // drops at rest
const MAX = 72; // most drops at once (after bursts)
const LOGO_DROPS = 110; // drops used to draw the logo (extras melt back together afterwards)
const IDLE_MS = 3000; // untouched this long → the glass sets and cracks
const FILTER_ID = "connext-glass";

export function LavaPlay() {
  const box = useRef<HTMLDivElement>(null);
  const gooRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Engine | null>(null);
  const [taps, setTaps] = useState(0);
  const [logo, setLogo] = useState(false);
  const [frozen, setFrozen] = useState(false);

  useEffect(() => {
    const host = box.current;
    const goo = gooRef.current;
    const fx = fxRef.current;
    const g = goo?.getContext("2d");
    const f = fx?.getContext("2d");
    if (!host || !goo || !fx || !g || !f) return;

    const css = getComputedStyle(document.documentElement);
    const hot = css.getPropertyValue("--color-brand-hot").trim() || "#ff4a3d";
    const mid = css.getPropertyValue("--color-brand").trim() || "#db2931";
    const deep = css.getPropertyValue("--color-brand-deep").trim() || "#8e1219";
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let W = 0;
    let H = 0;
    let dpr = 1;
    let drops: Drop[] = [];
    let rings: Ring[] = [];
    let sparks: Spark[] = [];
    let shards: Shard[] = [];
    let cracks: Pt[][] = []; // each crack is a jagged line
    let mode: "free" | "logo" = "free";
    let isFrozen = false;
    let crackStart = 0;
    let lastTouch = performance.now();
    let t = 0;
    let raf = 0;
    let onScreen = true;
    const pointer = { x: 0, y: 0, px: 0, py: 0, down: false, t0: 0, sx: 0, sy: 0 };
    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    const logoImg = new Image();
    logoImg.src = "/brand/arrow-white.png";

    const seed = () => {
      drops = Array.from({ length: COUNT }, () => {
        const base = rand(9, 23);
        return { x: rand(W * 0.15, W * 0.85), y: rand(H * 0.15, H * 0.85), vx: rand(-1, 1), vy: rand(-1, 1), r: base, tr: base, base };
      });
    };

    // Sample points inside the logo (alpha mask) so each drop gets a spot to flow to.
    const formLogo = () => {
      if (!logoImg.complete || !logoImg.naturalWidth) return false;
      const h = H * 0.8;
      const w = h * (logoImg.naturalWidth / logoImg.naturalHeight);
      const off = document.createElement("canvas");
      off.width = Math.ceil(w);
      off.height = Math.ceil(h);
      const o = off.getContext("2d");
      if (!o) return false;
      o.drawImage(logoImg, 0, 0, w, h);
      const alpha = o.getImageData(0, 0, off.width, off.height).data;
      // The logo needs more liquid than the resting lava: bud extra droplets off existing drops.
      while (drops.length < LOGO_DROPS) {
        const src = drops[Math.floor(Math.random() * drops.length)];
        drops.push({ x: src.x + rand(-4, 4), y: src.y + rand(-4, 4), vx: 0, vy: 0, r: 2, tr: 8, base: 8 });
      }
      const n = drops.length;
      for (let step = Math.floor(h / 6); step >= 4; step--) {
        const pts: Pt[] = [];
        for (let y = step / 2; y < h; y += step)
          for (let x = step / 2; x < w; x += step)
            if (alpha[(Math.floor(y) * off.width + Math.floor(x)) * 4 + 3] > 140) pts.push({ x: (W - w) / 2 + x, y: (H - h) / 2 + y });
        if (pts.length < n) continue;
        const targets = Array.from({ length: n }, (_, i) => pts[Math.floor((i * pts.length) / n)]).sort((a, b) => a.y - b.y || a.x - b.x);
        [...drops].sort((a, b) => a.y - b.y || a.x - b.x).forEach((d, i) => {
          d.tx = targets[i].x;
          d.ty = targets[i].y;
          d.tr = step * 0.72;
        });
        mode = "logo";
        return true;
      }
      return false;
    };

    const release = () => {
      mode = "free";
      for (const d of drops) {
        d.tx = d.ty = undefined;
        d.tr = d.base;
      }
    };

    // ── Glass setting and cracking ─────────────────────────────────────────
    const insideGlass = (p: Pt) => drops.some((d) => Math.hypot(p.x - d.x, p.y - d.y) < d.r * 0.9);

    // Pick a few impact points on the biggest pieces of glass; from each, jagged cracks radiate outward
    // and stop where the glass ends. Cracks run across merged drops, so they look like one cracked pane.
    const buildCracks = () => {
      const impacts: Pt[] = [];
      for (const d of [...drops].sort((a, b) => b.r - a.r)) {
        if (impacts.length >= 7 || d.r < 7) break;
        if (impacts.every((p) => Math.hypot(p.x - d.x, p.y - d.y) > 70)) impacts.push({ x: d.x + rand(-3, 3), y: d.y + rand(-3, 3) });
      }
      cracks = [];
      for (const p of impacts) {
        const arms = 4 + Math.floor(Math.random() * 3);
        for (let i = 0; i < arms; i++) {
          let angle = (i / arms) * Math.PI * 2 + rand(-0.35, 0.35);
          const line: Pt[] = [p];
          let cur = p;
          for (let s = 0; s < 7; s++) {
            angle += rand(-0.45, 0.45);
            const next = { x: cur.x + Math.cos(angle) * rand(7, 15), y: cur.y + Math.sin(angle) * rand(7, 15) };
            if (!insideGlass(next)) break;
            line.push(next);
            cur = next;
            // Now and then a short side branch splits off.
            if (s > 1 && Math.random() < 0.22) {
              const b = angle + (Math.random() < 0.5 ? 1 : -1) * rand(0.6, 1.1);
              const tip = { x: cur.x + Math.cos(b) * rand(6, 12), y: cur.y + Math.sin(b) * rand(6, 12) };
              if (insideGlass(tip)) cracks.push([cur, tip]);
            }
          }
          if (line.length > 1) cracks.push(line);
        }
      }
    };

    const freeze = () => {
      isFrozen = true;
      crackStart = performance.now();
      buildCracks();
      setFrozen(true);
      navigator.vibrate?.([8, 40, 8]);
      wake();
    };

    // Break the set glass: shards fly out from every piece near the touch, then it's liquid again.
    const shatter = (x: number, y: number) => {
      isFrozen = false;
      cracks = [];
      setFrozen(false);
      for (const d of drops) {
        const dist = Math.hypot(d.x - x, d.y - y);
        if (dist > 260 || shards.length > 110) continue;
        const pieces = d.r > 14 ? 3 : 2;
        for (let i = 0; i < pieces; i++) {
          const a = Math.atan2(d.y - y, d.x - x) + rand(-0.9, 0.9);
          const s = rand(3, 9) * (1 - dist / 320);
          const size = rand(3, 8) + d.r * 0.15;
          shards.push({
            x: d.x + rand(-d.r, d.r) * 0.5,
            y: d.y + rand(-d.r, d.r) * 0.5,
            vx: Math.cos(a) * s,
            vy: Math.sin(a) * s - 2,
            rot: rand(0, Math.PI * 2),
            vr: rand(-0.3, 0.3),
            life: 1,
            shape: [
              [rand(-1, 1) * size, -size],
              [size, rand(-0.5, 1) * size],
              [-size, rand(-0.2, 1) * size],
            ],
          });
        }
      }
      navigator.vibrate?.(25);
    };

    // Any touch wakes the toy; if the glass has set, that touch shatters it first.
    const touch = (x: number, y: number) => {
      lastTouch = performance.now();
      if (isFrozen) shatter(x, y);
    };

    const burst = (x = W / 2, y = H / 2, power = 1) => {
      if (mode === "logo") {
        release();
        setLogo(false);
      }
      rings.push({ x, y, r: 6, life: 1 });
      for (let i = 0; i < 16; i++) {
        const a = rand(0, Math.PI * 2);
        const s = rand(2, 8) * power;
        sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, red: i % 3 === 0 });
      }
      let hit: Drop | null = null;
      let hitDist = Infinity;
      const reach = 200 * power;
      for (const d of drops) {
        const dx = d.x - x;
        const dy = d.y - y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist < hitDist) {
          hitDist = dist;
          hit = d;
        }
        if (dist < reach) {
          const k = (1 - dist / reach) * 13 * power;
          d.vx += (dx / dist) * k;
          d.vy += (dy / dist) * k;
        }
      }
      // The drop you hit splits into 3–4 droplets (same total size), which melt back together later.
      if (hit && hitDist < hit.r + 34 && hit.r > 12 && drops.length < MAX) {
        const parts = 3 + Math.floor(Math.random() * 2);
        const pr = hit.r / Math.sqrt(parts);
        for (let i = 0; i < parts; i++) {
          const a = (i / parts) * Math.PI * 2 + rand(0, 0.7);
          const s = rand(4, 9);
          drops.push({ x: hit.x + Math.cos(a) * 3, y: hit.y + Math.sin(a) * 3, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: pr, tr: pr, base: pr });
        }
        drops.splice(drops.indexOf(hit), 1);
      }
      navigator.vibrate?.(12);
      setTaps((n) => n + 1);
      wake();
    };

    const step = () => {
      t++;
      if (!isFrozen && !pointer.down && performance.now() - lastTouch > IDLE_MS) freeze();
      const cx = W / 2;
      const cy = H / 2;
      for (const d of drops) {
        if (isFrozen) {
          // Setting glass: everything slows to a stop.
          d.vx *= 0.8;
          d.vy *= 0.8;
        } else if (mode === "logo" && d.tx !== undefined && d.ty !== undefined) {
          d.vx = (d.vx + (d.tx - d.x) * 0.055) * 0.8;
          d.vy = (d.vy + (d.ty - d.y) * 0.055) * 0.8;
        } else {
          // A weak pull to the middle, plus a slow drifting current (lava-lamp style).
          d.vx += (cx - d.x) * 0.00028;
          d.vy += (cy - d.y) * 0.00028;
          if (!still) {
            d.vx += Math.sin(t * 0.008 + d.base * 2.1 + d.y * 0.01) * 0.05;
            d.vy += Math.cos(t * 0.006 + d.base * 1.3 + d.x * 0.01) * 0.05;
          }
          if (pointer.down) {
            const dx = pointer.x - d.x;
            const dy = pointer.y - d.y;
            const dist = Math.hypot(dx, dy) || 1;
            if (dist < 280) {
              const k = (1 - dist / 280) * 0.95;
              d.vx += (dx / dist) * k + (pointer.x - pointer.px) * 0.04;
              d.vy += (dy / dist) * k + (pointer.y - pointer.py) * 0.04;
            }
          }
          d.vx *= 0.962;
          d.vy *= 0.962;
        }
        d.r += (d.tr - d.r) * 0.12;
      }
      if (mode === "free" && !isFrozen) {
        // Drops keep their volume (push apart when squashed) and slowly melt back together.
        for (let i = 0; i < drops.length; i++)
          for (let j = i + 1; j < drops.length; j++) {
            const a = drops[i];
            const b = drops[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.hypot(dx, dy) || 0.01;
            const rr = (a.r + b.r) * 0.92;
            if (dist >= rr) continue;
            if (drops.length > COUNT && a.base + b.base < 34 && Math.random() < 0.004) {
              const r = Math.sqrt(a.base * a.base + b.base * b.base);
              const m = a.r * a.r + b.r * b.r;
              a.vx = (a.vx * a.r * a.r + b.vx * b.r * b.r) / m;
              a.vy = (a.vy * a.r * a.r + b.vy * b.r * b.r) / m;
              a.x = (a.x + b.x) / 2;
              a.y = (a.y + b.y) / 2;
              a.base = a.tr = r;
              drops.splice(j, 1);
              j--;
              continue;
            }
            const k = (rr - dist) * 0.045;
            const nx = dx / dist;
            const ny = dy / dist;
            a.vx -= nx * k;
            a.vy -= ny * k;
            b.vx += nx * k;
            b.vy += ny * k;
          }
      }
      for (const d of drops) {
        d.x += d.vx;
        d.y += d.vy;
        // Soft walls: always bounce back inward, with a bit less speed (never flip a drop that's already
        // heading back in, or it gets stuck to the wall).
        if (d.x < d.r) {
          d.x = d.r;
          d.vx = Math.abs(d.vx) * 0.6;
        } else if (d.x > W - d.r) {
          d.x = W - d.r;
          d.vx = -Math.abs(d.vx) * 0.6;
        }
        if (d.y < d.r) {
          d.y = d.r;
          d.vy = Math.abs(d.vy) * 0.6;
        } else if (d.y > H - d.r) {
          d.y = H - d.r;
          d.vy = -Math.abs(d.vy) * 0.6;
        }
      }
      pointer.px = pointer.x;
      pointer.py = pointer.y;
      for (const r of rings) {
        r.r += 7 * r.life + 1.5;
        r.life -= 0.028;
      }
      for (const s of sparks) {
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.14; // a little gravity
        s.vx *= 0.98;
        s.life -= 0.022;
      }
      for (const s of shards) {
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.22;
        s.vx *= 0.99;
        s.rot += s.vr;
        s.life -= 0.016;
      }
      rings = rings.filter((r) => r.life > 0);
      sparks = sparks.filter((s) => s.life > 0);
      shards = shards.filter((s) => s.life > 0 && s.y < H + 40);
    };

    // How far the cracks have spread: 0 → 1 over about a second, starting once the glass has stopped.
    const crackProgress = () => Math.min(1, Math.max(0, (performance.now() - crackStart - 350) / 1100));

    const draw = () => {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      // One gradient for the whole panel, so merged drops read as a single smooth liquid.
      const grad = g.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, hot);
      grad.addColorStop(0.5, mid);
      grad.addColorStop(1, deep);
      g.fillStyle = grad;
      g.beginPath();
      for (const d of drops) {
        g.moveTo(d.x + d.r, d.y);
        g.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      }
      g.fill();

      f.setTransform(dpr, 0, 0, dpr, 0, 0);
      f.clearRect(0, 0, W, H);
      // Cracks: a dark groove with a bright edge beside it, growing outward from each impact point.
      const p = crackProgress();
      if (cracks.length && p > 0) {
        f.lineCap = "round";
        f.lineJoin = "round";
        for (const [color, width, off] of [
          ["rgba(40,0,6,0.55)", 1.6, 0.9],
          ["rgba(255,255,255,0.9)", 1.1, 0],
        ] as const) {
          f.strokeStyle = color;
          f.lineWidth = width;
          f.beginPath();
          for (const line of cracks) {
            const shown = (line.length - 1) * p;
            f.moveTo(line[0].x + off, line[0].y + off);
            for (let i = 1; i < line.length && i - 1 < shown; i++) {
              const k = Math.min(1, shown - (i - 1));
              const a = line[i - 1];
              const b = line[i];
              f.lineTo(a.x + (b.x - a.x) * k + off, a.y + (b.y - a.y) * k + off);
            }
          }
          f.stroke();
        }
      }
      for (const s of shards) {
        f.save();
        f.translate(s.x, s.y);
        f.rotate(s.rot);
        f.globalAlpha = Math.min(1, s.life * 1.4);
        f.beginPath();
        f.moveTo(s.shape[0][0], s.shape[0][1]);
        f.lineTo(s.shape[1][0], s.shape[1][1]);
        f.lineTo(s.shape[2][0], s.shape[2][1]);
        f.closePath();
        f.fillStyle = "rgba(255,85,95,0.55)";
        f.fill();
        f.strokeStyle = "rgba(255,255,255,0.85)";
        f.lineWidth = 0.8;
        f.stroke();
        f.restore();
      }
      f.globalAlpha = 1;
      for (const r of rings) {
        f.strokeStyle = `rgba(255,255,255,${r.life * 0.75})`;
        f.lineWidth = 1 + 3 * r.life;
        f.beginPath();
        f.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        f.stroke();
      }
      for (const s of sparks) {
        f.fillStyle = s.red ? `rgba(255,90,96,${s.life})` : `rgba(255,255,255,${s.life})`;
        f.beginPath();
        f.arc(s.x, s.y, 1 + 2 * s.life, 0, Math.PI * 2);
        f.fill();
      }
    };

    const busy = () => rings.length > 0 || sparks.length > 0 || shards.length > 0;
    const moving = () => pointer.down || busy() || drops.some((d) => Math.abs(d.vx) + Math.abs(d.vy) > 0.05);
    const frame = () => {
      raf = 0;
      step();
      draw();
      // Frozen and fully cracked: nothing left to animate, so sleep until the next touch.
      const settledGlass = isFrozen && crackProgress() >= 1 && !busy() && !moving();
      // Under reduced motion, also stop as soon as everything settles.
      if (onScreen && !document.hidden && !settledGlass && (!still || moving() || isFrozen)) raf = requestAnimationFrame(frame);
    };
    function wake() {
      if (!raf) raf = requestAnimationFrame(frame);
    }
    // While asleep (reduced motion, or settled), still notice when the 3 s are up.
    const idleCheck = window.setInterval(() => {
      if (onScreen && !document.hidden && !isFrozen && performance.now() - lastTouch > IDLE_MS) wake();
    }, 500);

    const resize = () => {
      const rect = host.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (const c of [goo, fx]) {
        c.width = Math.round(rect.width * dpr);
        c.height = Math.round(rect.height * dpr);
      }
      if (W && drops.length)
        for (const d of drops) {
          d.x *= rect.width / W;
          d.y *= rect.height / H;
        }
      W = rect.width;
      H = rect.height;
      if (!drops.length) seed();
      if (mode === "logo") formLogo();
      if (isFrozen) buildCracks();
      draw();
      wake();
    };

    const local = (e: PointerEvent) => {
      const rect = fx.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onDown = (e: PointerEvent) => {
      const p = local(e);
      const wasFrozen = isFrozen;
      touch(p.x, p.y);
      Object.assign(pointer, { x: p.x, y: p.y, px: p.x, py: p.y, sx: p.x, sy: p.y, down: true, t0: performance.now() });
      fx.setPointerCapture(e.pointerId);
      if (mode === "logo" || wasFrozen) {
        // Breaking the glass or the logo is the whole tap; don't also start a drag.
        burst(p.x, p.y, wasFrozen ? 1.2 : 1.4);
        pointer.down = false;
      }
      wake();
    };
    const onMove = (e: PointerEvent) => {
      const p = local(e);
      pointer.x = p.x;
      pointer.y = p.y;
      if (pointer.down) lastTouch = performance.now();
    };
    const onUp = () => {
      if (!pointer.down) return;
      pointer.down = false;
      lastTouch = performance.now();
      const quick = performance.now() - pointer.t0 < 260 && Math.hypot(pointer.x - pointer.sx, pointer.y - pointer.sy) < 12;
      if (quick) burst(pointer.x, pointer.y);
    };

    fx.addEventListener("pointerdown", onDown);
    fx.addEventListener("pointermove", onMove);
    fx.addEventListener("pointerup", onUp);
    fx.addEventListener("pointercancel", onUp);
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      // Coming back into view counts as a fresh start, so it doesn't greet you already cracked.
      if (onScreen && !isFrozen) lastTouch = performance.now();
      if (onScreen) wake();
    });
    io.observe(host);
    const onVisibility = () => {
      if (!document.hidden) wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    logoImg.onload = () => mode === "logo" && formLogo();

    engine.current = {
      burst: (power) => {
        touch(W / 2, H / 2);
        burst(W / 2, H / 2, power);
      },
      toggleLogo: () => {
        touch(W / 2, H / 2);
        if (mode === "logo") {
          burst(W / 2, H / 2, 1.6);
          return false;
        }
        const ok = formLogo();
        wake();
        return ok;
      },
    };

    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(idleCheck);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      fx.removeEventListener("pointerdown", onDown);
      fx.removeEventListener("pointermove", onMove);
      fx.removeEventListener("pointerup", onUp);
      fx.removeEventListener("pointercancel", onUp);
      engine.current = null;
    };
  }, []);

  return (
    <div className="grid items-center gap-8 lg:grid-cols-[1fr_1.55fr] lg:gap-12">
      <div>
        <p className="flex items-center gap-2 text-sm font-bold text-brand">
          <span aria-hidden className="h-0.5 w-6 rounded-full bg-brand" />
          พักสมองสักนิด
        </p>
        <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
          ลาวา<span className="text-tcas-gradient">แก้ว</span> คลายเครียด
        </h2>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted sm:text-base">
          ทำการบ้านมาเหนื่อย ๆ ลองเล่นสักพัก ลาวาแก้วสีแดงจะหลอมรวมกันเหมือนของเหลวจริง
        </p>
        <ul className="mt-5 space-y-2.5 text-sm text-ink">
          {[
            { Icon: MousePointerClick, text: "แตะ ให้หยดลาวาแตกกระจาย" },
            { Icon: Hand, text: "กดค้างหรือลาก ดูดลาวาเข้าหานิ้ว แล้วปล่อยให้เหวี่ยง" },
            { Icon: Gem, text: "ปล่อยไว้ 3 วินาที ลาวาจะแข็งเป็นแก้วแล้วร้าว แตะเพื่อทุบให้แตก" },
            { Icon: Sparkles, text: "กด “รวมเป็นโลโก้” แล้วแตะเพื่อระเบิดโลโก้" },
          ].map(({ Icon, text }) => (
            <li key={text} className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                <Icon aria-hidden className="h-4 w-4" />
              </span>
              {text}
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={logo}
            onClick={() => setLogo(engine.current?.toggleLogo() ?? false)}
            className={cx(
              "inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold transition-all duration-150 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]",
              logo ? "bg-ink text-white shadow-soft" : "bg-feature-gradient text-white shadow-brand-glow hover:shadow-brand-glow-lg",
            )}
          >
            <Sparkles aria-hidden className="h-4 w-4" />
            {logo ? "ระเบิดโลโก้!" : "รวมเป็นโลโก้"}
          </button>
          <button
            type="button"
            onClick={() => engine.current?.burst(1.7)}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-bold text-ink shadow-soft-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-brand/30 hover:text-brand active:translate-y-0 active:scale-[0.98]"
          >
            <Zap aria-hidden className="h-4 w-4" />
            {frozen ? "ทุบให้แตก!" : "เขย่า!"}
          </button>
        </div>
      </div>

      <div
        ref={box}
        className="relative h-[340px] select-none overflow-hidden rounded-3xl bg-ink shadow-soft-lg sm:h-[420px]"
        style={{
          // Dots, stripes and coloured glows behind the glass, so you can see through it.
          backgroundImage: [
            "radial-gradient(rgb(255 255 255 / 0.09) 1px, transparent 1.6px)",
            "radial-gradient(45% 50% at 85% 10%, rgb(138 79 216 / 0.35), transparent 70%)",
            "radial-gradient(60% 55% at 40% 65%, rgb(219 41 49 / 0.25), transparent 70%)",
            "repeating-linear-gradient(120deg, rgb(255 255 255 / 0.035) 0 2px, transparent 2px 26px)",
          ].join(", "),
          backgroundSize: "22px 22px, auto, auto, auto",
        }}
      >
        <svg aria-hidden width="0" height="0" className="absolute">
          <defs>
            <filter id={FILTER_ID} x="-5%" y="-5%" width="110%" height="110%">
              {/* 1. Melt nearby drops into one shape (blur, then a hard alpha threshold). */}
              <feGaussianBlur in="SourceGraphic" stdDeviation="11" result="blur" />
              <feColorMatrix in="blur" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" result="goo" />
              {/* 2. Glass body: the red, but see-through. */}
              <feComposite in="SourceGraphic" in2="goo" operator="atop" result="body" />
              <feColorMatrix in="body" values="1.18 0 0 0 0.02  0 0.95 0 0 0  0 0 1.05 0 0.02  0 0 0 0.7 0" result="tint" />
              {/* 3. A thin bright rim around the edge, like the edge of a glass pane. */}
              <feMorphology in="goo" operator="erode" radius="2.2" result="inner" />
              <feComposite in="goo" in2="inner" operator="out" result="edge" />
              <feGaussianBlur in="edge" stdDeviation="0.7" result="edgeSoft" />
              <feFlood floodColor="#ffd9dc" floodOpacity="0.85" />
              <feComposite in2="edgeSoft" operator="in" result="rim" />
              {/* 4. Glossy highlights where the rounded surface catches the light (top-left). */}
              <feGaussianBlur in="goo" stdDeviation="5" result="bump" />
              <feSpecularLighting in="bump" surfaceScale="7" specularConstant="0.85" specularExponent="45" lightingColor="#ffffff" result="shine">
                <feDistantLight azimuth="225" elevation="50" />
              </feSpecularLighting>
              <feComposite in="shine" in2="goo" operator="in" result="shineIn" />
              <feMerge>
                <feMergeNode in="tint" />
                <feMergeNode in="rim" />
                <feMergeNode in="shineIn" />
              </feMerge>
            </filter>
          </defs>
        </svg>
        <canvas ref={gooRef} aria-hidden className="absolute inset-0 h-full w-full" style={{ filter: `url(#${FILTER_ID})` }} />
        {/* Once the lava has flowed into the logo, the crisp logo fades in on top: it "sets" like hard candy. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
          <div
            className={cx(
              "bg-feature-gradient h-[80%] transition-[opacity,transform] ease-out",
              logo ? "scale-100 opacity-80 delay-700 duration-500" : "scale-90 opacity-0 duration-150",
            )}
            style={{
              aspectRatio: "185 / 272",
              WebkitMask: "url(/brand/arrow-white.png) center / contain no-repeat",
              mask: "url(/brand/arrow-white.png) center / contain no-repeat",
            }}
          />
        </div>
        <canvas
          ref={fxRef}
          role="img"
          aria-label="ของเล่นลาวาแก้ว แตะเพื่อให้หยดลาวาแตก กดค้างเพื่อดูดลาวาเข้าหา ปล่อยไว้แล้วแก้วจะร้าว"
          className="absolute inset-0 h-full w-full cursor-pointer touch-none"
        />
        <span className="pointer-events-none absolute right-3 top-3 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold tabular-nums text-white backdrop-blur">
          แตะไปแล้ว {taps.toLocaleString("th-TH")} ครั้ง
        </span>
        <span
          aria-hidden={!frozen}
          className={cx(
            "pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-bold text-white backdrop-blur transition-opacity duration-500",
            frozen ? "opacity-100 delay-1000" : "opacity-0",
          )}
        >
          แก้วแข็งตัวแล้ว แตะเพื่อทุบให้แตก!
        </span>
      </div>
    </div>
  );
}
