"use client";

import { useState } from "react";
import type { Column, TableSummary } from "@/lib/datastruct";

const TYPE_TONE: Record<Column["type"], string> = {
  integer: "text-sky-300",
  number: "text-sky-300",
  boolean: "text-violet-300",
  date: "text-amber-300",
  string: "text-emerald-300",
  empty: "text-[var(--muted)]",
};

function ColumnDetail({ col, rows }: { col: Column; rows: number }) {
  const fmt = (n?: number) => (n === undefined ? "–" : n.toLocaleString(undefined, { maximumFractionDigits: 3 }));
  return (
    <div className="space-y-2 text-[13px]">
      <p className="font-semibold">{col.name}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-[var(--muted)]">Type</dt>
        <dd>{col.type}</dd>
        <dt className="text-[var(--muted)]">Filled</dt>
        <dd>
          {col.filled.toLocaleString()} of {rows.toLocaleString()}
        </dd>
        <dt className="text-[var(--muted)]">Distinct</dt>
        <dd>
          {col.distinct.toLocaleString()}
          {col.distinctCapped ? "+" : ""}
        </dd>
        {col.min !== undefined && (
          <>
            <dt className="text-[var(--muted)]">Min / max</dt>
            <dd>
              {fmt(col.min)} / {fmt(col.max)}
            </dd>
            <dt className="text-[var(--muted)]">Mean / median</dt>
            <dd>
              {fmt(col.mean)} / {fmt(col.median)}
            </dd>
          </>
        )}
      </dl>
      {col.top.length > 0 && (
        <div>
          <p className="mb-1 text-[var(--muted)]">Most common values</p>
          <ul className="space-y-0.5">
            {col.top.map(([v, n]) => (
              <li key={v} className="flex gap-2 text-[11px]">
                <span className="min-w-0 flex-1 truncate font-mono" title={v}>
                  {v}
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

export default function ExplorerTable({ table }: { table: TableSummary }) {
  const [selected, setSelected] = useState(0);
  const [showRows, setShowRows] = useState(false);
  const col = table.columns[selected];
  const issues = [
    table.ragged ? `${table.ragged.toLocaleString()} rows have a different number of cells than the header.` : "",
    table.duplicateRows ? `${table.duplicateRows.toLocaleString()} rows are exact duplicates.` : "",
  ].filter(Boolean);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-3 text-[13px]">
        <span>
          {table.rows.toLocaleString()} rows · {table.columns.length} columns · delimiter{" "}
          <code>{table.delimiter === "\t" ? "tab" : table.delimiter}</code>
        </span>
        <div role="group" aria-label="Table view" className="ml-auto flex overflow-hidden rounded-lg border border-[var(--border)] text-[13px]">
          {[false, true].map((v) => (
            <button
              key={String(v)}
              aria-pressed={showRows === v}
              className={`px-3 py-1 ${showRows === v ? "bg-[var(--selected)]" : "text-[var(--muted)]"}`}
              onClick={() => setShowRows(v)}
            >
              {v ? "Rows" : "Columns"}
            </button>
          ))}
        </div>
      </div>
      {issues.length > 0 && (
        <ul className="shrink-0 list-disc rounded-lg border border-line-strong bg-[#141922] py-2 pr-3 pl-7 text-[13px] text-prose-soft">
          {issues.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
      {showRows ? (
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-[var(--panel)] text-left text-[var(--muted)]">
              <tr>
                {table.columns.map((c, i) => (
                  <th key={i} scope="col" className="px-2 py-1 font-normal whitespace-nowrap">
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.preview.map((r, i) => (
                <tr key={i} className="border-t border-[var(--border)]">
                  {table.columns.map((_, ci) => (
                    <td key={ci} className="max-w-[16rem] truncate px-2 py-1" title={r[ci]}>
                      {r[ci]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {table.rows > table.preview.length && (
            <p className="p-2 text-[11px] text-[var(--muted)]">First {table.preview.length} rows.</p>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-3 max-md:flex-col">
          <div className="min-h-0 min-w-0 flex-1 overflow-auto rounded-lg border border-[var(--border)]">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-[var(--panel)] text-left text-[var(--muted)]">
                <tr>
                  <th scope="col" className="px-2 py-1 font-normal">Column</th>
                  <th scope="col" className="px-2 py-1 font-normal">Type</th>
                  <th scope="col" className="px-2 py-1 font-normal">Filled</th>
                  <th scope="col" className="px-2 py-1 font-normal">Distinct</th>
                  <th scope="col" className="px-2 py-1 font-normal">Range or common values</th>
                </tr>
              </thead>
              <tbody>
                {table.columns.map((c, i) => (
                  <tr
                    key={i}
                    aria-selected={selected === i}
                    className={`cursor-pointer border-t border-[var(--border)] ${selected === i ? "bg-[var(--selected)]" : "hover:bg-[var(--hover)]"}`}
                    onClick={() => setSelected(i)}
                  >
                    <td className="px-2 py-1">
                      <button className="text-left" onClick={() => setSelected(i)}>
                        {c.name}
                      </button>
                    </td>
                    <td className={`px-2 py-1 ${TYPE_TONE[c.type]}`}>{c.type}</td>
                    <td className="px-2 py-1">{table.rows ? Math.round((c.filled / table.rows) * 100) : 0}%</td>
                    <td className="px-2 py-1">
                      {c.distinct.toLocaleString()}
                      {c.distinctCapped ? "+" : ""}
                    </td>
                    <td className="max-w-[18rem] truncate px-2 py-1 text-[var(--muted)]">
                      {c.min !== undefined
                        ? `${c.min.toLocaleString()} to ${c.max?.toLocaleString()}`
                        : c.samples.join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <aside aria-label="Selected column" className="max-h-[40%] w-full shrink-0 overflow-auto rounded-lg border border-[var(--border)] bg-well p-3 md:max-h-none md:w-72">
            {col ? <ColumnDetail col={col} rows={table.rows} /> : null}
          </aside>
        </div>
      )}
    </div>
  );
}
