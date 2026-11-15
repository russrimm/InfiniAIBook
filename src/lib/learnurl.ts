export class LearnError extends Error {
  constructor(message: string, readonly status: 400 | 502 = 502) {
    super(message);
    this.name = "LearnError";
  }
}

export function normalizeLearnUrl(input: string): string {
  try {
    const url = new URL(input);
    const path = url.pathname.replace(/^\/[a-z]{2}-[a-z]{2}(?=\/|$)/i, "");
    if (
      url.protocol !== "https:" || url.hostname !== "learn.microsoft.com" ||
      url.username || url.password || url.port ||
      !path || path === "/" ||
      /^\/(?:api|search|answers|users|profile)(?:\/|$)/i.test(path) ||
      /\.(?:png|jpe?g|gif|webp|svg|pdf|zip|mp4)$/i.test(path)
    ) throw new Error("Not a documentation URL");
    url.hash = "";
    url.search = "";
    return url.href;
  } catch {
    throw new LearnError("Enter an HTTPS Microsoft Learn documentation URL on learn.microsoft.com.", 400);
  }
}
