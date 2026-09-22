/**
 * Keeps a surface mounted long enough to animate itself out.
 *
 * A surface that is simply unmounted vanishes, and a dismissal that vanishes
 * reads as a glitch rather than a decision. `usePresence` holds the element in
 * the tree for the length of its exit and reports which phase it is in, so the
 * caller only has to flip one boolean.
 */

import { useEffect, useRef, useState } from "preact/hooks";

/** Kept in step with `--plop-dur-dismiss` in tokens.css. */
const EXIT_MS = 160;

export function usePresence(open: boolean, exitMs = EXIT_MS) {
  const [mounted, setMounted] = useState(open);
  const [exiting, setExiting] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    clearTimeout(timer.current);
    if (open) {
      setMounted(true);
      setExiting(false);
      return;
    }
    if (!mounted) return;
    setExiting(true);
    timer.current = window.setTimeout(() => {
      setMounted(false);
      setExiting(false);
    }, exitMs);
    return () => clearTimeout(timer.current);
  }, [open, exitMs, mounted]);

  return { mounted, exiting };
}

/**
 * Closes a surface when the pointer goes down anywhere outside it, or on
 * Escape.
 *
 * Listens on `pointerdown` rather than `click`: a click fires after the press
 * completes, which loses to anything that re-renders in between.
 *
 * The press that opened the surface must not also close it. That is guarded
 * with a timestamp rather than by deferring attachment to the next frame —
 * `requestAnimationFrame` is throttled in a background or hidden tab, and a
 * listener that attaches "next frame" may not attach for seconds.
 */
export function useDismiss(
  ref: { current: HTMLElement | null },
  onDismiss: () => void,
  active = true
) {
  const handler = useRef(onDismiss);
  handler.current = onDismiss;

  useEffect(() => {
    if (!active) return;
    const attachedAt = performance.now();

    const outside = (event: PointerEvent) => {
      // Anything dispatched before this listener existed is the press that
      // opened the surface, replayed through a capture phase we joined late.
      if (event.timeStamp < attachedAt) return;
      const el = ref.current;
      const target = event.target as Node | null;
      // A press inside any Plop surface — including one in a different layer,
      // like the settings panel — is never "outside".
      if (!el || !target) return;
      if (el.contains(target)) return;
      if ((target as Element).closest?.(".plop-surface")) return;
      handler.current();
    };

    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") handler.current();
    };

    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", escape);

    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("keydown", escape);
    };
  }, [ref, active]);
}
