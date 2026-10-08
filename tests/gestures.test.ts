import { describe, expect, it } from "vitest";
import { AVATAR_PRESETS } from "@/lib/avatars";
import { gestureCatalog, planGestures, sectionGesture, speechUnits } from "@/lib/gestures";
import { buildTrainingSsml } from "@/lib/training";

const text =
  "Welcome to this session on spreadsheets and why they matter to you. Today we cover three ideas that make your work faster.\n\n" +
  "First, structure your data in tables so formulas stay readable. Second, name your ranges so a reader knows what they mean. Third, check your totals before you share.";

const sections = [
  { title: "Welcome", text },
  { title: "Middle", text },
  { title: "Close", text },
];

describe("presenter gestures", () => {
  it("only knows presenters that exist, with the style the preset uses", () => {
    for (const key of Object.keys(AVATAR_PRESETS)) {
      for (const g of gestureCatalog(key)) expect(g.id).toMatch(/^[a-z0-9-]+$/);
    }
    expect(gestureCatalog("lisa-casual").length).toBeGreaterThan(5);
    expect(gestureCatalog("head-adrian")).toEqual([]);
    expect(gestureCatalog("lisa-graceful-standing")).toEqual([]);
  });

  it("keeps the plain SSML unchanged when gestures are off", () => {
    const plain = buildTrainingSsml(sections, "Ava");
    expect(buildTrainingSsml(sections, "Ava", undefined, { presenter: "lisa-casual", mode: "off" })).toBe(plain);
    expect(plain).not.toContain("<bookmark");
  });

  it("adds only catalog gestures in auto mode, none for avatars without any", () => {
    const body = { presenter: "max-business", mode: "auto" as const };
    const ssml = buildTrainingSsml(sections, "Guy", undefined, body);
    const marks = [...ssml.matchAll(/gesture\.([a-z0-9-]+)'/g)].map((m) => m[1]);
    const known = gestureCatalog("max-business").map((g) => g.id);
    expect(marks.length).toBeGreaterThan(3);
    for (const m of marks) expect(known).toContain(m);
    expect(ssml.startsWith("<speak")).toBe(true);
    expect(buildTrainingSsml(sections, "Ava", undefined, { presenter: "head-adrian", mode: "auto" })).not.toContain(
      "<bookmark"
    );
  });

  it("opens with a greeting and closes with thanks", () => {
    const body = { presenter: "max-business", mode: "auto" as const };
    const first = planGestures(speechUnits(text), { ...body, index: 0, count: 3 });
    const last = planGestures(speechUnits(text), { ...body, index: 2, count: 3 });
    expect(first[0]).toBe("welcome");
    expect(last.at(-1)).toBe("thanks");
  });

  it("never repeats a gesture back to back", () => {
    const plan = planGestures(speechUnits(`${text}\n\n${text}\n\n${text}`), {
      presenter: "lisa-casual",
      mode: "auto",
      index: 1,
      count: 3,
    }).filter(Boolean);
    plan.forEach((g, i) => i && expect(g).not.toBe(plan[i - 1]));
  });

  it("honors a section's own pick, even with video gestures off, and a pick of none", () => {
    const picked = planGestures(speechUnits(text), {
      presenter: "lisa-casual",
      mode: "off",
      gesture: "show-front-4",
      index: 1,
      count: 3,
    });
    expect(picked[0]).toBe("show-front-4");
    expect(picked.slice(1).every((g) => g === null)).toBe(true);
    const none = planGestures(speechUnits(text), {
      presenter: "lisa-casual",
      mode: "auto",
      gesture: "none",
      index: 1,
      count: 3,
    });
    expect(none.every((g) => g === null)).toBe(true);
  });

  it("drops a pick the presenter does not have", () => {
    expect(sectionGesture("lisa-casual", "wave-left-1")).toBeUndefined();
    expect(sectionGesture("lisa-casual", "none")).toBe("none");
    expect(sectionGesture("lisa-casual", "show-front-2")).toBe("show-front-2");
  });

  it("gives a section the same gestures alone as inside the whole video", () => {
    const body = { presenter: "meg-casual", mode: "auto" as const };
    const whole = buildTrainingSsml(sections, "Ava", undefined, body);
    const alone = buildTrainingSsml([sections[1]], "Ava", undefined, { ...body, index: 1, count: 3 });
    const inner = alone.replace(/^.*?<voice[^>]*>/, "").replace(/<\/voice>.*$/, "");
    expect(whole).toContain(inner);
  });
});
