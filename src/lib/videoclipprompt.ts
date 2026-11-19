import { ASPECT_LABELS, MAX_PROMPT_CHARS, MAX_PROMPTS, type ClipAspect } from "./videoclip";

/**
 * Drafting clip prompts from a notebook's sources.
 *
 * The chat model reads the selected sources and proposes a few short, visual
 * prompts. They are shown to the person for editing before any money is spent,
 * so this only has to make them good starting points: concrete, filmable and
 * safe for a provider's content filters.
 */

export type ClipPromptDraft = { title: string; prompt: string };

export function CLIP_PROMPT_INSTRUCTION(
  count: number,
  opts: { aspect: ClipAspect; duration: number; topic?: string },
): string {
  const n = Math.min(MAX_PROMPTS, Math.max(1, Math.floor(count)));
  return `You are a cinematographer writing prompts for a text-to-video model.

From the source excerpts, propose ${n} different short ${opts.duration}-second video clip${n === 1 ? "" : "s"} (${ASPECT_LABELS[opts.aspect]}) that would make good B-roll for a presentation about them${opts.topic ? `, focused on: ${opts.topic}` : ""}.
Each clip shows ONE idea from the sources as a single continuous shot.

Rules for every prompt:
- Describe what the camera sees: the subject, the action, the setting, the lighting and one camera movement. Be concrete and filmable.
- A single continuous shot with no scene cuts. Say so.
- No text, captions, logos, signs, charts or numbers on screen. Video models draw them badly.
- No dialogue and no narration. Natural ambient sound is fine.
- No real people, celebrities, politicians or recognizable faces; no brands, products by name, copyrighted characters or music. Use generic or abstract subjects such as hands, silhouettes, landscapes, machines, objects and diagrams made of light.
- Nothing violent, sexual or distressing.
- Stay faithful to the excerpts: show something they actually discuss. Do not invent facts.
- 40 to 90 words each, written as one paragraph of plain sentences.

Respond with a single JSON object only: { "prompts": [ { "title": string (3 to 6 words), "prompt": string } ] }
Return exactly ${n} prompt${n === 1 ? "" : "s"}.`;
}

const clean = (s: string): string =>
  s
    .replace(/\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g, "")
    .replace(/[*_`#>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Accept the shapes models drift into: the requested object, a bare array, or plain strings. */
export function normalizeClipPrompts(raw: unknown, max = MAX_PROMPTS): ClipPromptDraft[] {
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { prompts?: unknown }).prompts)
      ? (raw as { prompts: unknown[] }).prompts
      : [];

  const seen = new Set<string>();
  const out: ClipPromptDraft[] = [];
  for (const item of list) {
    const o = typeof item === "string" ? { prompt: item } : (item as { title?: unknown; prompt?: unknown; description?: unknown });
    const prompt = clean(String(o?.prompt ?? o?.description ?? "")).slice(0, MAX_PROMPT_CHARS).trim();
    if (prompt.length < 20) continue;
    const key = prompt.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (seen.has(key)) continue;
    seen.add(key);
    const title = clean(String(o?.title ?? "")).slice(0, 60) || prompt.split(/[.!?]/)[0].split(" ").slice(0, 5).join(" ");
    out.push({ title, prompt });
    if (out.length >= max) break;
  }
  return out;
}
