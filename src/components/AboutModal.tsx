"use client";

import { AUTHOR, GITHUB_URL, LINKEDIN_URL, MIT_LICENSE, REPO_URL } from "@/lib/about";
import { useDialog } from "./useDialog";

const DOCS = `${REPO_URL}/blob/main/docs`;

/** The core loop and where things live, in the order a new user meets them. */
const HELP: { title: string; body: string; doc?: string }[] = [
  {
    title: "1. Add sources",
    body: "Open or create a notebook, then upload files, add a link, paste text, search or browse the web, or reuse a source from another notebook.",
    doc: "sources.md",
  },
  {
    title: "2. Choose which sources to use",
    body: "Tick sources in the Sources panel. Chat and Studio use only the ticked ones, and the header shows how many are in use.",
  },
  {
    title: "3. Ask in Chat",
    body: "Answers come only from your sources. Numbered citations open the exact passage. Save a good answer to Notes.",
    doc: "grounding.md",
  },
  {
    title: "4. Create in Studio",
    body: "Pick a format, adjust its Options if you like, and press Generate. Results appear in Studio's Library. Audio and video stop at an editable script before anything is narrated or rendered.",
    doc: "studio.md",
  },
  {
    title: "Notes and transformations",
    body: "Notes sit beside Studio. Transformations are reusable prompts. Open a source and choose Transform to run one; the result becomes a note.",
    doc: "notes-and-search.md",
  },
  {
    title: "Search, live discussion and screen helper",
    body: "Search finds and answers across every notebook. Live discussion lets you talk your sources through out loud. Screen helper coaches you through any app, one step at a time.",
    doc: "features.md",
  },
  {
    title: "Mistakes are recoverable",
    body: "Deleted sources, notes, chats, artifacts and notebooks can be restored for 8 seconds from the Undo prompt.",
  },
];

export default function AboutModal({
  onClose,
  onStartTour,
}: {
  onClose: () => void;
  /** Offered inside a notebook, where the walkthrough's panels exist. */
  onStartTour?: () => void;
}) {
  const { dialogRef, backdropProps } = useDialog(onClose);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      {...backdropProps}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        className="fade-up card flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden !p-0 outline-none"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-5 py-3">
          <div className="flex-1">
            <h2 id="about-title" className="text-[15px] font-semibold">
              InfiniAIBook
            </h2>
            <p className="text-[11px] text-[var(--muted)]">
              Help and about: a self-hosted research notebook for grounded chat, notes and
              Studio artifacts.
            </p>
          </div>
          <button aria-label="Close" className="btn !px-2.5 !py-1.5 !text-xs" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <section aria-labelledby="help-title">
            <div className="flex items-center gap-2">
              <h3 id="help-title" className="flex-1 text-[13px] font-semibold">
                How InfiniAIBook works
              </h3>
              {onStartTour && (
                <button
                  type="button"
                  className="btn hidden !px-2.5 !py-1 !text-[11px] lg:inline-flex"
                  onClick={onStartTour}
                >
                  Show me around
                </button>
              )}
            </div>
            <ul className="mt-2 space-y-2">
              {HELP.map((h) => (
                <li key={h.title} className="rounded-xl border border-[var(--border)] px-3 py-2">
                  <p className="text-[13px] font-medium">{h.title}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-[var(--muted)]">
                    {h.body}
                    {h.doc && (
                      <>
                        {" "}
                        <a
                          className="text-[var(--accent)] underline-offset-2 hover:underline"
                          href={`${DOCS}/${h.doc}`}
                          aria-label={`Learn more: ${h.title.replace(/^\d+\.\s*/, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Learn more
                        </a>
                      </>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <h3 className="mt-5 text-[13px] font-semibold">About</h3>
          <p className="mt-1 text-sm text-[#d7dee8]">Created by {AUTHOR}</p>
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

          <details className="mt-5">
            <summary className="cursor-pointer text-[13px] font-semibold">
              License <span className="font-normal text-[var(--muted)]">· MIT</span>
            </summary>
            <pre className="mt-2 max-h-80 overflow-auto rounded-xl border border-[var(--border)] bg-[#0b0d12] p-3 text-[11px] leading-relaxed whitespace-pre-wrap text-prose-soft">
              {MIT_LICENSE}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}
