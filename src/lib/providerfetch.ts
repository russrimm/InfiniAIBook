import { BlockedHostError, DownloadTimeoutError, ResponseTooLargeError, readCapped, safeFetch } from "./safefetch";

/**
 * Downloads of files a model provider hands back as a link: a generated image,
 * a finished avatar video, a job summary.
 *
 * The link comes from a response, not from the operator, so it is treated like
 * any other address the server is asked to fetch. A provider that was
 * compromised, misconfigured or pointed at a hostile endpoint could otherwise
 * make this server request a cloud metadata address or a service on the
 * private network and return what it found. Every request here:
 *
 *  - goes to a public address, checked again on every redirect hop (safeFetch),
 *    unless it is on an origin the operator configured for the provider,
 *  - carries no credential,
 *  - has a time limit for the response to start, and a size limit and time limit for the body.
 */

export class ProviderAssetError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ProviderAssetError";
  }
}

export type ProviderAssetOptions = {
  /** What is being downloaded, for messages: "generated image". */
  what: string;
  maxBytes: number;
  /**
   * The provider endpoints the operator configured (AI_BASE_URL, an Azure
   * endpoint). A link on one of these origins is fetched directly even when it
   * is on a private network, because a local OpenAI-compatible server serves
   * its own images. Redirects off it must lead to public addresses.
   */
  trusted?: (string | null | undefined)[];
  /** Refuse any link that is not https, even on a trusted origin. */
  httpsOnly?: boolean;
  signal?: AbortSignal;
  /** How long the response may take to start. */
  headersTimeoutMs?: number;
  /** How long the whole body may take. */
  bodyTimeoutMs?: number;
};

const HEADERS_TIMEOUT_MS = 30_000;
const MAX_HOPS = 5;

const originOf = (value: string | null | undefined): string | null => {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

/** An AbortSignal that fires after `ms` until `settle` is called, and whenever `outer` fires. */
function startTimeout(ms: number, outer?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`no response within ${Math.round(ms / 1000)} seconds`)), ms);
  const forward = () => controller.abort(outer?.reason);
  if (outer?.aborted) forward();
  else outer?.addEventListener("abort", forward, { once: true });
  return {
    signal: controller.signal,
    settle: () => clearTimeout(timer),
  };
}

/**
 * Start downloading a provider's link. Resolves with the response once its
 * headers are in; the caller reads the body, within `maxBytes`.
 */
export async function openProviderAsset(rawUrl: string, opts: ProviderAssetOptions): Promise<Response> {
  const trusted = new Set((opts.trusted ?? []).map(originOf).filter((o): o is string => Boolean(o)));
  const { signal, settle } = startTimeout(opts.headersTimeoutMs ?? HEADERS_TIMEOUT_MS, opts.signal);
  try {
    let current = rawUrl;
    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      let url: URL;
      try {
        url = new URL(current);
      } catch {
        throw new ProviderAssetError(`The provider returned a link to the ${opts.what} that is not a web address.`);
      }
      if (opts.httpsOnly && url.protocol !== "https:") {
        throw new ProviderAssetError(`The provider returned an unexpected link to the ${opts.what}; only https links are downloaded.`);
      }

      if (!trusted.has(url.origin)) {
        try {
          return (await safeFetch(url.toString(), { signal })).res;
        } catch (e) {
          if (e instanceof BlockedHostError) {
            throw new ProviderAssetError(
              `The provider returned a link to the ${opts.what} that was not downloaded: ${e.message}`,
              { cause: e },
            );
          }
          throw e;
        }
      }

      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new ProviderAssetError(`The provider returned an unexpected link to the ${opts.what}.`);
      }
      const res = await fetch(url, { signal, redirect: "manual" });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        void res.body?.cancel().catch(() => {});
        current = new URL(location, url).toString();
        continue;
      }
      return res;
    }
    throw new ProviderAssetError(`The link to the ${opts.what} redirected too many times.`);
  } finally {
    settle();
  }
}

const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

/** The limit message for a body that grew past `maxBytes`, in the caller's own words. */
export const providerAssetTooLarge = (what: string, maxBytes: number) =>
  `The ${what} is larger than ${mb(maxBytes)}, so it was not downloaded.`;

/** Download a provider's link into memory, refusing anything over `maxBytes`. */
export async function downloadProviderAsset(rawUrl: string, opts: ProviderAssetOptions): Promise<Buffer> {
  const res = await openProviderAsset(rawUrl, opts);
  if (!res.ok) {
    void res.body?.cancel().catch(() => {});
    throw Object.assign(new ProviderAssetError(`Could not download the ${opts.what} (${res.status}).`), {
      status: res.status,
    });
  }
  try {
    return await readCapped(res, opts.maxBytes, opts.bodyTimeoutMs);
  } catch (e) {
    if (e instanceof ResponseTooLargeError) {
      throw new ProviderAssetError(providerAssetTooLarge(opts.what, opts.maxBytes), { cause: e });
    }
    if (e instanceof DownloadTimeoutError) {
      throw new ProviderAssetError(`The ${opts.what} took too long to download, so it was stopped.`, { cause: e });
    }
    throw e;
  }
}
