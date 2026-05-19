import { createSignal, onCleanup, onMount } from "solid-js";

const MOBILE_MAX = 639;

/** Returns a signal that is true on small viewports (Tailwind sm-). SSR-safe (assumes desktop). */
export function useIsMobile() {
  const [isMobile, setIsMobile] = createSignal(false);
  onMount(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_MAX}px)`);
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    onCleanup(() => mq.removeEventListener("change", sync));
  });
  return isMobile;
}
