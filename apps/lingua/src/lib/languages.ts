/**
 * Languages the app teaches and explains in. Any language can be the target
 * (the one being learned) or the support language (the one the learner
 * already speaks). Add a language by appending one entry here, plus at least
 * one persona in personas.ts.
 */

export type Script = "latin" | "cjk" | "kana" | "hangul" | "devanagari" | "arabic";

export type Language = {
  code: string;
  /** English name, used in the UI and in model instructions. */
  name: string;
  /** Name in the language itself. */
  native: string;
  flag: string;
  rtl?: boolean;
  /**
   * Writing systems that identify the language on sight. Japanese lists kana
   * first: kanji alone cannot tell it apart from Chinese.
   */
  scripts: Script[];
  /**
   * Very common short words, for telling Latin-script languages apart in a
   * short transcript line. Lower case, no punctuation.
   */
  commonWords: string[];
  /** Letters with marks typical of the language; a tie-breaker between Latin-script languages. */
  marks?: string;
  /**
   * Phrases a learner says when lost. Matched case-insensitively as
   * substrings of the learner's transcribed turn.
   */
  confusion: string[];
};

export const LANGUAGES: Language[] = [
  {
    code: "en",
    name: "English",
    native: "English",
    flag: "🇺🇸",
    scripts: ["latin"],
    commonWords: [
      "the", "and", "is", "you", "i", "it", "to", "of", "a", "that", "what", "this",
      "have", "are", "do", "not", "with", "my", "me", "we", "can", "yes", "no", "please",
      "would", "like", "how", "where",
    ],
    confusion: [
      "i don't understand", "i do not understand", "what does that mean", "what does",
      "can you repeat", "say that again", "sorry?", "i'm lost", "i am lost",
      "in english", "slower please", "i don't know how to say",
    ],
  },
  {
    code: "es",
    name: "Spanish",
    native: "Español",
    flag: "🇪🇸",
    scripts: ["latin"],
    marks: "ñ¿¡áéíóú",
    commonWords: [
      "el", "la", "los", "las", "y", "es", "de", "que", "en", "un", "una", "por", "para",
      "con", "no", "sí", "yo", "tú", "está", "estoy", "pero", "muy", "gracias", "quiero",
      "hola", "qué", "cómo", "dónde",
    ],
    confusion: [
      "no entiendo", "no comprendo", "qué significa", "que significa", "puedes repetir",
      "puede repetir", "otra vez", "más despacio", "mas despacio", "no sé cómo decir",
      "no se como decir", "en español",
    ],
  },
  {
    code: "fr",
    name: "French",
    native: "Français",
    flag: "🇫🇷",
    scripts: ["latin"],
    marks: "çàèêëîïôûœé",
    commonWords: [
      "le", "la", "les", "et", "est", "de", "des", "que", "en", "un", "une", "pour", "avec",
      "je", "tu", "vous", "nous", "pas", "oui", "non", "mais", "très", "merci", "suis",
      "bonjour", "c'est", "qu'est-ce", "où",
    ],
    confusion: [
      "je ne comprends pas", "je comprends pas", "ça veut dire quoi", "qu'est-ce que ça veut dire",
      "vous pouvez répéter", "tu peux répéter", "pouvez-vous répéter", "plus lentement",
      "je ne sais pas comment dire", "en français",
    ],
  },
  {
    code: "de",
    name: "German",
    native: "Deutsch",
    flag: "🇩🇪",
    scripts: ["latin"],
    marks: "äöüß",
    commonWords: [
      "der", "die", "das", "und", "ist", "ich", "du", "sie", "wir", "nicht", "ein", "eine",
      "mit", "für", "auf", "zu", "ja", "nein", "aber", "sehr", "danke", "bin", "habe",
      "hallo", "was", "wie", "wo", "gerne",
    ],
    confusion: [
      "ich verstehe nicht", "ich verstehe das nicht", "was bedeutet", "was heißt",
      "können sie das wiederholen", "kannst du das wiederholen", "noch einmal", "nochmal",
      "langsamer bitte", "bitte langsamer", "ich weiß nicht, wie man", "auf deutsch",
    ],
  },
  {
    code: "it",
    name: "Italian",
    native: "Italiano",
    flag: "🇮🇹",
    scripts: ["latin"],
    marks: "àèéìòù",
    commonWords: [
      "il", "lo", "la", "gli", "le", "e", "è", "di", "che", "un", "una", "per", "con", "non",
      "sì", "io", "tu", "sono", "ma", "molto", "grazie", "vorrei", "ciao", "cosa", "come",
      "dove", "anche", "questo",
    ],
    confusion: [
      "non capisco", "cosa significa", "che significa", "puoi ripetere", "può ripetere",
      "di nuovo", "più piano", "più lentamente", "non so come dire", "in italiano",
    ],
  },
  {
    code: "pt",
    name: "Portuguese",
    native: "Português",
    flag: "🇧🇷",
    scripts: ["latin"],
    marks: "ãõçâêôáéí",
    commonWords: [
      "o", "a", "os", "as", "e", "é", "de", "que", "em", "um", "uma", "para", "com", "não",
      "sim", "eu", "você", "está", "estou", "mas", "muito", "obrigado", "obrigada", "quero",
      "olá", "oi", "como", "onde",
    ],
    confusion: [
      "não entendi", "não entendo", "o que significa", "pode repetir", "você pode repetir",
      "de novo", "mais devagar", "não sei como dizer", "em português",
    ],
  },
  {
    code: "ja",
    name: "Japanese",
    native: "日本語",
    flag: "🇯🇵",
    scripts: ["kana", "cjk"],
    commonWords: [],
    confusion: [
      "わかりません", "分かりません", "わからない", "分からない", "どういう意味",
      "もう一度", "もういちど", "ゆっくり", "なんて言う", "日本語で",
    ],
  },
  {
    code: "zh",
    name: "Mandarin Chinese",
    native: "中文",
    flag: "🇨🇳",
    scripts: ["cjk"],
    commonWords: [],
    confusion: [
      "我不明白", "我不懂", "听不懂", "聽不懂", "什么意思", "什麼意思", "再说一遍",
      "再說一遍", "慢一点", "慢一點", "怎么说", "用中文",
    ],
  },
  {
    code: "ko",
    name: "Korean",
    native: "한국어",
    flag: "🇰🇷",
    scripts: ["hangul"],
    commonWords: [],
    confusion: [
      "모르겠어요", "모르겠습니다", "이해가 안 돼요", "이해 못 했어요", "무슨 뜻",
      "다시 말해", "천천히", "어떻게 말해", "한국어로",
    ],
  },
  {
    code: "hi",
    name: "Hindi",
    native: "हिन्दी",
    flag: "🇮🇳",
    scripts: ["devanagari"],
    commonWords: [],
    confusion: [
      "समझ नहीं आया", "मैं नहीं समझा", "मैं नहीं समझी", "मतलब क्या", "क्या मतलब",
      "फिर से बोलिए", "दोबारा", "धीरे बोलिए", "कैसे कहते", "हिंदी में",
    ],
  },
  {
    code: "ar",
    name: "Arabic",
    native: "العربية",
    flag: "🇸🇦",
    rtl: true,
    scripts: ["arabic"],
    commonWords: [],
    confusion: [
      "لا أفهم", "ما فهمت", "ماذا تعني", "ما معنى", "أعد من فضلك", "مرة أخرى",
      "ببطء", "كيف أقول", "بالعربية",
    ],
  },
];

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code) as [string, ...string[]];

export function language(code: string): Language {
  const found = BY_CODE.get(code);
  if (!found) throw new Error(`Unknown language "${code}".`);
  return found;
}

export function isLanguage(code: unknown): code is string {
  return typeof code === "string" && BY_CODE.has(code);
}

const SCRIPT_PATTERNS: Record<Exclude<Script, "latin">, RegExp> = {
  kana: /[\u3040-\u30ff]/g,
  cjk: /[\u4e00-\u9fff]/g,
  hangul: /[\uac00-\ud7af\u1100-\u11ff]/g,
  devanagari: /[\u0900-\u097f]/g,
  arabic: /[\u0600-\u06ff]/g,
};

const LATIN = /[a-zà-öø-ÿ]/gi;

/**
 * Best guess at which of `candidates` a short line of speech is in.
 *
 * Realtime transcription does not report a language, and a learner mixing two
 * languages is exactly the case worth spotting. Non-Latin scripts identify
 * themselves; Latin-script languages are told apart by their most common
 * words. Returns null when the line is too short or too even to call.
 */
export function detectLanguage(text: string, candidates: string[]): string | null {
  const langs = candidates.filter(isLanguage).map(language);
  if (!text.trim() || !langs.length) return null;

  const counts: Record<string, number> = {};
  for (const [script, re] of Object.entries(SCRIPT_PATTERNS)) {
    counts[script] = text.match(re)?.length ?? 0;
  }
  const latinCount = text.match(LATIN)?.length ?? 0;

  // Score each candidate by the characters of its own scripts. Kanji are
  // shared with Chinese, so they count fully for Japanese only alongside kana.
  const scriptScore = (l: Language) => {
    if (l.scripts.includes("latin")) return 0;
    if (l.scripts.includes("kana")) return counts.kana * 2 + (counts.kana > 0 ? counts.cjk : counts.cjk * 0.5);
    if (l.code === "zh" && counts.kana > 0) return 0;
    return l.scripts.reduce((n, s) => n + (s === "latin" ? 0 : counts[s] ?? 0), 0);
  };
  const nonLatin = langs
    .map((l) => ({ code: l.code, score: scriptScore(l) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  if (nonLatin.length && nonLatin[0].score >= latinCount) return nonLatin[0].code;

  const words = text
    .toLowerCase()
    .replace(/[¿¡?!.,;:"“”«»()]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return nonLatin[0]?.code ?? null;

  const lowered = text.toLowerCase();
  const latin = langs
    .filter((l) => l.scripts.includes("latin"))
    .map((l) => {
      const set = new Set(l.commonWords);
      const marks = l.marks ? [...lowered].filter((ch) => l.marks!.includes(ch)).length : 0;
      return { code: l.code, score: words.filter((w) => set.has(w)).length + marks * 0.5 };
    })
    .sort((a, b) => b.score - a.score);
  const [best, second] = latin;
  if (best && best.score > 0 && best.score > (second?.score ?? 0)) return best.code;
  return nonLatin[0]?.code ?? null;
}

/** True when the learner's line contains a "help, I'm lost" phrase in any of the languages. */
export function soundsConfused(text: string, languageCodes: string[]): boolean {
  const lower = text.toLowerCase();
  return languageCodes
    .filter(isLanguage)
    .some((code) => language(code).confusion.some((p) => lower.includes(p.toLowerCase())));
}
