import type { Context } from 'konva/lib/Context';
import type { Shape as KonvaShape } from 'konva/lib/Shape';
import { getStroke } from 'perfect-freehand';
import type { PenShape } from './model';

const outlineCache = new WeakMap<PenShape, number[][]>();

/**
 * perfect-freehand turns raw pointer samples into a pressure-like variable-width outline.
 * The outline is cached per (immutable) shape object, so panning and zooming never recompute it.
 */
function outline(shape: PenShape): number[][] {
  let cached = outlineCache.get(shape);
  if (!cached) {
    const input: number[][] = [];
    for (let i = 0; i < shape.points.length; i += 2) {
      input.push([shape.points[i]!, shape.points[i + 1]!]);
    }
    cached = getStroke(input, {
      size: shape.strokeWidth * 2,
      thinning: 0.5,
      smoothing: 0.5,
      streamline: 0.4,
      simulatePressure: true,
    });
    outlineCache.set(shape, cached);
  }
  return cached;
}

/**
 * Konva sceneFunc. Uses Konva's context API (not a raw Path2D) so the same path also feeds
 * Konva's hit graph, which keeps freehand strokes clickable and draggable.
 */
export function drawFreehand(shape: PenShape) {
  return (ctx: Context, node: KonvaShape) => {
    const pts = outline(shape);
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0]![0]!, pts[0]![1]!);
    // Quadratic curves through midpoints give a smooth outline with few vertices.
    for (let i = 1; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i]!;
      const [x1, y1] = pts[i + 1]!;
      ctx.quadraticCurveTo(x0!, y0!, (x0! + x1!) / 2, (y0! + y1!) / 2);
    }
    ctx.closePath();
    ctx.fillStrokeShape(node);
  };
}
