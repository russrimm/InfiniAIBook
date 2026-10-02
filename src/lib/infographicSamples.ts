/**
 * Example content for the style gallery, so every style can be seen before
 * anything is generated.
 *
 * All samples come from one fictional notebook — a community-garden pilot with
 * a project brief, a water plan, workshop notes and a resident survey, the
 * same notebook the docs gallery uses — so the styles can be compared like for
 * like. Each style gets the fields its prompt asks for, in the counts and
 * lengths the prompt sets, so a preview shows what that style really produces.
 */

import { STYLE_ORDER, type InfographicStyle } from "./infographic";
import type { Citation, InfographicContent } from "./types";

export const SAMPLE_CITATIONS: Citation[] = [
  {
    n: 1,
    sourceId: "sample-brief",
    sourceTitle: "Riverside Garden — project brief",
    part: 0,
    snippet: "The pilot converts the vacant lot on Elm Street into 24 raised beds over one season.",
  },
  {
    n: 2,
    sourceId: "sample-water",
    sourceTitle: "Planting & water plan",
    part: 0,
    snippet: "A drip kit cuts water use by about 40% against hand watering, for $640 up front.",
  },
  {
    n: 3,
    sourceId: "sample-workshops",
    sourceTitle: "Volunteer workshop notes",
    part: 0,
    snippet: "38 volunteers signed up after two Saturday workshops; 12 committed to weekly shifts.",
  },
  {
    n: 4,
    sourceId: "sample-survey",
    sourceTitle: "Resident survey",
    part: 0,
    snippet: "68% of 210 respondents said they would use a plot; fresh produce ranked first.",
  },
];

const TITLE = "Riverside Garden Pilot";
const SUBTITLE = "Turning a vacant lot into 24 shared raised beds in one season";

const STATS: InfographicContent["stats"] = [
  { value: "24", label: "Raised beds", caption: "Built on the Elm Street lot [1]" },
  { value: "68%", label: "Would use a plot", caption: "Of 210 surveyed residents [4]" },
  { value: "40%", label: "Less water", caption: "With the drip kit [2]" },
  { value: "38", label: "Volunteers", caption: "After two workshops [3]" },
];

const SECTIONS: InfographicContent["sections"] = [
  {
    heading: "The plan",
    icon: "🌱",
    bullets: [
      "Convert the Elm Street lot into 24 raised beds [1]",
      "Plant in spring, harvest through early fall [1]",
    ],
  },
  {
    heading: "Water",
    icon: "💧",
    bullets: [
      "Drip kit uses about 40% less water [2]",
      "Costs $640 up front, paid from the grant [2]",
    ],
  },
  {
    heading: "People",
    icon: "🤝",
    bullets: [
      "38 volunteers joined after two workshops [3]",
      "12 committed to weekly watering shifts [3]",
    ],
  },
  {
    heading: "Demand",
    icon: "📣",
    bullets: [
      "68% of residents would use a plot [4]",
      "Fresh produce ranked as the top reason [4]",
    ],
  },
];

const TAKEAWAY = "Demand is proven; steady volunteers and drip irrigation decide whether the beds thrive [3][4].";

const REGIONS: NonNullable<InfographicContent["regions"]> = [
  {
    heading: "BUILD",
    concepts: [
      { takeaway: "24 beds on one lot", detail: "The vacant Elm Street lot becomes raised beds [1].", metaphor: "layers", value: "24" },
      { takeaway: "One season to prove it", detail: "Planting in spring, harvest through fall [1].", metaphor: "clock" },
    ],
  },
  {
    heading: "GROW",
    concepts: [
      { takeaway: "Drip beats the hose", detail: "About 40% less water than hand watering [2].", metaphor: "pipe", value: "40%" },
      { takeaway: "A $640 kit", detail: "Paid once from the pilot grant [2].", metaphor: "coins", value: "$640" },
    ],
  },
  {
    heading: "SHARE",
    concepts: [
      { takeaway: "Residents want plots", detail: "68% of 210 respondents would use one [4].", metaphor: "growth", value: "68%" },
      { takeaway: "Volunteers keep it alive", detail: "12 of 38 volunteers took weekly shifts [3].", metaphor: "network", value: "12" },
    ],
  },
];

const base = (): InfographicContent => ({
  title: TITLE,
  subtitle: SUBTITLE,
  stats: STATS,
  sections: SECTIONS,
  takeaway: TAKEAWAY,
});

/** Per-style shaping, mirroring each style's generation hint. */
const SHAPES: Partial<Record<InfographicStyle, (b: InfographicContent) => InfographicContent>> = {
  guide: (b) => ({
    ...b,
    stats: [],
    sections: [],
    regions: REGIONS,
    hub: { label: "Shared beds", caption: "Everything in the pilot feeds the 24 beds [1]." },
    scale: [
      { tier: "Herbs", example: "Basil, mint, chives", figure: "1 bed" },
      { tier: "Greens", example: "Lettuce and kale", figure: "6 beds" },
      { tier: "Vegetables", example: "Tomatoes and squash", figure: "17 beds" },
    ],
    takeaway: "Lock in weekly volunteers before the first planting day.",
  }),
  illustrated: (b) => ({ ...b, stats: [], sections: [], regions: REGIONS }),
  image: (b) => ({ ...b, stats: [], sections: [], regions: REGIONS }),
  anime: (b) => ({ ...b, stats: [], sections: [], regions: REGIONS }),
  retro: (b) => ({ ...b, stats: [], sections: [], regions: REGIONS }),
  papercraft: (b) => ({ ...b, stats: [], sections: [], regions: REGIONS }),
  flat: (b) => ({ ...b, sections: SECTIONS.slice(0, 3) }),
  data: (b) => ({
    ...b,
    chart: [
      { label: "Vegetable beds", value: 17, display: "17" },
      { label: "Greens beds", value: 6, display: "6" },
      { label: "Herb beds", value: 1, display: "1" },
    ],
    sections: [
      {
        heading: "What it means",
        icon: "📊",
        bullets: ["Most beds go to vegetables, the top request [1][4]", "Herbs need just one shared bed [1]"],
      },
      {
        heading: "The trend",
        icon: "📈",
        bullets: ["Sign-ups doubled after the second workshop [3]", "Water need falls 40% with drip [2]"],
      },
    ],
  }),
  process: (b) => ({
    ...b,
    flow: ["Build the beds", "Plant in spring", "Water weekly", "Harvest and share"],
    sections: [
      { heading: "Build the beds", icon: "🔨", bullets: ["Volunteers assemble 24 cedar beds [1]", "Hands over a ready lot for planting [1]"] },
      { heading: "Plant in spring", icon: "🌱", bullets: ["Seedlings go in after the last frost [1]", "Leaves beds ready for the drip lines [2]"] },
      { heading: "Water weekly", icon: "💧", bullets: ["12 volunteers run weekly shifts [3]", "The drip kit cuts water 40% [2]"] },
      { heading: "Harvest and share", icon: "🧺", bullets: ["Produce goes to plot holders first [4]", "Surplus feeds next year's plan [1]"] },
    ],
  }),
  comparison: (b) => ({
    ...b,
    sections: [],
    compare: {
      aLabel: "Hand watering",
      bLabel: "Drip kit",
      rows: [
        { feature: "Up-front cost", a: "None [2]", b: "$640 once [2]" },
        { feature: "Water use", a: "Baseline [2]", b: "About 40% less [2]" },
        { feature: "Volunteer time", a: "Daily visits [3]", b: "Weekly checks [3]" },
        { feature: "Reliability", a: "Depends on turnout [3]", b: "Runs on a timer [2]" },
      ],
      verdict: "Hand watering suits a trial bed; the drip kit pays off once all 24 beds are planted [2][3].",
    },
  }),
  checklist: (b) => ({
    ...b,
    stats: STATS.slice(0, 2),
    sections: [],
    checklist: [
      { title: "Confirm the lot lease", detail: "Secure the Elm Street lot for the season [1]." },
      { title: "Order the drip kit", detail: "Budget $640 from the pilot grant [2]." },
      { title: "Run the build day", detail: "Assemble all 24 beds with volunteers [1][3]." },
      { title: "Set weekly shifts", detail: "Schedule the 12 committed volunteers [3]." },
      { title: "Assign plots", detail: "Offer beds to the residents who asked first [4]." },
      { title: "Review at harvest", detail: "Compare yield and water use to the plan [2]." },
    ],
  }),
  educational: (b) => ({
    ...b,
    sections: [
      { heading: "What it is", icon: "🌱", bullets: ["24 shared raised beds on a vacant lot [1]", "A one-season pilot run by volunteers [1][3]"] },
      { heading: "Why it matters", icon: "💡", bullets: ["68% of residents want a plot [4]", "Fresh produce is the top reason given [4]"] },
      { heading: "How to apply it", icon: "🛠️", bullets: ["Start with drip irrigation to save water [2]", "Lock in weekly volunteers early [3]"] },
    ],
  }),
  timeline: (b) => ({
    ...b,
    stats: STATS.slice(0, 2),
    sections: [],
    milestones: [
      { date: "Jan", title: "Grant approved", detail: "The pilot budget covers beds and a drip kit [1][2]." },
      { date: "Feb", title: "Residents surveyed", detail: "68% of 210 respondents want a plot [4]." },
      { date: "Mar", title: "Volunteer workshops", detail: "Two Saturdays bring in 38 volunteers [3]." },
      { date: "Apr", title: "Build day", detail: "All 24 raised beds go up on Elm Street [1]." },
      { date: "Sep", title: "Harvest review", detail: "Yield and water use are compared to plan [2]." },
    ],
  }),
  pyramid: (b) => ({
    ...b,
    stats: STATS.slice(0, 2),
    sections: [],
    levels: [
      { label: "Shared harvest", detail: "The outcome everything else supports [4].", value: "24 beds" },
      { label: "Weekly care", detail: "12 volunteers keep the beds watered [3].", value: "12" },
      { label: "Water system", detail: "A drip kit cuts water use by 40% [2].", value: "40%" },
      { label: "Land & demand", detail: "A secured lot and residents who want plots [1][4].", value: "68%" },
    ],
  }),
  funnel: (b) => ({
    ...b,
    stats: [],
    sections: [],
    levels: [
      { label: "Residents surveyed", detail: "Everyone reached by the survey [4].", value: "210" },
      { label: "Want a plot", detail: "Said they would use a bed [4].", value: "143" },
      { label: "Volunteered", detail: "Signed up at the workshops [3].", value: "38" },
      { label: "Weekly shifts", detail: "Committed to regular watering [3].", value: "12" },
    ],
  }),
  cycle: (b) => ({
    ...b,
    stats: STATS.slice(0, 2),
    flow: ["Plant", "Water", "Harvest", "Compost"],
    sections: [
      { heading: "Plant", icon: "🌱", bullets: ["Seedlings go in each spring [1]"] },
      { heading: "Water", icon: "💧", bullets: ["Drip lines water on a timer [2]"] },
      { heading: "Harvest", icon: "🧺", bullets: ["Plot holders pick through fall [4]"] },
      { heading: "Compost", icon: "♻️", bullets: ["Scraps enrich next spring's soil [1]"] },
    ],
  }),
  myths: (b) => ({
    ...b,
    stats: STATS.slice(0, 2),
    sections: [],
    myths: [
      { myth: "Nobody nearby wants a garden", fact: "68% of 210 residents said they would use a plot [4]." },
      { myth: "Drip irrigation is too expensive", fact: "The $640 kit cuts water use by about 40% [2]." },
      { myth: "Volunteers drift away after a month", fact: "12 of 38 volunteers committed to weekly shifts [3]." },
    ],
    takeaway: "The pilot's biggest risk is staffing, not demand or cost [3][4].",
  }),
  proscons: (b) => ({
    ...b,
    title: "Is the drip kit worth it?",
    stats: [],
    sections: [],
    pros: [
      "Uses about 40% less water than hand watering [2]",
      "Runs on a timer, so missed shifts matter less [2][3]",
      "Frees volunteers for building and harvest [3]",
    ],
    cons: [
      "Costs $640 up front from a small grant [2]",
      "Lines need checking after each build change [2]",
      "Adds a setup day before planting [1]",
    ],
    takeaway: "Worth it once all 24 beds are planted; skip it for a single trial bed [2].",
  }),
  cheatsheet: (b) => ({
    ...b,
    stats: STATS.slice(0, 2),
    terms: [
      { term: "Raised bed", definition: "A framed box of soil above ground level [1]." },
      { term: "Drip line", definition: "Tubing that waters roots slowly, saving about 40% [2]." },
      { term: "Plot holder", definition: "A resident assigned one bed for the season [4]." },
      { term: "Shift", definition: "A weekly two-hour watering slot [3]." },
      { term: "Build day", definition: "The Saturday all 24 beds go up [1]." },
      { term: "Harvest review", definition: "End-of-season check on yield and water [2]." },
    ],
    sections: [
      { heading: "Rules of thumb", icon: "📌", bullets: ["Water early, before 9 a.m. [2]", "One bed per household [4]"] },
    ],
  }),
  bento: (b) => ({
    ...b,
    sections: [
      { heading: "Demand is real", icon: "📣", bullets: ["68% of residents would use a plot [4]", "Fresh produce is the top reason [4]"] },
      ...SECTIONS.slice(0, 3),
    ],
  }),
  cutout: (b) => ({
    ...b,
    sections: [
      { heading: "Demand is real", icon: "📣", bullets: ["68% of 210 residents would use a plot [4]", "Fresh produce ranked first [4]"] },
      { heading: "Water", icon: "💧", bullets: ["Drip saves about 40% [2]"] },
      { heading: "People", icon: "🤝", bullets: ["12 weekly volunteers [3]"] },
    ],
  }),
  corporate: (b) => ({
    ...b,
    nextSteps: ["Order the $640 drip kit [2]", "Schedule the April build day [1]", "Assign plots by survey order [4]"],
  }),
  minimal: (b) => ({ ...b, stats: STATS.slice(0, 2), sections: SECTIONS.slice(0, 3) }),
  editorial: (b) => ({
    ...b,
    subtitle: "On Elm Street, an empty lot is about to become a neighborhood's kitchen garden.",
    stats: [],
    sections: [
      { heading: "A lot with a waiting list", icon: "🌱", bullets: ["68% of residents say they would use a plot [4]", "The pilot builds 24 beds in one season [1]"] },
      { heading: "The quiet work of water", icon: "💧", bullets: ["A drip kit cuts water use by about 40% [2]"] },
    ],
    pullQuote: "Fresh produce, close to home, was the first thing people asked for.",
  }),
  neon: (b) => ({
    ...b,
    flow: ["Secure land", "Install drip", "Staff shifts", "Share harvest"],
    sections: [
      { heading: "Secure land", icon: "📍", bullets: ["Lease the Elm Street lot [1]"] },
      { heading: "Install drip", icon: "💧", bullets: ["Cuts water use 40% [2]"] },
      { heading: "Staff shifts", icon: "🧑‍🌾", bullets: ["12 weekly volunteers [3]"] },
      { heading: "Share harvest", icon: "🧺", bullets: ["Plots go to residents first [4]"] },
    ],
  }),
  clay: (b) => ({
    ...b,
    sections: [
      { heading: "The Garden", icon: "🌻", bullets: ["24 friendly raised beds [1]"] },
      { heading: "The Water Team", icon: "💧", bullets: ["A drip kit that sips 40% less [2]"] },
      { heading: "The Helpers", icon: "🧑‍🌾", bullets: ["38 volunteers, 12 every week [3]"] },
      { heading: "The Neighbors", icon: "🏡", bullets: ["Most want a plot of their own [4]"] },
    ],
  }),
  kawaii: (b) => ({
    ...b,
    sections: [
      { heading: "Happy little beds", icon: "🌷", bullets: ["24 cozy beds for veggies [1]", "Planted every spring [1]"] },
      { heading: "Sip-sip water", icon: "💧", bullets: ["Drip lines save lots of water [2]"] },
      { heading: "Garden friends", icon: "🐝", bullets: ["38 helpers said yes [3]"] },
      { heading: "Yummy goals", icon: "🍅", bullets: ["Neighbors want fresh food [4]"] },
    ],
    takeaway: "Lots of neighbors want to grow together — let's dig in! [4]",
  }),
  scientific: (b) => ({
    ...b,
    title: "Drip irrigation reduced water use by ~40%",
    stats: [
      { value: "n = 210", label: "Survey respondents", caption: "Resident survey [4]" },
      { value: "−40%", label: "Water use", caption: "Drip vs hand watering [2]" },
      { value: "24", label: "Beds", caption: "Single-season pilot [1]" },
    ],
    chart: [
      { label: "Hand watering", value: 100, display: "100%" },
      { label: "Drip kit", value: 60, display: "60%" },
    ],
    sections: [
      { heading: "Method", icon: "🧪", bullets: ["Water use compared across 24 beds in one season [1][2]"] },
      { heading: "Limitations", icon: "⚠️", bullets: ["Single site; results may vary with rainfall [2]"] },
    ],
  }),
  bricks: (b) => ({
    ...b,
    stats: STATS.slice(0, 2),
    sections: [
      { heading: "Land", icon: "📍", bullets: ["The Elm Street lot, secured for the season [1]"] },
      { heading: "Water", icon: "💧", bullets: ["A drip kit that saves 40% [2]"] },
      { heading: "People", icon: "🤝", bullets: ["12 weekly volunteers [3]"] },
      { heading: "Harvest", icon: "🧺", bullets: ["Fresh produce for 68% who asked [4]"] },
    ],
  }),
  sketch: (b) => ({
    ...b,
    sections: [
      { heading: "Beds!", icon: "✏️", bullets: ["24 raised beds [1]", "One season [1]"] },
      { heading: "Water", icon: "💧", bullets: ["Drip = −40% [2]"] },
      { heading: "People", icon: "🙌", bullets: ["38 joined, 12 weekly [3]"] },
    ],
  }),
  chalkboard: (b) => ({
    ...b,
    takeaway: "A shared garden lives or dies by steady care, not good intentions [3].",
    sections: [
      { heading: "Example 1: water", icon: "💧", bullets: ["Drip lines water even when shifts are missed [2]"] },
      { heading: "Example 2: people", icon: "🧑‍🌾", bullets: ["12 weekly volunteers beat 38 occasional ones [3]"] },
      { heading: "Example 3: plots", icon: "🌱", bullets: ["Assigned holders tend their own beds [4]"] },
    ],
  }),
  watercolor: (b) => ({
    ...b,
    stats: [],
    sections: [
      { heading: "An empty lot", icon: "🌫️", bullets: ["Elm Street sat vacant for years [1]"] },
      { heading: "Neighbors gather", icon: "🤝", bullets: ["38 volunteers answered the call [3]"] },
      { heading: "Something grows", icon: "🌻", bullets: ["24 beds bloom through the fall [1]"] },
    ],
    pullQuote: "What was an empty lot became a shared kitchen garden.",
  }),
};

/** The example infographic shown for a style before generating. */
export function sampleInfographic(style: InfographicStyle): InfographicContent {
  const shape = SHAPES[style];
  const b = base();
  return { ...(shape ? shape(b) : b), style };
}

/** Every style has a sample; exported for tests. */
export const SAMPLED_STYLES: InfographicStyle[] = STYLE_ORDER;
