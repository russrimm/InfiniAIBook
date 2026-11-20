"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import Markdown from "./Markdown";
import GettingStarted from "./GettingStarted";
import ChatFind from "./ChatFind";
import { useCitationHandler } from "./CitationContext";
import { useConfirm } from "./ConfirmDialog";
import { useDeferredDelete } from "./UndoToast";
import { UNCITED_LABEL } from "@/lib/citations";
import { STOPPED_MARK, exportFilename, messageToMarkdown } from "@/lib/chatmarkdown";
import type { ChatSession, Citation, Message, Source } from "@/lib/types";

/** Mirrors MAX_MESSAGE_CHARS in src/app/api/chat/route.ts. */
const MAX_MESSAGE_CHARS = 20_000;

/** Ids made in the browser before the server has named the message; they contain a colon, a server id never does. */
const isLocalId = (id: string) => id.includes(":");

type Turn = { mode: "regenerate" | "edit"; messageId: string };

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
  liveLearn = false,
  initialMessages,
  sessions,
  onNoteSaved,
  onAddSources,
  onChooseSources,
  onUseAll,
  onOpenStudio,
}: {
  notebookId: string;
  sources: Source[];
  selectedIds: string[];
  liveLearn?: boolean;
  /** Messages of `sessions[0]`, the most recent conversation. */
  initialMessages: Message[];
  sessions: ChatSession[];
  onNoteSaved?: () => void;
  /** Getting-started actions; each takes the user to the panel that does it. */
  onAddSources?: () => void;
  onChooseSources?: () => void;
  onUseAll?: () => void;
  onOpenStudio?: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  /** null is a new, unsaved chat; the server creates it on the first question. */
  const [sessionId, setSessionId] = useState<string | null>(sessions[0]?.id ?? null);
  const [sessionList, setSessionList] = useState<ChatSession[]>(sessions);
  /** Chats deleted but still within their undo window. */
  const [hiddenSessions, setHiddenSessions] = useState<Set<string>>(new Set());
  const deferDelete = useDeferredDelete();
  const askConfirm = useConfirm();
  const [loadingSession, setLoadingSession] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  /** The answer being regenerated; hidden while its replacement streams, restored if that fails. */
  const [replacingId, setReplacingId] = useState<string | null>(null);
  /** The message just copied, for the brief "Copied" confirmation. */
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Follow-up questions for the latest answer. Optional: absent whenever they could not be made. */
  const [suggestions, setSuggestions] = useState<{ forId: string; items: string[] } | null>(null);
  const suggestAbort = useRef<AbortController | null>(null);
  const [exporting, setExporting] = useState(false);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftCites, setDraftCites] = useState<Citation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
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
    suggestAbort.current?.abort();
    setSuggestions(null);
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

  /** The chat title being edited in place of the picker, or null. */
  const [renaming, setRenaming] = useState<string | null>(null);
  /** Set by Escape so the blur that follows does not save the edit. */
  const cancelRename = useRef(false);

  const renameSession = async (value: string) => {
    setRenaming(null);
    const current = sessionList.find((s) => s.id === sessionId);
    const title = value.trim();
    if (!current || !title || title === current.title) return;
    const restore = () =>
      setSessionList((l) => l.map((s) => (s.id === current.id ? { ...s, title: current.title } : s)));
    setSessionList((l) => l.map((s) => (s.id === current.id ? { ...s, title } : s)));
    try {
      const res = await fetch(`/api/sessions/${current.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error();
    } catch {
      restore();
      setError("That chat could not be renamed. Try again.");
    }
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

  const copyMessage = useCallback(async (m: Message) => {
    try {
      // Unavailable outside a secure context, e.g. when opened over plain http on a LAN.
      await navigator.clipboard.writeText(messageToMarkdown(m));
    } catch {
      setError("Copying is blocked by the browser here. Select the text and copy it instead.");
      return;
    }
    setCopiedId(m.id);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopiedId(null), 1800);
  }, []);

  /**
   * The server's id for the message at `index`. Messages made in this browser
   * (a question just sent, an answer cut short by Stop) carry a local id until
   * the chat is read back, and the server only knows its own.
   */
  const serverId = async (index: number): Promise<string | null> => {
    const local = messagesRef.current[index];
    if (!local) return null;
    if (!isLocalId(local.id)) return local.id;
    if (!sessionId) return null;
    const res = await fetch(`/api/sessions/${sessionId}`).catch(() => null);
    if (!res?.ok) return null;
    const fresh = ((await res.json()) as { messages: Message[] }).messages;
    if (fresh[index]?.role !== local.role) return null;
    setMessages(fresh);
    messagesRef.current = fresh;
    return fresh[index].id;
  };

  const regenerate = async (m: Message) => {
    const list = messagesRef.current;
    const index = list.findIndex((x) => x.id === m.id);
    const question = list[index - 1];
    if (index < 0 || index !== list.length - 1 || question?.role !== "user") return;
    const id = await serverId(index);
    if (!id) {
      setError("That answer could not be regenerated. Reopen the chat and try again.");
      return;
    }
    await send(question.content, { mode: "regenerate", messageId: id });
  };

  const editAndResend = async (m: Message, text: string): Promise<boolean> => {
    const list = messagesRef.current;
    const index = list.findIndex((x) => x.id === m.id);
    if (index < 0) return false;
    const later = list.length - index - 1;
    if (later > 0) {
      const ok = await askConfirm({
        title: "Edit and resend this message?",
        message: `Your earlier question and the ${later} message${later === 1 ? "" : "s"} after it will be replaced by a new answer. This chat is saved that way and cannot be undone.`,
        confirmLabel: "Edit and resend",
        destructive: true,
      });
      if (!ok) return false;
    }
    const id = await serverId(index);
    if (!id) {
      setError("That message could not be edited. Reopen the chat and try again.");
      return false;
    }
    await send(text, { mode: "edit", messageId: id });
    return true;
  };

  const exportChat = async () => {
    if (!sessionId || exporting) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/export`);
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = exportFilename(sessionList.find((s) => s.id === sessionId)?.title ?? "chat");
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("That chat could not be exported. Try again.");
    } finally {
      setExporting(false);
    }
  };

  /** Ask for follow-up questions. Never blocks or reports: they are a bonus, not part of the answer. */
  const loadSuggestions = async (sid: string, messageId: string) => {
    suggestAbort.current?.abort();
    const controller = new AbortController();
    suggestAbort.current = controller;
    try {
      const res = await fetch("/api/chat/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: sid, messageId }),
        signal: controller.signal,
      });
      if (!res.ok) return;
      const { suggestions: items } = (await res.json()) as { suggestions?: string[] };
      if (!controller.signal.aborted && items?.length) setSuggestions({ forId: messageId, items });
    } catch {
      /* optional; stay silent */
    }
  };

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // The composer grows with its text; shrink it back once a question is sent.
  useEffect(() => {
    if (!input && inputRef.current) inputRef.current.style.height = "";
  }, [input]);

  // Follow the answer as it streams, but only while the reader is at the
  // bottom: scrolling up to reread something must not be yanked back down.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, draft]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      suggestAbort.current?.abort();
      if (copyTimer.current) clearTimeout(copyTimer.current);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    []
  );

  const stop = () => abortRef.current?.abort();

  /**
   * Ask a question, or with `turn` redo one: `regenerate` replaces the latest
   * answer, `edit` replaces a user message and everything after it.
   */
  const send = async (text: string, turn?: Turn) => {
    const q = text.trim();
    if (!q || streaming || (!liveLearn && selectedIds.length === 0)) return;
    if (q.length > MAX_MESSAGE_CHARS) {
      setError(
        `That message is ${q.length.toLocaleString()} characters; the limit is ${MAX_MESSAGE_CHARS.toLocaleString()}. Add long text as a source instead.`
      );
      return;
    }
    // A half-typed draft survives starters, suggestions and redoing a turn.
    if (text === input) setInput("");
    setError(null);
    setNotice(null);
    setDraft("");
    setDraftCites([]);
    suggestAbort.current?.abort();
    setSuggestions(null);
    stickToBottom.current = true;
    const before = messagesRef.current;
    const localUserId = `local:user-${Date.now()}`;
    const replaceId = turn?.mode === "regenerate" ? turn.messageId : null;
    if (replaceId) {
      setReplacingId(replaceId);
    } else {
      const keep = turn ? before.slice(0, before.findIndex((x) => x.id === turn.messageId)) : before;
      setMessages([...keep, { id: localUserId, role: "user", content: q, createdAt: Date.now() }]);
    }
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let acc = "";
    let cites: Citation[] = [];
    let finished = false;
    /** The server has taken the request; before that a refused edit changed nothing. */
    let accepted = false;
    let sid = sessionId;

    const flushDraft = () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
    const withoutReplaced = (list: Message[]) => (replaceId ? list.filter((x) => x.id !== replaceId) : list);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notebookId,
          message: q,
          sourceIds: selectedIds,
          sessionId: sessionId ?? undefined,
          ...turn,
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
            stopped?: boolean;
            session?: ChatSession;
            userId?: string;
          };
          if (ev.type === "session" && ev.session) {
            const s = ev.session;
            accepted = true;
            sid = s.id;
            setSessionId(s.id);
            setSessionList((l) => [s, ...l.filter((x) => x.id !== s.id)]);
            const userId = ev.userId;
            if (userId) {
              setMessages((m) => m.map((x) => (x.id === localUserId ? { ...x, id: userId } : x)));
            }
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
            if (!acc.trim()) {
              // Nothing to show or save; say so instead of leaving a blank turn.
              setError(
                "The model returned an empty answer. Try again, or pick another chat model."
              );
              setDraft("");
              setDraftCites([]);
              continue;
            }
            const id = ev.id ?? `local:a-${Date.now()}`;
            setMessages((m) => [
              ...withoutReplaced(m),
              {
                id,
                role: "assistant",
                content: acc,
                citations: ev.citations ?? cites,
                createdAt: Date.now(),
              },
            ]);
            setDraft("");
            setDraftCites([]);
            if (ev.id && sid && !ev.stopped && (ev.citations ?? cites).length) {
              void loadSuggestions(sid, ev.id);
            }
          }
        }
      }
    } catch (e) {
      flushDraft();
      if (controller.signal.aborted) {
        // Stopped by the reader: keep what arrived, as the server does.
        if (acc && !finished) {
          setMessages((m) => [
            ...withoutReplaced(m),
            {
              id: `local:stopped-${Date.now()}`,
              role: "assistant",
              content: acc + STOPPED_MARK,
              citations: cites,
              createdAt: Date.now(),
            },
          ]);
        }
      } else {
        // A refused edit changed nothing on the server, so put the chat back.
        if (turn?.mode === "edit" && !accepted) setMessages(before);
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
      setDraft("");
      setDraftCites([]);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setReplacingId(null);
      setStreaming(false);
    }
  };

  // Stable handlers for the memoised rows, which must not re-render per streamed token.
  const redoRef = useRef({ regenerate, editAndResend });
  useEffect(() => {
    redoRef.current = { regenerate, editAndResend };
  });
  const onRegenerate = useCallback((m: Message) => redoRef.current.regenerate(m), []);
  const onEdit = useCallback((m: Message, text: string) => redoRef.current.editAndResend(m, text), []);

  const disabled = !liveLearn && sources.length === 0;
  /** Sources exist but none is ticked: nothing to ground an answer in. */
  const noneSelected = !liveLearn && !disabled && selectedIds.length === 0;
  const [findOpen, setFindOpen] = useState(false);
  const closeFind = useCallback(() => {
    setFindOpen(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);
  // The command palette asks for Find through an event, so the two stay decoupled.
  useEffect(() => {
    const open = () => setFindOpen(true);
    window.addEventListener("infiniaibook:chat-find", open);
    return () => window.removeEventListener("infiniaibook:chat-find", open);
  }, []);
  const blocked = disabled || noneSelected;
  /** No chat has ever been started here, so the getting-started steps still help. */
  const firstRun = sessionList.length === 0;

  return (
    <section aria-label="Chat" className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-4 py-2 sm:px-8">
        {renaming !== null ? (
          <input
            aria-label="Chat name"
            className="input !h-8 min-w-0 flex-1 !py-0 text-[12px]"
            value={renaming}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setRenaming(e.target.value)}
            onBlur={(e) => {
              if (cancelRename.current) {
                cancelRename.current = false;
                return;
              }
              void renameSession(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                // Handled here so Escape cancels the edit rather than closing anything else.
                e.stopPropagation();
                cancelRename.current = true;
                setRenaming(null);
              }
            }}
          />
        ) : (
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
        )}
        <button
          className="btn shrink-0 !px-2.5 !py-1 !text-[11px]"
          disabled={streaming || !sessionId}
          onClick={() => void openSession(null)}
          title="Start a new conversation"
        >
          ＋ New
        </button>
        <button
          className="btn shrink-0 !px-2 !py-1 !text-[11px]"
          disabled={messages.length === 0}
          aria-pressed={findOpen}
          onClick={() => (findOpen ? closeFind() : setFindOpen(true))}
          title="Find in this chat"
          aria-label="Find in this chat"
        >
          <span aria-hidden>🔍</span>
        </button>
        {sessionId && (
          <>
            <button
              className="btn shrink-0 !px-2 !py-1 !text-[11px]"
              disabled={streaming || renaming !== null}
              onClick={() => {
                cancelRename.current = false;
                setRenaming(sessionList.find((s) => s.id === sessionId)?.title ?? "");
              }}
              title="Rename this chat"
              aria-label="Rename this chat"
            >
              ✎
            </button>
            <button
              className="btn shrink-0 !px-2 !py-1 !text-[11px]"
              disabled={streaming || exporting || messages.length === 0}
              onClick={() => void exportChat()}
              title="Download this chat as Markdown"
              aria-label="Export this chat as Markdown"
            >
              ⤓
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
      {findOpen && (
        <ChatFind
          scrollRef={scrollRef}
          contentKey={`${sessionId}:${messages.length}:${messages[messages.length - 1]?.content.length ?? 0}`}
          onClose={closeFind}
        />
      )}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="relative min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8"
      >
        <div className="mx-auto max-w-3xl">
          {loadingSession && (
            <p className="pt-8 text-center text-sm text-[var(--muted)]">Loading chat…</p>
          )}
          {!loadingSession && messages.length === 0 && !draft && (
            <div className="pt-8 pb-6 text-center">
              <div aria-hidden className="mb-3 text-4xl">
                💬
              </div>
              <h2 className="text-lg font-medium">Ask your sources anything</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">
                {liveLearn
                  ? "Answers use your selected saved sources and fresh Microsoft Learn documentation. Live citations keep the excerpt used."
                  : blocked
                  ? "Answers come only from your sources. Here is how to get started."
                  : "Every answer is drawn only from your selected sources, with numbered citations that open the passage they came from."}
              </p>
              {!liveLearn && (blocked || firstRun) && (
                <div className="mt-6">
                  <GettingStarted
                    sourceCount={sources.length}
                    selectedCount={selectedIds.length}
                    onAddSources={onAddSources}
                    onChooseSources={onChooseSources}
                    onUseAll={onUseAll}
                    onOpenStudio={onOpenStudio}
                  />
                </div>
              )}
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
            {messages.map((m, i) => (
              <MessageRow
                key={m.id}
                m={m}
                saved={savedIds.has(m.id)}
                copied={copiedId === m.id}
                hidden={m.id === replacingId}
                canRedo={!streaming && !blocked}
                isLatestAnswer={i === messages.length - 1 && i > 0 && messages[i - 1].role === "user"}
                onSave={saveAsNote}
                onCopy={copyMessage}
                onRegenerate={onRegenerate}
                onEdit={onEdit}
              />
            ))}

            {!streaming &&
              !blocked &&
              suggestions &&
              suggestions.forId === messages[messages.length - 1]?.id && (
                <div
                  role="group"
                  aria-label="Suggested follow-up questions"
                  className="fade-up -mt-2 flex flex-wrap gap-2"
                >
                  {suggestions.items.map((s) => (
                    <button
                      key={s}
                      className="rounded-xl border border-[var(--border)] bg-well px-3 py-1.5 text-left text-[13px] text-[var(--muted)] transition hover:border-line-hover hover:text-[var(--fg)]"
                      onClick={() => void send(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
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
              <div
                role="alert"
                className="rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300"
              >
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
            ref={inputRef}
            className="input max-h-40 min-h-[44px] resize-none py-3"
            rows={1}
            placeholder={
              disabled
                ? "Add a source to start chatting…"
                : noneSelected
                  ? "Select at least one source to chat…"
                  : liveLearn ? "Ask your sources and Microsoft Learn…" : "Ask about your sources…"
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
              // Enter while an IME is composing confirms the character, not the message.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
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
          Using {selectedIds.length} of {sources.length} source
          {sources.length === 1 ? "" : "s"}{liveLearn
            ? " + live Microsoft Learn"
            : " · answers come only from these documents"}
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
  copied,
  hidden,
  canRedo,
  isLatestAnswer,
  onSave,
  onCopy,
  onRegenerate,
  onEdit,
}: {
  m: Message;
  saved: boolean;
  /** Briefly true after this message was copied. */
  copied: boolean;
  /** An answer being regenerated gives way to its replacement. */
  hidden: boolean;
  /** False while another answer streams or there is nothing to ask against. */
  canRedo: boolean;
  /** The chat's last answer, the only one that can be regenerated. */
  isLatestAnswer: boolean;
  onSave: (m: Message) => Promise<void>;
  onCopy: (m: Message) => Promise<void>;
  onRegenerate: (m: Message) => Promise<void>;
  /** Resolves true once the edit was sent; false if it was declined, so the editor stays open. */
  onEdit: (m: Message, text: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(m.content);
  const editButton = useRef<HTMLButtonElement>(null);

  const copyStatus = (
    <span role="status" className="text-[11px] text-[var(--muted)]">
      {copied ? "✓ Copied" : ""}
    </span>
  );
  const actionClass =
    "text-[11px] text-[var(--muted)] transition hover:text-[var(--fg)] disabled:opacity-60";

  if (hidden) return null;

  if (m.role === "user") {
    const closeEditor = () => {
      setEditing(false);
      requestAnimationFrame(() => editButton.current?.focus());
    };
    const submit = async () => {
      const next = text.trim();
      if (!next) return;
      if (await onEdit(m, next)) setEditing(false);
    };
    if (editing) {
      return (
        <div className="fade-up flex flex-col items-end gap-2">
          <textarea
            className="input min-h-[44px] w-full max-w-[85%] resize-y py-3"
            aria-label="Edit your message"
            autoFocus
            rows={Math.min(8, Math.max(2, text.split("\n").length))}
            value={text}
            maxLength={MAX_MESSAGE_CHARS}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setText(m.content);
                closeEditor();
              } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <div className="flex gap-2">
            <button
              className="btn !px-2.5 !py-1 !text-[11px]"
              aria-label="Cancel editing"
              onClick={() => {
                setText(m.content);
                closeEditor();
              }}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary !px-2.5 !py-1 !text-[11px]"
              aria-label="Send edited message"
              disabled={!text.trim() || !canRedo}
              onClick={() => void submit()}
            >
              Send
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="group fade-up flex flex-col items-end gap-1">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-user-bubble px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap">
          {m.content}
        </div>
        <div className="flex items-center gap-3 px-1">
          {copyStatus}
          <button
            className={`reveal ${actionClass}`}
            aria-label="Copy your message"
            onClick={() => void onCopy(m)}
          >
            📋 Copy
          </button>
          <button
            ref={editButton}
            className={`reveal ${actionClass}`}
            aria-label="Edit and resend your message"
            disabled={!canRedo}
            onClick={() => {
              setText(m.content);
              setEditing(true);
            }}
          >
            ✎ Edit
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="fade-up">
      {m.content.trim() ? (
        <Markdown citations={m.citations}>{m.content}</Markdown>
      ) : (
        <p className="text-[13px] text-[var(--muted)] italic">
          No answer was returned for this question.
        </p>
      )}
      {!!m.citations?.length && <CiteFooter citations={m.citations} />}
      {m.content.trim() && !m.citations?.length && (
        <p className="mt-2 text-[12px] leading-snug text-amber-200/90">{UNCITED_LABEL}</p>
      )}
      {m.content.trim() && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <button className={actionClass} aria-label="Copy this answer" onClick={() => void onCopy(m)}>
            📋 Copy
          </button>
          {isLatestAnswer && (
            <button
              className={actionClass}
              aria-label="Regenerate this answer"
              disabled={!canRedo}
              onClick={() => void onRegenerate(m)}
            >
              ↻ Regenerate
            </button>
          )}
          <button className={actionClass} disabled={saved} onClick={() => void onSave(m)}>
            {saved ? "✓ Saved to notes" : "🗒️ Save to notes"}
          </button>
          {copyStatus}
        </div>
      )}
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
                  <span className="text-[10px] text-dim">{c.url ? "live excerpt" : `part ${c.part}`}</span>
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