/**
 * Plop's own scrollbar.
 *
 * The native bar is hidden everywhere in the UI, so this is the only scroll
 * affordance the user gets: it has to track position *and* be grabbable. One
 * component serves the widget's horizontal rail and the settings panel's
 * vertical overflow.
 */

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { RefObject } from "preact";

type Axis = "x" | "y";

/** Per-axis property names, so the maths below is written once. */
const AXIS = {
  x: {
    size: "clientWidth",
    scrollSize: "scrollWidth",
    offset: "scrollLeft",
    client: "clientX",
    rectStart: "left",
    rectSize: "width",
  },
  y: {
    size: "clientHeight",
    scrollSize: "scrollHeight",
    offset: "scrollTop",
    client: "clientY",
    rectStart: "top",
    rectSize: "height",
  },
} as const;

export function ScrollBar({
  target,
  axis,
  /** Re-measure when this changes — content that grows or shrinks. */
  watch,
  label,
  /** Keeps the track clear of sticky edges, in px: [start, end]. */
  inset,
}: {
  target: RefObject<HTMLElement>;
  axis: Axis;
  watch?: unknown;
  label: string;
  inset?: [number, number];
}) {
  const track = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ size: 100, start: 0 });
  const [dragging, setDragging] = useState(false);
  const a = AXIS[axis];

  const measure = useCallback(() => {
    const el = target.current;
    if (!el) return;
    const ratio = Math.min(1, el[a.size] / el[a.scrollSize]);
    const travel = 100 - ratio * 100;
    const max = el[a.scrollSize] - el[a.size];
    const progress = max <= 0 ? 0 : el[a.offset] / max;
    setThumb({ size: ratio * 100, start: travel * progress });
  }, [target, a]);

  useEffect(() => {
    const el = target.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of el.children) observer.observe(child);
    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure, target, watch]);

  /** Maps a pointer position on the track to a scroll offset on the target. */
  const scrollToPointer = (event: PointerEvent) => {
    const el = target.current;
    const bar = track.current;
    if (!el || !bar) return;
    const rect = bar.getBoundingClientRect();
    const thumbSize = (el[a.size] / el[a.scrollSize]) * rect[a.rectSize];
    const usable = rect[a.rectSize] - thumbSize;
    if (usable <= 0) return;
    const offset = event[a.client] - rect[a.rectStart] - thumbSize / 2;
    const progress = Math.min(1, Math.max(0, offset / usable));
    el[a.offset] = progress * (el[a.scrollSize] - el[a.size]);
  };

  // Nothing to scroll: no bar. A track with a full-width thumb is just noise.
  if (thumb.size >= 100) return null;

  return (
    <div
      class={`plop-scrollbar plop-scrollbar--${axis}${
        dragging ? " is-dragging" : ""
      }`}
      ref={track}
      role="scrollbar"
      aria-label={label}
      aria-orientation={axis === "x" ? "horizontal" : "vertical"}
      aria-valuenow={Math.round(thumb.start)}
      style={
        inset && axis === "y"
          ? { top: `${inset[0]}px`, bottom: `${inset[1]}px` }
          : inset
            ? { left: `${inset[0]}px`, right: `${inset[1]}px` }
            : undefined
      }
      onPointerDown={(event) => {
        const bar = track.current;
        if (!bar) return;
        try {
          bar.setPointerCapture(event.pointerId);
        } catch {
          /* no capture: dragging works while the pointer stays on the bar */
        }
        setDragging(true);
        scrollToPointer(event);
      }}
      onPointerMove={(event) => dragging && scrollToPointer(event)}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
    >
      {/* Absolutely positioned: a percentage margin resolves against the
          containing block's *width* on both axes, so a vertical bar driven by
          margin-top simply never moved. */}
      <div
        class="plop-scrollbar__thumb"
        style={
          axis === "x"
            ? { width: `${thumb.size}%`, left: `${thumb.start}%` }
            : { height: `${thumb.size}%`, top: `${thumb.start}%` }
        }
      />
    </div>
  );
}
