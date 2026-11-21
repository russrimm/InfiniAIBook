import { db, transaction } from "./db";

/**
 * A daily ceiling on estimated model, speech and image spend.
 *
 * Prices are rough on purpose: providers do not share one rate card, and a
 * ceiling that is slightly high still stops a runaway loop. Amounts are US
 * cents. `DAILY_BUDGET_USD=0` turns the ceiling off. When the variable is
 * unset, cloud configurations default to $25 and local endpoints (Ollama,
 * llama.cpp, LM Studio, any http:// or loopback base URL) are unlimited.
 */
export class BudgetExceededError extends Error {
  readonly code = "budget";
  constructor(message: string) {
    super(message);
    this.name = "BudgetExceededError";
  }
}

const LOCAL_PROVIDERS = new Set(["ollama", "lmstudio", "llamacpp"]);

/** Whether this process is pointed at a service that bills by the call. */
export function cloudSpendLikely(): boolean {
  // Speech and avatar calls are billed however local the chat model is.
  if (
    process.env.AZURE_SPEECH_REGION?.trim() ||
    process.env.AZURE_SPEECH_RESOURCE_ID?.trim() ||
    process.env.AZURE_SPEECH_ENDPOINT?.trim() ||
    process.env.AZURE_SPEECH_KEY?.trim()
  ) {
    return true;
  }
  const provider = process.env.AI_PROVIDER?.trim().toLowerCase() ?? "";
  // A video model is billed per second however local the chat model is.
  if (
    process.env.AZURE_OPENAI_VIDEO_DEPLOYMENT?.trim() ||
    process.env.AI_VIDEO_PROVIDER?.trim() ||
    process.env.AI_VIDEO_MODEL?.trim()
  ) {
    return true;
  }
  if (LOCAL_PROVIDERS.has(provider)) return false;
  const base = process.env.AI_BASE_URL?.trim() ?? "";
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?/i.test(base)) return false;
  if (/^http:\/\//i.test(base)) return false;
  return Boolean(
    process.env.AZURE_OPENAI_ENDPOINT?.trim() ||
      process.env.OPENAI_API_KEY?.trim() ||
      base.startsWith("https://")
  );
}

/**
 * Daily ceiling in cents, or null when the ceiling is off. Only an explicit 0
 * turns it off. A value that is not a number (a typo such as "25 USD") must not
 * do the same, or a mistake would silently remove the protection; it falls back
 * to the default and says so once. A leading "$" is accepted.
 */
export function dailyBudgetCents(): number | null {
  const raw = process.env.DAILY_BUDGET_USD?.trim();
  if (raw) {
    const n = Number(raw.replace(/^\$/, ""));
    if (Number.isFinite(n) && n >= 0) return n === 0 ? null : Math.round(n * 100);
    if (!warnedBudget) {
      warnedBudget = true;
      console.warn(
        `[budget] DAILY_BUDGET_USD="${raw.slice(0, 40)}" is not a number of dollars, so the default ceiling applies. Use a number such as 25, or 0 to turn the ceiling off.`
      );
    }
  }
  return cloudSpendLikely() ? 2500 : null;
}

let warnedBudget = false;

export function budgetDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * Prices, in US cents, that the budget charges and that cost estimates quote.
 * They are deliberately rough (see the note at the top of this file) and can
 * be changed per deployment with the PRICE_* variables in .env.example.
 *
 * - studioCall: one Studio or chat-model call that writes a script or document
 * - image: one generated picture
 * - speechPer1kChars: text-to-speech, per 1,000 characters (each call counts at least 4)
 * - avatarPer150Words: avatar video, per 150 spoken words (about a minute; each render counts at least 25)
 */
export type Rates = { studioCall: number; image: number; speechPer1kChars: number; avatarPer150Words: number };

export const DEFAULT_RATES: Rates = { studioCall: 8, image: 12, speechPer1kChars: 3, avatarPer150Words: 40 };

const rate = (raw: string | undefined, fallback: number): number => {
  const n = Number(raw?.trim());
  return raw?.trim() && Number.isFinite(n) && n >= 0 ? n : fallback;
};

export function rates(env: Record<string, string | undefined> = process.env): Rates {
  return {
    studioCall: rate(env.PRICE_STUDIO_CALL_CENTS, DEFAULT_RATES.studioCall),
    image: rate(env.PRICE_IMAGE_CENTS, DEFAULT_RATES.image),
    speechPer1kChars: rate(env.PRICE_SPEECH_PER_1K_CHARS_CENTS, DEFAULT_RATES.speechPer1kChars),
    avatarPer150Words: rate(env.PRICE_AVATAR_PER_150_WORDS_CENTS, DEFAULT_RATES.avatarPer150Words),
  };
}

/** Cents for one text-to-speech call of this many characters (SSML markup included). */
export function speechCents(chars: number, r: Rates = rates()): number {
  return Math.max(4, Math.ceil(chars / 1000) * r.speechPer1kChars);
}

/** Cents for one avatar render that speaks this many words. */
export function avatarCents(words: number, r: Rates = rates()): number {
  return Math.max(25, Math.ceil((words / 150) * r.avatarPer150Words));
}
let ready = false;

function ensure() {
  if (ready) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS spend (
      id INTEGER PRIMARY KEY,
      day TEXT NOT NULL,
      kind TEXT NOT NULL,
      cents INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_spend_day ON spend(day);
  `);
  ready = true;
}

export function spentTodayCents(now = Date.now()): number {
  ensure();
  const row = db
    .prepare("SELECT COALESCE(SUM(cents), 0) AS cents FROM spend WHERE day = ?")
    .get(budgetDay(now)) as unknown as { cents: number };
  return row.cents;
}

/**
 * Count `cents` against today before the provider is called. Parallel requests
 * share one transaction, so they cannot all slip under the ceiling together.
 * A failed call is still counted: refunding it would let a retry loop spend
 * without bound.
 */
export function reserve(kind: string, cents: number, now = Date.now()): void {
  const cap = dailyBudgetCents();
  if (cap === null || cents <= 0) return;
  ensure();
  const day = budgetDay(now);
  transaction(() => {
    const row = db
      .prepare("SELECT COALESCE(SUM(cents), 0) AS cents FROM spend WHERE day = ?")
      .get(day) as unknown as { cents: number };
    if (row.cents + cents > cap) {
      const left = Math.max(0, cap - row.cents);
      throw new BudgetExceededError(
        `Daily model budget reached ($${(row.cents / 100).toFixed(2)} of $${(cap / 100).toFixed(2)}; $${(left / 100).toFixed(2)} left). Raise DAILY_BUDGET_USD, or set it to 0 to turn the ceiling off.`
      );
    }
    db.prepare("INSERT INTO spend (day, kind, cents, created_at) VALUES (?, ?, ?, ?)").run(
      day,
      kind.slice(0, 40),
      cents,
      now
    );
  });
}

/**
 * Refuse a job up front when it could not fit under today's ceiling, without
 * recording any spend. Long, costly jobs (video clips) check this before they
 * start, then `reserve` each piece as it is submitted so a cancelled job is
 * never charged for pieces it never made.
 */
export function assertCanAfford(cents: number, now = Date.now()): void {
  const cap = dailyBudgetCents();
  if (cap === null || cents <= 0) return;
  const spent = spentTodayCents(now);
  if (spent + cents > cap) {
    const left = Math.max(0, cap - spent);
    throw new BudgetExceededError(
      `This would cost about $${(cents / 100).toFixed(2)}, but only $${(left / 100).toFixed(2)} is left of today's $${(cap / 100).toFixed(2)} budget. Raise DAILY_BUDGET_USD, or set it to 0 to turn the ceiling off.`
    );
  }
}

export function budgetStatus(now = Date.now()) {
  const cap = dailyBudgetCents();
  const spent = cap === null ? 0 : spentTodayCents(now);
  return {
    enabled: cap !== null,
    capCents: cap,
    spentCents: spent,
    remainingCents: cap === null ? null : Math.max(0, cap - spent),
  };
}
