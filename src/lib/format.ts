/** Format parameter counts as compact strings (e.g., 235100000000 → "235B"). */
export function formatParams(
  n: number | null | undefined,
  decimals = 1,
): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1e12) return trim(n / 1e12, decimals) + "T";
  if (n >= 1e9) return trim(n / 1e9, decimals) + "B";
  if (n >= 1e6) return trim(n / 1e6, decimals) + "M";
  return n.toString();
}

function trim(x: number, decimals: number): string {
  const s = x.toFixed(decimals);
  // Only strip trailing zeros that follow a decimal point — otherwise
  // "10" would collapse to "1".
  if (!s.includes(".")) return s;
  return s.replace(/\.?0+$/, "");
}

/** Format byte counts as GB-style strings. */
export function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "—";
  const gb = n / 1e9;
  if (gb >= 100) return `${Math.round(gb)} GB`;
  if (gb >= 10) return `${gb.toFixed(0)} GB`;
  return `${gb.toFixed(1)} GB`;
}

/** Score formatter — preserves 0-1 fraction precision or 0-100 integer-ish display. */
export function formatScore(
  v: number | null | undefined,
  maxValue: number,
): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (maxValue <= 1) return (v * 100).toFixed(1);
  return v.toFixed(1);
}
