export type ArtifactType =
  | "report"
  | "briefing"
  | "study_guide"
  | "faq"
  | "quiz"
  | "mindmap"
  | "timeline"
  | "infographic"
  | "podcast";

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
export type QuizContent = { title: string; questions: QuizQuestion[] };

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
  /** Ordered stages, used by the isometric and neon flow layouts. */
  flow?: string[];
};

export type PodcastTurn = { speaker: "a" | "b"; text: string; at: number };

export type PodcastContent = {
  title: string;
  description?: string;
  turns: PodcastTurn[];
  audioUrl: string;
  durationSec: number;
  voices: { a: string; b: string };
};

export type ArtifactContent =
  | DocContent
  | FaqContent
  | QuizContent
  | MindMapContent
  | TimelineContent
  | InfographicContent
  | PodcastContent;

export type Artifact = {
  id: string;
  notebookId: string;
  type: ArtifactType;
  title: string;
  content: ArtifactContent & { citations?: Citation[] };
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
