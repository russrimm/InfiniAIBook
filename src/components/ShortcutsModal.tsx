"use client";

import { SHORTCUTS } from "@/lib/shortcuts";
import { useDialog } from "./useDialog";

export default function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const { dialogRef, backdropProps } = useDialog(onClose);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      {...backdropProps}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        className="fade-up card flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden !p-0 outline-none"
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-5 py-3">
          <h2 id="shortcuts-title" className="flex-1 text-[15px] font-semibold">
            Keyboard shortcuts
          </h2>
          <button aria-label="Close" className="btn !px-2.5 !py-1.5 !text-xs" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <table className="w-full text-left text-[13px]">
            <caption className="sr-only">Keys and what they do</caption>
            <thead className="text-[11px] text-[var(--muted)]">
              <tr>
                <th scope="col" className="pb-2 font-medium">Keys</th>
                <th scope="col" className="pb-2 font-medium">What it does</th>
                <th scope="col" className="pb-2 font-medium">Where</th>
              </tr>
            </thead>
            <tbody>
              {SHORTCUTS.map((s) => (
                <tr key={`${s.where}-${s.keys.join("+")}`} className="border-t border-[var(--border)] align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {s.keys.map((k, i) => (
                      <span key={k}>
                        {i > 0 && <span className="text-[var(--muted)]"> + </span>}
                        <kbd className="rounded border border-[var(--border)] bg-well px-1.5 py-0.5 font-mono text-[11px]">
                          {k}
                        </kbd>
                      </span>
                    ))}
                  </td>
                  <td className="py-2 pr-3">{s.does}</td>
                  <td className="py-2 text-[var(--muted)]">{s.where}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-[var(--muted)]">
            Letter shortcuts are off while you are typing in a field, and when Ctrl, Alt or Cmd is held.
          </p>
        </div>
      </div>
    </div>
  );
}
