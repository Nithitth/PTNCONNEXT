// Glass Stack block types. To add a block: add an entry (shape, size range, how often it appears).
// Sizes are in world units (the world is 400 wide); they shrink a little as the tower gets taller.

export type BlockShape = "rect" | "square" | "circle" | "triangle";

export type BlockType = {
  shape: BlockShape;
  /** Width (rect/square) or diameter (circle/triangle) range. */
  size: [number, number];
  /** Height for "rect" (ignored for other shapes). */
  height?: [number, number];
  /** Relative chance of appearing. */
  weight: number;
  /** Only appears once the tower is at least this tall (metres). */
  fromMetres?: number;
};

export const BLOCKS: BlockType[] = [
  { shape: "rect", size: [90, 140], height: [26, 36], weight: 6 },
  { shape: "square", size: [44, 62], weight: 3 },
  { shape: "rect", size: [50, 70], height: [50, 70], weight: 2 },
  { shape: "circle", size: [40, 56], weight: 1, fromMetres: 3 },
  { shape: "triangle", size: [56, 72], weight: 1, fromMetres: 6 },
];

/** Neon glass colours the blocks cycle through. */
export const GLASS = ["#ff4a5a", "#b267ff", "#4aa8ff", "#ff7ad1", "#ffb347", "#4ae0b0"];
