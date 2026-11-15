import { db } from "./db";
import { searchLearn } from "./learn";
import { retrieveWithDiagnostics, type Passage, type RetrievalResult } from "./retrieve";

export function notebookLiveLearn(notebookId: string): boolean {
  const row = db.prepare("SELECT live_learn FROM notebooks WHERE id = ?")
    .get(notebookId) as { live_learn: number } | undefined;
  return row?.live_learn === 1;
}

export async function retrieveChatContext(
  notebookId: string,
  query: string,
  sourceIds: string[] | undefined
): Promise<RetrievalResult & { notice: string | null }> {
  const enabled = notebookLiveLearn(notebookId);
  const [local, live] = await Promise.all([
    retrieveWithDiagnostics(notebookId, query, sourceIds, 12),
    enabled ? searchLearn(query.slice(0, 1000)) : Promise.resolve([]),
  ]);
  const parts = new Map<string, number>();
  const fresh: Passage[] = live.slice(0, 6).map((page, i) => {
    const idx = parts.get(page.url) ?? 0;
    parts.set(page.url, idx + 1);
    return {
      id: `learn-${i}`,
      sourceId: `learn:${page.url}`,
      sourceTitle: `Microsoft Learn: ${page.title}`,
      idx,
      text: page.content.slice(0, 4000),
      url: page.url,
    };
  });
  return {
    passages: [...local.passages, ...fresh],
    mismatch: local.mismatch,
    notice: enabled && !fresh.length
      ? "Microsoft Learn found no matches for this question. This answer uses only your selected saved sources."
      : null,
  };
}
