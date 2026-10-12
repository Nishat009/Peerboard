'use client';

import type Konva from 'konva';
import { memo, useMemo } from 'react';
import { Arrow, Ellipse, Rect, Shape as KonvaShape, Text } from 'react-konva';
import { drawFreehand } from './freehand';
import type { Shape } from './model';

export type ShapeNodeProps = {
  shape: Shape;
  draggable: boolean;
  hidden: boolean;
  onDragEnd: (id: string, node: Konva.Node) => void;
  onDoubleClick: (id: string) => void;
};

/** Konva rendering flags that trade imperceptible quality for large speedups at scale. */
const FAST = { perfectDrawEnabled: false, shadowForStrokeEnabled: false } as const;

function ShapeNodeImpl({ shape, draggable, hidden, onDragEnd, onDoubleClick }: ShapeNodeProps) {
  const sceneFunc = useMemo(
    () => (shape.type === 'pen' ? drawFreehand(shape) : undefined),
    [shape],
  );

  const common = {
    id: shape.id,
    name: 'shape',
    x: shape.x,
    y: shape.y,
    rotation: shape.rotation,
    draggable,
    visible: !hidden,
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => onDragEnd(shape.id, e.target),
    onDblClick: () => onDoubleClick(shape.id),
    onDblTap: () => onDoubleClick(shape.id),
    ...FAST,
  };

  switch (shape.type) {
    case 'pen':
      return (
        <KonvaShape {...common} sceneFunc={sceneFunc} fill={shape.stroke} hitStrokeWidth={12} />
      );
    case 'rect':
      return (
        <Rect
          {...common}
          width={shape.width}
          height={shape.height}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
          cornerRadius={4}
          strokeScaleEnabled={false}
        />
      );
    case 'ellipse':
      return (
        <Ellipse
          {...common}
          radiusX={shape.width / 2}
          radiusY={shape.height / 2}
          // Offset moves the origin to the top-left so rotation/transform match rectangles.
          offsetX={-shape.width / 2}
          offsetY={-shape.height / 2}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
          strokeScaleEnabled={false}
        />
      );
    case 'arrow':
      return (
        <Arrow
          {...common}
          points={shape.points}
          stroke={shape.stroke}
          fill={shape.stroke}
          strokeWidth={shape.strokeWidth}
          pointerLength={shape.strokeWidth * 3 + 6}
          pointerWidth={shape.strokeWidth * 3 + 6}
          lineCap="round"
          lineJoin="round"
          hitStrokeWidth={16}
        />
      );
    case 'text':
      return (
        <Text
          {...common}
          text={shape.text}
          fontSize={shape.fontSize}
          width={shape.width}
          fill={shape.stroke}
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          lineHeight={1.4}
        />
      );
  }
}

/** Re-renders only when this shape's object (or its interaction flags) changes. */
export const ShapeNode = memo(ShapeNodeImpl);
