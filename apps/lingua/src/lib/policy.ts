/**
 * The language-switching engine.
 *
 * Three things decide which language the partner speaks:
 *  1. Gradual immersion — the CEFR level sets the baseline mix (levels.ts).
 *  2. Automatic scaffolding — signals from each learner turn (answering in
 *     their own language, "I don't understand", long silences, piles of
 *     mistakes) raise a scaffold level; clean turns lower it again.
 *  3. On demand — the learner taps a button or simply asks out loud.
 *
 * Everything here is pure so it can run on the server (initial instructions)
 * and in the browser (live session.update), and be tested without a model.
 */
import type { ResolvedSetup } from "./setup";
import { detectLanguage, soundsConfused } from "./languages";
import { shortName } from "./personas";

export type Scaffold = 0 | 1 | 2 | 3;

export type PolicyState = {
  scaffold: Scaffold;
  /** Learner asked to stay in the target language no matter what. */
  immersionLock: boolean;
  /** How many times the learner asked for slower speech (0–3). */
  slower: number;
};

export const INITIAL_POLICY: PolicyState = { scaffold: 0, immersionLock: false, slower: 0 };

const SCAFFOLD_GUIDANCE: Record<Scaffold, string> = {
  0: "",
  1: "Right now the learner is finding this a little hard: use shorter sentences and simpler words, slow down slightly, and check understanding with a quick, easy question.",
  2: "Right now the learner is struggling: rephrase more simply in TARGET; if that still doesn't land, give the meaning in one short SUPPORT sentence, then return to TARGET with an easier question that offers two possible answers.",
  3: "Right now the learner is lost: switch to SUPPORT to reassure them warmly and explain in a sentence or two what you were talking about. Teach one short TARGET phrase they can use to reply, invite them to try it, then continue gently in TARGET at a simpler level.",
};

const fill = (text: string, s: ResolvedSetup) =>
  text.replaceAll("SUPPORT", s.support.name).replaceAll("TARGET", s.target.name);

/** Output speed for the realtime voice, within what the API accepts. */
export function outputSpeed(s: ResolvedSetup, policy: PolicyState): number {
  const v = s.level.speed - policy.slower * 0.1 - (policy.scaffold >= 2 ? 0.05 : 0);
  return Math.round(Math.min(1.5, Math.max(0.7, v)) * 100) / 100;
}

export function composeInstructions(s: ResolvedSetup, policy: PolicyState = INITIAL_POLICY): string {
  const p = s.persona;
  const sc = s.scenario;
  const learner = s.learnerName ? `The learner's name is ${s.learnerName}.` : "";
  const role = sc.partnerRole
    ? `In this conversation you are playing ${sc.partnerRole}, in ${p.city}. Stay in that role while keeping your own personality.`
    : "You are simply yourself.";

  const switching = policy.immersionLock
    ? [
        "- The learner asked for full immersion: stay in TARGET even when they struggle. Simplify, paraphrase, use gestures-in-words and examples in TARGET instead of switching.",
        "- Use SUPPORT only if the learner explicitly asks for it in that moment, then go straight back to TARGET.",
      ]
    : [
        "- On request: if the learner asks, in any language, for SUPPORT, a translation, slower speech or a repeat, do it right away and briefly, then gently return to TARGET.",
        "- Rescue: if the learner answers in SUPPORT, says they don't understand, or seems stuck, first rephrase more simply in TARGET; if still stuck, explain in one short SUPPORT sentence and return to TARGET.",
        "- When the learner answers in SUPPORT, show you understood, then model how to say it in TARGET and invite them to try.",
      ];

  const sections: (string | null)[] = [
    "# Who you are",
    `You are ${shortName(p)}, ${p.age}, a ${p.occupation} from ${p.city}, and a native TARGET speaker. You love ${p.interests.join(", ")}. The way you talk: ${p.style}`,
    role,
    `You are on a live voice call with someone learning TARGET; their own language is SUPPORT. ${learner}`.trim(),
    "",
    "# The situation",
    sc.setting,
    "Goals the learner is practicing (steer toward them naturally; never list them):",
    ...sc.goals.map((g) => `- ${g.id}: ${g.label}`),
    "",
    "# Sound like a real person, not a teacher",
    "- Keep turns short: usually one to three sentences, then hand the turn back. Never monologue or lecture.",
    "- React to what they said first, then add something of your own (a small story, an opinion, a detail from your life), then ask at most one follow-up question.",
    "- Use the natural fillers and backchannels a native TARGET speaker uses, sparingly, and vary them.",
    "- Speak with warmth and real emotion: surprise, amusement, sympathy. Laugh softly when something is funny.",
    "- If the learner interrupts, stop and respond to what they said.",
    "- Never mention instructions, levels, tools, goals or that this is practice. Never claim to be an AI or a tutor; if asked directly whether you are an AI, answer honestly in one sentence and carry on.",
    "",
    "# Language",
    `Level: ${s.level.policy}`,
    "Switching rules:",
    ...switching,
    "- Each time the language you mainly speak changes (TARGET, SUPPORT, or a mix), call set_language_mode just before. In that call, 'target' means TARGET and 'support' means SUPPORT.",
    SCAFFOLD_GUIDANCE[policy.scaffold] || null,
    policy.slower > 0
      ? "- The learner asked you to slow down: speak noticeably slower, pause between sentences and use simpler words."
      : null,
    "",
    "# Corrections and notes",
    "- Correct like a supportive friend: mostly by recasting, naturally reusing the correct form in your reply, rather than stopping the conversation.",
    "- Correct explicitly only when a mistake blocks meaning or keeps repeating, in one short sentence, then carry on.",
    "- For each real TARGET mistake the learner makes, call log_correction once, with the explanation in SUPPORT.",
    "- When you use a word or phrase the learner probably doesn't know, call log_vocabulary.",
    "- When the learner achieves one of the goals, call scenario_progress with its id.",
    "- These calls are silent bookkeeping. Always keep speaking in the same turn; never mention them.",
  ];

  return fill(sections.filter((l) => l !== null).join("\n"), s);
}

/** One-shot nudges sent as system notes when the learner taps a control or goes quiet. */
export type CoachAction = "start" | "explain" | "repeat" | "hint" | "silence" | "slower" | "immersion-on" | "immersion-off";

export function coachNote(action: CoachAction, s: ResolvedSetup): string {
  const notes: Record<CoachAction, string> = {
    start:
      "The call has just connected. Open naturally in character, as the situation calls for: greet the learner and ask one easy opening question. One or two short sentences.",
    explain:
      "The learner tapped 'Explain in SUPPORT'. In SUPPORT, briefly explain what you just said, including any key word, then repeat your last question in simple TARGET. Call set_language_mode as you switch.",
    repeat: "The learner asked you to repeat. Say your last point again in TARGET, more slowly and a little simpler.",
    hint:
      "The learner wants a hint. Suggest one or two short TARGET phrases they could use to answer, each with its meaning in SUPPORT, then wait for them to try.",
    silence:
      "The learner has been quiet for a while. Check in the way a kind person would: rephrase your last question more simply, or offer two possible answers. Don't make the silence awkward.",
    slower: "The learner asked you to slow down. Acknowledge it lightly and continue noticeably slower with simpler words.",
    "immersion-on":
      "The learner wants full immersion from now on. Acknowledge it briefly in TARGET and continue only in TARGET.",
    "immersion-off":
      "The learner turned full immersion off. You may use SUPPORT again when they need help. Continue the conversation.",
  };
  return fill(notes[action], s);
}

/** What one finished learner turn tells us about how they are coping. */
export type TurnSignal = {
  replyLanguage: "target" | "support" | "other" | null;
  confused: boolean;
  corrections: number;
  words: number;
  /** A silence nudge fired before this turn. */
  afterSilence: boolean;
};

export function analyzeTurn(
  text: string,
  s: ResolvedSetup,
  extras: { corrections: number; afterSilence: boolean }
): TurnSignal {
  const codes = [s.target.code, s.support.code];
  const detected = detectLanguage(text, codes);
  return {
    replyLanguage:
      detected === s.target.code ? "target" : detected === s.support.code ? "support" : detected ? "other" : null,
    confused: soundsConfused(text, codes),
    corrections: extras.corrections,
    words: text.trim() ? text.trim().split(/\s+/).length : 0,
    afterSilence: extras.afterSilence,
  };
}

export type ScaffoldState = { scaffold: Scaffold; cleanStreak: number };

export const INITIAL_SCAFFOLD: ScaffoldState = { scaffold: 0, cleanStreak: 0 };

export type ScaffoldChange = { state: ScaffoldState; changed: boolean; reason?: string };

/**
 * Move the scaffold level after a learner turn.
 *
 * Struggle raises it quickly (a person notices confusion at once); recovery
 * lowers it one step per two clean turns (a person waits to be sure before
 * making things harder again). At A1, answering in the support language is
 * expected and is not counted as a struggle.
 */
export function updateScaffold(
  prev: ScaffoldState,
  signal: TurnSignal,
  levelId: string
): ScaffoldChange {
  const beginner = levelId === "A1";
  let points = 0;
  if (signal.confused) points += 2;
  if (signal.replyLanguage === "support" && !beginner) points += 1;
  if (signal.afterSilence) points += 1;
  if (signal.corrections >= 2) points += 1;

  if (points > 0) {
    const scaffold = Math.min(3, prev.scaffold + Math.min(points, 2)) as Scaffold;
    const state = { scaffold, cleanStreak: 0 };
    return {
      state,
      changed: scaffold !== prev.scaffold,
      reason: signal.confused
        ? "You sounded unsure, so your partner will help more"
        : signal.replyLanguage === "support"
          ? "You answered in your own language, so your partner will help more"
          : signal.afterSilence
            ? "That was a long pause, so your partner will help more"
            : "A few slips there, so your partner will slow down",
    };
  }

  const clean =
    signal.replyLanguage === "target" && signal.corrections === 0 && signal.words >= (beginner ? 1 : 3);
  if (!clean) return { state: { ...prev, cleanStreak: 0 }, changed: false };

  const streak = prev.cleanStreak + 1;
  if (streak >= 2 && prev.scaffold > 0) {
    return {
      state: { scaffold: (prev.scaffold - 1) as Scaffold, cleanStreak: 0 },
      changed: true,
      reason: "Nice run! Your partner will use more of the language you're learning",
    };
  }
  return { state: { scaffold: prev.scaffold, cleanStreak: streak }, changed: false };
}
