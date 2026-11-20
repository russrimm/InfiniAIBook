"use client";

import { useEffect, useRef, useState } from "react";
import { readJSONReply } from "@/lib/jsonreply";
import { useDialog } from "./useDialog";

type Summary = {
  createdAt: string;
  appVersion: string;
  counts: { notebooks: number; sources: number; artifacts: number; notes: number; messages: number };
  fileCount: number;
  totalBytes: number;
  archiveBytes: number;
};
type InboxFile = { name: string; bytes: number; modified: string };
type InboxReply = { inbox: InboxFile[]; inboxPath: string; inboxName: string; maxUploadBytes: number; error?: string };
type Staged = { token: string; summary: Summary; label: string };

const mb = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1024 ** 2))} MB`);
const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export default function BackupModal({ onClose }: { onClose: () => void }) {
  const { dialogRef, backdropProps } = useDialog(onClose);
  const fileRef = useRef<HTMLInputElement>(null);
  const [inbox, setInbox] = useState<InboxReply | null>(null);
  const [staged, setStaged] = useState<Staged | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<"check" | "restore" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState<{ previousFolder: string } | null>(null);

  useEffect(() => {
    void fetch("/api/backup/restore")
      .then((r) => readJSONReply<InboxReply>(r))
      .then(setInbox)
      .catch(() => {});
  }, []);

  const discard = (token: string) => {
    void fetch(`/api/backup/restore/${token}`, { method: "DELETE" }).catch(() => {});
  };

  const stage = async (init: RequestInit, label: string) => {
    setBusy("check");
    setError(null);
    if (staged) discard(staged.token);
    setStaged(null);
    setConfirmed(false);
    try {
      const res = await fetch("/api/backup/restore", { method: "POST", ...init });
      const j = await readJSONReply<{ token: string; summary: Summary; error?: string }>(res, "Could not check that backup.");
      setStaged({ token: j.token, summary: j.summary, label });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check that backup.");
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    if (!staged) return;
    setBusy("restore");
    setError(null);
    try {
      const res = await fetch(`/api/backup/restore/${staged.token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: "replace" }),
      });
      const j = await readJSONReply<{ previousFolder: string; error?: string }>(res, "The restore failed. Your data was not changed.");
      setRestored({ previousFolder: j.previousFolder });
      setStaged(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The restore failed. Your data was not changed.");
    } finally {
      setBusy(null);
    }
  };

  const close = () => {
    if (staged && !restored) discard(staged.token);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" {...backdropProps}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="backup-title"
        data-testid="backup-modal"
        className="fade-up card flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden !p-0 outline-none"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-5 py-3">
          <h2 id="backup-title" className="flex-1 text-[15px] font-semibold">
            Backup and restore
          </h2>
          <button aria-label="Close" className="btn !px-2.5 !py-1.5 !text-xs" onClick={close}>
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4 text-[13px] leading-relaxed">
          <section aria-labelledby="backup-export">
            <h3 id="backup-export" className="mb-1 text-sm font-semibold">
              Back up everything
            </h3>
            <p className="text-[var(--muted)]">
              One ZIP with every notebook, source, chat, note and generated item, plus your music, watermarks, video clips and rendered media.
              It never includes API keys or .env files. You can keep working while it downloads.
            </p>
            <a className="btn btn-primary mt-3 inline-flex" href="/api/backup" download>
              Download backup (.zip)
            </a>
          </section>

          <section aria-labelledby="backup-restore">
            <h3 id="backup-restore" className="mb-1 text-sm font-semibold">
              Restore from a backup
            </h3>
            {restored ? (
              <div role="status" className="rounded-xl border border-emerald-700/50 bg-emerald-950/30 p-3 text-emerald-200">
                <p className="font-medium">Restored. Reload to see your notebooks.</p>
                <p className="mt-1 text-xs opacity-90">
                  Your previous data was kept in <code className="break-all">{restored.previousFolder}</code> on the server. Delete that
                  folder when you no longer need it.
                </p>
                <button className="btn btn-primary mt-3" onClick={() => window.location.reload()}>
                  Reload
                </button>
              </div>
            ) : (
              <>
                <p className="text-[var(--muted)]">
                  Restoring replaces everything on this server with the backup. The backup is checked first, and your current data is
                  kept aside until you delete it.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button className="btn" disabled={busy !== null} onClick={() => fileRef.current?.click()}>
                    {busy === "check" ? "Checking…" : "Choose a backup (.zip)"}
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".zip,application/zip"
                    className="sr-only"
                    aria-label="Choose a backup ZIP to restore"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void stage({ headers: { "content-type": "application/zip" }, body: file }, file.name);
                    }}
                  />
                  <span className="text-xs text-[var(--muted)]">Up to {mb(inbox?.maxUploadBytes ?? 200 * 1024 ** 2)} by upload.</span>
                </div>

                {inbox && inbox.inbox.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-[var(--muted)]">
                      Or restore a larger backup that you copied into the <code>{inbox.inboxName}</code> folder in the data folder:
                    </p>
                    <ul className="mt-1 space-y-1">
                      {inbox.inbox.map((f) => (
                        <li key={f.name} className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate">
                            {f.name} <span className="text-xs text-[var(--muted)]">({mb(f.bytes)})</span>
                          </span>
                          <button
                            className="btn !px-2.5 !py-1 !text-xs"
                            disabled={busy !== null}
                            onClick={() =>
                              void stage(
                                { headers: { "content-type": "application/json" }, body: JSON.stringify({ inbox: f.name }) },
                                f.name,
                              )
                            }
                          >
                            Check
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {inbox && inbox.inbox.length === 0 && (
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    Backups over {mb(inbox.maxUploadBytes)}: copy the ZIP into the <code>{inbox.inboxName}</code> folder inside the data
                    folder, then reopen this window.
                  </p>
                )}

                {staged && (
                  <div className="mt-4 rounded-xl border border-[var(--border)] bg-well p-3" data-testid="backup-staged">
                    <p className="font-medium">{staged.label} is a valid backup.</p>
                    <p className="mt-1 text-[var(--muted)]">
                      Made {new Date(staged.summary.createdAt).toLocaleString()} (version {staged.summary.appVersion}):{" "}
                      {count(staged.summary.counts.notebooks, "notebook")}, {count(staged.summary.counts.sources, "source")},{" "}
                      {count(staged.summary.counts.artifacts, "generated item")} and {count(staged.summary.fileCount, "media file")} (
                      {mb(staged.summary.totalBytes)} unpacked).
                    </p>
                    <label className="mt-3 flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={confirmed}
                        onChange={(e) => setConfirmed(e.target.checked)}
                      />
                      <span>I understand this replaces all notebooks, sources, generated items and media on this server.</span>
                    </label>
                    <div className="mt-3 flex gap-2">
                      <button className="btn btn-primary" disabled={!confirmed || busy !== null} onClick={() => void restore()}>
                        {busy === "restore" ? "Restoring… this can take several minutes" : "Replace my data with this backup"}
                      </button>
                      <button
                        className="btn"
                        disabled={busy !== null}
                        onClick={() => {
                          discard(staged.token);
                          setStaged(null);
                          setConfirmed(false);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
            {error && (
              <p role="alert" className="mt-3 rounded-xl border border-red-900/60 bg-red-950/30 px-3 py-2 text-red-300">
                {error}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
