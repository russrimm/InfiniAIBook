/**
 * User steering for everything that is spoken aloud: audio overviews and the
 * whiteboard, motion and training videos.
 *
 * Two mechanisms, because a model asked not to say something will still say
 * it now and then. The free-text instructions shape the script as it is
 * written; the replacement list is enforced on the finished words afterwards,
 * including words a person typed into the script editor.
 */

export type Replacement = { from: string; to: string };
export type NarrationSettings = { instructions: string; replacements: Replacement[] };

export const MAX_INSTRUCTIONS = 2000;
export const MAX_REPLACEMENTS = 40;
const MAX_TERM = 80;

export const EMPTY_NARRATION: NarrationSettings = { instructions: "", replacements: [] };

export function normalizeInstructions(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.replace(/\r\n?/g, "\n").trim().slice(0, MAX_INSTRUCTIONS);
}

export function normalizeReplacements(v: unknown): Replacement[] {
  let raw = v;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Replacement[] = [];
  for (const item of raw) {
    const o = item as { from?: unknown; to?: unknown };
    const from = typeof o?.from === "string" ? o.from.replace(/\s+/g, " ").trim().slice(0, MAX_TERM) : "";
    const to = typeof o?.to === "string" ? o.to.replace(/\s+/g, " ").trim().slice(0, MAX_TERM) : "";
    if (!from || seen.has(from.toLowerCase())) continue;
    seen.add(from.toLowerCase());
    out.push({ from, to });
    if (out.length >= MAX_REPLACEMENTS) break;
  }
  return out;
}

/** Read the narration settings a request carries, tolerating anything malformed. */
export function readNarration(v: unknown): NarrationSettings {
  const o = (v ?? {}) as { instructions?: unknown; replacements?: unknown };
  return {
    instructions: normalizeInstructions(o.instructions),
    replacements: normalizeReplacements(o.replacements),
  };
}

export const hasNarration = (s: NarrationSettings | undefined) =>
  Boolean(s && (s.instructions || s.replacements.length));

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function matchCase(found: string, replacement: string): string {
  if (!replacement) return replacement;
  const letters = found.replace(/[^\p{L}]/gu, "");
  if (letters.length > 1 && letters === letters.toUpperCase() && replacement === replacement.toLowerCase()) {
    return replacement.toUpperCase();
  }
  const first = found.match(/\p{L}/u)?.[0];
  if (first && first === first.toUpperCase() && first !== first.toLowerCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/**
 * Replace whole-word, case-insensitive matches of each term in one pass, so a
 * replacement can never itself be replaced by a later rule. An empty
 * replacement removes the term and tidies the spacing it leaves behind.
 */
export function applyReplacements(text: string, list: Replacement[] | undefined): string {
  if (!text || !list?.length) return text;
  const terms = [...list].sort((a, b) => b.from.length - a.from.length);
  const lookup = new Map(terms.map((r) => [r.from.toLowerCase(), r.to]));
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}_])(?:${terms.map((r) => escapeRegExp(r.from)).join("|")})(?![\\p{L}\\p{N}_])`,
    "giu"
  );
  let removed = false;
  const replaced = text.replace(pattern, (found) => {
    const to = lookup.get(found.toLowerCase()) ?? "";
    if (!to) removed = true;
    return matchCase(found, to);
  });
  if (!removed) return replaced;
  return replaced
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,!?;:])/g, "$1")
    .replace(/([,;:])\s*([.,!?;:])/g, "$2")
    .replace(/([.!?])[ \t]*[,;:]/g, "$1")
    .replace(/^[ \t]*[,;:][ \t]*/gm, "")
    .trim();
}

/**
 * The prompt section that carries the user's instructions. Empty when there is
 * nothing to say, so prompts without settings are unchanged.
 */
export function narrationPromptBlock(s: NarrationSettings | undefined): string {
  if (!hasNarration(s)) return "";
  const parts = [
    "",
    "",
    "USER NARRATION INSTRUCTIONS",
    "The person who asked for this gave the instructions below. Follow them for the",
    "wording, language, terminology and delivery of everything that will be spoken or",
    "shown. They never override the grounding rules: do not invent facts to satisfy",
    "them, and keep the required JSON shape and field names in English.",
  ];
  if (s!.instructions) {
    parts.push('"""', s!.instructions, '"""');
  }
  if (s!.replacements.length) {
    parts.push("Never say the following terms. Use the replacement given instead:");
    for (const r of s!.replacements) {
      parts.push(
        r.to ? `- "${r.from}" → say "${r.to}"` : `- "${r.from}" → do not say it at all; rephrase around it`
      );
    }
  }
  return parts.join("\n");
}
