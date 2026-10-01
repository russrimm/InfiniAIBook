import Link from "next/link";
import { Conversation } from "@/components/Conversation";
import { resolveSetup, setupFromParams } from "@/lib/setup";

export const dynamic = "force-dynamic";

export default async function TalkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string") params.set(k, v);
  const setup = setupFromParams(params);

  if (!setup) {
    return (
      <div className="mx-auto max-w-md px-5 py-16 text-center">
        <h1 className="text-xl font-semibold">That conversation link is incomplete.</h1>
        <p className="mt-2 text-muted">Pick your languages, level and partner to start a call.</p>
        <Link href="/" className="mt-6 inline-block rounded-full bg-accent px-5 py-2.5 font-medium text-white">
          Set up a conversation
        </Link>
      </div>
    );
  }

  return <Conversation setup={setup} resolved={resolveSetup(setup)} />;
}
