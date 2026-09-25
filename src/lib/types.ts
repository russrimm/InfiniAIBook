export type ArtifactType =
  | "report"
  | "briefing"
  | "study_guide"
  | "faq"
  | "quiz"
  | "flashcards"
  | "mindmap"
  | "timeline"
  | "infographic"
  | "video"
  | "podcast";

/** Study aids can be tuned for depth and rigour at generation time. */
export type StudyDifficulty = "easy" | "medium" | "hard";
export type StudyLength = "short" | "standard" | "long";
export type StudyOptions = {
  difficulty?: StudyDifficulty;
  length?: StudyLength;
  /** Target running time for the audio overview. */
  audioLength?: string;
};

export type Citation = {
  n: number;
  sourceId: string;
  sourceTitle: string;
  part: number;
  snippet: string;
};

export type DocContent = { title: string; subtitle?: string; markdown: string };
export type FaqContent = { title: string; items: { q: string; a: string }[] };
export type QuizQuestion = {
  question: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
};
export type QuizContent = {
  title: string;
  questions: QuizQuestion[];
  difficulty?: StudyDifficulty;
};

export type Flashcard = {
  front: string;
  back: string;
  /** Optional nudge shown before the card is flipped. */
  hint?: string;
};
export type FlashcardsContent = {
  title: string;
  subtitle?: string;
  cards: Flashcard[];
  difficulty?: StudyDifficulty;
};

export type MindNode = { label: string; note?: string; children?: MindNode[] };
export type MindMapContent = { title: string; root: MindNode };

export type TimelineContent = {
  title: string;
  items: { date: string; title: string; text: string }[];
};

export type InfographicContent = {
  title: string;
  subtitle?: string;
  accent?: string;
  /** Visual style key from src/lib/infographic.ts; defaults to "classic". */
  style?: string;
  stats: { value: string; label: string; caption?: string }[];
  sections: { heading: string; icon?: string; bullets: string[] }[];
  takeaway?: string;
  /** Used by editorial and watercolor styles. */
  pullQuote?: string;
  /** Used by the corporate style. */
  nextSteps?: string[];
  /** Ordered stages, used by the process flow layout. */
  flow?: string[];
  /** Comparable figures on one scale, used by the data-driven layout. */
  chart?: { label: string; value: number; display?: string }[];
  /** Side-by-side comparison, used by the comparison layout. */
  compare?: {
    aLabel: string;
    bLabel: string;
    rows: { feature: string; a: string; b: string }[];
    verdict?: string;
  };
  /** Actionable items, used by the checklist layout. */
  checklist?: { title: string; detail: string }[];
  /** Thematic groups of visual concepts, used by the illustrated layout. */
  regions?: {
    heading: string;
    concepts: {
      takeaway: string;
      detail: string;
      metaphor: string;
      value?: string;
    }[];
  }[];
  /** Visual guide: the central concept everything else connects to. */
  hub?: { label: string; caption?: string };
  /** Visual guide: graded tiers, lightest to heaviest. */
  scale?: { tier: string; example?: string; figure?: string }[];
  /** Visual guide: 2-4 options compared across features. */
  matrix?: { columns: string[]; rows: { feature: string; values: string[] }[] };
  /** Set by the image styles: the rendered PNG served from /api/image/:id. */
  imageUrl?: string;
  imageModel?: string;
  imageSize?: string;
};

export type PodcastSpeakerId = "a" | "b" | "c" | "d";
export type PodcastTurn = { speaker: PodcastSpeakerId; text: string; at: number };
export type PodcastSpeaker = {
  id: PodcastSpeakerId;
  name?: string;
  voice: string;
  role?: string;
};

export type PodcastContent = {
  title: string;
  description?: string;
  turns: PodcastTurn[];
  audioUrl: string;
  durationSec: number;
  voices: { a: string; b: string } & Partial<Record<PodcastSpeakerId, string>>;
  /** Speaker display names and roles used to write the episode. */
  speakers?: PodcastSpeaker[];
  /** Requested running time, so the result can be compared with the target. */
  length?: string;
  targetMinutes?: number;
  /** Named sections with their start offset, for jumping around the audio. */
  chapters?: { title: string; at: number }[];
};

export type VideoContent = {
  title: string;
  description?: string;
  scenes: {
    title: string;
    caption: string;
    narration: string;
    step?: number;
  }[];
  videoUrl?: string;
  bytes?: number;
  voice?: string;
  progress?: { stage: string; done: number; total: number; note?: string };
};

export type ArtifactContent =
  | DocContent
  | FaqContent
  | QuizContent
  | FlashcardsContent
  | MindMapContent
  | TimelineContent
  | InfographicContent
  | VideoContent
  | PodcastContent;

export type Artifact = {
  id: string;
  notebookId: string;
  type: ArtifactType;
  title: string;
  content: ArtifactContent & { citations?: Citation[] };
  createdAt: number;
};

/**
 * What a listing needs to know about an artifact.
 *
 * Bodies are fetched when one is opened rather than shipped with the notebook:
 * they are the bulk of that response and grow with every artifact ever made,
 * while the list itself only ever shows an icon, a title and a date.
 */
export type ArtifactSummary = {
  id: string;
  type: ArtifactType;
  title: string;
  createdAt: number;
};

export type Source = {
  id: string;
  notebookId: string;
  title: string;
  kind: string;
  url: string | null;
  chars: number;
  summary: string | null;
  createdAt: number;
};

export type Notebook = {
  id: string;
  title: string;
  emoji: string;
  createdAt: number;
  sourceCount?: number;
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  createdAt: number;
};

/** One conversation thread; a notebook can hold any number of them. */
export type ChatSession = {
  id: string;
  notebookId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount?: number;
};

/**
 * A note is the user's own writing, or model output they chose to keep: a saved
 * chat answer or the result of a transformation. `kind` records which, so the
 * list can distinguish what was written from what was generated.
 */
export type Note = {
  id: string;
  notebookId: string;
  title: string;
  content: string;
  kind: "human" | "ai";
  sourceId: string | null;
  citations?: Citation[];
  createdAt: number;
  updatedAt: number;
};

/** A reusable prompt applied to one source at a time. */
export type Transformation = {
  id: string;
  name: string;
  description: string;
  prompt: string;
  builtin: boolean;
};
