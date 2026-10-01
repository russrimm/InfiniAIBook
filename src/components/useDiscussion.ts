"use client";

/**
 * Runs one live discussion in the browser: microphone, WebRTC peer
 * connection, the realtime data channel, source search on the AI's behalf,
 * quick actions, gentle check-ins after long silences, and cancellation.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  MODES,
  OPENING_NOTE,
  SILENCE_NOTE,
  parseDiscussionTool,
  quickActionsFor,
  type DiscussionCitation,
  type DiscussionSetup,
} from "@/lib/discussion";
import {
  discussionReducer,
  initialDiscussion,
  responseTools,
  type DiscussionAction,
  type DiscussionState,
  type RealtimeEvent,
} from "@/lib/discussionState";

export type CallStatus = "idle" | "connecting" | "live" | "ended" | "error";

const SILENCE_MS = 15_000;
/** Ignored: harmless races between our response.create and the server's own. */
const BENIGN = new Set(["conversation_already_has_active_response", "response_cancel_not_active"]);

async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}

function rms(analyser: AnalyserNode, buf: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / buf.length) * 4);
}

export function useDiscussion(opts: { notebookId: string; sourceIds: string[]; setup: DiscussionSetup }) {
  const { notebookId, sourceIds, setup } = opts;
  const [state, setState] = useState<DiscussionState>(() => initialDiscussion());
  const [status, setStatus] = useState<CallStatus>("idle");
  const [phase, setPhase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [levels, setLevels] = useState({ ai: 0, user: 0 });
  const [searching, setSearching] = useState(false);

  const stateRef = useRef(state);
  const setupRef = useRef(setup);
  setupRef.current = setup;
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const silenceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nudgesRef = useRef(0);
  const chainRef = useRef(0);
  const mutedRef = useRef(false);
  /** Bumped on every teardown, so work still in flight knows it was cancelled. */
  const attemptRef = useRef(0);
  const endedAtRef = useRef<number | null>(null);
  const searchQueueRef = useRef<Promise<void>>(Promise.resolve());

  const dispatch = useCallback((a: DiscussionAction) => {
    stateRef.current = discussionReducer(stateRef.current, a);
    setState(stateRef.current);
  }, []);

  const send = useCallback((event: Record<string, unknown>) => {
    const dc = dcRef.current;
    if (dc?.readyState === "open") dc.send(JSON.stringify(event));
  }, []);

  const note = useCallback(
    (text: string) =>
      send({
        type: "conversation.item.create",
        item: { type: "message", role: "system", content: [{ type: "input_text", text }] },
      }),
    [send]
  );

  const interrupt = useCallback(() => {
    const st = stateRef.current;
    if (st.responseActive) send({ type: "response.cancel" });
    if (st.assistantSpeaking) send({ type: "output_audio_buffer.clear" });
  }, [send]);

  const clearSilence = useCallback(() => {
    if (silenceRef.current) clearTimeout(silenceRef.current);
    silenceRef.current = null;
  }, []);

  const armSilence = useCallback(() => {
    clearSilence();
    if (!MODES[setupRef.current.mode].asksQuestions || nudgesRef.current >= 2) return;
    silenceRef.current = setTimeout(() => {
      const st = stateRef.current;
      if (mutedRef.current || st.userSpeaking || st.assistantSpeaking || st.responseActive) return;
      nudgesRef.current += 1;
      note(SILENCE_NOTE);
      send({ type: "response.create" });
    }, SILENCE_MS);
  }, [clearSilence, note, send]);

  /** Answer the AI's tool calls once its response is done, then let it continue if it owes a reply. */
  const handleResponseDone = useCallback(
    async (e: RealtimeEvent) => {
      const attempt = attemptRef.current;
      const r = responseTools(e, parseDiscussionTool);
      for (const c of r.calls) {
        if (attempt !== attemptRef.current) return;
        let output: string;
        if (c.call?.name === "search_sources") {
          const query = c.call.args.query;
          // Searches from overlapping responses run one at a time, so each
          // numbers its excerpts after the previous one's are in state.
          const run = searchQueueRef.current.then(async () => {
            if (attempt !== attemptRef.current) return null;
            setSearching(true);
            try {
              const st = stateRef.current;
              const res = await postJson<{ output: string; citations: DiscussionCitation[] }>(
                "/api/discussion/search",
                {
                  notebookId,
                  sourceIds,
                  query,
                  start: st.citations.reduce((n, x) => Math.max(n, x.n), 0) + 1,
                  known: st.citations.map((x) => ({ passageId: x.passageId, n: x.n })),
                }
              );
              if (attempt !== attemptRef.current) return null;
              dispatch({ type: "excerpts", citations: res.citations, query });
              return res.output;
            } catch {
              return "The search failed. Tell the user you couldn't check the sources just now.";
            } finally {
              setSearching(false);
            }
          });
          searchQueueRef.current = run.then(
            () => undefined,
            () => undefined
          );
          const result = await run;
          if (result === null) return;
          output = result;
        } else {
          if (c.call) dispatch({ type: "tool", callId: c.callId, call: c.call, itemId: r.messageId });
          output = JSON.stringify({ ok: !!c.call });
        }
        send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: c.callId, output } });
      }
      if (attempt !== attemptRef.current) return;
      // Never loop if the model keeps answering with nothing but tool calls.
      if (r.needsResponse && chainRef.current < 3) {
        chainRef.current += 1;
        send({ type: "response.create" });
      } else {
        chainRef.current = 0;
        if (!stateRef.current.assistantSpeaking) armSilence();
      }
    },
    [armSilence, dispatch, notebookId, send, sourceIds]
  );

  const onEvent = useCallback(
    (e: RealtimeEvent) => {
      dispatch({ type: "server", event: e, now: Date.now() });
      switch (e.type) {
        case "input_audio_buffer.speech_started":
          clearSilence();
          nudgesRef.current = 0;
          break;
        case "response.created":
        case "output_audio_buffer.started":
          clearSilence();
          break;
        case "output_audio_buffer.stopped":
          armSilence();
          break;
        case "response.done":
          void handleResponseDone(e);
          break;
        case "error":
          if (!BENIGN.has(e.error?.code ?? "")) {
            console.warn("[discussion]", e.error);
            setWarning(e.error?.message ?? "The realtime service reported an error.");
          }
          break;
      }
    },
    [armSilence, clearSilence, dispatch, handleResponseDone]
  );

  const meter = useCallback((remote: MediaStream) => {
    const ctx = ctxRef.current ?? new AudioContext();
    ctxRef.current = ctx;
    ctx.resume().catch(() => {});
    const mk = (stream: MediaStream) => {
      const a = ctx.createAnalyser();
      a.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(a);
      return a;
    };
    const ai = mk(remote);
    const user = micRef.current ? mk(micRef.current) : null;
    const buf = new Uint8Array(new ArrayBuffer(512));
    let last = 0;
    const tick = (t: number) => {
      if (t - last > 50) {
        last = t;
        setLevels({ ai: rms(ai, buf), user: user && !mutedRef.current ? rms(user, buf) : 0 });
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const teardown = useCallback(() => {
    attemptRef.current += 1;
    clearSilence();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    dcRef.current?.close();
    pcRef.current?.close();
    micRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close().catch(() => {});
    if (audioRef.current) audioRef.current.srcObject = null;
    dcRef.current = null;
    pcRef.current = null;
    micRef.current = null;
    ctxRef.current = null;
    setLevels({ ai: 0, user: 0 });
    setSearching(false);
  }, [clearSilence]);

  const start = useCallback(async () => {
    if (status === "connecting" || status === "live") return;
    teardown();
    setError(null);
    setWarning(null);
    setStatus("connecting");
    setPhase("Getting ready…");
    endedAtRef.current = null;
    nudgesRef.current = 0;
    chainRef.current = 0;
    // A new call starts unmuted: the fresh mic track is live, so the UI must say so.
    mutedRef.current = false;
    setMuted(false);
    stateRef.current = initialDiscussion();
    setState(stateRef.current);
    // Created inside the click so autoplay rules let it run.
    if (typeof AudioContext !== "undefined") ctxRef.current = new AudioContext();

    const attempt = attemptRef.current;
    const cancelled = () => attempt !== attemptRef.current;
    let mic: MediaStream | null = null;
    let pc: RTCPeerConnection | null = null;
    const abandon = () => {
      mic?.getTracks().forEach((t) => t.stop());
      pc?.close();
    };
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser can't use the microphone here. Use a current browser on localhost or HTTPS.");
      }
      setPhase("Allow microphone access to start");
      mic = await navigator.mediaDevices
        .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
        .catch(() => {
          throw new Error("Microphone access was blocked. Allow it in the browser's site settings and try again.");
        });
      if (cancelled()) return abandon();
      micRef.current = mic;
      setPhase("Reading your sources…");

      pc = new RTCPeerConnection();
      const conn = pc;
      pcRef.current = conn;
      const audio = audioRef.current ?? new Audio();
      audio.autoplay = true;
      audioRef.current = audio;
      conn.ontrack = (ev) => {
        const [remote] = ev.streams;
        if (!remote) return;
        audio.srcObject = remote;
        audio.play().catch(() => {});
        meter(remote);
      };
      conn.addTrack(mic.getAudioTracks()[0], mic);
      conn.onconnectionstatechange = () => {
        if (conn.connectionState === "failed" && !cancelled()) {
          teardown();
          endedAtRef.current = Date.now();
          setError("The call dropped. The conversation so far is kept below.");
          setStatus("ended");
        }
      };

      const dc = conn.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onmessage = (m) => {
        try {
          onEvent(JSON.parse(m.data) as RealtimeEvent);
        } catch {
          // Not JSON: nothing to use.
        }
      };
      dc.onopen = () => {
        if (cancelled()) return;
        dispatch({ type: "connected", now: Date.now() });
        setStatus("live");
        setPhase("");
        note(OPENING_NOTE(setupRef.current));
        send({ type: "response.create" });
      };

      const offer = await conn.createOffer();
      await conn.setLocalDescription(offer);
      const { answer, citations } = await postJson<{ answer: string; citations: DiscussionCitation[] }>(
        "/api/discussion",
        { notebookId, sourceIds, setup: setupRef.current, sdp: offer.sdp }
      );
      if (cancelled()) return abandon();
      dispatch({ type: "reset", citations });
      setPhase("Connecting…");
      await conn.setRemoteDescription({ type: "answer", sdp: answer });
    } catch (e) {
      if (cancelled()) return abandon();
      teardown();
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, [dispatch, meter, note, notebookId, onEvent, send, sourceIds, status, teardown]);

  /** Hang up. While still connecting, this cancels and returns to setup. */
  const end = useCallback(() => {
    const connected = !!stateRef.current.connectedAt;
    teardown();
    setPhase("");
    if (!connected) {
      setStatus("idle");
      return;
    }
    endedAtRef.current = Date.now();
    setStatus("ended");
  }, [teardown]);

  const quick = useCallback(
    (id: string) => {
      if (status !== "live") return;
      const action = quickActionsFor(setupRef.current.mode).find((a) => a.id === id);
      if (!action) return;
      clearSilence();
      interrupt();
      note(action.note);
      send({ type: "response.create" });
    },
    [clearSilence, interrupt, note, send, status]
  );

  const sendText = useCallback(
    (text: string) => {
      const t = text.trim();
      if (status !== "live" || !t) return;
      clearSilence();
      interrupt();
      send({
        type: "conversation.item.create",
        item: { type: "message", role: "user", content: [{ type: "input_text", text: t.slice(0, 2000) }] },
      });
      send({ type: "response.create" });
    },
    [clearSilence, interrupt, send, status]
  );

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    micRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    if (next) clearSilence();
  }, [clearSilence]);

  const durationSec = () => {
    const from = stateRef.current.connectedAt;
    if (!from) return 0;
    return Math.round(((endedAtRef.current ?? Date.now()) - from) / 1000);
  };

  // A live call is closed with the page; warn before losing it.
  useEffect(() => {
    if (status !== "live") return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);

  useEffect(() => teardown, [teardown]);

  return {
    state,
    status,
    phase,
    error,
    warning,
    dismissWarning: () => setWarning(null),
    muted,
    levels,
    searching,
    start,
    end,
    quick,
    sendText,
    toggleMute,
    durationSec,
  };
}
