"use client";

import { useEffect, useState } from "react";
import { safeNextPath } from "@/lib/access";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // With no password configured there is nothing to sign in to; go on to where
  // the user was headed instead of showing a lock that cannot be used.
  useEffect(() => {
    void fetch("/api/auth/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { auth?: boolean } | null) => {
        if (j && j.auth === false) {
          const next = new URLSearchParams(window.location.search).get("next");
          const target = safeNextPath(next, window.location.origin);
          window.location.replace(target.startsWith("/login") ? "/" : target);
        }
      })
      .catch(() => {});
  }, []);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error);
      }
      const next = new URLSearchParams(window.location.search).get("next");
      // Only same-origin paths, so the login page cannot be used as a redirector.
      window.location.href = safeNextPath(next, window.location.origin);
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : "Sign-in failed. Check your connection and try again."
      );
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="fixed top-4 right-4 text-[13px]">
        <ThemeToggle variant="nav" />
      </div>
      <form
        className="card fade-up w-full max-w-sm px-6 py-8"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Logo size={56} className="mb-3" />
        <h1 className="text-2xl font-semibold tracking-tight">InfiniAIBook</h1>
        <p className="mt-1 mb-6 text-[13px] text-[var(--muted)]">
          This instance is password protected.
        </p>
        <label htmlFor="password" className="mb-1.5 block text-[13px] font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          className="input"
          type="password"
          autoFocus
          required
          autoComplete="current-password"
          value={password}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error" : undefined}
          onChange={(e) => {
            setPassword(e.target.value);
            if (error) setError(null);
          }}
        />
        {error && (
          <p id="login-error" role="alert" className="mt-2 text-[12px] text-red-300">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary mt-4 w-full" disabled={busy || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
