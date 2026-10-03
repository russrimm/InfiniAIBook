import type { Metadata } from "next";
import Workspace from "@/components/Workspace";
import { db } from "@/lib/db";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const row = db.prepare("SELECT title FROM notebooks WHERE id = ?").get(id) as
    | { title: string }
    | undefined;
  return { title: row?.title ?? "Notebook not found" };
}

export default async function NotebookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Workspace notebookId={id} />;
}
