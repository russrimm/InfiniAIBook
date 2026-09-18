"use client";

import { useMemo, useState } from "react";
import type { MindNode } from "@/lib/types";

type Laid = {
  node: MindNode;
  depth: number;
  branch: number;
  x: number;
  y: number;
  w: number;
  h: number;
  parent: Laid | null;
};

const COLORS = [
  "#7c8cff",
  "#34d399",
  "#fbbf24",
  "#fb7185",
  "#38bdf8",
  "#c084fc",
  "#f97316",
];

const COL_W = 250;
const ROW_H = 46;
const PAD_Y = 14;

function measure(node: MindNode, depth: number): number {
  const kids = node.children ?? [];
  if (!kids.length || depth >= 3) return ROW_H;
  return kids.reduce((sum, k) => sum + measure(k, depth + 1), 0);
}

function layout(root: MindNode): { nodes: Laid[]; height: number } {
  const nodes: Laid[] = [];

  const walk = (
    node: MindNode,
    depth: number,
    top: number,
    branch: number,
    parent: Laid | null
  ): number => {
    const height = measure(node, depth);
    const w = depth === 0 ? 190 : Math.min(200, Math.max(120, node.label.length * 8 + 28));
    const laid: Laid = {
      node,
      depth,
      branch,
      x: depth * COL_W,
      y: top + height / 2,
      w,
      h: 34,
      parent,
    };
    nodes.push(laid);

    const kids = depth >= 3 ? [] : (node.children ?? []);
    let cursor = top;
    kids.forEach((k, i) => {
      const kh = measure(k, depth + 1);
      walk(k, depth + 1, cursor, depth === 0 ? i : branch, laid);
      cursor += kh;
    });
    return height;
  };

  const total = walk(root, 0, PAD_Y, 0, null);
  return { nodes, height: total + PAD_Y * 2 };
}

export default function MindMap({ root, title }: { root: MindNode; title: string }) {
  const [zoom, setZoom] = useState(1);
  const { nodes, height } = useMemo(() => layout(root), [root]);
  const maxDepth = nodes.reduce((m, n) => Math.max(m, n.depth), 0);
  const width = (maxDepth + 1) * COL_W + 40;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--muted)]">
          {nodes.length} nodes · hover a node for its note
        </p>
        <div className="flex gap-1">
          <button
            className="btn !px-2.5 !py-1 !text-xs"
            onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}
          >
            −
          </button>
          <button
            className="btn !px-2.5 !py-1 !text-xs"
            onClick={() => setZoom(1)}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            className="btn !px-2.5 !py-1 !text-xs"
            onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))}
          >
            +
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-[var(--border)] bg-[#0e1116]">
        <svg
          width={width * zoom}
          height={height * zoom}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={title}
        >
          {nodes
            .filter((n) => n.parent)
            .map((n, i) => {
              const p = n.parent!;
              const x1 = p.x + p.w;
              const y1 = p.y;
              const x2 = n.x;
              const y2 = n.y;
              const mx = (x1 + x2) / 2;
              return (
                <path
                  key={`l-${i}`}
                  d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={COLORS[n.branch % COLORS.length]}
                  strokeOpacity={n.depth === 1 ? 0.6 : 0.32}
                  strokeWidth={n.depth === 1 ? 2 : 1.4}
                />
              );
            })}

          {nodes.map((n, i) => {
            const color = COLORS[n.branch % COLORS.length];
            const isRoot = n.depth === 0;
            return (
              <g key={`n-${i}`} transform={`translate(${n.x}, ${n.y - n.h / 2})`}>
                <title>{n.node.note || n.node.label}</title>
                <rect
                  width={n.w}
                  height={n.h}
                  rx={9}
                  fill={isRoot ? color : "#151a21"}
                  stroke={color}
                  strokeOpacity={isRoot ? 1 : 0.55}
                  strokeWidth={isRoot ? 0 : 1.2}
                />
                {n.depth > 0 && (
                  <rect width={3} height={n.h} rx={1.5} fill={color} opacity={0.9} />
                )}
                <text
                  x={n.depth > 0 ? 12 : n.w / 2}
                  y={n.h / 2 + 4.5}
                  textAnchor={isRoot ? "middle" : "start"}
                  fill={isRoot ? "#0b0d10" : "#e7ebf0"}
                  fontSize={isRoot ? 13.5 : 12}
                  fontWeight={isRoot ? 700 : 500}
                >
                  {n.node.label.length > 26
                    ? `${n.node.label.slice(0, 25)}…`
                    : n.node.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
