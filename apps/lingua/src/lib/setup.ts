import { z } from "zod";
import { LANGUAGE_CODES, language, type Language } from "./languages";
import { LEVEL_IDS, level, type Level } from "./levels";
import { resolvePersona, type Persona } from "./personas";
import { resolveScenario, type Scenario } from "./scenarios";

/** What the learner picks before a call. Validated on every server route that takes it. */
export const SetupSchema = z
  .object({
    target: z.enum(LANGUAGE_CODES),
    support: z.enum(LANGUAGE_CODES),
    level: z.enum(LEVEL_IDS),
    scenario: z.string().max(40).default("free"),
    persona: z.string().max(40).optional(),
    learnerName: z
      .string()
      .trim()
      .max(40)
      .regex(/^[\p{L}\p{M}' .-]*$/u, "Use letters only for your name.")
      .optional(),
  })
  .refine((s) => s.target !== s.support, {
    message: "Pick a language to learn that differs from the one you already speak.",
    path: ["support"],
  });

export type Setup = z.infer<typeof SetupSchema>;

export type ResolvedSetup = {
  target: Language;
  support: Language;
  level: Level;
  scenario: Scenario;
  persona: Persona;
  learnerName?: string;
};

export function resolveSetup(setup: Setup): ResolvedSetup {
  return {
    target: language(setup.target),
    support: language(setup.support),
    level: level(setup.level),
    scenario: resolveScenario(setup.scenario),
    persona: resolvePersona(setup.target, setup.persona),
    learnerName: setup.learnerName || undefined,
  };
}

/** Serialize a setup into URL search params for the conversation page. */
export function setupToParams(setup: Setup): URLSearchParams {
  const p = new URLSearchParams({
    target: setup.target,
    support: setup.support,
    level: setup.level,
    scenario: setup.scenario,
  });
  if (setup.persona) p.set("persona", setup.persona);
  if (setup.learnerName) p.set("name", setup.learnerName);
  return p;
}

export function setupFromParams(p: URLSearchParams): Setup | null {
  const parsed = SetupSchema.safeParse({
    target: p.get("target"),
    support: p.get("support"),
    level: p.get("level"),
    scenario: p.get("scenario") ?? "free",
    persona: p.get("persona") ?? undefined,
    learnerName: p.get("name") ?? undefined,
  });
  return parsed.success ? parsed.data : null;
}
