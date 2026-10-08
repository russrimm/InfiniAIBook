"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { useDialog } from "./useDialog";

export type ConfirmOptions = {
  title: string;
  /** What will happen, in a sentence. Say what is lost and whether it can be undone. */
  message?: string;
  /** Names the action ("Delete notebook"), never a bare "OK". */
  confirmLabel: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive and focuses Cancel first. */
  destructive?: boolean;
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

const ConfirmContext = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null);

function ConfirmModal({ pending, onAnswer }: { pending: Pending; onAnswer: (ok: boolean) => void }) {
  const { dialogRef, backdropProps } = useDialog(() => onAnswer(false));
  const destructive = pending.destructive ?? false;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      {...backdropProps}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={pending.message ? "confirm-message" : undefined}
        className="fade-up w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 outline-none"
      >
        <h2 id="confirm-title" className="text-[15px] font-semibold">
          {pending.title}
        </h2>
        {pending.message && (
          <p id="confirm-message" className="mt-1.5 text-[13px] leading-relaxed text-[var(--muted)]">
            {pending.message}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn" autoFocus={destructive} onClick={() => onAnswer(false)}>
            {pending.cancelLabel ?? "Cancel"}
          </button>
          <button
            className={
              destructive
                ? "btn !border-red-900/60 !bg-red-950/30 !text-red-300 hover:!bg-red-950/50"
                : "btn btn-primary"
            }
            autoFocus={!destructive}
            onClick={() => onAnswer(true)}
          >
            {pending.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Themed, keyboard-safe replacement for window.confirm(), which cannot follow
 * the app's theme, hides what the buttons do behind "OK / Cancel", and blocks
 * the page. `await confirm({...})` resolves true only on the confirm button.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const current = useRef<Pending | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        // A second request while one is open answers the first with "no".
        current.current?.resolve(false);
        const next = { ...options, resolve };
        current.current = next;
        setPending(next);
      }),
    []
  );

  const answer = (ok: boolean) => {
    current.current?.resolve(ok);
    current.current = null;
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && <ConfirmModal pending={pending} onAnswer={answer} />}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return confirm;
}
