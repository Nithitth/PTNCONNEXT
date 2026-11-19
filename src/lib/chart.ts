// Small pure helpers for the hand-drawn SVG charts (report, war room). No chart library.

/** A round axis maximum at or above v: 1, 2, 2.5, 5 or 10 × a power of ten. */
export function niceMax(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/**
 * An SVG path through the values (null = a gap), fitted into w × h with `pad` px of margin.
 * `max` fixes the top of the scale (default: the largest value).
 */
export function linePath(values: (number | null)[], w: number, h: number, opts: { max?: number; min?: number; pad?: number } = {}): string {
  const pad = opts.pad ?? 2;
  const known = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (!known.length) return "";
  const max = opts.max ?? Math.max(...known);
  const min = opts.min ?? Math.min(0, ...known);
  const span = max - min || 1;
  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      pen = false;
      return;
    }
    const x = values.length > 1 ? pad + i * step : w / 2;
    const y = pad + (h - pad * 2) * (1 - (Math.min(max, v) - min) / span);
    d += `${pen ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    pen = true;
  });
  return d;
}

/** The y of a value on the same scale as linePath. */
export function yOf(v: number, h: number, opts: { max: number; min?: number; pad?: number }): number {
  const pad = opts.pad ?? 2;
  const min = opts.min ?? 0;
  const span = opts.max - min || 1;
  return pad + (h - pad * 2) * (1 - (Math.min(opts.max, Math.max(min, v)) - min) / span);
}

/** Radar (spider) chart points for values 0–100 around a centre, first axis at the top. */
export function radarPoints(values: (number | null)[], r: number, cx: number, cy: number): { x: number; y: number }[] {
  const n = values.length;
  return values.map((v, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const k = Math.max(0, Math.min(100, v ?? 0)) / 100;
    return { x: cx + Math.cos(a) * r * k, y: cy + Math.sin(a) * r * k };
  });
}

/** The polygon "x,y x,y …" for an SVG <polygon>. */
export const polygon = (pts: { x: number; y: number }[]) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
