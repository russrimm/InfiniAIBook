"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import Markdown from "./Markdown";
import { useCitationHandler } from "./CitationContext";
import { useDeferredDelete } from "./UndoToast";
import type { ChatSession, Citation, Message, Source } from "@/lib/types";

/** Mirrors MAX_MESSAGE_CHARS in src/app/api/chat/route.ts. */
const MAX_MESSAGE_CHARS = 20_000;
const STOPPED_MARK = "\n\n_(Stopped before the answer was finished.)_";

const STARTERS = [
  "Summarize the key arguments across my sources.",
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
  /** Chats deleted but still within their undo window. */
  const [hiddenSessions, setHiddenSessions] = useState<Set<string>>(new Set());
  const deferDelete = useDeferredDelete();
  const [loadingSession, setLoadingSession] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftCites, setDraftCites] = useState<Citation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** Follow new text only while the reader is at the bottom. */
  const stickToBottom = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  /** Pending animation frame for the streamed draft, so tokens batch per paint. */
  const frame = useRef<number | null>(null);

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

  const deleteCurrentSession = () => {
    const current = sessionList.find((s) => s.id === sessionId);
    if (!current) return;
    setHiddenSessions((h) => new Set(h).add(current.id));
    const rest = sessionList.filter((s) => s.id !== current.id && !hiddenSessions.has(s.id));
    void openSession(rest[0]?.id ?? null);
    deferDelete({
      label: `Chat “${current.title}”`,
      url: `/api/sessions/${current.id}`,
      onUndo: () => {
        setHiddenSessions((h) => {
          const next = new Set(h);
          next.delete(current.id);
          return next;
        });
        void openSession(current.id);
      },
      onCommitted: () =>
        setSessionList((l) => l.filter((s) => s.id !== current.id)),
    });
  };

  // Read through refs so the callback below is stable and memoised rows do not
  // re-render on every streamed token.
  const messagesRef = useRef(messages);
  const onNoteSavedRef = useRef(onNoteSaved);
  useEffect(() => {
    messagesRef.current = messages;
    onNoteSavedRef.current = onNoteSaved;
  });

  const saveAsNote = useCallback(
    async (m: Message) => {
      const list = messagesRef.current;
      const index = list.findIndex((x) => x.id === m.id);
      const question = list
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
        onNoteSavedRef.current?.();
      } else {
        setError("Could not save that answer as a note.");
      }
    },
    [notebookId]
  );

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // Follow the answer as it streams, but only while the reader is at the
  // bottom: scrolling up to reread something must not be yanked back down.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, draft]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    []
  );

  const stop = () => abortRef.current?.abort();

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || streaming || selectedIds.length === 0) return;
    if (q.length > MAX_MESSAGE_CHARS) {
      setError(
        `That message is ${q.length.toLocaleString()} characters; the limit is ${MAX_MESSAGE_CHARS.toLocaleString()}. Add long text as a source instead.`
      );
      return;
    }
    setInput("");
    setError(null);
    setDraft("");
    setDraftCites([]);
    stickToBottom.current = true;
    setMessages((m) => [
      ...m,
      { id: `tmp-${Date.now()}`, role: "user", content: q, createdAt: Date.now() },
    ]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let acc = "";
    let cites: Citation[] = [];
    let finished = false;

    const flushDraft = () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };

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
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(j.error || "Request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

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
            // Tokens arrive far faster than frames; render once per paint.
            if (frame.current === null) {
              frame.current = requestAnimationFrame(() => {
                frame.current = null;
                setDraft(acc);
              });
            }
          } else if (ev.type === "error") {
            throw new Error(ev.error || "Stream failed");
          } else if (ev.type === "done") {
            flushDraft();
            finished = true;
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
      flushDraft();
      if (controller.signal.aborted) {
        // Stopped by the reader: keep what arrived, as the server does.
        if (acc && !finished) {
          setMessages((m) => [
            ...m,
            {
              id: `stopped-${Date.now()}`,
              role: "assistant",
              content: acc + STOPPED_MARK,
              citations: cites,
              createdAt: Date.now(),
            },
          ]);
        }
      } else {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
      setDraft("");
      setDraftCites([]);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setStreaming(false);
    }
  };

  const disabled = sources.length === 0;
  /** Sources exist but none is ticked: nothing to ground an answer in. */
  const noneSelected = !disabled && selectedIds.length === 0;
  const blocked = disabled || noneSelected;

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
          {sessionList
            .filter((s) => !hiddenSessions.has(s.id))
            .map((s) => (
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
              onClick={deleteCurrentSession}
              title="Delete this chat"
              aria-label="Delete this chat"
            >
              🗑
            </button>
          </>
        )}
      </div>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8"
      >
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
                  : noneSelected
                    ? "Select at least one source to chat — answers use only the sources you tick."
                    : "Every answer is drawn only from your selected sources, with numbered citations that open the passage they came from."}
              </p>
              {!blocked && (
                <div className="mx-auto mt-6 grid max-w-xl gap-2 sm:grid-cols-2">
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      className="card px-3 py-2.5 text-left text-[13px] text-[var(--muted)] transition hover:border-line-hover hover:text-[var(--fg)]"
                      onClick={() => void send(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-6" aria-live="polite" aria-busy={streaming}>
            {messages.map((m) => (
              <MessageRow
                key={m.id}
                m={m}
                saved={savedIds.has(m.id)}
                onSave={saveAsNote}
              />
            ))}

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
              disabled
                ? "Add a source to start chatting…"
                : noneSelected
                  ? "Select at least one source to chat…"
                  : "Ask about your sources…"
            }
            value={input}
            disabled={blocked}
            maxLength={MAX_MESSAGE_CHARS}
            aria-label="Question"
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
          {streaming ? (
            <button
              type="button"
              className="btn h-[44px] shrink-0 !px-4"
              onClick={stop}
              title="Stop generating; the answer so far is kept"
            >
              ■ Stop
            </button>
          ) : (
            <button
              className="btn btn-primary h-[44px] shrink-0 !px-4"
              disabled={blocked || !input.trim()}
            >
              Send
            </button>
          )}
        </form>
        <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-dim">
          {selectedIds.length} of {sources.length} sources in context · answers are
          grounded in your documents only
        </p>
      </div>
    </section>
  );
}

/**
 * One turn. Memoised: while an answer streams only the draft below changes, so
 * earlier answers — each a full Markdown parse — are not rendered again per
 * token.
 */
const MessageRow = memo(function MessageRow({
  m,
  saved,
  onSave,
}: {
  m: Message;
  saved: boolean;
  onSave: (m: Message) => Promise<void>;
}) {
  if (m.role === "user") {
    return (
      <div className="fade-up flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-user-bubble px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap">
          {m.content}
        </div>
      </div>
    );
  }
  return (
    <div className="fade-up">
      <Markdown citations={m.citations}>{m.content}</Markdown>
      {!!m.citations?.length && <CiteFooter citations={m.citations} />}
      <button
        className="mt-2 text-[11px] text-[var(--muted)] transition hover:text-[var(--fg)] disabled:opacity-60"
        disabled={saved}
        onClick={() => void onSave(m)}
      >
        {saved ? "✓ Saved to notes" : "🗒️ Save to notes"}
      </button>
    </div>
  );
});

function CiteFooter({ citations }: { citations: Citation[] }) {
  const [open, setOpen] = useState(false);
  const openCitation = useCitationHandler();
  const unique = Array.from(
    new Map(citations.map((c) => [`${c.sourceId}-${c.part}`, c])).values()
  );
  return (
    <div className="mt-3">
      <button
        className="text-[11px] font-medium text-[var(--muted)] transition hover:text-[var(--fg)]"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? "▾" : "▸"} {unique.length} citation{unique.length === 1 ? "" : "s"}
      </button>
      {open && (
        <ul className="fade-up mt-2 space-y-1.5">
          {unique.map((c) => (
            <li key={`${c.sourceId}-${c.part}`}>
              <button
                type="button"
                className="block w-full rounded-lg border border-[var(--border)] bg-well px-3 py-2 text-left transition hover:border-line-hover disabled:cursor-default"
                disabled={!openCitation}
                onClick={() => openCitation?.(c)}
                title="Open this passage in its source"
              >
                <span className="mb-1 flex items-center gap-2">
                  <span className="cite">{c.n}</span>
                  <span className="truncate text-[11px] font-medium">{c.sourceTitle}</span>
                  <span className="text-[10px] text-dim">part {c.part}</span>
                </span>
                <span className="line-clamp-3 text-[11px] leading-snug text-[var(--muted)]">
                  {c.snippet}…
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}