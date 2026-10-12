import { customAlphabet } from 'nanoid';
import type * as Y from 'yjs';

export type Tool = 'select' | 'hand' | 'pen' | 'rect' | 'ellipse' | 'arrow' | 'text';

type ShapeBase = {
  id: string;
  /** Top-left anchor in world coordinates (pen/arrow points are relative to it). */
  x: number;
  y: number;
  rotation: number;
  stroke: string;
  strokeWidth: number;
  /** Paint order. Creation-time based, ties broken by id, so every peer sorts identically. */
  z: number;
};

export type PenShape = ShapeBase & { type: 'pen'; points: number[] };
export type RectShape = ShapeBase & { type: 'rect'; width: number; height: number };
export type EllipseShape = ShapeBase & { type: 'ellipse'; width: number; height: number };
export type ArrowShape = ShapeBase & { type: 'arrow'; points: [number, number, number, number] };
export type TextShape = ShapeBase & { type: 'text'; text: string; fontSize: number; width: number };
export type Shape = PenShape | RectShape | EllipseShape | ArrowShape | TextShape;

export type Bounds = { x: number; y: number; width: number; height: number };

/**
 * Shapes live in one Y.Map keyed by id rather than a Y.Array: concurrent edits to different
 * shapes never conflict, and an edit to one shape is a single small map entry update.
 * Shape values are treated as immutable; every change writes a new object.
 */
export const getShapesMap = (doc: Y.Doc) => doc.getMap<Shape>('shapes');

/** Transaction origin for local edits; the UndoManager tracks only this origin. */
export const LOCAL_ORIGIN = Symbol('peerboard-local');

/** Alphanumeric ids keep them safe to use as Konva node ids. */
export const newShapeId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);

export const nextZ = () => Date.now() + Math.random();

export const byZ = (a: Shape, b: Shape) => a.z - b.z || (a.id < b.id ? -1 : 1);

const boundsCache = new WeakMap<Shape, Bounds>();

function localBounds(shape: Shape): Bounds {
  switch (shape.type) {
    case 'rect':
    case 'ellipse':
      return { x: 0, y: 0, width: shape.width, height: shape.height };
    case 'text':
      return {
        x: 0,
        y: 0,
        width: shape.width,
        height: shape.fontSize * 1.4 * (shape.text.split('\n').length || 1),
      };
    case 'pen':
    case 'arrow': {
      let minX = 0;
      let minY = 0;
      let maxX = 0;
      let maxY = 0;
      for (let i = 0; i < shape.points.length; i += 2) {
        const px = shape.points[i]!;
        const py = shape.points[i + 1]!;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
  }
}

/** World-space axis-aligned bounds, including rotation and stroke. Cached per shape object. */
export function shapeBounds(shape: Shape): Bounds {
  const cached = boundsCache.get(shape);
  if (cached) return cached;

  const local = localBounds(shape);
  const pad = shape.strokeWidth * 2;
  const rad = (shape.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const corners = [
    [local.x, local.y],
    [local.x + local.width, local.y],
    [local.x, local.y + local.height],
    [local.x + local.width, local.y + local.height],
  ].map(([cx, cy]) => [shape.x + cx! * cos - cy! * sin, shape.y + cx! * sin + cy! * cos] as const);

  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const bounds = {
    x: Math.min(...xs) - pad,
    y: Math.min(...ys) - pad,
    width: Math.max(...xs) - Math.min(...xs) + pad * 2,
    height: Math.max(...ys) - Math.min(...ys) + pad * 2,
  };
  boundsCache.set(shape, bounds);
  return bounds;
}

export const intersects = (a: Bounds, b: Bounds) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

export function unionBounds(shapes: Shape[]): Bounds | null {
  if (shapes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const shape of shapes) {
    const b = shapeBounds(shape);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Bakes a Konva transform (scale from the Transformer) into the shape's geometry. */
export function applyTransform(
  shape: Shape,
  t: { x: number; y: number; rotation: number; scaleX: number; scaleY: number },
): Shape {
  const base = { x: t.x, y: t.y, rotation: t.rotation };
  const scalePoints = (points: number[]) =>
    points.map((v, i) => (i % 2 === 0 ? v * t.scaleX : v * t.scaleY));

  switch (shape.type) {
    case 'rect':
    case 'ellipse':
      return {
        ...shape,
        ...base,
        width: Math.max(2, shape.width * Math.abs(t.scaleX)),
        height: Math.max(2, shape.height * Math.abs(t.scaleY)),
      };
    case 'text':
      return {
        ...shape,
        ...base,
        width: Math.max(24, shape.width * Math.abs(t.scaleX)),
        fontSize: Math.max(8, Math.round(shape.fontSize * Math.abs(t.scaleY))),
      };
    case 'pen':
      return { ...shape, ...base, points: scalePoints(shape.points) };
    case 'arrow':
      return { ...shape, ...base, points: scalePoints(shape.points) as ArrowShape['points'] };
  }
}

export const STROKE_COLORS = [
  '#0f172a',
  '#2c4cd9',
  '#0f766e',
  '#15803d',
  '#b45309',
  '#be123c',
  '#7c3aed',
  '#64748b',
] as const;

export const STROKE_WIDTHS = [2, 4, 8] as const;
