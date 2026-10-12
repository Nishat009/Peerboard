'use client';

import type Konva from 'konva';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Layer, Rect, Stage, Transformer } from 'react-konva';
import { useRoom } from '@/features/room/room-context';
import { cx } from '@/lib/cx';
import { isTypingTarget } from '@/lib/hooks';
import { downloadBlob } from '@/lib/peerboard-file';
import { BoardToolbar, TOOLS } from './board-toolbar';
import {
  LOCAL_ORIGIN,
  STROKE_COLORS,
  applyTransform,
  getShapesMap,
  intersects,
  newShapeId,
  nextZ,
  shapeBounds,
  unionBounds,
  type Bounds,
  type Shape,
  type TextShape,
  type Tool,
} from './model';
import { RemoteCursors, type Viewport } from './remote-cursors';
import { ShapeNode } from './shape-node';
import { useElementSize } from './use-element-size';
import { useShapes } from './use-shapes';
import { useUndo } from './use-undo';
import { ZoomControls } from './zoom-controls';

type Point = { x: number; y: number };
type Drawing = { start: Point; shape: Shape; points: number[] };

const MIN_SCALE = 0.1;
const MAX_SCALE = 8;
const CURSOR_THROTTLE_MS = 40;
/** Extra world-space margin around the viewport before a shape is culled. */
const CULL_MARGIN = 200;
const EMPTY: ReadonlySet<string> = new Set();

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const rectFrom = (a: Point, b: Point): Bounds => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(a.x - b.x),
  height: Math.abs(a.y - b.y),
});
const fontSizeFor = (strokeWidth: number) => 16 + strokeWidth * 2;

export default function Whiteboard() {
  const { doc, awareness } = useRoom();
  const shapesMap = useMemo(() => getShapesMap(doc), [doc]);
  const shapes = useShapes(shapesMap);
  const history = useUndo(shapesMap);

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const contentLayerRef = useRef<Konva.Layer>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const size = useElementSize(containerRef);

  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState<string>(STROKE_COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [selected, setSelected] = useState<ReadonlySet<string>>(EMPTY);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const [marquee, setMarquee] = useState<Bounds | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Hot-path state lives in refs: pointermove must not trigger React renders.
  const drawing = useRef<Drawing | null>(null);
  const marqueeStart = useRef<Point | null>(null);
  const commitFrame = useRef(0);
  const lastCursorSent = useRef(0);
  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const panning = tool === 'hand' || spaceHeld;

  const transact = useCallback((fn: () => void) => doc.transact(fn, LOCAL_ORIGIN), [doc]);

  const worldPointer = (): Point | null => stageRef.current?.getRelativePointerPosition() ?? null;

  // ---------- drawing ----------

  const buildShape = (d: Drawing): Shape =>
    d.shape.type === 'pen' ? { ...d.shape, points: d.points.slice() } : d.shape;

  const commitDrawing = useCallback(() => {
    commitFrame.current = 0;
    const d = drawing.current;
    if (d) transact(() => shapesMap.set(d.shape.id, buildShape(d)));
  }, [shapesMap, transact]);

  const scheduleCommit = () => {
    // Batch pointer samples: at most one Yjs update (and one network frame) per animation frame.
    if (!commitFrame.current) commitFrame.current = requestAnimationFrame(commitDrawing);
  };

  const finishDrawing = useCallback(() => {
    const d = drawing.current;
    if (!d) return;
    cancelAnimationFrame(commitFrame.current);
    commitDrawing();
    drawing.current = null;

    const s = d.shape;
    const degenerate =
      ((s.type === 'rect' || s.type === 'ellipse') && s.width < 3 && s.height < 3) ||
      (s.type === 'arrow' && Math.hypot(s.points[2], s.points[3]) < 4);
    if (degenerate) transact(() => shapesMap.delete(s.id));
    history.checkpoint();
  }, [commitDrawing, history, shapesMap, transact]);

  const finishMarquee = useCallback(
    (additive: boolean) => {
      const start = marqueeStart.current;
      const end = worldPointer();
      marqueeStart.current = null;
      setMarquee(null);
      if (!start || !end) return;
      const area = rectFrom(start, end);
      if (area.width < 2 && area.height < 2) return;
      const hits = [...shapesMap.values()].filter((s) => intersects(shapeBounds(s), area));
      setSelected((prev) => new Set([...(additive ? prev : []), ...hits.map((s) => s.id)]));
    },
    [shapesMap],
  );

  const handlePointerDown = (e: Konva.KonvaEventObject<PointerEvent>) => {
    if (panning || e.evt.button > 0) return;
    const stage = stageRef.current;
    const pos = worldPointer();
    if (!stage || !pos) return;

    if (tool === 'select') {
      const target = e.target;
      if (target.getParent()?.getClassName() === 'Transformer') return;
      if (target !== stage && target.hasName('shape')) {
        const id = target.id();
        setSelected((prev) => {
          if (e.evt.shiftKey) {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          }
          return prev.has(id) ? prev : new Set([id]);
        });
        return;
      }
      if (!e.evt.shiftKey) setSelected(EMPTY);
      marqueeStart.current = pos;
      setMarquee({ ...pos, width: 0, height: 0 });
      return;
    }

    const base = {
      id: newShapeId(),
      x: pos.x,
      y: pos.y,
      rotation: 0,
      stroke: color,
      strokeWidth,
      z: nextZ(),
    };

    if (tool === 'text') {
      const text: TextShape = {
        ...base,
        type: 'text',
        text: '',
        fontSize: fontSizeFor(strokeWidth),
        width: 260,
      };
      transact(() => shapesMap.set(text.id, text));
      setEditingId(text.id);
      return;
    }

    history.checkpoint();
    const shape: Shape =
      tool === 'pen'
        ? { ...base, type: 'pen', points: [0, 0] }
        : tool === 'arrow'
          ? { ...base, type: 'arrow', points: [0, 0, 0, 0] }
          : { ...base, type: tool, width: 0, height: 0 };
    drawing.current = { start: pos, shape, points: [0, 0] };
    transact(() => shapesMap.set(shape.id, shape));
  };

  const broadcastCursor = (pos: Point | null) => {
    const now = performance.now();
    if (pos && now - lastCursorSent.current < CURSOR_THROTTLE_MS) return;
    lastCursorSent.current = now;
    awareness.setLocalStateField('pointer', pos && { x: Math.round(pos.x), y: Math.round(pos.y) });
  };

  const handlePointerMove = () => {
    const pos = worldPointer();
    if (!pos) return;
    broadcastCursor(pos);

    if (marqueeStart.current) {
      setMarquee(rectFrom(marqueeStart.current, pos));
      return;
    }
    const d = drawing.current;
    if (!d) return;

    const s = d.shape;
    if (s.type === 'pen') {
      const dx = pos.x - s.x;
      const dy = pos.y - s.y;
      const lx = d.points[d.points.length - 2]!;
      const ly = d.points[d.points.length - 1]!;
      // Drop samples closer than one screen pixel; they add size without adding detail.
      const minDist = 1 / viewport.scale;
      if ((dx - lx) ** 2 + (dy - ly) ** 2 < minDist * minDist) return;
      d.points.push(dx, dy);
    } else if (s.type === 'arrow') {
      d.shape = { ...s, points: [0, 0, pos.x - d.start.x, pos.y - d.start.y] };
    } else if (s.type === 'rect' || s.type === 'ellipse') {
      d.shape = { ...s, ...rectFrom(d.start, pos) };
    }
    scheduleCommit();
  };

  const handlePointerUp = (e: Konva.KonvaEventObject<PointerEvent>) => {
    if (marqueeStart.current) finishMarquee(e.evt.shiftKey);
    finishDrawing();
  };

  // A stroke can end outside the canvas; finish it wherever the pointer is released.
  useEffect(() => {
    const up = (e: PointerEvent) => {
      if (marqueeStart.current) finishMarquee(e.shiftKey);
      finishDrawing();
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, [finishDrawing, finishMarquee]);

  // ---------- selection & transform ----------

  const deleteSelected = useCallback(() => {
    const ids = [...selectedRef.current];
    if (ids.length === 0) return;
    transact(() => ids.forEach((id) => shapesMap.delete(id)));
    setSelected(EMPTY);
  }, [shapesMap, transact]);

  // Stable callbacks (selection read from a ref) keep memoized ShapeNodes from re-rendering.
  const handleShapeDragEnd = useCallback(
    (id: string, node: Konva.Node) => {
      const stage = node.getStage();
      const ids = selectedRef.current.has(id) ? [...selectedRef.current] : [id];
      transact(() => {
        for (const sid of ids) {
          const shape = shapesMap.get(sid);
          const n = sid === id ? node : stage?.findOne(`#${sid}`);
          if (shape && n) shapesMap.set(sid, { ...shape, x: n.x(), y: n.y() });
        }
      });
    },
    [shapesMap, transact],
  );

  const handleShapeDoubleClick = useCallback(
    (id: string) => {
      if (shapesMap.get(id)?.type === 'text') setEditingId(id);
    },
    [shapesMap],
  );

  const handleTransformEnd = () => {
    const nodes = transformerRef.current?.nodes() ?? [];
    transact(() => {
      for (const node of nodes) {
        const shape = shapesMap.get(node.id());
        if (!shape) continue;
        const next = applyTransform(shape, {
          x: node.x(),
          y: node.y(),
          rotation: node.rotation(),
          scaleX: node.scaleX(),
          scaleY: node.scaleY(),
        });
        node.scale({ x: 1, y: 1 });
        shapesMap.set(shape.id, next);
      }
    });
  };

  useEffect(() => {
    const tr = transformerRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    const nodes =
      tool === 'select'
        ? [...selected]
            .filter((id) => id !== editingId)
            .map((id) => stage.findOne(`#${id}`))
            .filter((n): n is Konva.Node => n !== undefined)
        : [];
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selected, shapes, tool, editingId]);

  // Drop selections of shapes a collaborator deleted.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set([...prev].filter((id) => shapesMap.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [shapes, shapesMap]);

  // ---------- viewport ----------

  const zoomAt = useCallback((screen: Point, factor: number) => {
    setViewport((v) => {
      const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
      const wx = (screen.x - v.x) / v.scale;
      const wy = (screen.y - v.y) / v.scale;
      return { scale, x: screen.x - wx * scale, y: screen.y - wy * scale };
    });
  }, []);

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    if (e.evt.ctrlKey || e.evt.metaKey) {
      // Pinch-to-zoom on trackpads arrives as ctrl+wheel.
      const pointer = stageRef.current?.getPointerPosition();
      if (pointer) zoomAt(pointer, Math.exp(-e.evt.deltaY * 0.01));
    } else {
      setViewport((v) => ({ ...v, x: v.x - e.evt.deltaX, y: v.y - e.evt.deltaY }));
    }
  };

  const handleStageDrag = (e: Konva.KonvaEventObject<DragEvent>) => {
    const stage = stageRef.current;
    if (stage && e.target === stage) setViewport((v) => ({ ...v, x: stage.x(), y: stage.y() }));
  };

  const visibleShapes = useMemo(() => {
    if (exporting || size.width === 0) return shapes;
    const view: Bounds = {
      x: -viewport.x / viewport.scale - CULL_MARGIN,
      y: -viewport.y / viewport.scale - CULL_MARGIN,
      width: size.width / viewport.scale + CULL_MARGIN * 2,
      height: size.height / viewport.scale + CULL_MARGIN * 2,
    };
    return shapes.filter((s) => selected.has(s.id) || intersects(shapeBounds(s), view));
  }, [shapes, viewport, size, selected, exporting]);

  // ---------- export ----------

  useEffect(() => {
    if (!exporting) return;
    setExporting(false);
    const layer = contentLayerRef.current;
    const bounds = unionBounds(shapes);
    if (!layer || !bounds) return;

    const pad = 32;
    const { x, y, scale } = viewport;
    const canvas = layer.toCanvas({
      x: (bounds.x - pad) * scale + x,
      y: (bounds.y - pad) * scale + y,
      width: (bounds.width + pad * 2) * scale,
      height: (bounds.height + pad * 2) * scale,
      pixelRatio: 2 / scale,
    });
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, 0, 0);
    out.toBlob((blob) => blob && downloadBlob(blob, 'peerboard.png'), 'image/png');
  }, [exporting, shapes, viewport]);

  // ---------- keyboard ----------

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        history.redo();
      } else if (key === 'delete' || key === 'backspace') {
        deleteSelected();
      } else if (key === 'escape') {
        setSelected(EMPTY);
      } else if (e.code === 'Space') {
        e.preventDefault();
        setSpaceHeld(true);
      } else if (!mod && !e.altKey) {
        const match = TOOLS.find((t) => t.key === key);
        if (match) setTool(match.tool);
      }
    };
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpaceHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [deleteSelected, history]);

  const editingShape = editingId ? shapesMap.get(editingId) : undefined;

  return (
    <div
      ref={containerRef}
      className={cx(
        'relative min-h-0 min-w-0 flex-1 touch-none overflow-hidden bg-canvas select-none',
        // Dot grid gives a sense of scale while panning; pure CSS, no canvas work.
        'bg-[radial-gradient(circle,#cbd5e1_1px,transparent_1px)]',
        panning
          ? 'cursor-grab active:cursor-grabbing'
          : tool === 'select'
            ? 'cursor-default'
            : tool === 'text'
              ? 'cursor-text'
              : 'cursor-crosshair',
      )}
      style={{
        backgroundSize: `${24 * viewport.scale}px ${24 * viewport.scale}px`,
        backgroundPosition: `${viewport.x}px ${viewport.y}px`,
      }}
      onPointerLeave={() => broadcastCursor(null)}
    >
      <BoardToolbar
        tool={tool}
        color={color}
        strokeWidth={strokeWidth}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        hasSelection={selected.size > 0}
        onTool={(t) => {
          setTool(t);
          if (t !== 'select') setSelected(EMPTY);
        }}
        onColor={(c) => {
          setColor(c);
          // Recolor the current selection as well, like most design tools.
          const ids = [...selectedRef.current];
          if (ids.length) {
            transact(() =>
              ids.forEach((id) => {
                const s = shapesMap.get(id);
                if (s) shapesMap.set(id, { ...s, stroke: c });
              }),
            );
          }
        }}
        onStrokeWidth={setStrokeWidth}
        onUndo={history.undo}
        onRedo={history.redo}
        onDelete={deleteSelected}
        onExport={() => setExporting(true)}
      />

      {size.width > 0 && (
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          x={viewport.x}
          y={viewport.y}
          scaleX={viewport.scale}
          scaleY={viewport.scale}
          draggable={panning}
          onDragMove={handleStageDrag}
          onDragEnd={handleStageDrag}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onWheel={handleWheel}
        >
          {/* Hit testing is only needed for selection; skipping it makes drawing cheaper. */}
          <Layer ref={contentLayerRef} listening={tool === 'select' && !panning}>
            {visibleShapes.map((shape) => (
              <ShapeNode
                key={shape.id}
                shape={shape}
                draggable={tool === 'select' && !panning}
                hidden={shape.id === editingId}
                onDragEnd={handleShapeDragEnd}
                onDoubleClick={handleShapeDoubleClick}
              />
            ))}
          </Layer>
          <Layer>
            <Transformer
              ref={transformerRef}
              rotateEnabled
              ignoreStroke
              anchorSize={8}
              anchorCornerRadius={2}
              anchorStroke="#2c4cd9"
              borderStroke="#2c4cd9"
              onTransformEnd={handleTransformEnd}
            />
            {marquee && (
              <Rect
                {...marquee}
                fill="rgba(63,102,232,0.08)"
                stroke="#3f66e8"
                strokeWidth={1 / viewport.scale}
                listening={false}
              />
            )}
          </Layer>
        </Stage>
      )}

      <RemoteCursors awareness={awareness} viewport={viewport} />

      {editingShape?.type === 'text' && (
        <TextEditor
          key={editingShape.id}
          shape={editingShape}
          viewport={viewport}
          onChange={(text) =>
            transact(() => shapesMap.set(editingShape.id, { ...editingShape, text }))
          }
          onDone={(text) => {
            setEditingId(null);
            if (!text.trim()) transact(() => shapesMap.delete(editingShape.id));
          }}
        />
      )}

      {shapes.length === 0 && (
        <p className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-sm text-slate-400">
          Pick a tool and start drawing. Everyone in the room sees it live.
        </p>
      )}

      <ZoomControls
        scale={viewport.scale}
        onZoom={(f) => zoomAt({ x: size.width / 2, y: size.height / 2 }, f)}
        onReset={() => setViewport({ x: 0, y: 0, scale: 1 })}
      />
    </div>
  );
}

function TextEditor({
  shape,
  viewport,
  onChange,
  onDone,
}: {
  shape: TextShape;
  viewport: Viewport;
  onChange: (text: string) => void;
  onDone: (text: string) => void;
}) {
  const [value, setValue] = useState(shape.text);

  return (
    <textarea
      autoFocus
      value={value}
      placeholder="Type…"
      rows={Math.max(1, value.split('\n').length)}
      onChange={(e) => {
        setValue(e.target.value);
        onChange(e.target.value);
      }}
      onBlur={() => onDone(value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
          e.currentTarget.blur();
        }
      }}
      className="absolute z-20 m-0 origin-top-left resize-none overflow-hidden border-0 bg-transparent p-0 leading-[1.4] outline-1 outline-brand-400 outline-dashed placeholder:text-slate-400"
      style={{
        left: shape.x * viewport.scale + viewport.x,
        top: shape.y * viewport.scale + viewport.y,
        width: shape.width * viewport.scale,
        fontSize: shape.fontSize * viewport.scale,
        color: shape.stroke,
        transform: `rotate(${shape.rotation}deg)`,
      }}
    />
  );
}
