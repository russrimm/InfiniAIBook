"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { THUMB_H, THUMB_W, fitFrame, toGray } from "@/lib/screenhelp";

export type Frame = {
  /** JPEG data URL sent to the model. */
  dataUrl: string;
  width: number;
  height: number;
  /** Grayscale thumbnail, for change detection only. */
  thumb: Uint8Array;
};

export type CaptureState = "idle" | "starting" | "sharing" | "stopped";

/** Why screen sharing cannot work here, or null when it can. */
export function captureUnsupportedReason(): string | null {
  if (typeof window === "undefined") return null;
  if (!window.isSecureContext) {
    return "Browsers only allow screen sharing on HTTPS or localhost. Open InfiniAIBook at http://localhost, or put it behind HTTPS.";
  }
  if (!navigator.mediaDevices?.getDisplayMedia) {
    return "This browser does not support screen sharing. Try a current version of Edge, Chrome or Firefox on a desktop computer.";
  }
  return null;
}

/**
 * Share a screen, window or tab with `getDisplayMedia` and grab still frames
 * from it on demand. Nothing is recorded; a frame exists only when `grab()`
 * is called.
 */
export function useScreenCapture() {
  const [state, setState] = useState<CaptureState>("idle");
  const [error, setError] = useState<string | null>(null);
  /** The live stream, for an on-page preview. */
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const stop = useCallback((next: CaptureState = "stopped") => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
    if (videoRef.current) videoRef.current.srcObject = null;
    setState(next);
  }, []);

  const start = useCallback(async () => {
    const unsupported = captureUnsupportedReason();
    if (unsupported) {
      setError(unsupported);
      return false;
    }
    setError(null);
    setState("starting");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 5 },
        audio: false,
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      // The browser's own "Stop sharing" bar ends the track without telling us.
      track?.addEventListener("ended", () => {
        if (streamRef.current === stream) stop("stopped");
      });
      let video = videoRef.current;
      if (!video) {
        video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        videoRef.current = video;
      }
      video.srcObject = stream;
      await video.play();
      setStream(stream);
      setState("sharing");
      return true;
    } catch (e) {
      const name = (e as { name?: string })?.name;
      setError(
        name === "NotAllowedError"
          ? "Screen sharing was canceled or blocked."
          : e instanceof Error
            ? e.message
            : "Screen sharing could not start."
      );
      stop("idle");
      return false;
    }
  }, [stop]);

  /** Grab the current frame, or null when nothing is being shared yet. */
  const grab = useCallback(
    (opts: { full?: boolean } = { full: true }): Frame | null => {
      const video = videoRef.current;
      if (!video || !streamRef.current || !video.videoWidth || !video.videoHeight) return null;

      const thumbCanvas = document.createElement("canvas");
      thumbCanvas.width = THUMB_W;
      thumbCanvas.height = THUMB_H;
      const tctx = thumbCanvas.getContext("2d", { willReadFrequently: true });
      if (!tctx) return null;
      tctx.drawImage(video, 0, 0, THUMB_W, THUMB_H);
      const thumb = toGray(tctx.getImageData(0, 0, THUMB_W, THUMB_H).data);

      if (opts.full === false) return { dataUrl: "", width: 0, height: 0, thumb };

      const { width, height } = fitFrame(video.videoWidth, video.videoHeight);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, width, height);
      return { dataUrl: canvas.toDataURL("image/jpeg", 0.82), width, height, thumb };
    },
    []
  );

  useEffect(() => () => stop("idle"), [stop]);

  return { state, error, stream, start, stop, grab, setError };
}
