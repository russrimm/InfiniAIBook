"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MindNode } from "@/lib/types";

const COLORS = [
  "#7c8cff",
  "#34d399",
  "#fbbf24",
  "#fb7185",
  "#38bdf8",
  "#c084fc",
  "#f97316",
];

const COL_W = 236;
const ROW_H = 44;
const NODE_H = 34;
const PAD = 18;

/** A node positioned for the currently expanded subset of the tree. */
type Placed = {
  path: string;
  node: MindNode;
  depth: number;
  branch: number;
  x: number;
  y: number;
  w: number;
  childCount: number;
  expanded: boolean;
  parentPath: string | null;
  parentX: number;
  parentY: number;
};

const childrenOf = (n: MindNode) => n.children ?? [];

function nodeWidth(label: string, depth: number): number {
  if (depth === 0) return 200;
  return Math.min(196, Math.max(118, label.length * 7.6 + 34));
}

/** Rows a node occupies once only expanded branches are counted. */
function visibleRows(node: MindNode, path: string, expanded: Set<string>): number {
  const kids = childrenOf(node);
  if (!kids.length || !expanded.has(path)) return 1;
  return kids.reduce((sum, k, i) => sum + visibleRows(k, `${path}.${i}`, expanded), 0);
}

function layout(root: MindNode, expanded: Set<string>) {
  const placed: Placed[] = [];

  const walk = (
    node: MindNode,
    path: string,
    depth: number,
    top: number,
    branch: number,
    parent: Placed | null
  ) => {
    const rows = visibleRows(node, path, expanded);
    const kids = childrenOf(node);
    const isOpen = expanded.has(path) && kids.length > 0;
    const w = nodeWidth(node.label, depth);

    const self: Placed = {
      path,
      node,
      depth,
      branch,
      x: depth * COL_W,
      y: top + (rows * ROW_H) / 2,
      w,
      childCount: kids.length,
      expanded: isOpen,
      parentPath: parent?.path ?? null,
      parentX: parent ? parent.x + parent.w : 0,
      parentY: parent?.y ?? 0,
    };
    placed.push(self);

    if (!isOpen) return;
    let cursor = top;
    kids.forEach((kid, i) => {
      const kidPath = `${path}.${i}`;
      walk(kid, kidPath, depth + 1, cursor, depth === 0 ? i : branch, self);
      cursor += visibleRows(kid, kidPath, expanded) * ROW_H;
    });
  };

  walk(root, "0", 0, PAD, 0, null);

  const maxDepth = placed.reduce((m, p) => Math.max(m, p.depth), 0);
  return {
    placed,
    width: (maxDepth + 1) * COL_W + 40,
    height: visibleRows(root, "0", expanded) * ROW_H + PAD * 2,
  };
}

/** Every path that has children, for expand-all. */
function allBranchPaths(node: MindNode, path = "0", out: string[] = []): string[] {
  if (childrenOf(node).length) {
    out.push(path);
    childrenOf(node).forEach((k, i) => allBranchPaths(k, `${path}.${i}`, out));
  }
  return out;
}

export default function MindMap({ root, title }: { root: MindNode; title: string }) {
  // Starts fully collapsed: only the central topic is showing.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);
  const viewRef = useRef<HTMLDivElement>(null);

  const { placed, width, height } = useMemo(
    () => layout(root, expanded),
    [root, expanded]
  );

  const branchPaths = useMemo(() => allBranchPaths(root), [root]);
  const totalNodes = useMemo(() => {
    const count = (n: MindNode): number =>
      1 + childrenOf(n).reduce((s, k) => s + count(k), 0);
    return count(root);
  }, [root]);

  const fit = useCallback(() => {
    const el = viewRef.current;
    if (!el) return;
    const scale = Math.min(
      (el.clientWidth - 24) / width,
      (el.clientHeight - 24) / height,
      1.4
    );
    setZoom(Math.max(0.3, +scale.toFixed(2)));
  }, [width, height]);

  // Refit whenever the visible tree changes, so expanding never pushes the
  // map out of view.
  useLayoutEffect(() => {
    fit();
  }, [fit]);

  useEffect(() => {
    const el = viewRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        // Collapsing a node also collapses everything beneath it, so
        // re-opening it later starts tidy rather than restoring a deep tree.
        for (const p of prev) {
          if (p === path || p.startsWith(`${path}.`)) next.delete(p);
        }
      } else {
        next.add(path);
      }
      return next;
    });

  const allOpen = expanded.size === branchPaths.length;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--muted)]">
          {placed.length} of {totalNodes} nodes ·{" "}
          {expanded.size === 0
            ? "click the centre topic to explore"
            : "click a topic to expand or collapse"}
        </p>
        <div className="flex gap-1">
          <button
            className="btn !px-2.5 !py-1 !text-xs"
            onClick={() => setExpanded(allOpen ? new Set() : new Set(branchPaths))}
          >
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
          <button
            className="btn !px-2.5 !py-1 !text-xs"
            onClick={() => setZoom((z) => Math.max(0.3, +(z - 0.1).toFixed(2)))}
            aria-label="Zoom out"
          >
            −
          </button>
          <button className="btn !px-2.5 !py-1 !text-xs" onClick={fit}>
            {Math.round(zoom * 100)}%
          </button>
          <button
            className="btn !px-2.5 !py-1 !text-xs"
            onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.1).toFixed(2)))}
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
      </div>

      <div
        ref={viewRef}
        className="grid min-h-0 flex-1 place-items-center overflow-auto rounded-xl border border-[var(--border)] bg-[#0e1116] p-3"
      >
        <svg
          width={width * zoom}
          height={height * zoom}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Mind map: ${title}`}
        >
          {placed
            .filter((p) => p.parentPath !== null)
            .map((p) => {
              const mx = (p.parentX + p.x) / 2;
              return (
                <path
                  key={`link-${p.path}`}
                  className="mm-link"
                  d={`M ${p.parentX} ${p.parentY} C ${mx} ${p.parentY}, ${mx} ${p.y}, ${p.x} ${p.y}`}
                  fill="none"
                  stroke={COLORS[p.branch % COLORS.length]}
                  strokeOpacity={p.depth === 1 ? 0.55 : 0.3}
                  strokeWidth={p.depth === 1 ? 2 : 1.4}
                />
              );
            })}

          {placed.map((p) => {
            const color = COLORS[p.branch % COLORS.length];
            const isRoot = p.depth === 0;
            const hasKids = p.childCount > 0;
            const label =
              p.node.label.length > 24 ? `${p.node.label.slice(0, 23)}…` : p.node.label;

            return (
              <g
                key={p.path}
                className="mm-node"
                transform={`translate(${p.x}, ${p.y - NODE_H / 2})`}
                role={hasKids ? "button" : undefined}
                tabIndex={hasKids ? 0 : undefined}
                aria-expanded={hasKids ? p.expanded : undefined}
                aria-label={
                  hasKids
                    ? `${p.node.label}, ${p.expanded ? "expanded" : "collapsed"}, ${p.childCount} subtopics`
                    : p.node.label
                }
                style={{ cursor: hasKids ? "pointer" : "default" }}
                onClick={() => hasKids && toggle(p.path)}
                onKeyDown={(e) => {
                  if (hasKids && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    toggle(p.path);
                  }
                }}
              >
                <title>{p.node.note || p.node.label}</title>

                <rect
                  width={p.w}
                  height={NODE_H}
                  rx={9}
                  fill={isRoot ? color : "#151a21"}
                  stroke={color}
                  strokeOpacity={isRoot ? 1 : p.expanded ? 0.9 : 0.5}
                  strokeWidth={isRoot ? 0 : 1.2}
                />
                {!isRoot && (
                  <rect width={3} height={NODE_H} rx={1.5} fill={color} opacity={0.9} />
                )}

                <text
                  x={isRoot ? p.w / 2 - (hasKids ? 10 : 0) : 12}
                  y={NODE_H / 2 + 4.5}
                  textAnchor={isRoot ? "middle" : "start"}
                  fill={isRoot ? "#0b0d10" : "#e7ebf0"}
                  fontSize={isRoot ? 13.5 : 12}
                  fontWeight={isRoot ? 700 : 500}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {label}
                </text>

                {hasKids && (
                  <g transform={`translate(${p.w - 20}, ${NODE_H / 2})`}>
                    <circle
                      r={9}
                      fill={isRoot ? "rgba(0,0,0,0.22)" : p.expanded ? color : "#1f2530"}
                      stroke={isRoot ? "transparent" : color}
                      strokeOpacity={0.55}
                      strokeWidth={1}
                    />
                    {p.expanded ? (
                      <path
                        d="M -4 0 H 4"
                        stroke={isRoot ? "#0b0d10" : "#0b0d10"}
                        strokeWidth={2}
                        strokeLinecap="round"
                      />
                    ) : (
                      <text
                        y={3.4}
                        textAnchor="middle"
                        fontSize={9.5}
                        fontWeight={700}
                        fill={isRoot ? "#0b0d10" : color}
                        style={{ pointerEvents: "none", userSelect: "none" }}
                      >
                        {p.childCount}
                      </text>
                    )}
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
