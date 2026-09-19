"use client";

import { useState } from "react";
import { STUDIO, STUDIO_ORDER } from "@/lib/studio";
import {
  INFOGRAPHIC_STYLES,
  STYLE_ORDER,
  type InfographicStyle,
} from "@/lib/infographic";
import type { Artifact, ArtifactType } from "@/lib/types";

export default function StudioPanel({
  notebookId,
  hasSources,
  selectedIds,
  artifacts,
  onOpen,
  onChanged,
}: {
  notebookId: string;
  hasSources: boolean;
  selectedIds: string[];
  artifacts: Artifact[];
  onOpen: (a: Artifact) => void;
  onChanged: () => Promise<void> | void;
}) {
  const [topic, setTopic] = useState("");
  const [style, setStyle] = useState<InfographicStyle>("classic");
  const [busy, setBusy] = useState<ArtifactType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (
    type: ArtifactType,
    url: string,
    body: Record<string, unknown>
  ) => {
    setBusy(type);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Generation failed");
      await onChanged();
      onOpen(json as Artifact);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(null);
    }
  };

  const generate = (type: ArtifactType) =>
    run(type, "/api/generate", {
      notebookId,
      type,
      topic: topic.trim() || undefined,
      sourceIds: selectedIds,
      ...(type === "infographic" ? { style } : {}),
    });

  const generateAudio = () =>
    run("podcast", "/api/podcast", {
      notebookId,
      topic: topic.trim() || undefined,
      sourceIds: selectedIds,
    });

  const remove = async (id: string) => {
    await fetch(`/api/artifacts/${id}`, { method: "DELETE" });
    await onChanged();
  };

  const blocked = !hasSources || selectedIds.length === 0;

  return (
    <aside className="flex h-full min-h-0 flex-col bg-[var(--panel)]">
      <div className="px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold tracking-wide">Studio</h2>
        <p className="mt-1 text-[11px] text-[var(--muted)]">
          Turn your sources into something you can actually use.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <input
          className="input mb-3"
          placeholder="Optional focus, e.g. 'funding risks'"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />

        <label className="mb-3 block">
          <span className="mb-1.5 flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
            <span>{INFOGRAPHIC_STYLES[style].icon}</span>
            Infographic style
          </span>
          <select
            className="input cursor-pointer appearance-none"
            value={style}
            onChange={(e) => setStyle(e.target.value as InfographicStyle)}
          >
            {STYLE_ORDER.map((key) => (
              <option key={key} value={key}>
                {INFOGRAPHIC_STYLES[key].label} — {INFOGRAPHIC_STYLES[key].blurb}
              </option>
            ))}
          </select>
        </label>

        <button
          disabled={blocked || !!busy}
          onClick={() => void generateAudio()}
          className={`card group relative mb-2 flex w-full items-center gap-3 overflow-hidden px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
            busy === "podcast"
              ? "shimmer border-[var(--accent)]"
              : "hover:border-[#39424f]"
          }`}
        >
          <span className="text-xl">🎧</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium">Audio overview</span>
            <span className="block text-[10px] leading-snug text-[var(--muted)]">
              {busy === "podcast"
                ? "Writing and narrating… this takes a minute"
                : "Two hosts discuss your sources"}
            </span>
          </span>
        </button>

        <div className="grid grid-cols-2 gap-2">
          {STUDIO_ORDER.map((type) => {
            const s = STUDIO[type];
            const isBusy = busy === type;
            return (
              <button
                key={type}
                disabled={blocked || !!busy}
                onClick={() => void generate(type)}
                className={`card group relative overflow-hidden px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  isBusy ? "shimmer border-[var(--accent)]" : "hover:border-[#39424f]"
                }`}
              >
                <div className="mb-1.5 text-lg">{s.icon}</div>
                <div className="text-[13px] font-medium">{s.label}</div>
                <div className="mt-0.5 text-[10px] leading-snug text-[var(--muted)]">
                  {isBusy ? "Generating…" : s.blurb}
                </div>
              </button>
            );
          })}
        </div>

        {blocked && (
          <p className="mt-3 text-[11px] text-[var(--muted)]">
            {hasSources
              ? "Select at least one source to generate."
              : "Add a source to unlock the studio."}
          </p>
        )}
        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

        <div className="mt-6">
          <h3 className="mb-2 text-[11px] font-semibold tracking-widest text-[var(--muted)] uppercase">
            Generated
          </h3>
          {artifacts.length === 0 ? (
            <p className="text-[11px] text-[var(--muted)]">
              Nothing yet. Pick a format above.
            </p>
          ) : (
            <ul className="space-y-1">
              {artifacts.map((a) => (
                <li
                  key={a.id}
                  className="group flex items-center gap-2 rounded-xl border border-transparent px-2 py-2 transition hover:border-[var(--border)] hover:bg-[#171b21]"
                >
                  <span className="text-base">
                    {STUDIO[a.type as ArtifactType]?.icon ?? "📄"}
                  </span>
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => onOpen(a)}
                  >
                    <div className="truncate text-[13px] font-medium">{a.title}</div>
                    <div className="text-[10px] text-[#6b7482]">
                      {STUDIO[a.type as ArtifactType]?.label} ·{" "}
                      {new Date(a.createdAt).toLocaleString()}
                    </div>
                  </button>
                  <button
                    aria-label="Delete"
                    className="shrink-0 rounded px-1 text-xs text-[var(--muted)] opacity-0 transition group-hover:opacity-100 hover:text-red-400"
                    onClick={() => void remove(a.id)}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}
