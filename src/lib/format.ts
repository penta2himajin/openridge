/** Format parameter counts as compact strings (e.g., 235100000000 → "235B"). */
export function formatParams(n: number | null | undefined, decimals = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1e12) return trim(n / 1e12, decimals) + "T";
  if (n >= 1e9) return trim(n / 1e9, decimals) + "B";
  if (n >= 1e6) return trim(n / 1e6, decimals) + "M";
  return n.toString();
}

function trim(x: number, decimals: number): string {
  return x.toFixed(decimals).replace(/\.?0+$/, "");
}

/** Score formatter — preserves 0-1 fraction precision or 0-100 integer-ish display. */
export function formatScore(v: number | null | undefined, maxValue: number): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (maxValue <= 1) return (v * 100).toFixed(1);
  return v.toFixed(1);
}
