import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { voiceDir } from "./paths";
import { PINNED_VOICES } from "./voices";
import { listServiceVoices, synthesizeRawSsml, type ServiceVoice } from "./speech";
import {
  BASELINE_VOICES,
  isVoiceId,
  cleanStyle,
  usableStyles,
  type CatalogVoice,
} from "./voicecatalog";

const LOCALE = "en-US";
const TTL_MS = 24 * 60 * 60 * 1000;

type Cached = { at: number; voices: CatalogVoice[] };
let memory: Cached | null = null;

const cacheFile = () => path.join(voiceDir(), `catalog-${LOCALE}.json`);

/** Generally available voices, plus the MAI-Voice-2 family (preview, with the richest styles). */
function offered(v: ServiceVoice): boolean {
  if (v.Locale !== LOCALE) return false;
  if (v.ShortName.endsWith(":MAI-Voice-2")) return true;
  return v.Status === "GA" && !v.ShortName.includes("Multitalker");
}

export function toCatalog(list: ServiceVoice[]): CatalogVoice[] {
  return list.filter(offered).map((v) => ({
    id: v.ShortName,
    name: v.DisplayName?.trim() || v.ShortName,
    gender: v.Gender ?? "",
    styles: usableStyles(v.ShortName, v.StyleList),
    ...(v.VoiceType === "NeuralHD" ? { hd: true } : {}),
    ...(v.Status !== "GA" ? { preview: true } : {}),
  }));
}

function readDisk(): Cached | null {
  try {
    const j = JSON.parse(fs.readFileSync(cacheFile(), "utf8")) as Cached;
    return Array.isArray(j.voices) && typeof j.at === "number" ? j : null;
  } catch {
    return null;
  }
}

/**
 * The voices the Speech resource really offers, cached for a day. When the
 * service cannot be reached the last good list is used, then the pinned
 * speakers, so the picker never comes up empty.
 */
export async function loadVoiceCatalog(): Promise<{ voices: CatalogVoice[]; live: boolean }> {
  const now = Date.now();
  if (memory && now - memory.at < TTL_MS) return { voices: memory.voices, live: true };
  const disk = readDisk();
  if (disk && now - disk.at < TTL_MS) {
    memory = disk;
    return { voices: disk.voices, live: true };
  }
  try {
    const voices = toCatalog(await listServiceVoices());
    if (voices.length) {
      memory = { at: now, voices };
      fs.mkdirSync(voiceDir(), { recursive: true });
      fs.writeFileSync(cacheFile(), JSON.stringify(memory));
      return { voices, live: true };
    }
  } catch {
    /* fall through to the stale list */
  }
  if (disk) return { voices: disk.voices, live: true };
  return { voices: BASELINE_VOICES, live: false };
}

/**
 * Check a requested voice and style against the live list. A voice the service
 * does not offer falls back to `fallback`, and a style the voice does not
 * declare is dropped, so a stale or forged value cannot reach the renderer.
 */
export async function resolveVoice(
  voice: unknown,
  style: unknown,
  fallback: string
): Promise<{ voice: string; style?: string }> {
  const wanted = typeof voice === "string" ? voice : fallback;
  const id = PINNED_VOICES[wanted] ?? wanted;
  if (!isVoiceId(id)) return { voice: wanted };
  const { voices, live } = await loadVoiceCatalog();
  const found = voices.find((v) => v.id === id);
  if (!found) return live ? { voice: fallback } : { voice: wanted };
  const s = cleanStyle(style);
  return found.styles.includes(s ?? "") ? { voice: wanted, style: s } : { voice: wanted };
}

const sampleText = (name: string, style?: string) =>
  `Hello, I'm ${name}. ${
    style ? "This is how I sound with a different delivery. " : ""
  }Welcome to the training, and let's get started.`;

/** A short sample of one voice and style, rendered once and kept on disk. */
export async function voiceSample(voice: string, style?: string): Promise<Buffer> {
  const file = path.join(
    voiceDir(),
    "samples",
    `${crypto.createHash("sha1").update(`${voice}|${style ?? ""}`).digest("hex")}.mp3`
  );
  try {
    return fs.readFileSync(file);
  } catch {
    /* not rendered yet */
  }
  const { voices } = await loadVoiceCatalog();
  const name = voices.find((v) => v.id === voice)?.name.split(/[\s:]/)[0] ?? "your presenter";
  const text = sampleText(name, style);
  const inner = style ? `<mstts:express-as style='${style}'>${text}</mstts:express-as>` : text;
  const mp3 = await synthesizeRawSsml(
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='http://www.w3.org/2001/mstts' xml:lang='en-US'><voice name='${voice}'>${inner}</voice></speak>`
  );
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, mp3);
  return mp3;
}
