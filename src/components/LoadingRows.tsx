/** Placeholder rows shown while a modal's list or document loads. */
export default function LoadingRows({ rows = 4, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          aria-hidden
          className="shimmer h-12 rounded-xl border border-[var(--border)] bg-sunk"
          style={{ opacity: 1 - i * 0.18 }}
        />
      ))}
    </div>
  );
}