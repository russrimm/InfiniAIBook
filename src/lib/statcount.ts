/** The number a stat card counts up to, split so the rest of the value stays put. */
export const NUMBER = /^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$/;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const outCubic = (u: number) => 1 - (1 - u) ** 3;

/** The stat's text `u` (0 to 1) of the way through its count-up. */
export function statText(value: string, u: number): string {
  const m = NUMBER.exec(value);
  if (!m || u >= 1) return value;
  const raw = m[2];
  const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
  const v = parseFloat(raw.replace(/,/g, "")) * outCubic(clamp01(u));
  const text = raw.includes(",")
    ? v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : v.toFixed(decimals);
  return `${m[1]}${text}${m[3]}`;
}
