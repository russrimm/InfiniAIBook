"use client";

import { useEffect, useRef, useState } from "react";
import Markdown from "./Markdown";
import type { ChatSession, Citation, Message, Source } from "@/lib/types";

const STARTERS = [
  "Summarise the key arguments across my sources.",
  "What do these sources disagree about?",
  "What evidence is weakest or least supported?",
  "Give me a timeline of what happened.",
];

export default function ChatPanel({
  notebookId,
  sources,
  selectedIds,
  initialMessages,
  sessions,
  onNoteSaved,
}: {
  notebookId: string;
  sources: Source[];
  selectedIds: string[];
  /** Messages of `sessions[0]`, the most recent conversation. */
  initialMessages: Message[];
  sessions: ChatSession[];
  onNoteSaved?: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  /** null is a new, unsaved chat; the server creates it on the first question. */
  const [sessionId, setSessionId] = useState<string | null>(sessions[0]?.id ?? null);
  const [sessionList, setSessionList] = useState<ChatSession[]>(sessions);
  const [loadingSession, setLoadingSession] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftCites, setDraftCites] = useState<Citation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // The notebook reloads often (uploads, polling); that refreshes the list of
  // chats but must not swap out the one being read.
  useEffect(() => {
    setSessionList(sessions);
  }, [sessions]);

  const openSession = async (id: string | null) => {
    if (streaming) return;
    setError(null);
    setNotice(null);
    setSessionId(id);
    if (!id) {
      setMessages([]);
      return;
    }
    setLoadingSession(true);
    try {
      const res = await fetch(`/api/sessions/${id}`);
      if (!res.ok) throw new Error("That chat could not be opened.");
      setMessages(((await res.json()) as { messages: Message[] }).messages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That chat could not be opened.");
    } finally {
      setLoadingSession(false);
    }
  };

  const renameSession = async () => {
    const current = sessionList.find((s) => s.id === sessionId);
    if (!current) return;
    const title = window.prompt("Rename this chat", current.title)?.trim();
    if (!title) return;
    setSessionList((l) => l.map((s) => (s.id === current.id ? { ...s, title } : s)));
    await fetch(`/api/sessions/${current.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    });
  };

  const deleteCurrentSession = async () => {
    const current = sessionList.find((s) => s.id === sessionId);
    if (!current || !window.confirm(`Delete "${current.title}" and its messages?`)) return;
    await fetch(`/api/sessions/${current.id}`, { method: "DELETE" });
    const rest = sessionList.filter((s) => s.id !== current.id);
    setSessionList(rest);
    void openSession(rest[0]?.id ?? null);
  };

  const saveAsNote = async (m: Message, index: number) => {
    const question = messages
      .slice(0, index)
      .reverse()
      .find((x) => x.role === "user")?.content;
    const res = await fetch(`/api/notebooks/${notebookId}/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: question ? question.slice(0, 120) : undefined,
        content: m.content,
        kind: "ai",
        citations: m.citations,
      }),
    });
    if (res.ok) {
      setSavedIds((s) => new Set(s).add(m.id));
      onNoteSaved?.();
    } else {
      setError("Could not save that answer as a note.");
    }
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, draft]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || streaming) return;
    setInput("");
    setError(null);
    setDraft("");
    setDraftCites([]);
    setMessages((m) => [
      ...m,
      { id: `tmp-${Date.now()}`, role: "user", content: q, createdAt: Date.now() },
    ]);
    setStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notebookId,
          message: q,
          sourceIds: selectedIds,
          sessionId: sessionId ?? undefined,
        }),
      });

      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(j.error || "Request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";
      let cites: Citation[] = [];

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as {
            type: string;
            v?: string;
            citations?: Citation[];
            error?: string;
            notice?: string;
            id?: string;
            session?: ChatSession;
          };
          if (ev.type === "session" && ev.session) {
            const s = ev.session;
            setSessionId(s.id);
            setSessionList((l) => [s, ...l.filter((x) => x.id !== s.id)]);
          } else if (ev.type === "citations" && ev.citations) {
            cites = ev.citations;
            setDraftCites(cites);
          } else if (ev.type === "notice" && ev.notice) {
            setNotice(ev.notice);
          } else if (ev.type === "delta" && ev.v) {
            acc += ev.v;
            setDraft(acc);
          } else if (ev.type === "error") {
            throw new Error(ev.error || "Stream failed");
          } else if (ev.type === "done") {
            setMessages((m) => [
              ...m,
              {
                id: ev.id ?? `a-${Date.now()}`,
                role: "assistant",
                content: acc,
                citations: ev.citations ?? cites,
                createdAt: Date.now(),
              },
            ]);
            setDraft("");
            setDraftCites([]);
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setDraft("");
    } finally {
      setStreaming(false);
    }
  };

  const disabled = sources.length === 0;

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-4 py-2 sm:px-8">
        <select
          aria-label="Chat"
          className="input !h-8 min-w-0 flex-1 !py-0 text-[12px]"
          value={sessionId ?? ""}
          disabled={streaming}
          onChange={(e) => void openSession(e.target.value || null)}
        >
          {!sessionId && <option value="">New chat</option>}
          {sessionList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <button
          className="btn shrink-0 !px-2.5 !py-1 !text-[11px]"
          disabled={streaming || !sessionId}
          onClick={() => void openSession(null)}
          title="Start a new conversation"
        >
          ＋ New
        </button>
        {sessionId && (
          <>
            <button
              className="btn shrink-0 !px-2 !py-1 !text-[11px]"
              disabled={streaming}
              onClick={() => void renameSession()}
              title="Rename this chat"
              aria-label="Rename this chat"
            >
              ✎
            </button>
            <button
              className="btn shrink-0 !px-2 !py-1 !text-[11px]"
              disabled={streaming}
              onClick={() => void deleteCurrentSession()}
              title="Delete this chat"
              aria-label="Delete this chat"
            >
              🗑
            </button>
          </>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-3xl">
          {loadingSession && (
            <p className="pt-8 text-center text-sm text-[var(--muted)]">Loading chat…</p>
          )}
          {!loadingSession && messages.length === 0 && !draft && (
            <div className="pt-8 pb-6 text-center">
              <div className="mb-3 text-4xl">💬</div>
              <h2 className="text-lg font-medium">Ask your sources anything</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">
                {disabled
                  ? "Add a source first — answers are grounded strictly in the documents you upload."
                  : "Every answer is drawn only from your selected sources, with inline citations you can hover."}
              </p>
              {!disabled && (
                <div className="mx-auto mt-6 grid max-w-xl gap-2 sm:grid-cols-2">
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      className="card px-3 py-2.5 text-left text-[13px] text-[var(--muted)] transition hover:border-[#39424f] hover:text-[var(--fg)]"
                      onClick={() => void send(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-6">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={m.id} className="fade-up flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[#232a36] px-4 py-2.5 text-[15px] leading-relaxed">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="fade-up">
                  <Markdown citations={m.citations}>{m.content}</Markdown>
                  {!!m.citations?.length && <CiteFooter citations={m.citations} />}
                  <button
                    className="mt-2 text-[11px] text-[var(--muted)] transition hover:text-[var(--fg)] disabled:opacity-60"
                    disabled={savedIds.has(m.id)}
                    onClick={() => void saveAsNote(m, i)}
                  >
                    {savedIds.has(m.id) ? "✓ Saved to notes" : "🗒️ Save to notes"}
                  </button>
                </div>
              )
            )}

            {streaming && (
              <div className="fade-up">
                {draft ? (
                  <Markdown citations={draftCites}>{draft}</Markdown>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
                    <span className="typing-dot" />
                    <span className="typing-dot" style={{ animationDelay: "160ms" }} />
                    <span className="typing-dot" style={{ animationDelay: "320ms" }} />
                    <span className="ml-1">Reading your sources…</span>
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {notice && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-900/60 bg-amber-950/20 px-4 py-3 text-[13px] leading-snug text-amber-200/90">
                <span className="flex-1">{notice}</span>
                <button
                  className="shrink-0 rounded px-1 text-xs text-amber-200/70 transition hover:text-amber-100"
                  onClick={() => setNotice(null)}
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="shrink-0 border-t border-[var(--border)] px-4 py-3 sm:px-8">
        <form
          className="mx-auto flex max-w-3xl items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <textarea
            className="input max-h-40 min-h-[44px] resize-none py-3"
            rows={1}
            placeholder={
              disabled ? "Add a source to start chatting…" : "Ask about your sources…"
            }
            value={input}
            disabled={disabled}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
          />
          <button
            className="btn btn-primary h-[44px] shrink-0 !px-4"
            disabled={disabled || streaming || !input.trim()}
          >
            {streaming ? "…" : "Send"}
          </button>
        </form>
        <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-[#6b7482]">
          {selectedIds.length} of {sources.length} sources in context · answers are
          grounded in your documents only
        </p>
      </div>
    </section>
  );
}

function CiteFooter({ citations }: { citations: Citation[] }) {
  const [open, setOpen] = useState(false);
  const unique = Array.from(
    new Map(citations.map((c) => [`${c.sourceId}-${c.part}`, c])).values()
  );
  return (
    <div className="mt-3">
      <button
        className="text-[11px] font-medium text-[var(--muted)] transition hover:text-[var(--fg)]"
        onClick={() => setOpen(!open)}
      >
        {open ? "▾" : "▸"} {unique.length} citation{unique.length === 1 ? "" : "s"}
      </button>
      {open && (
        <ul className="fade-up mt-2 space-y-1.5">
          {unique.map((c) => (
            <li
              key={`${c.sourceId}-${c.part}`}
              className="rounded-lg border border-[var(--border)] bg-[#0e1116] px-3 py-2"
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="cite">{c.n}</span>
                <span className="truncate text-[11px] font-medium">
                  {c.sourceTitle}
                </span>
                <span className="text-[10px] text-[#6b7482]">part {c.part}</span>
              </div>
              <p className="line-clamp-3 text-[11px] leading-snug text-[var(--muted)]">
                {c.snippet}…
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
