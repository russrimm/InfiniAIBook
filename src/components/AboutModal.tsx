"use client";

import { useEffect } from "react";
import { AUTHOR, GITHUB_URL, LINKEDIN_URL, MIT_LICENSE, REPO_URL } from "@/lib/about";

export default function AboutModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        className="fade-up card flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden !p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-5 py-3">
          <div className="flex-1">
            <h2 id="about-title" className="text-[15px] font-semibold">
              InfiniAIBook
            </h2>
            <p className="text-[11px] text-[var(--muted)]">
              A self-hosted research notebook for grounded notes, chat and Studio artifacts.
            </p>
          </div>
          <button aria-label="Close" className="btn !px-2.5 !py-1.5 !text-xs" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p className="text-sm text-[#d7dee8]">Created by {AUTHOR}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-[13px]">
            <a className="btn !text-[12px]" href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer">
              LinkedIn
            </a>
            <a className="btn !text-[12px]" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            <a className="btn !text-[12px]" href={REPO_URL} target="_blank" rel="noopener noreferrer">
              Source repository
            </a>
          </div>

          <section className="mt-5">
            <h3 className="text-[13px] font-semibold">License</h3>
            <p className="mt-1 text-[12px] text-[var(--muted)]">MIT License</p>
            <pre className="mt-2 max-h-80 overflow-auto rounded-xl border border-[var(--border)] bg-[#0b0d12] p-3 text-[11px] leading-relaxed whitespace-pre-wrap text-[#c9d2dd]">
              {MIT_LICENSE}
            </pre>
          </section>
        </div>
      </div>
    </div>
  );
}
