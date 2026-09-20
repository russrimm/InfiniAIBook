/**
 * Provider readiness check.
 *
 * Answers "will OpenNotebook work against this model server?" on whatever
 * machine it runs on, which matters most when moving to local inference:
 * capabilities vary by runtime and by model in ways that only show up in use.
 *
 *   npm run check:ai               connectivity, chat, streaming, JSON, embeddings
 *   npm run check:ai -- --studio   also generate every Studio format
 *   npm run check:ai -- --styles   also generate every infographic style
 *   npm run check:ai -- --image    also render a test image
 *
 * It imports the application's own modules, so it exercises the same config
 * resolution and request shapes the app uses, rather than a parallel copy that
 * can drift out of step.
 *
 * Environment comes from --env-file in the npm script, not a call in this file:
 * ES imports are hoisted, so ai.ts would otherwise read its configuration
 * before any in-file loader had run and silently fall back to defaults.
 */
import {
  chatModel,
  embedModel,
  PROVIDER,
  chatJSON,
  chatStream,
  chatText,
  describeAuthError,
  embed,
  generateImage,
  imageModel,
} from "../src/lib/ai";
import { GROUNDING_RULES, STUDIO, STUDIO_ORDER } from "../src/lib/studio";
import { INFOGRAPHIC_STYLES, STYLE_ORDER } from "../src/lib/infographic";
import type { ArtifactType } from "../src/lib/types";

const args = process.argv.slice(2);
const runStudio = args.includes("--studio") || args.includes("--styles");
const runStyles = args.includes("--styles");
const runImage = args.includes("--image");

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

let failures = 0;
let warnings = 0;

const ok = (label: string, detail = "") =>
  console.log(`  ${GREEN}PASS${RESET}  ${label.padEnd(24)} ${DIM}${detail}${RESET}`);
const warn = (label: string, detail = "") => {
  warnings++;
  console.log(`  ${YELLOW}WARN${RESET}  ${label.padEnd(24)} ${detail}`);
};
const fail = (label: string, detail = "") => {
  failures++;
  console.log(`  ${RED}FAIL${RESET}  ${label.padEnd(24)} ${detail}`);
};

const ms = (t: number) => `${((Date.now() - t) / 1000).toFixed(1)}s`;
const reason = (e: unknown) =>
  describeAuthError(e) ?? (e instanceof Error ? e.message : String(e)).slice(0, 170);

/** Real material, so Studio prompts have something to actually work on. */
const SAMPLE = `Photosynthesis converts light energy into chemical energy stored in carbohydrates.
It occurs in the chloroplasts of plant cells, and fixes an estimated 100 billion tonnes of carbon each year.

The light-dependent reactions take place in the thylakoid membranes. They produce ATP and NADPH,
and split water, releasing oxygen as a by-product. Typical efficiency is 3 to 6 percent of incident light.

The Calvin cycle occurs in the stroma. It fixes carbon dioxide into three-carbon sugars using the
enzyme RuBisCO, consuming six molecules of carbon dioxide per glucose molecule produced.

C4 and CAM pathways are variants that concentrate carbon dioxide to reduce photorespiration.
Roughly 16,000 plant species use CAM photosynthesis.`;

const context = `SOURCE EXCERPTS\n===============\n[1] (source: "Photosynthesis primer", part 1)\n${SAMPLE}`;

async function main() {
  console.log(`\n${DIM}OpenNotebook — provider check${RESET}\n`);
  console.log(`  provider   ${PROVIDER}`);
  console.log(
    `  endpoint   ${
      PROVIDER === "openai"
        ? process.env.AI_BASE_URL
        : (process.env.AZURE_OPENAI_ENDPOINT ?? "(unset)")
    }`
  );
  console.log(`  chat       ${chatModel()}`);
  console.log(`  embedding  ${embedModel()}`);
  console.log(`  image      ${imageModel()}${runImage ? "" : `${DIM} (add --image to test)${RESET}`}\n`);

  console.log(`${DIM}core${RESET}`);

  // Chat also proves connectivity and credentials, so nothing else is
  // meaningful if it fails.
  let t = Date.now();
  try {
    const reply = await chatText([{ role: "user", content: "Reply with exactly: OK" }], 0.1);
    if (reply.trim()) ok("chat", `${ms(t)} — "${reply.slice(0, 24)}"`);
    else fail("chat", "empty reply");
  } catch (e) {
    fail("chat", reason(e));
    console.log(`\n${RED}Cannot reach the model. Remaining checks skipped.${RESET}\n`);
    process.exit(1);
  }

  t = Date.now();
  try {
    const stream = await chatStream(
      [{ role: "user", content: "Count to five, words only." }],
      0.2
    );
    let deltas = 0;
    for await (const part of stream) {
      if (part.choices?.[0]?.delta?.content) deltas++;
    }
    if (deltas > 1) ok("streaming", `${ms(t)} — ${deltas} deltas`);
    else warn("streaming", `only ${deltas} delta(s); answers will appear all at once`);
  } catch (e) {
    fail("streaming", reason(e));
  }

  // Every Studio format depends on structured output.
  t = Date.now();
  try {
    const out = await chatJSON<{ title?: unknown; items?: unknown }>(
      [
        {
          role: "system",
          content:
            'Respond with a single JSON object only: {"title": string, "items": [string]}. Two items about photosynthesis.',
        },
        { role: "user", content: "go" },
      ],
      0.3
    );
    if (typeof out.title === "string" && Array.isArray(out.items)) {
      ok("json mode", `${ms(t)} — parsed, ${(out.items as unknown[]).length} items`);
    } else {
      warn("json mode", "returned JSON but not the requested shape");
    }
  } catch (e) {
    fail("json mode", reason(e));
  }

  // Without embeddings, retrieval falls back to keyword matching.
  t = Date.now();
  let dims = 0;
  try {
    const [vec] = await embed(["photosynthesis converts light into chemical energy"]);
    dims = vec?.length ?? 0;
    if (dims > 0) ok("embeddings", `${ms(t)} — ${dims} dims`);
    else fail("embeddings", "empty vector");
  } catch (e) {
    fail("embeddings", reason(e));
  }

  if (dims > 0) await checkStoredDimensions(dims);

  // Image generation sits on its own deployment and api-version, so a working
  // chat model says nothing about whether the image style will run.
  if (runImage) {
    t = Date.now();
    try {
      const { png, model } = await generateImage(
        'A simple flat vector icon of a blue book on an off-white background. Letter the single word "SOURCES" beneath it.',
        { size: "1024x1024", quality: "medium" }
      );
      const isPng = png.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
      if (isPng && png.length > 1024) {
        ok("image", `${ms(t)} — ${model}, ${(png.length / 1024).toFixed(0)} KB`);
      } else {
        fail("image", "response was not a usable PNG");
      }
    } catch (e) {
      fail("image", reason(e));
    }
  }

  if (runStudio) await checkStudio();
  if (runStyles) await checkStyles();

  console.log("");
  if (failures) {
    console.log(
      `${RED}${failures} check(s) failed${RESET}${warnings ? `, ${warnings} warning(s)` : ""}\n`
    );
    process.exit(1);
  }
  console.log(
    `${GREEN}All checks passed${RESET}${warnings ? `${YELLOW} with ${warnings} warning(s)${RESET}` : ""}\n`
  );
}

/** Live embedding size against what is already stored, to catch a silent mismatch. */
async function checkStoredDimensions(dims: number) {
  try {
    const { db } = await import("../src/lib/db");
    const rows = db
      .prepare(
        `SELECT embed_model AS model, embed_dims AS dims, COUNT(*) AS n
           FROM chunks WHERE embedding IS NOT NULL
          GROUP BY embed_model, embed_dims`
      )
      .all() as unknown as { model: string | null; dims: number | null; n: number }[];

    if (!rows.length) {
      ok("stored embeddings", "none yet");
      return;
    }
    const mismatched = rows.filter((r) => r.dims !== dims);
    if (!mismatched.length) {
      ok("stored embeddings", `${rows.reduce((s, r) => s + r.n, 0)} chunks, all ${dims} dims`);
      return;
    }
    const detail = mismatched
      .map((r) => `${r.n} chunk(s) @ ${r.dims} dims from ${r.model ?? "unknown"}`)
      .join("; ");
    warn(
      "stored embeddings",
      `${detail} — keyword-only until re-embedded (POST /api/notebooks/<id>/reembed)`
    );
  } catch (e) {
    warn("stored embeddings", `could not read database: ${reason(e)}`);
  }
}

/** Shape checks mirroring what each renderer needs in order to draw anything. */
const SHAPE: Record<string, (c: Record<string, unknown>) => string | null> = {
  report: (c) =>
    typeof c.markdown === "string" && c.markdown.length > 200 ? null : "short or missing markdown",
  briefing: (c) =>
    typeof c.markdown === "string" && c.markdown.length > 100 ? null : "short or missing markdown",
  study_guide: (c) =>
    typeof c.markdown === "string" && c.markdown.length > 200 ? null : "short or missing markdown",
  faq: (c) => (Array.isArray(c.items) && c.items.length >= 3 ? null : "fewer than 3 items"),
  quiz: (c) => {
    const q = c.questions;
    if (!Array.isArray(q) || q.length < 3) return "fewer than 3 questions";
    const bad = q.filter((x) => {
      const o = x as Record<string, unknown>;
      return (
        !Array.isArray(o.choices) ||
        (o.choices as unknown[]).length < 2 ||
        typeof o.question !== "string"
      );
    });
    return bad.length ? `${bad.length} malformed question(s)` : null;
  },
  mindmap: (c) => {
    const root = c.root as Record<string, unknown> | undefined;
    const kids = root?.children;
    return Array.isArray(kids) && kids.length >= 2 ? null : "root has fewer than 2 branches";
  },
  timeline: (c) => (Array.isArray(c.items) && c.items.length >= 3 ? null : "fewer than 3 items"),
  infographic: (c) => {
    const s = c.sections;
    const hasBody = (Array.isArray(s) && s.length > 0) || c.compare || c.checklist || c.chart;
    return hasBody ? null : "no sections, compare, checklist or chart";
  },
};

function generateOnce(type: ArtifactType, styleHint = "") {
  const spec = STUDIO[type];
  return chatJSON<Record<string, unknown>>(
    [
      { role: "system", content: `${GROUNDING_RULES}\n\n${spec.instruction("")}${styleHint}` },
      { role: "user", content: context },
    ],
    0.5
  );
}

async function checkStudio() {
  console.log(`\n${DIM}studio formats${RESET}`);
  for (const type of STUDIO_ORDER) {
    const t = Date.now();
    try {
      const out = await generateOnce(type);
      const problem = SHAPE[type]?.(out) ?? null;
      if (problem) warn(STUDIO[type].label, `${ms(t)} — ${problem}`);
      else ok(STUDIO[type].label, ms(t));
    } catch (e) {
      fail(STUDIO[type].label, `${ms(t)} — ${reason(e)}`);
    }
  }
}

async function checkStyles() {
  console.log(`\n${DIM}infographic styles${RESET}`);
  for (const key of STYLE_ORDER) {
    const def = INFOGRAPHIC_STYLES[key];
    const hint = def.hint ? `\n\nSTYLE: ${def.label}\n${def.hint}` : "";
    const t = Date.now();
    try {
      const out = await generateOnce("infographic", hint);
      const problem = SHAPE.infographic(out);
      if (problem) warn(def.label, `${ms(t)} — ${problem}`);
      else ok(def.label, ms(t));
    } catch (e) {
      fail(def.label, `${ms(t)} — ${reason(e)}`);
    }
  }
}

main().catch((e) => {
  console.error(`\n${RED}check failed${RESET}`, e);
  process.exit(1);
});
