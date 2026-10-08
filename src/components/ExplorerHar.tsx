"use client";

import { useEffect, useMemo, useState } from "react";
import type { Breakdown, HarDetail, HarPhases, HarRequest, HarSummary } from "@/lib/har";

export const fmtBytes = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${Math.round(n)} B`;
export const fmtMs = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${Math.round(n)} ms`);

export const PHASE_COLOR: Record<keyof HarPhases, string> = {
  blocked: "#8b95a5",
  dns: "#2a9d8f",
  connect: "#e9c46a",
  ssl: "#9b5de5",
  send: "#4cc9f0",
  wait: "#4361ee",
  receive: "#3f8a1c",
};
export const MILESTONE_COLOR = { dom: "#2a9d8f", load: "#c2410c" } as const;
export const PHASES = Object.keys(PHASE_COLOR) as (keyof HarPhases)[];

const SEVERITY_TONE: Record<string, string> = {
  high: "bg-red-500/20 text-red-300",
  medium: "bg-amber-500/20 text-amber-300",
  low: "bg-sky-500/20 text-sky-300",
  info: "bg-[var(--hover)] text-[var(--muted)]",
};

export function statusTone(s: number) {
  if (s === 0 || s >= 400) return "text-red-300";
  if (s >= 300) return "text-amber-300";
  return "text-emerald-300";
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-well px-3 py-2">
      <p className="text-[11px] text-[var(--muted)]">{label}</p>
      <p className="text-[15px] font-semibold">{value}</p>
      {hint && <p className="text-[11px] text-[var(--muted)]">{hint}</p>}
    </div>
  );
}

function Bars({ title, rows, unit }: { title: string; rows: Breakdown[]; unit: "count" | "bytes" | "time" }) {
  const value = (r: Breakdown) => (unit === "count" ? r.count : unit === "bytes" ? r.bytes : r.time);
  const max = Math.max(1, ...rows.map(value));
  const label = (r: Breakdown) =>
    unit === "count" ? r.count.toLocaleString() : unit === "bytes" ? fmtBytes(r.bytes) : fmtMs(r.time);
  return (
    <section className="rounded-lg border border-[var(--border)] bg-well p-3">
      <h3 className="mb-2 text-[13px] font-semibold">{title}</h3>
      <ul className="space-y-1.5">
        {rows.slice(0, 8).map((r) => (
          <li key={r.key} className="text-[11px]">
            <div className="flex justify-between gap-2">
              <span className="truncate" title={r.key}>
                {r.key}
              </span>
              <span className="shrink-0 text-[var(--muted)]">
                {r.count.toLocaleString()} · {label(r)}
              </span>
            </div>
            <div className="mt-0.5 h-1.5 rounded bg-[var(--border)]">
              <div className="h-1.5 rounded bg-[var(--accent)]" style={{ width: `${(value(r) / max) * 100}%` }} />
            </div>
          </li>
        ))}
        {rows.length > 8 && <li className="text-[11px] text-[var(--muted)]">+ {rows.length - 8} more</li>}
      </ul>
    </section>
  );
}

function RequestLine({ r, onPick, metric }: { r: HarRequest; onPick: (i: number) => void; metric: string }) {
  return (
    <li>
      <button className="flex w-full gap-2 rounded px-1 py-0.5 text-left text-[11px] hover:bg-[var(--hover)]" onClick={() => onPick(r.index)}>
        <span className="shrink-0 text-[var(--muted)]">{metric}</span>
        <span className="min-w-0 truncate" title={r.url}>
          {r.host}
          {r.path}
        </span>
      </button>
    </li>
  );
}

export function Overview({ har, onPick }: { har: HarSummary; onPick: (i: number) => void }) {
  const t = har.totals;
  const phaseTotal = PHASES.reduce((s, k) => s + har.phases[k], 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Requests" value={t.requests.toLocaleString()} hint={`${har.byHost.length} hosts`} />
        <Stat label="Load time" value={fmtMs(t.wallTime)} hint={`${fmtMs(t.summedTime)} summed`} />
        <Stat label="Transferred" value={fmtBytes(t.transfer)} hint={`${fmtBytes(t.size)} uncompressed`} />
        <Stat label="Failed" value={t.failed.toLocaleString()} hint={`${t.redirects} redirects · ${t.cached} cached`} />
      </div>

      {(har.creator || har.browser) && (
        <p className="text-[11px] text-[var(--muted)]">
          Recorded by {har.creator || "unknown"}
          {har.browser ? ` in ${har.browser}` : ""}
          {har.version ? ` · HAR ${har.version}` : ""}
        </p>
      )}

      {har.findings.length > 0 && (
        <section className="rounded-lg border border-line-strong bg-sunk p-3">
          <h3 className="mb-1 text-[13px] font-semibold">Findings</h3>
          <ul className="space-y-1.5 text-[13px] text-prose-soft">
            {har.findings.map((f) => (
              <li key={f.text} className="flex items-start gap-2">
                <span className={`mt-0.5 shrink-0 rounded px-1.5 text-[10px] uppercase ${SEVERITY_TONE[f.severity]}`}>{f.severity}</span>
                <span className="min-w-0 flex-1">{f.text}</span>
                {f.requests.length > 0 && (
                  <button className="shrink-0 text-[11px] underline text-[var(--link)]" onClick={() => onPick(f.requests[0])}>
                    {f.requests.length === 1 ? "View request" : `View first of ${f.requests.length}`}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {har.serverTiming.length > 0 && (
        <section>
          <h3 className="mb-1 text-[13px] font-semibold">Server timing</h3>
          <table className="w-full text-[11px]">
            <thead className="text-left text-[var(--muted)]">
              <tr>
                <th className="py-1 pr-3 font-normal">Metric</th>
                <th className="pr-3 font-normal">Requests</th>
                <th className="pr-3 font-normal">Average</th>
                <th className="font-normal">Max</th>
              </tr>
            </thead>
            <tbody>
              {har.serverTiming.slice(0, 10).map((s) => (
                <tr key={s.name} className="border-t border-[var(--border)]">
                  <td className="py-1 pr-3 font-mono">{s.name}</td>
                  <td className="pr-3">{s.count}</td>
                  <td className="pr-3">{fmtMs(s.avg)}</td>
                  <td>{fmtMs(s.max)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {har.redirectChains.length > 0 && (
        <section>
          <h3 className="mb-1 text-[13px] font-semibold">Redirect chains</h3>
          <ul className="space-y-1 text-[11px]">
            {har.redirectChains.slice(0, 8).map((chain) => (
              <li key={chain[0]} className="flex flex-wrap items-center gap-1">
                {chain.map((i, k) => (
                  <span key={i} className="flex items-center gap-1">
                    {k > 0 && <span aria-hidden className="text-[var(--muted)]">→</span>}
                    <button className="rounded bg-[var(--hover)] px-1.5 py-0.5" onClick={() => onPick(i)} title={har.requests[i].url}>
                      {har.requests[i].status || "?"} {har.requests[i].host}
                      {har.requests[i].path.slice(0, 28)}
                    </button>
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}

      {har.pages.length > 0 && (
        <section>
          <h3 className="mb-1 text-[13px] font-semibold">Pages</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="text-left text-[var(--muted)]">
                <tr>
                  <th className="py-1 pr-3 font-normal">Page</th>
                  <th className="pr-3 font-normal">Requests</th>
                  <th className="pr-3 font-normal">DOMContentLoaded</th>
                  <th className="font-normal">Load</th>
                </tr>
              </thead>
              <tbody>
                {har.pages.map((p) => (
                  <tr key={p.id} className="border-t border-[var(--border)]">
                    <td className="max-w-[28rem] truncate py-1 pr-3" title={p.title}>
                      {p.title || p.id}
                    </td>
                    <td className="pr-3">{p.requests}</td>
                    <td className="pr-3">{p.onContentLoad === null ? "–" : fmtMs(p.onContentLoad)}</td>
                    <td>{p.onLoad === null ? "–" : fmtMs(p.onLoad)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {phaseTotal > 0 && (
        <section>
          <h3 className="mb-1 text-[13px] font-semibold">Where request time goes</h3>
          <div className="flex h-3 overflow-hidden rounded bg-[var(--border)]" role="img" aria-label="Share of time per phase">
            {PHASES.map((k) => (
              <div key={k} title={`${k}: ${fmtMs(har.phases[k])}`} style={{ width: `${(har.phases[k] / phaseTotal) * 100}%`, background: PHASE_COLOR[k] }} />
            ))}
          </div>
          <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[var(--muted)]">
            {PHASES.map((k) => (
              <li key={k} className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ background: PHASE_COLOR[k] }} />
                {k} {Math.round((har.phases[k] / phaseTotal) * 100)}%
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Bars title="Status codes" rows={har.byStatus} unit="count" />
        <Bars title="Methods" rows={har.byMethod} unit="count" />
        <Bars title="Content types (bytes)" rows={[...har.byCategory].sort((a, b) => b.bytes - a.bytes)} unit="bytes" />
        <Bars title="Hosts (bytes)" rows={[...har.byHost].sort((a, b) => b.bytes - a.bytes)} unit="bytes" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <section>
          <h3 className="mb-1 text-[13px] font-semibold">Slowest requests</h3>
          <ul>{har.slowest.map((i) => <RequestLine key={i} r={har.requests[i]} onPick={onPick} metric={fmtMs(har.requests[i].time)} />)}</ul>
        </section>
        <section>
          <h3 className="mb-1 text-[13px] font-semibold">Largest responses</h3>
          <ul>
            {har.largest.map((i) => (
              <RequestLine key={i} r={har.requests[i]} onPick={onPick} metric={fmtBytes(har.requests[i].transfer || har.requests[i].size)} />
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

type SortKey = "index" | "status" | "method" | "host" | "size" | "time";

function Pairs({ title, rows }: { title: string; rows: [string, string][] }) {
  if (!rows.length) return null;
  return (
    <section className="mb-3">
      <h4 className="mb-1 text-[11px] font-semibold text-[var(--muted)]">
        {title} ({rows.length})
      </h4>
      <dl className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-3 gap-y-0.5 text-[11px]">
        {rows.map(([k, v], i) => (
          <div key={`${k}-${i}`} className="contents">
            <dt className="font-mono break-all text-[var(--cite-ink)]">{k}</dt>
            <dd className="font-mono break-all">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function RequestDetail({ sourceId, r, onClose }: { sourceId: string; r: HarRequest; onClose: () => void }) {
  const [tab, setTab] = useState<"headers" | "payload" | "response" | "timing">("headers");
  const [loaded, setLoaded] = useState<{ index: number; detail: HarDetail | null; error?: boolean } | null>(null);

  useEffect(() => {
    let live = true;
    void fetch(`/api/sources/${sourceId}/structure?request=${r.index}`)
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const detail = (await res.json()) as HarDetail;
        if (live) setLoaded({ index: r.index, detail });
      })
      .catch(() => live && setLoaded({ index: r.index, detail: null, error: true }));
    return () => {
      live = false;
    };
  }, [sourceId, r.index]);

  const detail = loaded?.index === r.index ? loaded.detail : null;
  const failed = loaded?.index === r.index && loaded.error;
  const total = PHASES.reduce((s, k) => s + r.phases[k], 0) || 1;

  return (
    <aside aria-label="Request details" className="flex min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-well md:w-[26rem]">
      <div className="flex items-start gap-2 border-b border-[var(--border)] px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold">
            <span className={statusTone(r.status)}>{r.status || "failed"}</span> {r.method}
          </p>
          <p className="font-mono text-[11px] break-all text-[var(--muted)]">{r.url}</p>
        </div>
        <button aria-label="Close details" className="btn !px-2 !py-0.5 !text-xs" onClick={onClose}>
          ✕
        </button>
      </div>
      <div role="tablist" aria-label="Request detail" className="flex gap-1 border-b border-[var(--border)] px-2 py-1 text-[11px]">
        {(["headers", "payload", "response", "timing"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`rounded px-2 py-0.5 capitalize ${tab === t ? "bg-[var(--selected)]" : "text-[var(--muted)]"}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {failed && <p className="text-[13px] text-[var(--muted)]">Details could not be loaded.</p>}
        {!detail && !failed && tab !== "timing" && <p className="text-[13px] text-[var(--muted)]">Loading…</p>}
        {tab === "headers" && detail && (
          <>
            <Pairs title="Request headers" rows={detail.request.headers} />
            <Pairs title="Response headers" rows={detail.response.headers} />
            <Pairs title="Request cookies" rows={detail.request.cookies} />
            <Pairs title="Response cookies" rows={detail.response.cookies} />
          </>
        )}
        {tab === "payload" && detail && (
          <>
            <Pairs title="Query string" rows={detail.request.query} />
            {detail.request.postData ? (
              <pre className="font-mono text-[11px] break-all whitespace-pre-wrap">{detail.request.postData}</pre>
            ) : (
              !detail.request.query.length && <p className="text-[13px] text-[var(--muted)]">No query string or body.</p>
            )}
          </>
        )}
        {tab === "response" && detail && (
          <>
            {detail.response.encoding && <p className="text-[13px] text-[var(--muted)]">{detail.response.encoding}</p>}
            {detail.response.body ? (
              <pre className="font-mono text-[11px] break-all whitespace-pre-wrap">{detail.response.body}</pre>
            ) : (
              !detail.response.encoding && <p className="text-[13px] text-[var(--muted)]">No response body was saved in this archive.</p>
            )}
            {detail.response.bodyTruncated && <p className="mt-2 text-[11px] text-[var(--muted)]">Showing the first 20,000 characters.</p>}
          </>
        )}
        {tab === "timing" && (
          <ul className="space-y-2 text-[11px]">
            <li className="text-[13px]">
              Total {fmtMs(r.time)} · {r.httpVersion || "HTTP"} · {fmtBytes(r.transfer || r.size)}
              {r.serverIp ? ` · ${r.serverIp}` : ""}
            </li>
            {r.serverTiming.length > 0 && (
              <li className="rounded bg-[var(--hover)] px-2 py-1">
                Server-Timing: {r.serverTiming.map((t) => `${t.name} ${fmtMs(t.dur)}`).join(", ")}
              </li>
            )}
            {PHASES.map((k) => (
              <li key={k}>
                <div className="flex justify-between">
                  <span className="capitalize">{k}</span>
                  <span className="text-[var(--muted)]">{fmtMs(r.phases[k])}</span>
                </div>
                <div className="h-1.5 rounded bg-[var(--border)]">
                  <div className="h-1.5 rounded" style={{ width: `${(r.phases[k] / total) * 100}%`, background: PHASE_COLOR[k] }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

export function Requests({ sourceId, har, selected, onSelect }: { sourceId: string; har: HarSummary; selected: number | null; onSelect: (i: number | null) => void }) {
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [thirdOnly, setThirdOnly] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "index", dir: 1 });

  const methods = useMemo(() => [...new Set(har.requests.map((r) => r.method.toUpperCase()))].sort(), [har]);
  const categories = useMemo(() => [...new Set(har.requests.map((r) => r.category))].sort(), [har]);
  const statuses = useMemo(
    () => [...new Set(har.requests.map((r) => (r.status === 0 ? "0" : `${Math.floor(r.status / 100)}`)))].sort(),
    [har]
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = har.requests.filter(
      (r) =>
        (!q || r.url.toLowerCase().includes(q) || r.mime.toLowerCase().includes(q)) &&
        (!method || r.method.toUpperCase() === method) &&
        (!category || r.category === category) &&
        (!thirdOnly || r.thirdParty) &&
        (!status || (status === "0" ? r.status === 0 : Math.floor(r.status / 100) === Number(status)))
    );
    const val = (r: HarRequest): string | number =>
      sort.key === "index" ? r.index : sort.key === "status" ? r.status : sort.key === "method" ? r.method : sort.key === "host" ? r.host : sort.key === "size" ? r.transfer || r.size : r.time;
    return [...list].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [har, query, method, category, status, sort, thirdOnly]);

  const exportCsv = () => {
    const cell = (v: string | number | boolean) => {
      const s = String(v);
      // A leading = + - @ would run as a formula when the CSV opens in a spreadsheet.
      const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
      return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };
    const head = ["#", "method", "status", "url", "type", "size_bytes", "transfer_bytes", "time_ms", "blocked_ms", "dns_ms", "connect_ms", "ssl_ms", "send_ms", "wait_ms", "receive_ms", "http_version", "third_party"];
    const lines = rows.map((r) =>
      [r.index + 1, r.method, r.status, r.url, r.mime, r.size, r.transfer, Math.round(r.time), ...PHASES.map((k) => Math.round(r.phases[k])), r.httpVersion, r.thirdParty].map(cell).join(",")
    );
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "requests.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const end = Math.max(1, har.totals.wallTime);
  const current = selected !== null ? har.requests[selected] : null;
  const head = (key: SortKey, label: string) => (
    <th scope="col" aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className="px-2 py-1 text-left font-normal">
      <button onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === 1 ? -1 : 1 }))}>
        {label}
        {sort.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
  const select = "input !h-8 !w-auto !py-0 text-[13px]";

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <input aria-label="Search requests" className="input !h-8 min-w-0 flex-1 !py-0 text-[13px]" placeholder="Search URL or content type…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select aria-label="Method" className={select} value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="">All methods</option>
          {methods.map((m) => <option key={m}>{m}</option>)}
        </select>
        <select aria-label="Status" className={select} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {statuses.map((s) => <option key={s} value={s}>{s === "0" ? "Failed (0)" : `${s}xx`}</option>)}
        </select>
        <select aria-label="Type" className={select} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All types</option>
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-[13px]">
          <input type="checkbox" checked={thirdOnly} onChange={(e) => setThirdOnly(e.target.checked)} />
          Third-party
        </label>
        <button className="btn !px-2.5 !py-1 !text-xs" onClick={exportCsv} title="Download the filtered requests as CSV">
          Export CSV
        </button>
        <span className="text-[11px] text-[var(--muted)]">{rows.length.toLocaleString()} of {har.requests.length.toLocaleString()}</span>
      </div>
      <div className="flex min-h-0 flex-1 gap-3 max-md:flex-col">
        <div className="min-h-0 min-w-0 flex-1 overflow-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-[var(--panel)] text-[var(--muted)]">
              <tr>
                {head("index", "#")}
                {head("status", "Status")}
                {head("method", "Method")}
                {head("host", "URL")}
                {head("size", "Size")}
                {head("time", "Time")}
                <th scope="col" className="w-40 px-2 py-1 text-left font-normal">Waterfall</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 1000).map((r) => (
                <tr
                  key={r.index}
                  aria-selected={selected === r.index}
                  className={`cursor-pointer border-t border-[var(--border)] ${selected === r.index ? "bg-[var(--selected)]" : "hover:bg-[var(--hover)]"}`}
                  onClick={() => onSelect(r.index)}
                >
                  <td className="px-2 py-1 text-[var(--muted)]">{r.index + 1}</td>
                  <td className={`px-2 py-1 ${statusTone(r.status)}`}>{r.status || "failed"}</td>
                  <td className="px-2 py-1">{r.method}</td>
                  <td className="max-w-[22rem] px-2 py-1">
                    <button
                      className="block w-full truncate text-left"
                      title={r.url}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(r.index);
                      }}
                    >
                      <span className="text-[var(--muted)]">{r.host}</span>
                      {r.path}
                    </button>
                  </td>
                  <td className="px-2 py-1 whitespace-nowrap">{fmtBytes(r.transfer || r.size)}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{fmtMs(r.time)}</td>
                  <td className="px-2 py-1">
                    <div className="relative h-2.5 rounded bg-[var(--border)]" aria-hidden>
                      <div className="absolute top-0 flex h-2.5 overflow-hidden rounded" style={{ left: `${(r.offset / end) * 100}%`, width: `${Math.max(0.8, (r.time / end) * 100)}%` }}>
                        {PHASES.map((k) => {
                          const sum = PHASES.reduce((s, p) => s + r.phases[p], 0) || 1;
                          return <div key={k} style={{ width: `${(r.phases[k] / sum) * 100}%`, background: PHASE_COLOR[k] }} />;
                        })}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={7} className="px-2 py-3 text-[var(--muted)]">No requests match the filters.</td>
                </tr>
              )}
            </tbody>
          </table>
          {rows.length > 1000 && <p className="p-2 text-[11px] text-[var(--muted)]">Showing the first 1,000. Filter to narrow.</p>}
        </div>
        {current && <RequestDetail sourceId={sourceId} r={current} onClose={() => onSelect(null)} />}
      </div>
    </div>
  );
}
