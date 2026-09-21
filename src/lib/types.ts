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
  /** Set by the "image" style: the rendered PNG served from /api/image/:id. */
  imageUrl?: string;
  imageModel?: string;
  imageSize?: string;
};

export type PodcastTurn = { speaker: "a" | "b"; text: string; at: number };

export type PodcastContent = {
  title: string;
  description?: string;
  turns: PodcastTurn[];
  audioUrl: string;
  durationSec: number;
  voices: { a: string; b: string };
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
