import SearchView from "@/components/SearchView";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; notebookId?: string }>;
}) {
  const { q, notebookId } = await searchParams;
  return <SearchView initialQuery={q ?? ""} notebookId={notebookId} />;
}
