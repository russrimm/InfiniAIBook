"use client";

import { useEffect } from "react";
import "./globals.css";
import StatusScreen from "@/components/StatusScreen";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

/**
 * Replaces the root layout when it fails, so it supplies its own <html> and
 * <body>. The theme script keeps the user's light or dark choice.
 */
export default function GlobalError({
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>Something went wrong — InfiniAIBook</title>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <StatusScreen
          alert
          title="Something went wrong"
          actions={
            <>
              <button type="button" className="btn btn-primary" autoFocus onClick={reset}>
                Try again
              </button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/" className="btn">
                Go to notebooks
              </a>
            </>
          }
        >
          <p>
            InfiniAIBook could not load. Your notebooks are saved on the server. Try again, or
            reload the page.
          </p>
          {error.digest && (
            <p className="mt-2 font-mono text-[11px]">
              Reference: <span data-testid="error-digest">{error.digest}</span>
            </p>
          )}
        </StatusScreen>
      </body>
    </html>
  );
}
