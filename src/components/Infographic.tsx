"use client";

import { InlineCited } from "./Markdown";
import type { Citation, InfographicContent } from "@/lib/types";

const ACCENTS: Record<string, { from: string; to: string; soft: string; text: string }> = {
  indigo: { from: "#6366f1", to: "#8b5cf6", soft: "rgba(99,102,241,0.12)", text: "#a5b4fc" },
  emerald: { from: "#10b981", to: "#14b8a6", soft: "rgba(16,185,129,0.12)", text: "#6ee7b7" },
  amber: { from: "#f59e0b", to: "#f97316", soft: "rgba(245,158,11,0.12)", text: "#fcd34d" },
  rose: { from: "#f43f5e", to: "#ec4899", soft: "rgba(244,63,94,0.12)", text: "#fda4af" },
  sky: { from: "#0ea5e9", to: "#06b6d4", soft: "rgba(14,165,233,0.12)", text: "#7dd3fc" },
  violet: { from: "#8b5cf6", to: "#d946ef", soft: "rgba(139,92,246,0.12)", text: "#c4b5fd" },
};

const STAT_COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
};

export default function Infographic({
  content,
  citations,
}: {
  content: InfographicContent;
  citations?: Citation[];
}) {
  const a = ACCENTS[content.accent ?? "indigo"] ?? ACCENTS.indigo;

  return (
    <div
      className="overflow-hidden rounded-2xl border border-[var(--border)]"
      style={{ background: "#0e1116" }}
    >
      <div
        className="px-7 py-8 text-center"
        style={{ background: `linear-gradient(135deg, ${a.from}, ${a.to})` }}
      >
        <h1 className="text-2xl leading-tight font-bold text-white sm:text-3xl">
          {content.title}
        </h1>
        {content.subtitle && (
          <p className="mx-auto mt-2 max-w-xl text-sm text-white/85">
            {content.subtitle}
          </p>
        )}
      </div>

      {content.stats.length > 0 && (
        <div className={`grid gap-px bg-[var(--border)] ${STAT_COLS[Math.min(content.stats.length, 4)]}`}>
          {content.stats.map((s, i) => (
            <div key={i} className="bg-[#12151a] px-5 py-6 text-center">
              <div
                className="text-3xl font-bold tracking-tight"
                style={{ color: a.text }}
              >
                {s.value}
              </div>
              <div className="mt-1 text-[13px] font-medium">{s.label}</div>
              {s.caption && (
                <p className="mt-1.5 text-[11px] leading-snug text-[var(--muted)]">
                  <InlineCited text={s.caption} citations={citations} />
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 p-6 sm:grid-cols-2">
        {content.sections.map((s, i) => (
          <div
            key={i}
            className="rounded-xl border border-[var(--border)] p-4"
            style={{ background: a.soft }}
          >
            <div className="mb-2.5 flex items-center gap-2">
              <span className="text-xl">{s.icon || "•"}</span>
              <h3 className="text-[15px] font-semibold">{s.heading}</h3>
            </div>
            <ul className="space-y-2">
              {s.bullets.map((b, bi) => (
                <li key={bi} className="flex gap-2 text-[13px] leading-snug">
                  <span
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: a.from }}
                  />
                  <span>
                    <InlineCited text={b} citations={citations} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {content.takeaway && (
        <div
          className="mx-6 mb-6 rounded-xl border px-5 py-4"
          style={{ borderColor: `${a.from}55`, background: a.soft }}
        >
          <div className="mb-1 text-[10px] font-semibold tracking-widest uppercase" style={{ color: a.text }}>
            Key takeaway
          </div>
          <p className="text-[15px] leading-relaxed font-medium">
            <InlineCited text={content.takeaway} citations={citations} />
          </p>
        </div>
      )}
    </div>
  );
}
