"use client";

import { useEffect, useState } from "react";

type Full = {
  id: string;
  title: string;
  kind: string;
  url: string | null;
  text: string;
  chars: number;
  summary: string | null;
};

export default function SourceModal({
  sourceId,
  onClose,
}: {
  sourceId: string;
  onClose: () => void;
}) {
  const [src, setSrc] = useState<Full | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    void fetch(`/api/sources/${sourceId}`)
      .then((r) => r.json())
      .then(setSrc);
    return () => window.removeEventListener("keydown", h);
  }, [sourceId, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/65 p-0 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        className="fade-up flex h-full w-full max-w-3xl flex-col overflow-hidden border border-[var(--border)] bg-[var(--panel)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-[var(--border)] px-5 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-semibold">
              {src?.title ?? "Loading…"}
            </h2>
            {src && (
              <p className="text-[11px] text-[var(--muted)]">
                {src.kind.toUpperCase()} · {src.chars.toLocaleString()} characters
                {src.url && (
                  <>
                    {" · "}
                    <a
                      className="underline hover:text-[var(--fg)]"
                      href={src.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      original
                    </a>
                  </>
                )}
              </p>
            )}
          </div>
          <button
            aria-label="Close"
            className="btn !px-2.5 !py-1.5 !text-xs"
            onClick={onClose}
          >
            ✕
          </button>
        </header>

        {src?.summary && (
          <div className="shrink-0 border-b border-[var(--border)] bg-[#0e1116] px-5 py-3 text-[13px] leading-relaxed text-[var(--muted)]">
            {src.summary}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <pre className="font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-[#c9d2dd]">
            {src?.text ?? ""}
          </pre>
        </div>
      </div>
    </div>
  );
}
