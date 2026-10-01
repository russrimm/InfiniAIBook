import { NextResponse } from "next/server";
import { NotConfiguredError, ProviderError } from "./provider";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function error(message: string, status = 400, code?: string) {
  return NextResponse.json({ error: message, ...(code ? { code } : {}) }, { status });
}

/** Map a thrown error to a response, logging anything unexpected. */
export function fromError(e: unknown, context: string) {
  if (e instanceof NotConfiguredError) return error(e.message, 503, "not_configured");
  if (e instanceof BodyTooLarge) return error("Request body is too large.", 413);
  if (e instanceof BadJson) return error("Request body is not valid JSON.", 400);
  // Any provider failure is an upstream problem from the browser's view.
  if (e instanceof ProviderError) return error(e.message, 502, "provider");
  if (e instanceof Error && e.name === "TimeoutError") {
    return error("The model provider took too long to respond. Try again.", 504, "timeout");
  }
  if (e instanceof Error && /CredentialUnavailable|AggregateAuthenticationError|az login/i.test(`${e.name} ${e.message}`)) {
    return error(
      "Could not sign in to Azure. Run `az login` locally, give the app a managed identity on Azure, or set AZURE_OPENAI_API_KEY.",
      503,
      "auth"
    );
  }
  console.error(`[${context}]`, e);
  return error("Something went wrong. Check the server log for details.", 500);
}

export async function readJson(req: Request, maxBytes = 2 * 1024 * 1024): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new BodyTooLarge();
  const text = await req.text();
  if (text.length > maxBytes) throw new BodyTooLarge();
  try {
    return JSON.parse(text);
  } catch {
    throw new BadJson();
  }
}

export class BodyTooLarge extends Error {}
export class BadJson extends Error {}
