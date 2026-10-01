import Link from "next/link";
import { SessionView } from "@/components/SessionView";
import { getSession } from "@/lib/server/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const session = getSession(id);
  if (!session) {
    return (
      <div className="mx-auto max-w-md px-5 py-16 text-center">
        <h1 className="text-xl font-semibold">Conversation not found.</h1>
        <Link href="/history" className="mt-4 inline-block text-accent underline">
          Back to history
        </Link>
      </div>
    );
  }
  return <SessionView session={session} autoRecap={sp.recap === "1"} />;
}
