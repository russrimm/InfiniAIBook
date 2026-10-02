/**
 * Turns whatever the model returned for an infographic into the stored shape.
 *
 * Model output is untrusted in form as well as content: fields go missing,
 * arrive as the wrong type, or run long enough to wreck a layout. Everything
 * here is coerced, trimmed to the counts the renderer is built for, and
 * dropped when it cannot be shown properly.
 */

import type { InfographicContent } from "./types";

type Loose = Record<string, unknown>;

const ACCENTS = ["indigo", "emerald", "amber", "rose", "sky", "violet"];

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Loose =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Loose) : {};

/**
 * The header sits on a themed, often accent-colored band, where a citation
 * pill is either invisible or stray text depending on the style. Headings
 * frame the piece; the claims they preview are cited again in the body.
 */
export const stripMarkers = (s: string) => s.replace(/\s*\[\d+\](?:\[\d+\])*/g, "").trim();

const list = (v: unknown, max: number) =>
  arr(v)
    .map((x) => str(x).trim())
    .filter(Boolean)
    .slice(0, max);

function compact<T>(items: (T | null)[]): T[] {
  return items.filter((x): x is T => x !== null);
}

export function normalizeInfographic(input: unknown): InfographicContent {
  const raw = obj(input);
  const accent = ACCENTS.includes(str(raw.accent)) ? str(raw.accent) : "indigo";

  const stats = compact(
    arr(raw.stats).map((s) => {
      const o = obj(s);
      return str(o.value)
        ? { value: str(o.value), label: str(o.label), caption: str(o.caption) }
        : null;
    })
  ).slice(0, 4);

  const sections = compact(
    arr(raw.sections).map((s) => {
      const o = obj(s);
      const bullets = list(o.bullets, 8);
      return str(o.heading) && bullets.length
        ? { heading: str(o.heading), icon: str(o.icon, "•"), bullets }
        : null;
    })
  ).slice(0, 8);

  const chart = compact(
    arr(raw.chart).map((c) => {
      const o = obj(c);
      const value = Number(o.value);
      if (!str(o.label) || !Number.isFinite(value) || value < 0) return null;
      // A sentence here wrecks the bar layout, so keep only a compact figure.
      const display = str(o.display).trim();
      return {
        label: str(o.label).slice(0, 32),
        value,
        display: display && display.length <= 12 ? display : undefined,
      };
    })
  ).slice(0, 6);

  const rawCompare = obj(raw.compare);
  const rows = compact(
    arr(rawCompare.rows).map((r) => {
      const o = obj(r);
      return str(o.feature) ? { feature: str(o.feature), a: str(o.a), b: str(o.b) } : null;
    })
  ).slice(0, 6);
  const compare =
    rows.length && str(rawCompare.aLabel) && str(rawCompare.bLabel)
      ? {
          aLabel: str(rawCompare.aLabel),
          bLabel: str(rawCompare.bLabel),
          rows,
          verdict: str(rawCompare.verdict) || undefined,
        }
      : undefined;

  const checklist = compact(
    arr(raw.checklist).map((c) => {
      const o = obj(c);
      return str(o.title) ? { title: str(o.title), detail: str(o.detail) } : null;
    })
  ).slice(0, 10);

  const regions = compact(
    arr(raw.regions).map((r) => {
      const o = obj(r);
      const concepts = compact(
        arr(o.concepts).map((c) => {
          const k = obj(c);
          if (!str(k.takeaway)) return null;
          const value = str(k.value).trim();
          return {
            takeaway: str(k.takeaway),
            detail: str(k.detail),
            metaphor: str(k.metaphor, "lightbulb"),
            // Rendered oversized, so a long string would dominate the card.
            value: value && value.length <= 10 ? value : undefined,
          };
        })
      ).slice(0, 6);
      return str(o.heading) && concepts.length ? { heading: str(o.heading), concepts } : null;
    })
  ).slice(0, 3);

  // Visual-guide fields: the central hub, a graded scale, and an N-way matrix.
  const rawHub = obj(raw.hub);
  const hub = str(rawHub.label)
    ? { label: stripMarkers(str(rawHub.label)), caption: str(rawHub.caption) }
    : undefined;

  const scale = compact(
    arr(raw.scale).map((s) => {
      const o = obj(s);
      return str(o.tier)
        ? { tier: str(o.tier), example: str(o.example), figure: str(o.figure) }
        : null;
    })
  ).slice(0, 4);

  const rawMatrix = obj(raw.matrix);
  const columns = list(rawMatrix.columns, 4);
  const matrixRows = compact(
    arr(rawMatrix.rows).map((r) => {
      const o = obj(r);
      const values = arr(o.values).map((v) => str(v));
      return str(o.feature)
        ? { feature: str(o.feature), values: columns.map((_, i) => values[i] ?? "") }
        : null;
    })
  ).slice(0, 6);
  const matrix =
    columns.length >= 2 && matrixRows.length ? { columns, rows: matrixRows } : undefined;

  const milestones = compact(
    arr(raw.milestones).map((m) => {
      const o = obj(m);
      const title = str(o.title).trim();
      if (!title) return null;
      // A date is a label on the rail; a sentence there breaks the layout.
      const date = str(o.date).trim();
      return { date: date.length <= 24 ? date : date.slice(0, 24), title, detail: str(o.detail) };
    })
  ).slice(0, 8);

  const levels = compact(
    arr(raw.levels).map((l) => {
      const o = obj(l);
      const label = str(o.label).trim();
      if (!label) return null;
      const value = str(o.value).trim();
      return {
        label,
        detail: str(o.detail),
        value: value && value.length <= 12 ? value : undefined,
      };
    })
  ).slice(0, 6);

  const myths = compact(
    arr(raw.myths).map((m) => {
      const o = obj(m);
      const myth = str(o.myth).trim();
      const fact = str(o.fact).trim();
      return myth && fact ? { myth, fact } : null;
    })
  ).slice(0, 6);

  const terms = compact(
    arr(raw.terms).map((t) => {
      const o = obj(t);
      const term = str(o.term).trim();
      const definition = str(o.definition).trim();
      return term && definition ? { term, definition } : null;
    })
  ).slice(0, 16);

  const pros = list(raw.pros, 6);
  const cons = list(raw.cons, 6);
  const nextSteps = list(raw.nextSteps, 4);
  const flow = list(raw.flow, 6);

  return {
    title: stripMarkers(str(raw.title, "Infographic")) || "Infographic",
    subtitle: stripMarkers(str(raw.subtitle)),
    accent,
    stats,
    sections,
    takeaway: str(raw.takeaway),
    pullQuote: str(raw.pullQuote) || undefined,
    nextSteps: nextSteps.length ? nextSteps : undefined,
    flow: flow.length ? flow : undefined,
    chart: chart.length >= 2 ? chart : undefined,
    compare,
    checklist: checklist.length ? checklist : undefined,
    regions: regions.length ? regions : undefined,
    hub,
    scale: scale.length >= 2 ? scale : undefined,
    matrix,
    milestones: milestones.length >= 2 ? milestones : undefined,
    levels: levels.length >= 2 ? levels : undefined,
    myths: myths.length ? myths : undefined,
    pros: pros.length ? pros : undefined,
    cons: cons.length ? cons : undefined,
    terms: terms.length ? terms : undefined,
  };
}

/**
 * Whether there is nothing to show. Several layouts legitimately carry little
 * or no "sections", so the body can live in any of these.
 */
export function infographicIsEmpty(c: InfographicContent): boolean {
  return (
    c.sections.length === 0 &&
    !c.compare &&
    !c.checklist?.length &&
    !c.chart?.length &&
    !c.regions?.length &&
    !c.milestones?.length &&
    !c.levels?.length &&
    !c.myths?.length &&
    !c.terms?.length &&
    !c.pros?.length &&
    !c.cons?.length
  );
}
