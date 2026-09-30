import { SPEAKER_IDS, type SpeakerId } from "./voices";
import { applyReplacements, type Replacement } from "./narration";

/**
 * Audio-overview scripts: reading what the model wrote, keeping it to length,
 * and turning the reviewed script into the turns that get narrated.
 */

export type ScriptTurn = { speaker: SpeakerId; text: string };
export type ScriptSegment = { title: string; turns: ScriptTurn[] };
export type PodcastScript = { segments: ScriptSegment[] };

export type RawScript = {
  title?: unknown;
  description?: unknown;
  turns?: unknown;
  segments?: unknown;
};

export type SpeakerInput = { voice?: string; name?: string; role?: string };
export type SpeakerProfile = {
  id: SpeakerId;
  voice?: string;
  name?: string;
  role?: string;
};

export const MAX_TURN_CHARS = 3000;
export const MAX_TURNS = 400;

export const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
export const isSpeakerId = (v: string): v is SpeakerId =>
  (SPEAKER_IDS as readonly string[]).includes(v);
export const activeSpeakerIds = (count: number) =>
  SPEAKER_IDS.slice(0, Math.min(4, Math.max(1, count)));

export function cleanLabel(v: unknown, max = 60): string | undefined {
  const s = str(v).replace(/\s+/g, " ").trim().slice(0, max);
  return s || undefined;
}

export function readSpeakerProfiles(
  raw: unknown,
  customVoices?: Partial<Record<SpeakerId, string>>
): SpeakerProfile[] {
  const defaultInputs: SpeakerInput[] = [
    { role: "drives the conversation and asks the questions" },
    { role: "is the analyst who explains and supplies detail" },
  ];
  const inputs = Array.isArray(raw) && raw.length ? raw.slice(0, 4) : defaultInputs;
  const count = inputs.length >= 1 && inputs.length <= 4 ? inputs.length : 2;
  return activeSpeakerIds(count).map((id, i) => {
    const input = (inputs[i] ?? {}) as SpeakerInput;
    return {
      id,
      voice: cleanLabel(input.voice) ?? customVoices?.[id],
      name: cleanLabel(input.name),
      role: cleanLabel(input.role, 180),
    };
  });
}

/** Strip anything the model may have slipped in that a voice would read aloud. */
export function cleanSpoken(text: string): string {
  return (
    text
      .replace(/\[\d+\](?:\[\d+\])*/g, "")
      // Stage directions. The prompt forbids them, but a model trained on
      // recording scripts still reaches for [MUSIC] and (laughs) — and the
      // voice reads them out, word for word, as part of the dialogue.
      .replace(/\[(?:[A-Z][A-Z \-]{1,18}(?::[^\]]*)?)\]/g, "")
      .replace(/\((?:laughs?|chuckles?|sighs?|pauses?|beat|music|sfx)[^)]*\)/gi, "")
      .replace(/[*_`#>]/g, "")
      .replace(/\((?:https?:\/\/|www\.)[^)]*\)/gi, "")
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/^\s*[-•]\s*/gm, "")
      .replace(/\s{2,}/g, " ")
      // Removing citation markers leaves gaps like "bacteria ." — close them up.
      .replace(/\s+([.,!?;:])/g, "$1")
      .replace(/\(\s*\)/g, "")
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}

export type Flat = { turns: ScriptTurn[]; marks: { title: string; index: number }[] };

/**
 * Flatten the model's script to turns, remembering where each segment starts.
 *
 * Segment titles become the chapters offered in the player, so the boundary
 * has to survive flattening. Older scripts have a flat `turns` array and no
 * segments; they still play, just without chapters.
 */
export function readScript(script: RawScript, speakerCount: number): Flat {
  const marks: { title: string; index: number }[] = [];
  const turns: ScriptTurn[] = [];
  const ids = activeSpeakerIds(speakerCount);

  const push = (raw: unknown) => {
    const o = (raw ?? {}) as { speaker?: unknown; text?: unknown };
    const text = cleanSpoken(str(o.text)).slice(0, MAX_TURN_CHARS);
    if (!text) return;
    const given = str(o.speaker).toLowerCase();
    const speaker = isSpeakerId(given) && ids.includes(given)
      ? given
      : ids[turns.length % ids.length];
    turns.push({ speaker, text });
  };

  if (Array.isArray(script.segments) && script.segments.length) {
    for (const seg of script.segments) {
      const s = (seg ?? {}) as { title?: unknown; turns?: unknown };
      const title = cleanSpoken(str(s.title)).slice(0, 60);
      const before = turns.length;
      for (const t of Array.isArray(s.turns) ? s.turns : []) push(t);
      // A segment that produced nothing should not leave a chapter marker
      // pointing at the next segment's first line.
      if (title && turns.length > before) marks.push({ title, index: before });
    }
  }
  if (!turns.length && Array.isArray(script.turns)) {
    for (const t of script.turns) push(t);
  }

  return { turns: turns.slice(0, MAX_TURNS), marks: marks.filter((m) => m.index < MAX_TURNS) };
}

export const countWords = (turns: { text: string }[]) =>
  turns.reduce((n, t) => n + (t.text.match(/\S+/g)?.length ?? 0), 0);

/**
 * Cut a script down to a word budget, keeping the opening and the last two
 * turns.
 *
 * Returns which original positions survived, so chapter markers can be moved
 * with them rather than left pointing at whatever now sits at that index.
 */
export function trimToWords<T extends { text: string }>(
  turns: T[],
  target: number
): { turns: T[]; kept: number[] } {
  if (turns.length <= 4) return { turns, kept: turns.map((_, i) => i) };
  const tailFrom = turns.length - 2;
  const tailWords = countWords(turns.slice(tailFrom));

  const kept: number[] = [];
  let used = tailWords;
  for (let i = 0; i < tailFrom; i++) {
    const w = turns[i].text.match(/\S+/g)?.length ?? 0;
    if (used + w > target && kept.length >= 2) break;
    kept.push(i);
    used += w;
  }
  kept.push(tailFrom, tailFrom + 1);

  return {
    turns: kept.map((orig) => turns[orig]),
    kept,
  };
}

/** Group flat turns back into the segments the script editor shows. */
export function toSegments(flat: Flat): PodcastScript {
  const segments: ScriptSegment[] = [];
  const marks = [...flat.marks].sort((a, b) => a.index - b.index);
  const starts = marks.map((m) => m.index);
  if (!starts.length || starts[0] !== 0) {
    const end = starts[0] ?? flat.turns.length;
    if (end > 0) segments.push({ title: "", turns: flat.turns.slice(0, end) });
  }
  marks.forEach((m, i) => {
    const end = marks[i + 1]?.index ?? flat.turns.length;
    const turns = flat.turns.slice(m.index, end);
    if (turns.length) segments.push({ title: m.title, turns });
  });
  return { segments };
}

/**
 * Validate a script coming back from the editor. Speakers outside the
 * episode's set are reassigned rather than rejected; empty turns and empty
 * segments are dropped.
 */
export function normalizeEditedScript(raw: unknown, speakerCount: number): PodcastScript {
  const ids = activeSpeakerIds(speakerCount);
  const segs = Array.isArray((raw as { segments?: unknown })?.segments)
    ? ((raw as { segments: unknown[] }).segments)
    : [];
  const segments: ScriptSegment[] = [];
  let total = 0;
  for (const seg of segs) {
    const s = (seg ?? {}) as { title?: unknown; turns?: unknown };
    const turns: ScriptTurn[] = [];
    for (const t of Array.isArray(s.turns) ? s.turns : []) {
      if (total >= MAX_TURNS) break;
      const o = (t ?? {}) as { speaker?: unknown; text?: unknown };
      const text = str(o.text).replace(/\s+/g, " ").trim().slice(0, MAX_TURN_CHARS);
      if (!text) continue;
      const given = str(o.speaker).toLowerCase();
      const speaker = isSpeakerId(given) && ids.includes(given) ? given : ids[0]!;
      turns.push({ speaker, text });
      total++;
    }
    if (turns.length) {
      segments.push({ title: str(s.title).replace(/\s+/g, " ").trim().slice(0, 60), turns });
    }
  }
  return { segments };
}

/**
 * The words that will actually be narrated: cleaned of anything a voice would
 * read out, with the replacement list enforced, and chapter marks placed.
 */
export function scriptForNarration(script: PodcastScript, replacements: Replacement[]): Flat {
  const turns: ScriptTurn[] = [];
  const marks: { title: string; index: number }[] = [];
  for (const seg of script.segments) {
    const before = turns.length;
    for (const t of seg.turns) {
      const text = cleanSpoken(applyReplacements(t.text, replacements));
      if (text) turns.push({ speaker: t.speaker, text });
    }
    const title = applyReplacements(seg.title, replacements).trim();
    if (title && turns.length > before) marks.push({ title, index: before });
  }
  return { turns, marks };
}

/**
 * The editable script of an overview. Overviews made before scripts were
 * editable carry only timed turns and chapters, so the script is rebuilt from
 * those — they can be edited and narrated again too.
 */
export function scriptOf(c: {
  script?: PodcastScript;
  turns?: { speaker: SpeakerId; text: string; at?: number }[];
  chapters?: { title: string; at: number }[];
}): PodcastScript {
  if (c.script?.segments?.length) return c.script;
  const timed = c.turns ?? [];
  const turns = timed.map((t) => ({ speaker: t.speaker, text: t.text }));
  const starts = (c.chapters ?? [])
    .map((ch) => ({
      title: ch.title,
      index: timed.findIndex((t) => Math.abs(Number(t.at ?? -1) - ch.at) < 0.05),
    }))
    .filter((m) => m.index >= 0)
    .sort((a, b) => a.index - b.index);
  if (!starts.length) return { segments: turns.length ? [{ title: "", turns }] : [] };
  const segments: ScriptSegment[] = [];
  if (starts[0]!.index > 0) segments.push({ title: "", turns: turns.slice(0, starts[0]!.index) });
  starts.forEach((m, i) => {
    const seg = turns.slice(m.index, starts[i + 1]?.index ?? turns.length);
    if (seg.length) segments.push({ title: m.title, turns: seg });
  });
  return { segments };
}

/**
 * Narration settings for an overview. Older overviews kept `rate` at the top
 * level and stored full neural voice names for fixed ("classic") delivery, with
 * no `settings` at all; infer what they were made with rather than resetting it.
 */
export function podcastSettings(c: {
  settings?: { preset?: string; rate?: number; breath?: number };
  rate?: number;
  speakers?: { voice?: string }[];
}): { preset: string; rate: number | undefined; breath: number | undefined } {
  const s = c.settings ?? {};
  const pinned = (c.speakers ?? []).some((sp) => /^[a-z]{2}-[A-Z]{2}-/.test(sp.voice ?? ""));
  return {
    preset: s.preset ?? (pinned ? "classic" : "conversational"),
    rate: s.rate ?? c.rate,
    breath: s.breath,
  };
}
