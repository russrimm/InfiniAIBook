"use client";

import { useEffect } from "react";
import StatusScreen from "@/components/StatusScreen";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusScreen
      alert
      title="Something went wrong"
      actions={
        <>
          <button type="button" className="btn btn-primary" autoFocus onClick={reset}>
            Try again
          </button>
          {/* A full navigation, so a broken client state cannot follow the user home. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className="btn">
            Go to notebooks
          </a>
        </>
      }
    >
      <p>
        This page hit an unexpected error. Your notebooks are saved on the server. Try again, or
        return to your notebooks.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-[11px]">
          Reference: <span data-testid="error-digest">{error.digest}</span>
        </p>
      )}
    </StatusScreen>
  );
}
