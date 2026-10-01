import { HistoryList } from "@/components/HistoryList";
import { listSessions } from "@/lib/server/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function HistoryPage() {
  const sessions = listSessions();
  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Your conversations</h1>
      <HistoryList initial={sessions} />
    </div>
  );
}
