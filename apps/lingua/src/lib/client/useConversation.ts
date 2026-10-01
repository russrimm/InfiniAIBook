"use client";

/**
 * Runs one realtime voice call in the browser: microphone, WebRTC peer
 * connection, the "oai-events" data channel, live state, the
 * language-switching engine, silence nudges and autosave.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  conversationReducer,
  initialConversation,
  toTranscript,
  toolFollowUp,
  type Action,
  type ConversationState,
  type ServerEvent,
} from "../conversation";
import {
  INITIAL_POLICY,
  INITIAL_SCAFFOLD,
  analyzeTurn,
  coachNote,
  updateScaffold,
  type CoachAction,
  type PolicyState,
  type ScaffoldState,
} from "../policy";
import { buildSessionUpdate } from "../realtimeConfig";
import type { ResolvedSetup, Setup } from "../setup";

export type CallStatus = "idle" | "connecting" | "live" | "ending" | "ended" | "error";

const AUTOSAVE_MS = 30_000;
/** Ignored: a harmless race between our response.create and one the server started on its own. */
const BENIGN_ERRORS = new Set(["conversation_already_has_active_response", "response_cancel_not_active"]);

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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

export function useConversation(setup: Setup, s: ResolvedSetup) {
  const [state, setState] = useState<ConversationState>(() => initialConversation(s.target.code, s.support.code));
  const [status, setStatus] = useState<CallStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [policy, setPolicy] = useState<PolicyState>(INITIAL_POLICY);
  const [levels, setLevels] = useState({ partner: 0, learner: 0 });
  const [sessionId, setSessionId] = useState<string | null>(null);
  /** What the call is waiting on while connecting, for the status line. */
  const [phase, setPhase] = useState("");

  const stateRef = useRef(state);
  const policyRef = useRef(policy);
  const scaffoldRef = useRef<ScaffoldState>(INITIAL_SCAFFOLD);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const silenceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionRef = useRef<string | null>(null);
  const chainRef = useRef(0);
  /** Silence nudges since the learner last spoke; two unanswered is enough. */
  const nudgesRef = useRef(0);
  const afterSilenceRef = useRef(false);
  const analyzedRef = useRef(new Set<string>());
  const mutedRef = useRef(false);
  /** Bumped by every teardown, so a call still connecting knows it was cancelled. */
  const attemptRef = useRef(0);

  const dispatch = useCallback((a: Action) => {
    stateRef.current = conversationReducer(stateRef.current, a);
    setState(stateRef.current);
  }, []);

  const send = useCallback((event: Record<string, unknown>) => {
    const dc = dcRef.current;
    if (dc?.readyState === "open") dc.send(JSON.stringify(event));
  }, []);

  const systemNote = useCallback(
    (text: string) => {
      send({
        type: "conversation.item.create",
        item: { type: "message", role: "system", content: [{ type: "input_text", text }] },
      });
    },
    [send]
  );

  /** Stop the partner mid-sentence, as a person would when you cut in. */
  const interrupt = useCallback(() => {
    const st = stateRef.current;
    if (st.responseActive) send({ type: "response.cancel" });
    if (st.partnerSpeaking) send({ type: "output_audio_buffer.clear" });
  }, [send]);

  const applyPolicy = useCallback(
    (next: PolicyState) => {
      policyRef.current = next;
      setPolicy(next);
      send(buildSessionUpdate(s, next));
    },
    [s, send]
  );

  const clearSilence = useCallback(() => {
    if (silenceRef.current) clearTimeout(silenceRef.current);
    silenceRef.current = null;
  }, []);

  const armSilence = useCallback(() => {
    clearSilence();
    if (nudgesRef.current >= 2) return;
    silenceRef.current = setTimeout(() => {
      const st = stateRef.current;
      if (mutedRef.current || st.learnerSpeaking || st.partnerSpeaking || st.responseActive) return;
      nudgesRef.current += 1;
      afterSilenceRef.current = true;
      systemNote(coachNote("silence", s));
      send({ type: "response.create" });
    }, s.level.silenceSec * 1000);
  }, [clearSilence, s, send, systemNote]);

  /**
   * Score each learner turn once the partner has answered it, so the
   * partner's corrections for that turn are counted.
   */
  const analyzeAnswered = useCallback(() => {
    const st = stateRef.current;
    st.turns.forEach((turn, i) => {
      if (turn.role !== "learner" || turn.pending || !turn.text || analyzedRef.current.has(turn.id)) return;
      const answered = st.turns.slice(i + 1).some((t) => t.role === "partner" && !t.pending);
      if (!answered) return;
      analyzedRef.current.add(turn.id);
      const corrections = st.corrections.filter((c) => c.turnId === turn.id).length;
      const signal = analyzeTurn(turn.text, s, { corrections, afterSilence: afterSilenceRef.current });
      afterSilenceRef.current = false;
      const change = updateScaffold(scaffoldRef.current, signal, s.level.id);
      scaffoldRef.current = change.state;
      if (change.changed) {
        applyPolicy({ ...policyRef.current, scaffold: change.state.scaffold });
        if (change.reason) dispatch({ type: "notice", text: change.reason, kind: "scaffold" });
      }
    });
  }, [applyPolicy, dispatch, s]);

  const onServerEvent = useCallback(
    (e: ServerEvent) => {
      dispatch({ type: "server", event: e, now: Date.now() });
      switch (e.type) {
        case "input_audio_buffer.speech_started":
          clearSilence();
          nudgesRef.current = 0;
          break;
        case "response.created":
          clearSilence();
          break;
        case "output_audio_buffer.started":
          clearSilence();
          break;
        case "output_audio_buffer.stopped":
          armSilence();
          break;
        case "conversation.item.input_audio_transcription.completed":
          analyzeAnswered();
          break;
        case "response.done": {
          const follow = toolFollowUp(e);
          const valid = follow.calls.filter((c) => c.call).map((c) => ({ callId: c.callId, call: c.call! }));
          if (valid.length) dispatch({ type: "tools", calls: valid });
          for (const c of follow.calls) {
            send({
              type: "conversation.item.create",
              item: { type: "function_call_output", call_id: c.callId, output: JSON.stringify({ ok: !!c.call }) },
            });
          }
          // A response of tool calls only: let the partner actually speak, but
          // never loop if the model keeps answering with tools.
          if (follow.needsResponse && chainRef.current < 2) {
            chainRef.current += 1;
            send({ type: "response.create" });
          } else {
            chainRef.current = 0;
          }
          analyzeAnswered();
          // Without output_audio_buffer events, the end of the response is
          // the best sign that the partner has finished talking.
          if (!follow.needsResponse && !stateRef.current.partnerSpeaking) armSilence();
          break;
        }
        case "error": {
          const code = e.error?.code ?? "";
          if (!BENIGN_ERRORS.has(code)) {
            console.warn("[realtime]", e.error);
            setWarning(e.error?.message ?? "The conversation service reported an error.");
          }
          break;
        }
      }
    },
    [analyzeAnswered, armSilence, clearSilence, dispatch, send]
  );

  const saveTranscript = useCallback(async (ended: boolean) => {
    const id = sessionRef.current;
    if (!id) return;
    const t = toTranscript(stateRef.current, Date.now(), ended);
    await postJson(`/api/sessions/${id}/transcript`, t);
  }, []);

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
    const partner = mk(remote);
    const learner = micRef.current ? mk(micRef.current) : null;
    const buf = new Uint8Array(new ArrayBuffer(512));
    let last = 0;
    const tick = (t: number) => {
      if (t - last > 50) {
        last = t;
        setLevels({
          partner: rms(partner, buf),
          learner: learner && !mutedRef.current ? rms(learner, buf) : 0,
        });
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const teardown = useCallback(() => {
    attemptRef.current += 1;
    clearSilence();
    if (autosaveRef.current) clearInterval(autosaveRef.current);
    autosaveRef.current = null;
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
    setLevels({ partner: 0, learner: 0 });
  }, [clearSilence]);

  const start = useCallback(async () => {
    if (status === "connecting" || status === "live") return;
    setError(null);
    setWarning(null);
    setStatus("connecting");
    setPhase("Getting ready…");
    // Created inside the click so autoplay rules let it run; the voice meters use it.
    if (!ctxRef.current && typeof AudioContext !== "undefined") ctxRef.current = new AudioContext();
    const attempt = attemptRef.current;
    // Hanging up or leaving mid-connect tears down; every await checks this.
    const cancelled = () => attempt !== attemptRef.current;
    let mic: MediaStream | null = null;
    let pc: RTCPeerConnection | null = null;
    const abandon = () => {
      mic?.getTracks().forEach((t) => t.stop());
      pc?.close();
    };
    try {
      // Fail before asking for the microphone if there is nothing to talk to.
      const ready = await fetch("/api/status")
        .then((r) => r.json() as Promise<{ ready: boolean; problems: string[] }>)
        .catch(() => null);
      if (cancelled()) return;
      if (ready && !ready.ready) throw new Error(ready.problems.join(" "));

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser cannot use the microphone here. Use a current browser on localhost or HTTPS.");
      }
      setPhase("Allow microphone access to start");
      mic = await navigator.mediaDevices
        .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
        .catch(() => {
          throw new Error("Microphone access was blocked. Allow it in the browser's site settings and try again.");
        });
      if (cancelled()) return abandon();
      micRef.current = mic;
      setPhase("Calling…");

      const { id } = await postJson<{ id: string }>("/api/sessions", setup);
      if (cancelled()) return abandon();
      sessionRef.current = id;
      setSessionId(id);

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
          setError("The call dropped. Your conversation so far has been saved.");
          setStatus("error");
          saveTranscript(false).catch(() => {});
          teardown();
        }
      };

      const dc = conn.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onmessage = (m) => {
        try {
          onServerEvent(JSON.parse(m.data) as ServerEvent);
        } catch {
          // Not JSON: nothing we can use.
        }
      };
      dc.onopen = () => {
        if (cancelled()) return;
        dispatch({ type: "connected", now: Date.now() });
        setStatus("live");
        systemNote(coachNote("start", s));
        send({ type: "response.create" });
        autosaveRef.current = setInterval(() => saveTranscript(false).catch(() => {}), AUTOSAVE_MS);
      };

      const offer = await conn.createOffer();
      await conn.setLocalDescription(offer);
      const { answer } = await postJson<{ answer: string }>("/api/realtime", { setup, sdp: offer.sdp });
      if (cancelled()) return abandon();
      await conn.setRemoteDescription({ type: "answer", sdp: answer });
    } catch (e) {
      if (cancelled()) return abandon();
      teardown();
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, [dispatch, meter, onServerEvent, s, saveTranscript, send, setup, status, systemNote, teardown]);

  /** Hang up, save, and return the session id for the recap. */
  const end = useCallback(async (): Promise<string | null> => {
    // Still connecting: cancel the attempt and go back to the start screen.
    if (!stateRef.current.connectedAt) {
      teardown();
      setPhase("");
      setStatus("idle");
      return null;
    }
    setStatus("ending");
    teardown();
    try {
      await saveTranscript(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
      return null;
    }
    setStatus("ended");
    return sessionRef.current;
  }, [saveTranscript, teardown]);

  const coach = useCallback(
    (action: CoachAction) => {
      if (status !== "live") return;
      clearSilence();
      switch (action) {
        case "slower": {
          applyPolicy({ ...policyRef.current, slower: Math.min(3, policyRef.current.slower + 1) });
          break;
        }
        case "immersion-on":
        case "immersion-off":
          applyPolicy({ ...policyRef.current, immersionLock: action === "immersion-on" });
          break;
      }
      interrupt();
      systemNote(coachNote(action, s));
      send({ type: "response.create" });
    },
    [applyPolicy, clearSilence, interrupt, s, send, status, systemNote]
  );

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    micRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    if (next) clearSilence();
  }, [clearSilence]);

  const setGloss = useCallback((id: string, gloss: string) => dispatch({ type: "gloss", id, gloss }), [dispatch]);

  // Save what we have if the tab closes mid-call.
  useEffect(() => {
    const onHide = () => {
      const id = sessionRef.current;
      if (!id || !pcRef.current) return;
      const t = toTranscript(stateRef.current, Date.now(), false);
      navigator.sendBeacon(
        `/api/sessions/${id}/transcript`,
        new Blob([JSON.stringify(t)], { type: "application/json" })
      );
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  // Leaving through an in-app link fires no pagehide: save, then hang up.
  useEffect(
    () => () => {
      const id = sessionRef.current;
      if (id && pcRef.current && stateRef.current.connectedAt) {
        fetch(`/api/sessions/${id}/transcript`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toTranscript(stateRef.current, Date.now(), true)),
          keepalive: true,
        }).catch(() => {});
      }
      teardown();
    },
    [teardown]
  );

  return {
    state,
    status,
    error,
    warning,
    dismissWarning: () => setWarning(null),
    muted,
    policy,
    levels,
    sessionId,
    phase,
    start,
    end,
    coach,
    toggleMute,
    setGloss,
  };
}
