"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  DEFAULT_WATERMARK_LAYOUT,
  MAX_WATERMARK_BYTES,
  MAX_WATERMARK_TEXT,
  WATERMARK_MAX_SIDE,
  WATERMARK_OPACITIES,
  WATERMARK_POSITIONS,
  WATERMARK_SIZES,
  type WatermarkChoice,
  type WatermarkImage,
  type WatermarkOpacity,
  type WatermarkPosition,
  type WatermarkSize,
} from "@/lib/watermarkchoice";

const LIBRARY_EVENT = "infiniaibook:watermark-library";

/** Any image the browser can decode, as a PNG data URL that keeps its transparency. */
async function toPng(file: Blob, maxSide: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const s = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * s));
  canvas.height = Math.max(1, Math.round(bitmap.height * s));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/png");
}

/** Every picker shares the image library; an upload or delete in one updates the others. */
function useWatermarkLibrary() {
  const [images, setImages] = useState<WatermarkImage[] | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      fetch("/api/watermark")
        .then((r) => (r.ok ? r.json() : { images: [] }))
        .then((j: { images?: WatermarkImage[] }) => live && setImages(j.images ?? []))
        .catch(() => live && setImages([]));
    const onEvent = (e: Event) => {
      const list = (e as CustomEvent<WatermarkImage[] | undefined>).detail;
      if (list) setImages(list);
      else void load();
    };
    void load();
    window.addEventListener(LIBRARY_EVENT, onEvent);
    return () => {
      live = false;
      window.removeEventListener(LIBRARY_EVENT, onEvent);
    };
  }, []);
  const changed = (list?: WatermarkImage[]) => {
    if (list) setImages(list);
    window.dispatchEvent(new CustomEvent(LIBRARY_EVENT, { detail: list }));
  };
  return { images, changed };
}

type Mode = "none" | "text" | "image";
type Layout = { position: WatermarkPosition; size: WatermarkSize; opacity: WatermarkOpacity };
type State = { mode: Mode; text: string; image: string; layout: Layout };

const fromValue = (v: WatermarkChoice | null, prev?: State): State =>
  v
    ? {
        mode: v.kind,
        text: v.kind === "text" ? v.text : (prev?.text ?? ""),
        image: v.kind === "image" ? v.image : (prev?.image ?? ""),
        layout: { position: v.position, size: v.size, opacity: v.opacity },
      }
    : {
        mode: "none",
        text: prev?.text ?? "",
        image: prev?.image ?? "",
        layout: prev?.layout ?? DEFAULT_WATERMARK_LAYOUT,
      };

/** A choice is only emitted once it is complete: text typed, or an image picked. */
const toValue = (s: State): WatermarkChoice | null => {
  if (s.mode === "text" && s.text.trim()) return { kind: "text", text: s.text, ...s.layout };
  if (s.mode === "image" && s.image) return { kind: "image", image: s.image, ...s.layout };
  return null;
};

const selectCls =
  "min-w-0 cursor-pointer rounded-md border border-[var(--border)] bg-well px-2 py-1 text-[11px] text-[var(--fg)] outline-none focus:border-focus disabled:cursor-not-allowed disabled:opacity-50";
const inputCls =
  "min-w-0 rounded-md border border-[var(--border)] bg-well px-2 py-1 text-[11px] text-[var(--fg)] outline-none placeholder:text-faint focus:border-focus disabled:cursor-not-allowed disabled:opacity-50";
const iconBtn =
  "shrink-0 rounded-md border border-[var(--border)] bg-well px-1.5 py-1 text-[11px] leading-none text-[var(--muted)] transition-colors hover:border-line-hover hover:text-[var(--fg)] disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Watermark chooser for the video formats: none, a line of text or an image
 * from the shared library (with upload and delete), placed in one of nine
 * spots with a size and an opacity. Stamped onto the MP4 after it renders.
 */
export default function WatermarkPicker({
  value,
  onChange,
  disabled = false,
  label = "Mark",
}: {
  value: WatermarkChoice | null;
  onChange: (v: WatermarkChoice | null) => void;
  disabled?: boolean;
  label?: string;
}) {
  const { images, changed } = useWatermarkLibrary();
  const fileInput = useRef<HTMLInputElement>(null);
  const group = useId();
  const [state, setState] = useState<State>(() => fromValue(value));
  const stateRef = useRef(state);
  stateRef.current = state;
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Adopt a value set from outside (a reloaded draft), but never undo an
  // incomplete choice being made here, which is emitted as null.
  const emitted = useRef(JSON.stringify(value));
  const valueKey = JSON.stringify(value);
  useEffect(() => {
    if (valueKey === emitted.current) return;
    emitted.current = valueKey;
    setState((prev) => fromValue(JSON.parse(valueKey) as WatermarkChoice | null, prev));
  }, [valueKey]);

  const update = (patch: Partial<State>) => {
    // From the ref, so an upload finishing later builds on the latest edits.
    const next = { ...stateRef.current, ...patch };
    stateRef.current = next;
    setState(next);
    const v = toValue(next);
    const key = JSON.stringify(v);
    if (key !== emitted.current) {
      emitted.current = key;
      onChange(v);
    }
  };
  const setLayout = (patch: Partial<Layout>) =>
    update({ layout: { ...stateRef.current.layout, ...patch } });

  // A chosen image that has since been deleted falls back to none picked.
  useEffect(() => {
    if (!images || state.mode !== "image" || !state.image) return;
    if (images.some((i) => i.id === state.image)) return;
    setState((s) => ({ ...s, image: "" }));
    if (emitted.current !== "null") {
      emitted.current = "null";
      onChange(null);
    }
  }, [images, state.mode, state.image, onChange]);

  const selected = images?.find((i) => i.id === state.image);

  const upload = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const dataUrl = await toPng(file, WATERMARK_MAX_SIDE).catch(() => {
        throw new Error("That file could not be read as an image.");
      });
      if ((dataUrl.length * 3) / 4 > MAX_WATERMARK_BYTES) {
        throw new Error(
          `Images are limited to ${Math.round(MAX_WATERMARK_BYTES / 1_048_576)} MB.`
        );
      }
      const res = await fetch("/api/watermark", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: file.name, dataUrl }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        image?: WatermarkImage;
        images?: WatermarkImage[];
      };
      if (!res.ok || !j.image) throw new Error(j.error || "Upload failed.");
      changed(j.images ?? [j.image]);
      update({ mode: "image", image: j.image.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    if (!selected) return;
    if (!window.confirm(`Delete "${selected.name}" from the watermark images?`)) return;
    setError(null);
    const res = await fetch(`/api/watermark/${encodeURIComponent(selected.id)}`, {
      method: "DELETE",
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string; images?: WatermarkImage[] };
    if (!res.ok) {
      setError(j.error || "Could not delete that image.");
      return;
    }
    update({ image: "" });
    changed(j.images);
  };

  const empty = images !== null && images.length === 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="w-11 shrink-0 text-[10px] tracking-wide text-[var(--muted)] uppercase">
          {label}
        </span>
        <select
          aria-label="Watermark"
          className={`${selectCls} ${state.mode === "none" ? "flex-1" : "w-24 shrink-0"}`}
          disabled={disabled}
          value={state.mode}
          onChange={(e) => update({ mode: e.target.value as Mode })}
        >
          <option value="none">No watermark</option>
          <option value="text">Text</option>
          <option value="image">Image</option>
        </select>
        {state.mode === "text" && (
          <input
            aria-label="Watermark text"
            className={`${inputCls} flex-1`}
            disabled={disabled}
            maxLength={MAX_WATERMARK_TEXT}
            placeholder="Such as © Contoso Learning"
            value={state.text}
            onChange={(e) => update({ text: e.target.value })}
          />
        )}
        {state.mode === "image" && (
          <>
            <select
              aria-label="Watermark image"
              className={`${selectCls} flex-1`}
              disabled={disabled || images === null || empty}
              value={state.image}
              onChange={(e) => update({ image: e.target.value })}
            >
              <option value="">{empty ? "No images yet" : "Choose an image"}</option>
              {(images ?? []).map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
            {selected && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/watermark/${encodeURIComponent(selected.id)}`}
                alt=""
                className="h-6 max-w-12 shrink-0 rounded border border-[var(--border)] bg-[repeating-conic-gradient(#3a4250_0_25%,#262c36_0_50%)] bg-[length:8px_8px] object-contain"
              />
            )}
            {selected && (
              <button
                type="button"
                className={`${iconBtn} hover:!text-red-300`}
                aria-label={`Delete ${selected.name}`}
                title="Delete from watermark images"
                disabled={disabled}
                onClick={() => void remove()}
              >
                ✕
              </button>
            )}
            <button
              type="button"
              className={iconBtn}
              aria-label="Upload a watermark image"
              title="Upload an image"
              disabled={disabled || uploading}
              onClick={() => fileInput.current?.click()}
            >
              {uploading ? "…" : "＋"}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void upload(f);
              }}
            />
          </>
        )}
      </div>

      {state.mode !== "none" && (
        <div className="flex items-center gap-2 pl-[3.25rem]">
          <fieldset
            className="grid aspect-video w-[4.5rem] shrink-0 grid-cols-3 grid-rows-3 rounded-md border border-[var(--border)] bg-well p-0.5"
            disabled={disabled}
          >
            <legend className="sr-only">Watermark position</legend>
            {WATERMARK_POSITIONS.map((p) => (
              <label
                key={p.key}
                title={p.label}
                className="flex cursor-pointer items-center justify-center"
              >
                <input
                  type="radio"
                  name={group}
                  value={p.key}
                  aria-label={p.label}
                  checked={state.layout.position === p.key}
                  onChange={() => setLayout({ position: p.key })}
                  className="peer sr-only"
                />
                <span
                  aria-hidden
                  className="h-1 w-1 rounded-full bg-[var(--muted)] opacity-40 transition-colors peer-checked:h-1.5 peer-checked:w-3 peer-checked:rounded-sm peer-checked:bg-[var(--accent)] peer-checked:opacity-100 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)]"
                />
              </label>
            ))}
          </fieldset>
          <select
            aria-label="Watermark size"
            className={`${selectCls} flex-1`}
            disabled={disabled}
            value={state.layout.size}
            onChange={(e) => setLayout({ size: e.target.value as WatermarkSize })}
          >
            {(Object.keys(WATERMARK_SIZES) as WatermarkSize[]).map((k) => (
              <option key={k} value={k}>
                {WATERMARK_SIZES[k].label}
              </option>
            ))}
          </select>
          <select
            aria-label="Watermark opacity"
            className={`${selectCls} flex-1`}
            disabled={disabled}
            value={state.layout.opacity}
            onChange={(e) => setLayout({ opacity: e.target.value as WatermarkOpacity })}
          >
            {(Object.keys(WATERMARK_OPACITIES) as WatermarkOpacity[]).map((k) => (
              <option key={k} value={k}>
                {WATERMARK_OPACITIES[k].label}
              </option>
            ))}
          </select>
        </div>
      )}

      {state.mode === "image" && empty && !error && (
        <p className="pl-[3.25rem] text-[10px] leading-snug text-[var(--muted)]">
          No images yet. Press ＋ to upload a logo you have the rights to use
          (PNG, JPEG, WebP or GIF). Transparent PNGs look best.
        </p>
      )}
      {error && <p className="pl-[3.25rem] text-[10px] leading-snug text-red-300">{error}</p>}
    </div>
  );
}
