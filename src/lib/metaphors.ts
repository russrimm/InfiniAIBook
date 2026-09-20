/**
 * Metaphor vocabulary for the illustrated infographic style.
 *
 * Kept separate from the SVG component because that module is client-side,
 * while the generation prompt needs these names on the server.
 */

export type MetaphorKey =
  | "scale"
  | "gauge"
  | "pipe"
  | "cables"
  | "coins"
  | "calculator"
  | "gears"
  | "shield"
  | "funnel"
  | "roadmap"
  | "clock"
  | "growth"
  | "warning"
  | "lightbulb"
  | "layers"
  | "network"
  | "document"
  | "target";

/** What each metaphor should be chosen to represent. */
export const METAPHOR_HINTS: Record<MetaphorKey, string> = {
  scale: "weighing two options against each other",
  gauge: "a limit, capacity or measured level",
  pipe: "a flow of data or material",
  cables: "branching connections, users or clients",
  coins: "cost, funding or revenue",
  calculator: "forecasting, estimation or arithmetic",
  gears: "configuration, mechanism or how something works",
  shield: "security, protection or risk mitigation",
  funnel: "filtering, narrowing or optimisation",
  roadmap: "a process, sequence or plan over time",
  clock: "time, duration or scheduling",
  growth: "an increasing trend or improvement",
  warning: "a risk, caveat or failure mode",
  lightbulb: "an insight, idea or recommendation",
  layers: "structure, architecture or composition",
  network: "relationships between many things",
  document: "records, reports or documentation",
  target: "a goal, objective or outcome",
};

export const METAPHOR_KEYS = Object.keys(METAPHOR_HINTS) as MetaphorKey[];
