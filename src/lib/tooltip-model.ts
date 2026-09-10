/**
 * Reactive derivation of the tooltip's "selected metric" view: which
 * benchmark the Index dropdown is showing, and the selected model's score
 * for it.
 *
 * This lives outside Tooltip.tsx because the naive way to write it — as
 * plain `const`s inside <Show>'s render-prop callback — is broken: Solid's
 * non-keyed <Show> only re-invokes that callback when the resolved value
 * flips between falsy/truthy (see its `equals: (a, b) => !a === !b` on the
 * condition memo). Switching the selection from one model to another (both
 * truthy) does not re-run the callback body, so a plain `const` computed
 * there freezes at whichever model was selected first — only accessor reads
 * inside JSX (which Solid's compiler wraps in their own tracked scope) keep
 * updating. `createMemo`d here, outside any <Show>, sidesteps that entirely.
 */
import { createMemo, type Accessor } from "solid-js";
import { METRICS_BY_ID, type MetricInfo } from "./metrics";
import type { MetricId, ModelRecord } from "./models";

export interface SelectedMetricView {
  info: MetricInfo;
  primary: number | null | undefined;
}

export function createSelectedMetricView(
  model: Accessor<ModelRecord | null>,
  metric: Accessor<MetricId>,
): Accessor<SelectedMetricView | null> {
  return createMemo(() => {
    const m = model();
    if (!m) return null;
    const met = metric();
    return { info: METRICS_BY_ID.get(met)!, primary: m.scores[met] };
  });
}
