"use client";

import { useEffect, useRef, useState } from "react";
import Matter from "matter-js";
import { Heart, RotateCcw, Trophy } from "lucide-react";
import { buttonStyles, cx } from "@/components/ui";
import { BLOCKS, GLASS, type BlockType } from "./blocks";

// ตึกแก้ว (Glass Stack): a crane swings a glowing jelly-glass block; tap to drop it. Stack as high as
// you can. Real physics (matter-js) for sliding and tipping; the jelly squash and jiggle is drawn on top.
// Challenge grows with height: faster, wider swing, smaller blocks, an auto-drop timer, and wind from 8 m.
// When a block falls off the platform, the tower shatters.
//
// World units: 400 wide, y grows downward, the platform's top is y = 0, 40 units = 1 metre.

const W = 400;
const UNIT = 40;
const BEST_KEY = "ptn-glass-stack-best";
const LIVES = 3;
/** The glowing lake under the platform; a block that falls into it costs a heart. */
const LAKE = 125;

type Phase = "ready" | "aim" | "falling" | "crashing" | "over";
type Spark = { x: number; y: number; vx: number; vy: number; life: number; colour: string };
type Shard = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; size: number; life: number; colour: string };
type Popup = { x: number; y: number; text: string; life: number };

/** Phone buzz, only after the player has touched the page (browsers block it before). */
const buzz = (pattern: number | number[]) => {
  if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(pattern);
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function pickBlock(metres: number): BlockType {
  const pool = BLOCKS.filter((b) => (b.fromMetres ?? 0) <= metres);
  let roll = Math.random() * pool.reduce((s, b) => s + b.weight, 0);
  for (const b of pool) if ((roll -= b.weight) <= 0) return b;
  return pool[0];
}

function readBest() {
  try {
    return Number(window.localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function GlassStack() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [metres, setMetres] = useState(0);
  const [count, setCount] = useState(0);
  const [best, setBest] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const [perfects, setPerfects] = useState(0);
  const [hearts, setHearts] = useState(LIVES);
  const api = useRef<{ drop: () => void; restart: () => void } | null>(null);

  useEffect(() => {
    // Read the saved best after the first paint (it lives in the browser, not on the server).
    const firstBest = requestAnimationFrame(() => setBest(readBest()));
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ── Sizing ──
    let cssW = 0;
    let cssH = 0;
    let s = 1; // pixels per world unit
    let VH = 0; // viewport height in world units
    const resize = () => {
      cssW = wrap.clientWidth;
      cssH = Math.round(Math.max(440, Math.min(window.innerHeight * 0.74, cssW * 1.45, 760)));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.height = `${cssH}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      s = cssW / W;
      VH = cssH / s;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // ── Physics ──
    const engine = Matter.Engine.create({ positionIterations: 12, velocityIterations: 10 });
    engine.gravity.y = 1;
    const ground = Matter.Bodies.rectangle(W / 2, 22, 260, 44, { isStatic: true, friction: 1, chamfer: { radius: 6 } });
    Matter.Composite.add(engine.world, ground);

    let blocks: Matter.Body[] = [];
    const colourOf = new Map<number, string>();
    let current: Matter.Body | null = null;
    let next = { type: pickBlock(0), colour: GLASS[0], w: 0, h: 0 };
    let colourIndex = 0;
    let state: Phase = "ready";
    let t = 0;
    let swing = 0;
    let settleFrames = 0;
    let dropAt = 0;
    let crashAt = 0;
    let camTop = -VH * 0.68;
    let shake = 0;
    let towerTop = 0;
    let bestHeight = readBest();
    let combo = 0;
    let sparks: Spark[] = [];
    let shards: Shard[] = [];
    let popups: Popup[] = [];
    // Jelly: each block jiggles (squash amount + phase), bumped by impacts.
    const wobble = new Map<number, { amp: number; phase: number }>();
    const jiggle = (b: Matter.Body, amount: number) => {
      const w = wobble.get(b.id) ?? { amp: 0, phase: 0 };
      w.amp = Math.min(0.28, w.amp + amount);
      wobble.set(b.id, w);
    };
    const goldUntil = new Map<number, number>();
    let rings: { x: number; y: number; r: number; grow: number; life: number; colour: string }[] = [];
    let aimStart = 0;
    let wind = 0;
    let lastMilestone = 0;
    let flash = 0;
    let banner: { text: string; life: number } | null = null;
    let perfectCount = 0;
    let lives = LIVES;
    const bokeh = Array.from({ length: 22 }, () => ({ x: rand(0, 1), y: rand(0, 1), r: rand(10, 34), sp: rand(0.0003, 0.0011), hue: Math.floor(rand(0, GLASS.length)) }));
    const streaks = Array.from({ length: 26 }, () => ({ x: rand(0, W), y: rand(0, 1), len: rand(18, 46), sp: rand(0.6, 1.4) }));
    const stars = Array.from({ length: 90 }, () => ({ x: rand(0, W), y: rand(-6000, 0), r: rand(0.6, 1.8), tw: rand(0, 6) }));

    const sizeNext = () => {
      const m = Math.max(0, -towerTop) / UNIT;
      const type = pickBlock(m);
      const shrink = Math.max(0.72, 1 - m * 0.008);
      const w = rand(type.size[0], type.size[1]) * shrink;
      const h = type.shape === "rect" && type.height ? rand(type.height[0], type.height[1]) : w;
      colourIndex = (colourIndex + 1) % GLASS.length;
      next = { type, colour: GLASS[colourIndex], w, h };
    };
    sizeNext();

    const craneY = () => camTop + 70;
    // The swing starts narrow (always over the platform) and widens as the tower grows.
    const craneX = () => W / 2 + Math.sin(swing) * Math.min(140, 60 + (Math.max(0, -towerTop) / UNIT) * 5);

    const makeBody = (x: number, y: number) => {
      const opts = { friction: 0.95, frictionStatic: 1.4, restitution: 0.06, density: 0.002, frictionAir: 0.008 };
      const { type, w, h } = next;
      if (type.shape === "circle") return Matter.Bodies.circle(x, y, w / 2, opts);
      if (type.shape === "triangle") return Matter.Bodies.polygon(x, y, 3, w / 2, opts);
      return Matter.Bodies.rectangle(x, y, w, h, { ...opts, chamfer: { radius: Math.min(12, h / 3) } });
    };

    const updateHeight = () => {
      let top = 0;
      for (const b of blocks) if (b.position.y < 60) top = Math.min(top, b.bounds.min.y);
      towerTop = top;
      const m = Math.round((Math.max(0, -top) / UNIT) * 10) / 10;
      setMetres(m);
      return m;
    };

    const drop = () => {
      if (state === "ready") {
        state = "aim";
        setPhase("aim");
        aimStart = t;
        return;
      }
      if (state !== "aim") return;
      const body = makeBody(craneX(), craneY() + next.h / 2 + 18);
      colourOf.set(body.id, next.colour);
      Matter.Composite.add(engine.world, body);
      blocks.push(body);
      current = body;
      state = "falling";
      setPhase("falling");
      settleFrames = 0;
      dropAt = t;
      setCount(blocks.length);
    };

    const shatterAll = () => {
      for (const b of blocks) {
        const colour = colourOf.get(b.id) ?? GLASS[0];
        const pieces = reduce ? 3 : 9;
        for (let i = 0; i < pieces; i++) {
          const a = rand(0, Math.PI * 2);
          const sp = rand(2, 7);
          shards.push({
            x: b.position.x + rand(-12, 12),
            y: b.position.y + rand(-10, 10),
            vx: Math.cos(a) * sp + b.velocity.x,
            vy: Math.sin(a) * sp - 3 + b.velocity.y,
            rot: rand(0, 6.3),
            vr: rand(-0.3, 0.3),
            size: rand(4, 11),
            life: 1,
            colour,
          });
        }
        Matter.Composite.remove(engine.world, b);
      }
      blocks = [];
      flash = reduce ? 0 : 0.85;
      buzz([30, 40, 60]);
    };

    const restart = () => {
      for (const b of blocks) Matter.Composite.remove(engine.world, b);
      blocks = [];
      colourOf.clear();
      current = null;
      shards = [];
      sparks = [];
      popups = [];
      towerTop = 0;
      combo = 0;
      camTop = -VH * 0.68;
      wobble.clear();
      goldUntil.clear();
      rings = [];
      banner = null;
      lastMilestone = 0;
      perfectCount = 0;
      setPerfects(0);
      lives = LIVES;
      setHearts(LIVES);
      sizeNext();
      state = "aim";
      setPhase("aim");
      aimStart = t;
      setMetres(0);
      setCount(0);
      setNewBest(false);
    };
    api.current = { drop, restart };

    Matter.Events.on(engine, "collisionStart", (e) => {
      for (const pair of e.pairs) {
        const hit = Math.hypot(pair.bodyA.velocity.x - pair.bodyB.velocity.x, pair.bodyA.velocity.y - pair.bodyB.velocity.y);
        for (const b of [pair.bodyA, pair.bodyB]) if (colourOf.has(b.id)) jiggle(b, Math.min(0.22, hit * 0.03));
        const isCurrent = pair.bodyA === current || pair.bodyB === current;
        if (!isCurrent) continue;
        const speed = current ? Math.hypot(current.velocity.x, current.velocity.y) : 0;
        if (speed < 1.2) continue;
        // The whole tower wobbles a little when a block lands.
        for (const b of blocks) if (b !== current) jiggle(b, Math.min(0.06, speed * 0.008));
        const lp = pair.collision.supports[0] ?? current!.position;
        rings.push({ x: lp.x, y: lp.y, r: 6, grow: 2.6, life: 1, colour: colourOf.get(current!.id) ?? "#fff" });
        const p = pair.collision.supports[0] ?? current!.position;
        const colour = colourOf.get(current!.id) ?? "#fff";
        for (let i = 0; i < (reduce ? 3 : 10); i++) {
          const a = rand(Math.PI, Math.PI * 2);
          sparks.push({ x: p.x, y: p.y, vx: Math.cos(a) * rand(1, 4), vy: Math.sin(a) * rand(1, 3.5), life: 1, colour });
        }
        buzz(8);
      }
    });

    // ── Drawing helpers ──
    const pathOf = (b: Matter.Body) => {
      ctx.beginPath();
      const v = b.vertices;
      ctx.moveTo(v[0].x, v[0].y);
      for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
      ctx.closePath();
    };

    const drawGlass = (draw: () => void, colour: string, bounds: { minX: number; minY: number; maxX: number; maxY: number }, alpha = 1) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      // Body: see-through colour.
      draw();
      const g = ctx.createLinearGradient(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY);
      g.addColorStop(0, `${colour}cc`);
      g.addColorStop(1, `${colour}55`);
      ctx.fillStyle = g;
      ctx.fill();
      // Glow rim.
      ctx.shadowColor = colour;
      ctx.shadowBlur = 16;
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = colour;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.stroke();
      // Gloss: a soft white sheen across the top-left.
      ctx.save();
      draw();
      ctx.clip();
      const gl = ctx.createLinearGradient(bounds.minX, bounds.minY, bounds.minX + (bounds.maxX - bounds.minX) * 0.6, bounds.maxY);
      gl.addColorStop(0, "rgba(255,255,255,0.55)");
      gl.addColorStop(0.35, "rgba(255,255,255,0.08)");
      gl.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gl;
      ctx.fillRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
      ctx.restore();
      ctx.restore();
    };

    // A block's outline, squashed (anchored at its bottom) and rippled by its jiggle, drawn with smooth curves.
    const jellyPath = (b: Matter.Body) => () => {
      const w = wobble.get(b.id);
      const amp = w ? w.amp : 0;
      const ph = w ? w.phase : 0;
      const sq = amp * Math.sin(ph);
      const cx = b.position.x;
      const base = b.bounds.max.y;
      const pts = b.vertices.map((v, i) => {
        const rip = 1 + amp * 0.3 * Math.sin(ph * 1.6 + i * 1.3);
        const x = cx + (v.x - cx) * (1 + sq) * rip;
        const y = base + (v.y - base) * (1 - sq) * (2 - rip);
        return { x, y };
      });
      const n = pts.length;
      const mid = (a: { x: number; y: number }, c: { x: number; y: number }) => ({ x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 });
      ctx.beginPath();
      const m0 = mid(pts[n - 1], pts[0]);
      ctx.moveTo(m0.x, m0.y);
      for (let i = 0; i < n; i++) {
        const m = mid(pts[i], pts[(i + 1) % n]);
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, m.x, m.y);
      }
      ctx.closePath();
    };

    const drawJelly = (b: Matter.Body, alpha: number) => {
      const colour = colourOf.get(b.id) ?? GLASS[0];
      const bounds = { minX: b.bounds.min.x - 6, minY: b.bounds.min.y - 6, maxX: b.bounds.max.x + 6, maxY: b.bounds.max.y + 6 };
      drawGlass(jellyPath(b), colour, bounds, alpha);
      // Little bubbles suspended in the jelly.
      ctx.save();
      jellyPath(b)();
      ctx.clip();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      const seed = b.id * 7.13;
      for (let i = 0; i < 3; i++) {
        const bx = b.position.x + Math.sin(seed + i * 2.1) * (b.bounds.max.x - b.bounds.min.x) * 0.28;
        const by = b.position.y + Math.cos(seed + i * 1.7) * (b.bounds.max.y - b.bounds.min.y) * 0.22 + Math.sin(t * 0.03 + i) * 1.5;
        ctx.beginPath();
        ctx.arc(bx, by, 1.4 + (i % 2), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      // Gold rim after a perfect drop.
      const g = goldUntil.get(b.id);
      if (g && g > t) {
        ctx.save();
        jellyPath(b)();
        ctx.globalAlpha = Math.min(1, (g - t) / 30);
        ctx.shadowColor = "#ffd27a";
        ctx.shadowBlur = 22;
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#ffd27a";
        ctx.stroke();
        ctx.restore();
      }
    };

    const previewPath = (x: number, y: number) => () => {
      const { type, w, h } = next;
      ctx.beginPath();
      if (type.shape === "circle") ctx.arc(x, y, w / 2, 0, Math.PI * 2);
      else if (type.shape === "triangle") {
        const r = w / 2;
        for (let i = 0; i < 3; i++) {
          const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
          if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
          else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        ctx.closePath();
      } else ctx.roundRect(x - w / 2, y - h / 2, w, h, 5);
    };

    // ── Loop ──
    let raf = 0;
    let running = true;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!running) return;
      t++;
      const m = Math.max(0, -towerTop) / UNIT;
      swing += Math.min(0.045, 0.016 + m * 0.0009);

      for (const [id, w] of wobble) {
        w.amp *= 0.93;
        w.phase += 0.42;
        if (w.amp < 0.002) wobble.delete(id);
      }

      // Wind from 12 m: a slowly changing, gentle side push on the falling block.
      wind = m >= 12 ? Math.sin(t * 0.008) * Math.min(0.0004, 0.0001 + (m - 12) * 0.00002) : 0;
      if (state === "falling" && current && wind) Matter.Body.applyForce(current, current.position, { x: wind * current.mass, y: 0 });

      // Auto-drop timer (from the second block): 4.5 s, then 3.5 s from 10 m.
      const aimLimit = m >= 10 ? 210 : 270;
      if (state === "aim" && blocks.length > 0 && t - aimStart > aimLimit) drop();

      // Physics: slow motion while the tower crashes.
      const slow = state === "crashing" && !reduce ? 0.3 : 1;
      Matter.Engine.update(engine, (1000 / 60) * slow);

      if (state === "falling" && current) {
        const still = current.speed < 0.22 && Math.abs(current.angularVelocity) < 0.015;
        settleFrames = still ? settleFrames + 1 : 0;
        if (settleFrames > 18 || t - dropAt > 210) {
          // Perfect drop: landed (almost) dead centre on the block below.
          const below = blocks
            .filter((b) => b !== current && b.position.y > current!.position.y)
            .sort((a, b) => a.position.y - b.position.y)[0];
          const target = below ? below.position.x : W / 2;
          if (Math.abs(current.position.x - target) < 6) {
            combo++;
            perfectCount++;
            setPerfects(perfectCount);
            goldUntil.set(current.id, t + 80);
            rings.push({ x: current.position.x, y: current.position.y, r: 10, grow: 4.5, life: 1, colour: "#ffd27a" });
            flash = reduce ? 0 : 0.18;
            for (const b of blocks) jiggle(b, 0.08);
            popups.push({ x: current.position.x, y: current.bounds.min.y - 10, text: combo > 1 ? `เป๊ะ! ×${combo}` : "เป๊ะ!", life: 1 });
            buzz([10, 30, 10]);
          } else combo = 0;
          const h = updateHeight();
          if (h > bestHeight && h > 0) popups.push({ x: W / 2, y: towerTop - 40, text: "สูงสุดใหม่!", life: 1 });
          const mile = Math.floor(h / 5) * 5;
          if (mile > lastMilestone) {
            lastMilestone = mile;
            banner = { text: `${mile} เมตร!`, life: 1 };
            buzz([15, 40, 15, 40, 30]);
            // Fireworks around the top of the tower.
            for (let k = 0; k < (reduce ? 1 : 3); k++) {
              const fx = rand(60, W - 60);
              const fy = towerTop - rand(60, 160);
              const colour = GLASS[Math.floor(rand(0, GLASS.length))];
              for (let i = 0; i < 36; i++) {
                const a = (i / 36) * Math.PI * 2;
                const sp = rand(2.5, 4.5);
                sparks.push({ x: fx, y: fy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.6, colour });
              }
            }
          }
          current = null;
          sizeNext();
          state = "aim";
          setPhase("aim");
          aimStart = t;
        }
      }

      // A block that falls into the lake splashes and costs a heart. The round ends on the last heart.
      const fallen = state === "aim" || state === "falling" ? blocks.filter((b) => b.position.y > LAKE + 10) : [];
      if (fallen.length && lives > 1) {
        lives--;
        setHearts(lives);
        for (const b of fallen) {
          const colour = colourOf.get(b.id) ?? GLASS[0];
          rings.push({ x: b.position.x, y: LAKE, r: 8, grow: 3.5, life: 1, colour });
          for (let i = 0; i < (reduce ? 4 : 18); i++) {
            const a = rand(Math.PI * 1.15, Math.PI * 1.85);
            sparks.push({ x: b.position.x, y: LAKE, vx: Math.cos(a) * rand(1, 3.5), vy: Math.sin(a) * rand(2, 5), life: 1.2, colour });
          }
          Matter.Composite.remove(engine.world, b);
          if (b === current) current = null;
        }
        blocks = blocks.filter((b) => !fallen.includes(b));
        setCount(blocks.length);
        popups.push({ x: W / 2, y: towerTop - 30, text: `หัวใจ -1 (เหลือ ${lives})`, life: 1 });
        shake = reduce ? 0 : 6;
        buzz([20, 30, 20]);
        updateHeight();
        if (state === "falling" && !current) {
          sizeNext();
          state = "aim";
          setPhase("aim");
          aimStart = t;
        }
      } else if (fallen.length) {
        lives = 0;
        setHearts(0);
        state = "crashing";
        setPhase("crashing");
        crashAt = t;
        shake = reduce ? 0 : 16;
        const h = Math.round((Math.max(0, -towerTop) / UNIT) * 10) / 10;
        if (h > bestHeight) {
          bestHeight = h;
          setBest(h);
          setNewBest(true);
          try {
            window.localStorage.setItem(BEST_KEY, String(h));
          } catch {
            // storage blocked: best stays for this visit
          }
        }
      }
      if (state === "crashing" && t - crashAt > (reduce ? 10 : 55) && blocks.length) shatterAll();
      if (state === "crashing" && t - crashAt > (reduce ? 20 : 110)) {
        state = "over";
        setPhase("over");
      }

      // Camera follows the top of the tower.
      const want = Math.min(-VH * 0.68, towerTop - VH * 0.48);
      camTop += (want - camTop) * 0.06;
      shake *= 0.9;

      // ── Draw ──
      ctx.save();
      ctx.clearRect(0, 0, cssW, cssH);
      // Sky darkens into space the higher you go.
      const k = Math.min(1, m / 25);
      const sky = ctx.createLinearGradient(0, 0, 0, cssH);
      sky.addColorStop(0, `rgb(${Math.round(70 - 58 * k)},${Math.round(18 - 8 * k)},${Math.round(70 - 30 * k)})`);
      sky.addColorStop(1, `rgb(${Math.round(26 - 14 * k)},${Math.round(10 - 4 * k)},${Math.round(40 - 18 * k)})`);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, cssW, cssH);

      // Aurora ribbons, stronger the higher you build.
      if (!reduce || t % 4 === 0) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const ribbons = ["#ff4a5a", "#b267ff", "#4ae0b0"];
        for (let i = 0; i < 3; i++) {
          const baseY = cssH * (0.18 + i * 0.13);
          const g = ctx.createLinearGradient(0, baseY - 60, 0, baseY + 60);
          g.addColorStop(0, "rgba(0,0,0,0)");
          g.addColorStop(0.5, `${ribbons[i]}${Math.round((0.1 + k * 0.14) * 255).toString(16).padStart(2, "0")}`);
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(0, cssH);
          for (let x = 0; x <= cssW; x += 16) {
            const y = baseY + Math.sin(x * 0.012 + t * 0.012 + i * 1.7) * 26 + Math.sin(x * 0.03 - t * 0.02 + i) * 9;
            ctx.lineTo(x, y);
          }
          ctx.lineTo(cssW, cssH);
          ctx.closePath();
          ctx.globalAlpha = 0.9;
          ctx.fill();
        }
        // Soft drifting bokeh lights.
        for (const b of bokeh) {
          b.y -= b.sp;
          if (b.y < -0.1) b.y = 1.1;
          const bx = b.x * cssW + Math.sin(t * 0.004 + b.r) * 12;
          const by = b.y * cssH;
          const rg = ctx.createRadialGradient(bx, by, 0, bx, by, b.r);
          rg.addColorStop(0, `${GLASS[b.hue]}2e`);
          rg.addColorStop(1, `${GLASS[b.hue]}00`);
          ctx.fillStyle = rg;
          ctx.globalAlpha = 1;
          ctx.fillRect(bx - b.r, by - b.r, b.r * 2, b.r * 2);
        }
        ctx.restore();
      }

      if (shake > 0.3) ctx.translate(rand(-shake, shake), rand(-shake, shake));
      ctx.scale(s, s);
      ctx.translate(0, -camTop);

      // Stars (fade in with height, slow parallax).
      for (const st of stars) {
        const y = st.y + camTop * 0.7;
        if (y < camTop - 10 || y > camTop + VH) continue;
        ctx.globalAlpha = Math.min(1, 0.15 + k) * (0.55 + 0.45 * Math.sin(t * 0.03 + st.tw));
        ctx.fillStyle = "#fff";
        ctx.fillRect(st.x, y, st.r, st.r);
      }
      ctx.globalAlpha = 1;

      // Height marks every 5 m, and your best in gold.
      ctx.font = "bold 11px Anuphan, sans-serif";
      for (let mm = 5; mm * UNIT < -camTop + 40; mm += 5) {
        const y = -mm * UNIT;
        if (y < camTop || y > camTop + VH) continue;
        ctx.strokeStyle = "rgba(255,255,255,0.14)";
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.fillText(`${mm} m`, 6, y - 4);
      }
      if (bestHeight > 0) {
        const y = -bestHeight * UNIT;
        ctx.strokeStyle = "rgba(255,200,80,0.8)";
        ctx.shadowColor = "#ffc850";
        ctx.shadowBlur = 8;
        ctx.setLineDash([10, 6]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#ffd27a";
        ctx.fillText(`สถิติ ${bestHeight.toFixed(1)} m`, W - 92, y - 5);
      }

      // The glowing lake below, with a soft reflection of the tower.
      const lakeG = ctx.createLinearGradient(0, LAKE, 0, LAKE + 260);
      lakeG.addColorStop(0, "rgba(90,40,150,0.55)");
      lakeG.addColorStop(1, "rgba(10,6,30,0.95)");
      ctx.fillStyle = lakeG;
      ctx.fillRect(0, LAKE, W, 400);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, LAKE, W, 400);
      ctx.clip();
      ctx.translate(0, LAKE * 2);
      ctx.scale(1, -1);
      ctx.globalAlpha = 0.2;
      for (const b of blocks) if (b.position.y > -260) drawJelly(b, 1);
      ctx.restore();
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 7; i++) {
        const y = LAKE + 6 + i * 11;
        ctx.strokeStyle = `rgba(255,255,255,${0.12 - i * 0.014})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= W; x += 10) {
          const yy = y + Math.sin(x * 0.05 + t * 0.05 + i) * 1.6;
          if (x === 0) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      ctx.restore();
      // Glass pillar holding the platform.
      ctx.save();
      const pg = ctx.createLinearGradient(W / 2 - 50, 0, W / 2 + 50, 0);
      pg.addColorStop(0, "rgba(255,255,255,0.08)");
      pg.addColorStop(0.5, "rgba(255,255,255,0.22)");
      pg.addColorStop(1, "rgba(255,255,255,0.05)");
      ctx.fillStyle = pg;
      ctx.fillRect(W / 2 - 50, 40, 100, LAKE - 40);
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.strokeRect(W / 2 - 50, 40, 100, LAKE - 40);
      ctx.restore();

      // Coloured light each block casts on the sky behind it.
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const b of blocks) {
        const colour = colourOf.get(b.id) ?? GLASS[0];
        const r = 70;
        const hg = ctx.createRadialGradient(b.position.x, b.position.y, 0, b.position.x, b.position.y, r);
        hg.addColorStop(0, `${colour}40`);
        hg.addColorStop(1, `${colour}00`);
        ctx.fillStyle = hg;
        ctx.fillRect(b.position.x - r, b.position.y - r, r * 2, r * 2);
      }
      ctx.restore();

      // Platform.
      drawGlass(() => pathOf(ground), "#ffffff", { minX: ground.bounds.min.x, minY: ground.bounds.min.y, maxX: ground.bounds.max.x, maxY: ground.bounds.max.y }, 0.55);

      // Blocks.
      for (const b of blocks) drawJelly(b, b === current ? 1 : 0.92);

      // Crane + the next block.
      if (state === "aim" || state === "ready") {
        const x = craneX();
        const y = craneY();
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, camTop + 22);
        ctx.lineTo(W, camTop + 22);
        ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,0.7)";
        ctx.beginPath();
        ctx.moveTo(x, camTop + 22);
        ctx.lineTo(x, y + 18 - 2);
        ctx.stroke();
        const by = y + next.h / 2 + 18;
        // Drop guide
        ctx.strokeStyle = `${next.colour}55`;
        ctx.setLineDash([3, 7]);
        ctx.beginPath();
        ctx.moveTo(x, by + next.h / 2);
        ctx.lineTo(x, Math.min(towerTop, 0));
        ctx.stroke();
        ctx.setLineDash([]);
        if (blocks.length > 0) {
          // Auto-drop timer: a small dial on the crane hook that runs out.
          const left = Math.max(0, 1 - (t - aimStart) / aimLimit);
          ctx.save();
          ctx.lineWidth = 3;
          ctx.strokeStyle = left < 0.3 ? "#ff4a5a" : "rgba(255,255,255,0.75)";
          ctx.shadowColor = ctx.strokeStyle;
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(x, y + 4, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
          ctx.stroke();
          ctx.restore();
        }
        drawGlass(previewPath(x, by), next.colour, { minX: x - next.w / 2, minY: by - next.h / 2, maxX: x + next.w / 2, maxY: by + next.h / 2 }, 0.75 + 0.25 * Math.sin(t * 0.12));
      }

      // Landing / perfect rings.
      rings = rings.filter((r) => (r.life -= 0.03) > 0);
      for (const r of rings) {
        r.r += r.grow;
        ctx.save();
        ctx.globalAlpha = r.life;
        ctx.strokeStyle = r.colour;
        ctx.shadowColor = r.colour;
        ctx.shadowBlur = 12;
        ctx.lineWidth = 2.5 * r.life;
        ctx.beginPath();
        ctx.ellipse(r.x, r.y, r.r, r.r * 0.35, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Wind streaks.
      if (Math.abs(wind) > 0.00005) {
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.22)";
        ctx.lineWidth = 1.2;
        const dir = Math.sign(wind);
        for (const st of streaks) {
          st.x += dir * st.sp * (2 + Math.abs(wind) * 6000);
          if (st.x > W + 50) st.x = -50;
          if (st.x < -50) st.x = W + 50;
          const y = camTop + st.y * VH;
          ctx.beginPath();
          ctx.moveTo(st.x, y);
          ctx.lineTo(st.x - dir * st.len, y);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Sparks.
      ctx.globalCompositeOperation = "lighter";
      sparks = sparks.filter((p) => (p.life -= 0.03) > 0);
      for (const p of sparks) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.12;
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.colour;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      // Shards.
      shards = shards.filter((p) => (p.life -= 0.008) > 0 && p.y < camTop + VH + 200);
      for (const p of shards) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.25;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.min(1, p.life * 1.5);
        ctx.shadowColor = p.colour;
        ctx.shadowBlur = 10;
        ctx.fillStyle = `${p.colour}bb`;
        ctx.beginPath();
        ctx.moveTo(0, -p.size);
        ctx.lineTo(p.size * 0.8, p.size * 0.6);
        ctx.lineTo(-p.size * 0.7, p.size * 0.4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;

      // Floating words ("เป๊ะ!", "สูงสุดใหม่!").
      popups = popups.filter((p) => (p.life -= 0.012) > 0);
      ctx.font = "800 18px Anuphan, sans-serif";
      ctx.textAlign = "center";
      for (const p of popups) {
        ctx.globalAlpha = Math.min(1, p.life * 2);
        ctx.fillStyle = "#fff";
        ctx.shadowColor = "#ff4a5a";
        ctx.shadowBlur = 14;
        ctx.fillText(p.text, p.x, p.y - (1 - p.life) * 40);
      }
      ctx.shadowBlur = 0;
      ctx.textAlign = "start";
      ctx.globalAlpha = 1;
      ctx.restore();

      // Screen-space overlays: wind sign, milestone banner, flash.
      if (Math.abs(wind) > 0.00005) {
        ctx.font = "800 13px Anuphan, sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fillText(`ลม ${wind > 0 ? "→" : "←"} ${"〉".repeat(Math.min(4, Math.ceil(Math.abs(wind) / 0.00014)))}`, 12, 22);
      }
      if (banner) {
        banner.life -= 0.012;
        if (banner.life <= 0) banner = null;
        else {
          const a = Math.min(1, banner.life * 2.5);
          const sc = 1 + (1 - Math.min(1, (1 - banner.life) * 5)) * 0.4;
          ctx.save();
          ctx.globalAlpha = a;
          ctx.translate(cssW / 2, cssH * 0.28);
          ctx.scale(sc, sc);
          ctx.textAlign = "center";
          ctx.font = "800 40px Anuphan, sans-serif";
          ctx.shadowColor = "#ff4a5a";
          ctx.shadowBlur = 24;
          ctx.fillStyle = "#fff";
          ctx.fillText(banner.text, 0, 0);
          ctx.restore();
        }
      }
      if (flash > 0.01) {
        ctx.fillStyle = `rgba(255,255,255,${flash})`;
        ctx.fillRect(0, 0, cssW, cssH);
        flash *= 0.86;
      }
    };
    raf = requestAnimationFrame(frame);

    // Pause when off screen or the tab is hidden.
    const io = new IntersectionObserver(([e]) => (running = e.isIntersecting && !document.hidden));
    io.observe(canvas);
    const vis = () => (running = !document.hidden);
    document.addEventListener("visibilitychange", vis);

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(firstBest);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", vis);
      Matter.Engine.clear(engine);
      api.current = null;
    };
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (phase === "over") api.current?.restart();
      else api.current?.drop();
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-brand">ห้องเกม</p>
          <h1 className="text-tcas-gradient font-display text-3xl font-extrabold">ตึกแก้ว</h1>
        </div>
        <div className="grid w-full grid-cols-3 gap-2 text-right sm:flex sm:w-auto">
          <div className="rounded-xl border border-line bg-surface px-3 py-1.5" aria-label={`เหลือหัวใจ ${hearts} ดวง`}>
            <p className="text-[10px] font-bold text-muted">พลาดได้</p>
            <p className="flex h-7 items-center gap-0.5">
              {Array.from({ length: LIVES }, (_, i) => (
                <Heart key={i} aria-hidden className={cx("h-4 w-4 transition-transform", i < hearts ? "fill-brand text-brand" : "scale-75 text-line-strong")} />
              ))}
            </p>
          </div>
          <div className="rounded-xl border border-line bg-surface px-3 py-1.5">
            <p className="text-[10px] font-bold text-muted">ความสูง</p>
            <p className="font-display text-lg font-extrabold tabular-nums text-ink" aria-live="polite">
              {metres.toFixed(1)} m
            </p>
          </div>
          <div className="rounded-xl border border-line bg-surface px-3 py-1.5">
            <p className="flex items-center justify-end gap-1 text-[10px] font-bold text-muted">
              <Trophy aria-hidden className="h-3 w-3 text-exam" />
              สถิติ
            </p>
            <p className="font-display text-lg font-extrabold tabular-nums text-ink">{best.toFixed(1)} m</p>
          </div>
        </div>
      </div>

      <div
        ref={wrapRef}
        className="bg-feature-gradient relative overflow-hidden rounded-[28px] p-[3px] shadow-brand-glow-lg"
      >
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="img"
          aria-label={`เกมตึกแก้ว สูง ${metres.toFixed(1)} เมตร ใช้ ${count} ก้อน กด Space หรือแตะเพื่อปล่อยก้อนแก้ว`}
          onPointerDown={() => (phase === "over" ? undefined : api.current?.drop())}
          onKeyDown={onKey}
          className="block w-full cursor-pointer touch-none rounded-[25px] outline-none focus-visible:ring-4 focus-visible:ring-white/60"
        />

        {phase === "ready" && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
            <div className="animate-pop rounded-3xl border border-white/25 bg-white/10 p-6 text-center text-white shadow-soft-lg backdrop-blur-md">
              <p className="font-display text-2xl font-extrabold">แตะเพื่อเริ่ม</p>
              <p className="mt-2 text-sm text-white/85">
                แตะเพื่อปล่อยก้อนแก้ว ซ้อนให้สูงที่สุด
                <br />
                มีหัวใจ 3 ดวง ก้อนตกน้ำเสีย 1 ดวง หมดหัวใจ ตึกแตก!
              </p>
            </div>
          </div>
        )}

        {phase === "over" && (
          <div className="absolute inset-0 grid place-items-center bg-black/25 p-6">
            <div className="animate-pop w-full max-w-xs rounded-3xl bg-surface p-6 text-center shadow-soft-lg">
              <p className="text-sm font-bold text-muted">{newBest ? "สถิติใหม่!" : "ตึกถล่มแล้ว"}</p>
              <p className={cx("font-display text-5xl font-extrabold tabular-nums", newBest ? "text-tcas-gradient" : "text-ink")}>{metres.toFixed(1)} m</p>
              <p className="mt-1 text-sm text-muted">
                ซ้อนได้ {Math.max(0, count - 1)} ก้อน · เป๊ะ {perfects} ครั้ง · สถิติ {best.toFixed(1)} m
              </p>
              <button type="button" onClick={() => api.current?.restart()} className={cx(buttonStyles.primary, "mt-5 w-full")}>
                <RotateCcw aria-hidden className="h-4 w-4" />
                เล่นอีกครั้ง
              </button>
            </div>
          </div>
        )}
      </div>
      <p className="mt-3 text-center text-xs text-muted">แตะจอ หรือกด Space เพื่อปล่อย · วงนาฬิกาหมดแล้วจะปล่อยเอง · 12 m ขึ้นไปมีลม</p>
    </div>
  );
}
