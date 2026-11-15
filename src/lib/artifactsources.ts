export class SourceBoundaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceBoundaryError";
  }
}

/** Legacy citations can establish provenance, but notes and live web results cannot. */
export function artifactSourceIds(content: unknown): string[] {
  if (!content || typeof content !== "object" || Array.isArray(content)) return [];
  const ids: string[] = [];
  if ("sourceIds" in content) {
    if (
      !Array.isArray(content.sourceIds) || !content.sourceIds.length ||
      content.sourceIds.some((id) => typeof id !== "string" || !id.trim() || id.startsWith("note:"))
    ) return [];
    ids.push(...content.sourceIds);
  }
  if ("citations" in content) {
    if (!Array.isArray(content.citations)) return [];
    for (const citation of content.citations) {
      if (
        !citation || typeof citation !== "object" ||
        !("sourceId" in citation) || typeof citation.sourceId !== "string" ||
        !citation.sourceId.trim() || citation.sourceId.startsWith("note:") ||
        ("url" in citation && typeof citation.url === "string")
      ) return [];
      ids.push(citation.sourceId);
    }
  }
  return [...new Set(ids)];
}
