import type { Metadata } from "next";
import SearchView from "@/components/SearchView";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; notebookId?: string }>;
}) {
  const { q, notebookId } = await searchParams;
  return <SearchView initialQuery={q ?? ""} notebookId={notebookId} />;
}
