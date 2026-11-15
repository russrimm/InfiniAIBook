import type { Metadata } from "next";
import Link from "next/link";
import StatusScreen from "@/components/StatusScreen";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <StatusScreen
      title="Page not found"
      actions={
        <Link href="/" className="btn btn-primary">
          Go to notebooks
        </Link>
      }
    >
      <p>That page does not exist, or the notebook was deleted.</p>
    </StatusScreen>
  );
}
