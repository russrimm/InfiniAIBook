/**
 * Capitalization for words shown on training-video slides.
 *
 * On-screen text is copied from the spoken script, often from the middle of a
 * sentence, so models hand back "copilot studio agents" where the slide should
 * read "Copilot Studio agents". The script itself is the authority on how its
 * names are written: a word written capitalized mid-sentence more often than
 * not ("Azure", "GitHub", "AI") is a name, and is restored wherever a slide has
 * it in lowercase. Slide text then starts with a capital letter.
 *
 * Text is only ever raised, never lowered, so anything an author capitalized
 * on purpose is left alone. Pure and client-safe.
 */

export type CaseVocabulary = ReadonlyMap<string, string>;

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu;
/** Text between two words that ends a sentence or a line. */
const SENTENCE_BREAK = /[.!?…:\n]["'”’)\]]*\s*["'“‘(\[]*$/u;

const BUILTIN: Record<string, string> = {
  i: "I",
  "i'm": "I'm",
  "i’m": "I’m",
  "i've": "I've",
  "i’ve": "I’ve",
  "i'll": "I'll",
  "i’ll": "I’ll",
  "i'd": "I'd",
  "i’d": "I’d",
};

const hasUpper = (w: string) => w !== w.toLowerCase();
const hasInnerUpper = (w: string) => hasUpper(w.slice(1));

/**
 * How the script writes its names: lowercase word → its usual capitalized form.
 * Pass prose (the spoken sections, the description, the objectives), not
 * Title Case headings, which would make every word look like a name.
 */
export function caseVocabulary(texts: (string | undefined)[]): Map<string, string> {
  const forms = new Map<string, Map<string, number>>();
  const plain = new Map<string, number>();
  const count = (w: string, start: boolean) => {
    if (/^\p{N}+$/u.test(w)) return;
    const key = w.toLowerCase();
    if (!hasUpper(w)) {
      plain.set(key, (plain.get(key) ?? 0) + 1);
      return;
    }
    // A capital at the start of a sentence says nothing about the word itself,
    // unless the word carries capitals inside it ("GitHub", "AI").
    if (start && !hasInnerUpper(w)) return;
    const f = forms.get(key) ?? new Map<string, number>();
    f.set(w, (f.get(w) ?? 0) + 1);
    forms.set(key, f);
  };
  for (const text of texts) {
    if (!text) continue;
    let last = 0;
    let first = true;
    for (const m of text.matchAll(WORD)) {
      const w = m[0];
      const start = first || SENTENCE_BREAK.test(text.slice(last, m.index));
      first = false;
      last = m.index + w.length;
      count(w, start);
      // "Copilot's" also teaches how "copilot" is written.
      const stem = w.split(/['’]/)[0];
      if (stem !== w) count(stem, start);
    }
  }
  const out = new Map<string, string>();
  for (const [key, f] of forms) {
    let best = "";
    let bestN = 0;
    let total = 0;
    for (const [form, n] of f) {
      total += n;
      if (n > bestN) [best, bestN] = [form, n];
    }
    if (total > (plain.get(key) ?? 0)) out.set(key, best);
  }
  return out;
}

/**
 * `text` as a slide should show it: names restored from the vocabulary, and
 * the first letter capitalized unless the first word is a name written in
 * lowercase on purpose ("iPhone").
 */
export function fixCase(text: string, vocab?: CaseVocabulary): string;
export function fixCase(text: string | undefined, vocab?: CaseVocabulary): string | undefined;
export function fixCase(text: string | undefined, vocab?: CaseVocabulary): string | undefined {
  if (!text) return text;
  let first = true;
  return text.replace(WORD, (w) => {
    let out = w;
    if (!hasUpper(w)) {
      const known = vocab?.get(w) ?? BUILTIN[w];
      if (known) out = known;
      else {
        const [stem, ...rest] = w.split(/(?=['’])/);
        const name = rest.length ? vocab?.get(stem) : undefined;
        if (name) out = name + rest.join("");
      }
    }
    if (first) {
      first = false;
      if (!hasUpper(out) && /^\p{Ll}/u.test(out)) out = out.charAt(0).toUpperCase() + out.slice(1);
    }
    return out;
  });
}

type CasedFields = {
  title?: string;
  subtitle?: string;
  caption?: string;
  question?: string;
  answer?: string;
  bullets?: { text: string; anchor?: string }[];
  stat?: { value: string; label: string };
  quote?: { text: string; attribution?: string };
};

/** A copy of a visual with every on-screen text field capitalized; anchors untouched. */
export function casedCue<T extends CasedFields>(cue: T, vocab?: CaseVocabulary): T {
  const out: T = { ...cue };
  if (cue.title) out.title = fixCase(cue.title, vocab);
  if (cue.subtitle) out.subtitle = fixCase(cue.subtitle, vocab);
  if (cue.caption) out.caption = fixCase(cue.caption, vocab);
  if (cue.question) out.question = fixCase(cue.question, vocab);
  if (cue.answer) out.answer = fixCase(cue.answer, vocab);
  if (cue.bullets) out.bullets = cue.bullets.map((b) => ({ ...b, text: fixCase(b.text, vocab) }));
  if (cue.stat) out.stat = { value: cue.stat.value, label: fixCase(cue.stat.label, vocab) };
  if (cue.quote) {
    out.quote = {
      ...cue.quote,
      text: fixCase(cue.quote.text, vocab),
      ...(cue.quote.attribution ? { attribution: fixCase(cue.quote.attribution, vocab) } : {}),
    };
  }
  return out;
}
