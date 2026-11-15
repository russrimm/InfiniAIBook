import type { ReactNode } from "react";
import Logo from "@/components/Logo";

/**
 * The full-page card behind the error and not-found screens. It uses no hooks
 * or providers, so it also renders inside global-error, where the root layout
 * (and its providers) is gone.
 */
export default function StatusScreen({
  title,
  children,
  actions,
  alert = false,
}: {
  title: string;
  children: ReactNode;
  actions: ReactNode;
  /** Announce the screen to assistive technology as soon as it appears. */
  alert?: boolean;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div role={alert ? "alert" : undefined} className="card fade-up w-full max-w-sm px-6 py-8">
        <Logo size={56} className="mb-3" />
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <div className="mt-1 mb-6 text-[13px] text-[var(--muted)]">{children}</div>
        <div className="flex flex-wrap gap-2">{actions}</div>
      </div>
    </main>
  );
}
