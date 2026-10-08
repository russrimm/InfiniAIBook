/** The InfiniAIBook mark. Decorative: the name always sits beside it. */
export default function Logo({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a small static brand asset; no optimizer needed
    <img
      src="/brand/infiniaibook-mark.png"
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={`inline-block shrink-0 ${className}`}
    />
  );
}
