"use client";

import { useCallback, useEffect, useState } from "react";

type ModelsResponse = {
  provider: "azure" | "openai";
  current: { chat: string; embedding: string; image: string };
  env: { chat: string; embedding: string; image: string };
  overridden: { chat: boolean; embedding: boolean; image: boolean };
  chat: string[];
  embedding: string[];
  image: string[];
  embeddedChunks: number;
  staleChunks: number;
  discoveryError: string | null;
};

export default function ModelPicker({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<ModelsResponse | null>(null);
  const [chat, setChat] = useState("");
  const [embedding, setEmbedding] = useState("");
  const [image, setImage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/models");
      const json = (await res.json()) as ModelsResponse;
      if (!res.ok) throw new Error((json as unknown as { error?: string }).error);
      setData(json);
      setChat(json.current.chat);
      setEmbedding(json.current.embedding);
      setImage(json.current.image);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load models");
    }
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    void load();
    return () => window.removeEventListener("keydown", h);
  }, [load, onClose]);

  if (!data && !error) {
    return (
      <Shell onClose={onClose}>
        <div className="card shimmer h-40" />
      </Shell>
    );
  }

  if (error || !data) {
    return (
      <Shell onClose={onClose}>
        <p className="text-sm text-red-300">{error}</p>
      </Shell>
    );
  }

  const embeddingChanged = embedding !== data.current.embedding;
  const dirty =
    chat !== data.current.chat || embeddingChanged || image !== data.current.image;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat, embedding, image }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save");
      setSavedNote(
        json.staleChunks > 0
          ? `Saved. ${json.staleChunks} chunk${json.staleChunks === 1 ? "" : "s"} were embedded with a different model and now rank by keyword only — re-embed each notebook to restore semantic search.`
          : "Saved."
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    try {
      await fetch("/api/models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat: null, embedding: null, image: null }),
      });
      setSavedNote("Reset to the configured defaults.");
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell onClose={onClose}>
      <p className="mb-4 text-[11px] text-[var(--muted)]">
        {data.provider === "azure" ? "Azure OpenAI" : "OpenAI-compatible endpoint"} ·{" "}
        {data.chat.length} chat and {data.embedding.length} embedding model
        {data.embedding.length === 1 ? "" : "s"} available
      </p>

      {data.discoveryError && (
        <p className="mb-4 rounded-lg border border-amber-900/60 bg-amber-950/20 px-3 py-2 text-[11px] leading-snug text-amber-200/90">
          Could not list models from the provider ({data.discoveryError}). Only the
          configured models are shown.
        </p>
      )}

      <Field
        label="Generation model"
        hint="Used for chat, Studio formats, summaries and audio scripts."
        value={chat}
        options={data.chat}
        overridden={data.overridden.chat}
        envValue={data.env.chat}
        onChange={setChat}
        disabled={saving}
      />

      <Field
        label="Embedding model"
        hint="Used to index and search your sources."
        value={embedding}
        options={data.embedding}
        overridden={data.overridden.embedding}
        envValue={data.env.embedding}
        onChange={setEmbedding}
        disabled={saving}
      />

      <Field
        label="Image model"
        hint={
          data.image.length
            ? 'Used by the "AI image" infographic style.'
            : 'Used by the "AI image" infographic style. No image model was found — deploy one to use it.'
        }
        value={image}
        options={data.image}
        overridden={data.overridden.image}
        envValue={data.env.image}
        onChange={setImage}
        disabled={saving}
      />

      {embeddingChanged && data.embeddedChunks > 0 && (
        <p className="mb-4 rounded-lg border border-amber-900/60 bg-amber-950/20 px-3 py-2.5 text-[12px] leading-snug text-amber-200/90">
          Embeddings from different models cannot be compared. Switching leaves all{" "}
          {data.embeddedChunks} existing chunk
          {data.embeddedChunks === 1 ? "" : "s"} ranked by keyword only until each
          notebook is re-embedded.
        </p>
      )}

      {savedNote && (
        <p className="mb-4 rounded-lg border border-[var(--border)] bg-[#0e1116] px-3 py-2.5 text-[12px] leading-snug text-[var(--muted)]">
          {savedNote}
        </p>
      )}

      <div className="flex items-center gap-2">
        {(data.overridden.chat || data.overridden.embedding || data.overridden.image) && (
          <button
            className="text-[11px] text-[var(--muted)] transition hover:text-[var(--fg)]"
            onClick={() => void reset()}
            disabled={saving}
          >
            Reset to defaults
          </button>
        )}
        <div className="ml-auto flex gap-2">
          <button className="btn !py-1.5 !text-xs" onClick={onClose}>
            Close
          </button>
          <button
            className="btn btn-primary !py-1.5 !text-xs"
            onClick={() => void save()}
            disabled={saving || !dirty}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Shell>
  );
}

function Field({
  label,
  hint,
  value,
  options,
  overridden,
  envValue,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  value: string;
  options: string[];
  overridden: boolean;
  envValue: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="mb-4 block">
      <span className="mb-1 flex items-center gap-2">
        <span className="text-[12px] font-medium">{label}</span>
        {overridden && (
          <span className="rounded bg-[#1e2430] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
            overrides {envValue}
          </span>
        )}
      </span>
      <span className="mb-1.5 block text-[11px] leading-snug text-[var(--muted)]">
        {hint}
      </span>
      <select
        className="input cursor-pointer"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
    </label>
  );
}

function Shell({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="fade-up w-full max-w-md overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center gap-2">
          <span className="text-lg">🧠</span>
          <h2 className="flex-1 text-[15px] font-semibold">Models</h2>
          <button
            aria-label="Close"
            className="btn !px-2.5 !py-1.5 !text-xs"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
