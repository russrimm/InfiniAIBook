"use client";

import { useMemo, useState } from "react";
import type { FieldStat, ValueType } from "@/lib/datastruct";

export const TYPE_COLOR: Record<string, string> = {
  object: "#2f6fe4",
  array: "#c2410c",
  value: "#3f8a1c",
  root: "#f08a4b",
};

/** Containers read as object/array; a path that only holds scalars as value. */
export function dominantKind(n: FieldStat): "object" | "array" | "value" {
  const o = n.types.object ?? 0;
  const a = n.types.array ?? 0;
  if (a >= o && a > 0) return "array";
  if (o > 0) return "object";
  return "value";
}

export function typeSummary(types: FieldStat["types"]): string {
  return (Object.entries(types) as [ValueType, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${t} ×${n.toLocaleString()}`)
    .join(", ");
}

export function FieldDetail({ node }: { node: FieldStat }) {
  return (
    <div className="space-y-2 text-[13px]">
      <p className="font-mono text-[11px] break-all text-[var(--cite-ink)]">{node.path}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-[var(--muted)]">Occurs</dt>
        <dd>{node.count.toLocaleString()}×</dd>
        <dt className="text-[var(--muted)]">Types</dt>
        <dd>{typeSummary(node.types)}</dd>
        {node.minSize !== undefined && (
          <>
            <dt className="text-[var(--muted)]">Size</dt>
            <dd>
              {node.minSize}–{node.maxSize} {dominantKind(node) === "array" ? "items" : "keys"}
            </dd>
          </>
        )}
        {node.distinct > 0 && (
          <>
            <dt className="text-[var(--muted)]">Distinct</dt>
            <dd>
              {node.distinct.toLocaleString()}
              {node.distinctCapped ? "+" : ""}
            </dd>
          </>
        )}
        {node.min !== undefined && (
          <>
            <dt className="text-[var(--muted)]">Range</dt>
            <dd>
              {node.min.toLocaleString()} to {node.max?.toLocaleString()} (mean{" "}
              {node.mean?.toLocaleString(undefined, { maximumFractionDigits: 2 })})
            </dd>
          </>
        )}
        {node.maxLength !== undefined && (
          <>
            <dt className="text-[var(--muted)]">Longest</dt>
            <dd>{node.maxLength.toLocaleString()} characters</dd>
          </>
        )}
        {node.empty > 0 && (
          <>
            <dt className="text-[var(--muted)]">Empty</dt>
            <dd>{node.empty.toLocaleString()}</dd>
          </>
        )}
      </dl>
      {node.top.length > 0 && (
        <div>
          <p className="mb-1 text-[var(--muted)]">Most common values</p>
          <ul className="space-y-0.5">
            {node.top.map(([v, n]) => (
              <li key={v} className="flex gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={v}>
                  {v === "" ? "(empty)" : v}
                </span>
                <span className="text-[var(--muted)]">{n.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SchemaTree({
  nodes,
  selected,
  onSelect,
  query,
}: {
  nodes: FieldStat[];
  selected: string;
  onSelect: (path: string) => void;
  query: string;
}) {
  const children = useMemo(() => {
    const m = new Map<string | null, FieldStat[]>();
    for (const n of nodes) {
      const list = m.get(n.parent) ?? [];
      list.push(n);
      m.set(n.parent, list);
    }
    return m;
  }, [nodes]);
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(nodes.filter((n) => n.depth >= 3 && (children.get(n.path)?.length ?? 0) > 0).map((n) => n.path))
  );

  const q = query.trim().toLowerCase();
  const matches = (n: FieldStat) => n.path.toLowerCase().includes(q);
  const rows: FieldStat[] = [];
  const visit = (n: FieldStat) => {
    rows.push(n);
    if (q || !collapsed.has(n.path)) for (const c of children.get(n.path) ?? []) visit(c);
  };
  for (const r of children.get(null) ?? []) visit(r);
  const shown = q ? rows.filter(matches) : rows;

  return (
    <ul role="tree" aria-label="Structure" className="text-[13px]">
      {shown.slice(0, 1500).map((n) => {
        const kind = dominantKind(n);
        const hasKids = (children.get(n.path)?.length ?? 0) > 0;
        const open = !collapsed.has(n.path);
        return (
          <li
            key={n.path}
            role="treeitem"
            aria-selected={selected === n.path}
            aria-expanded={hasKids ? open : undefined}
            className={`flex items-center gap-1.5 rounded px-1 py-[3px] ${
              selected === n.path ? "bg-[var(--selected)]" : "hover:bg-[var(--hover)]"
            }`}
            style={{ paddingLeft: q ? 4 : n.depth * 14 + 4 }}
          >
            {hasKids && !q ? (
              <button
                aria-label={open ? `Collapse ${n.key}` : `Expand ${n.key}`}
                className="w-4 shrink-0 text-[var(--muted)]"
                onClick={() =>
                  setCollapsed((s) => {
                    const next = new Set(s);
                    if (next.has(n.path)) next.delete(n.path);
                    else next.add(n.path);
                    return next;
                  })
                }
              >
                {open ? "▾" : "▸"}
              </button>
            ) : (
              <span className="w-4 shrink-0" />
            )}
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: TYPE_COLOR[kind] }} />
            <button
              className="min-w-0 flex-1 truncate text-left"
              title={n.path}
              onClick={() => onSelect(n.path)}
            >
              {q ? n.path : n.key}
            </button>
            <span className="shrink-0 text-[11px] text-[var(--muted)]">{n.count.toLocaleString()}×</span>
          </li>
        );
      })}
      {shown.length > 1500 && (
        <li className="px-2 py-1 text-[11px] text-[var(--muted)]">Showing the first 1,500 paths. Narrow the filter.</li>
      )}
      {!shown.length && <li className="px-2 py-1 text-[var(--muted)]">No paths match.</li>}
    </ul>
  );
}

type Placed = { n: FieldStat; x: number; y: number };

function SchemaGraph({
  nodes,
  selected,
  onSelect,
}: {
  nodes: FieldStat[];
  selected: string;
  onSelect: (path: string) => void;
}) {
  const [maxDepth, setMaxDepth] = useState(4);
  const [hideValues, setHideValues] = useState(false);
  const [zoom, setZoom] = useState(1);

  const { placed, edges, width, height, hidden } = useMemo(() => {
    const visible = nodes.filter((n) => n.depth <= maxDepth && !(hideValues && dominantKind(n) === "value"));
    const ids = new Set(visible.map((n) => n.path));
    const kids = new Map<string | null, FieldStat[]>();
    for (const n of visible) {
      const p = n.parent && ids.has(n.parent) ? n.parent : null;
      const list = kids.get(p) ?? [];
      list.push(n);
      kids.set(p, list);
    }
    const ROW = 34;
    const COL = 190;
    const pos = new Map<string, Placed>();
    let leaf = 0;
    const place = (n: FieldStat): number => {
      const list = kids.get(n.path) ?? [];
      const y = list.length
        ? list.map(place).reduce((s, v) => s + v, 0) / list.length
        : leaf++ * ROW + 20;
      pos.set(n.path, { n, x: n.depth * COL + 20, y });
      return y;
    };
    for (const r of kids.get(null) ?? []) place(r);
    const all = [...pos.values()];
    const links = all
      .filter((p) => p.n.parent && pos.has(p.n.parent))
      .map((p) => ({ from: pos.get(p.n.parent!)!, to: p }));
    return {
      placed: all,
      edges: links,
      width: (maxDepth + 1) * COL + 160,
      height: Math.max(leaf * ROW + 40, 80),
      hidden: nodes.length - visible.length,
    };
  }, [nodes, maxDepth, hideValues]);

  const capped = placed.length > 600;
  const draw = capped ? placed.slice(0, 600) : placed;
  const drawn = new Set(draw.map((p) => p.n.path));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-3 pb-2 text-[13px]">
        <label className="flex items-center gap-1.5">
          Depth
          <select
            className="input !h-7 !w-auto !py-0 text-[13px]"
            value={maxDepth}
            onChange={(e) => setMaxDepth(Number(e.target.value))}
          >
            {[2, 3, 4, 5, 6, 8, 12].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={hideValues} onChange={(e) => setHideValues(e.target.checked)} />
          Hide values
        </label>
        <span className="flex items-center gap-1">
          <button className="btn !px-2 !py-0.5 !text-xs" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}>
            −
          </button>
          <button className="btn !px-2 !py-0.5 !text-xs" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(2.4, z + 0.2))}>
            +
          </button>
        </span>
        <span className="text-[var(--muted)]">
          {draw.length} paths{hidden > 0 ? ` · ${hidden} hidden by the filters` : ""}
          {capped ? " · first 600 drawn" : ""}
        </span>
        <span className="ml-auto flex items-center gap-2 text-[11px] text-[var(--muted)]">
          {["object", "array", "value"].map((k) => (
            <span key={k} className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: TYPE_COLOR[k] }} />
              {k}
            </span>
          ))}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--well)]">
        <svg
          role="img"
          aria-label="Graph of the data structure. Select a node to see its details."
          width={width * zoom}
          height={height * zoom}
          viewBox={`0 0 ${width} ${height}`}
        >
          {edges
            .filter((e) => drawn.has(e.from.n.path) && drawn.has(e.to.n.path))
            .map((e) => (
              <path
                key={e.to.n.path}
                d={`M${e.from.x + 8},${e.from.y} C${e.from.x + 90},${e.from.y} ${e.to.x - 80},${e.to.y} ${e.to.x - 8},${e.to.y}`}
                fill="none"
                stroke="#6b2a2a"
                strokeWidth={Math.min(6, 1 + Math.log10(e.to.n.count + 1) * 1.4)}
                opacity={0.8}
              />
            ))}
          {draw.map(({ n, x, y }) => {
            const kind = n.depth === 0 ? "root" : dominantKind(n);
            const active = selected === n.path;
            return (
              <g
                key={n.path}
                tabIndex={0}
                role="button"
                aria-label={`${n.path}, ${n.count} occurrences`}
                className="cursor-pointer outline-none"
                onClick={() => onSelect(n.path)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(n.path);
                  }
                }}
              >
                <circle
                  cx={x}
                  cy={y}
                  r={7 + Math.min(5, Math.log10(n.count + 1) * 2)}
                  fill={TYPE_COLOR[kind]}
                  stroke={active ? "#fff" : "none"}
                  strokeWidth={2}
                />
                <text x={x + 16} y={y + 4} fontSize={11} fill="#e7ebf0">
                  {n.key.length > 22 ? `${n.key.slice(0, 21)}…` : n.key}
                  <tspan fill="#8b95a5"> ×{n.count.toLocaleString()}</tspan>
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export default function ExplorerStructure({ nodes, truncated }: { nodes: FieldStat[]; truncated: boolean }) {
  const [view, setView] = useState<"tree" | "graph">("tree");
  const [selected, setSelected] = useState(nodes[0]?.path ?? "");
  const [query, setQuery] = useState("");
  const node = nodes.find((n) => n.path === selected);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div role="group" aria-label="Structure view" className="flex overflow-hidden rounded-lg border border-[var(--border)] text-[13px]">
          {(["tree", "graph"] as const).map((v) => (
            <button
              key={v}
              aria-pressed={view === v}
              className={`px-3 py-1 ${view === v ? "bg-[var(--selected)] text-[var(--fg)]" : "text-[var(--muted)]"}`}
              onClick={() => setView(v)}
            >
              {v === "tree" ? "Tree" : "Graph"}
            </button>
          ))}
        </div>
        <input
          aria-label="Filter paths"
          className="input !h-8 min-w-0 flex-1 !py-0 text-[13px]"
          placeholder="Filter paths…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {truncated && (
          <span className="text-[11px] text-amber-300">Very large structure: only the first 3,000 paths are shown.</span>
        )}
      </div>
      <div className="flex min-h-0 flex-1 gap-3 max-md:flex-col">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
          {view === "tree" ? (
            <SchemaTree nodes={nodes} selected={selected} onSelect={setSelected} query={query} />
          ) : (
            <SchemaGraph
              nodes={query.trim() ? nodes.filter((n) => n.path.toLowerCase().includes(query.trim().toLowerCase()) || n.depth === 0) : nodes}
              selected={selected}
              onSelect={setSelected}
            />
          )}
        </div>
        <aside
          aria-label="Selected path"
          className="max-h-[40%] w-full shrink-0 overflow-auto rounded-lg border border-[var(--border)] bg-well p-3 md:max-h-none md:w-72"
        >
          {node ? <FieldDetail node={node} /> : <p className="text-[13px] text-[var(--muted)]">Select a path.</p>}
        </aside>
      </div>
    </div>
  );
}
