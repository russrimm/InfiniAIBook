"use client";

import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error);
      const next = new URLSearchParams(window.location.search).get("next");
      // Only same-site paths, so the login page cannot be used as a redirector.
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Sign-in failed.");
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form
        className="card fade-up w-full max-w-sm px-6 py-8"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h1 className="text-2xl font-semibold tracking-tight">InfiniAIBook</h1>
        <p className="mt-1 mb-6 text-[13px] text-[var(--muted)]">
          This instance is password protected.
        </p>
        <input
          className="input"
          type="password"
          autoFocus
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="mt-2 text-[12px] text-red-300">{error}</p>}
        <button className="btn btn-primary mt-4 w-full" disabled={busy || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
