/**
 * GGUF Q4_K_M size — formula estimate.
 *
 * llama.cpp's K-quants at "medium" quality average ~4.6-5.0 bits per weight
 * including per-block scale/zero overhead, so ~0.6 bytes/param is a workable
 * middle estimate across model sizes. Empirical real-world files (Qwen2.5-7B
 * Q4_K_M ≈ 4.68 GB, Llama 3 70B Q4_K_M ≈ 40 GB) sit ~5-15% above this.
 *
 * For MoE models the GGUF packs every expert weight (not just the active set),
 * so size scales with total params, not active.
 */
const BYTES_PER_PARAM_Q4_K_M = 0.6;

export function estimateQ4KMBytes(
  totalParams: number | null | undefined,
): number | null {
  if (totalParams == null || !Number.isFinite(totalParams) || totalParams <= 0)
    return null;
  return totalParams * BYTES_PER_PARAM_Q4_K_M;
}
