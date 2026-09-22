/**
 * Dragging an item out of the widget.
 *
 * A card can be picked up and carried to a drop zone on the host page, not
 * just clicked. The card itself cannot travel — it sits inside two
 * `overflow: hidden` boxes — so a ghost is rendered at the root and follows
 * the pointer while the original dims in place.
 *
 * If the drop misses, the ghost flies back to where it came from, fading and
 * blurring as it goes, and the original comes back up. Nothing is lost by
 * letting go in the wrong place.
 *
 * NOTE: the ghost is `position: fixed`, which is only free of the surface's
 * clipping while no ancestor of `.plop-root` sets `transform`, `filter` or
 * `backdrop-filter` — those make a containing block for fixed children. The
 * surface does set `filter`, which is why the ghost is a sibling of it rather
 * than a child.
 */

import { useEffect, useRef, useState } from "preact/hooks";
import type { PlopItem } from "../types";

/** Pointer travel before a press becomes a drag rather than a click. */
const DRAG_THRESHOLD = 6;
/** Kept in step with the flight transition in plop.css. */
const RETURN_MS = 320;

/** Anything the host page marks, plus real file inputs. */
const DROP_SELECTOR = '[data-plop-dropzone], input[type="file"]';

/** The element the item was released on comes along: the caller decides what
 *  a given kind of target does with it. */
export type DropHandler = (item: PlopItem, target: Element) => void;

export type DragState = {
  item: PlopItem;
  /** Where the card was when it was picked up. */
  origin: DOMRect;
  /** Pointer travel since pickup. */
  dx: number;
  dy: number;
  /** Flying home after a missed drop. */
  returning: boolean;
};

export function useCardDrag(onDrop: DropHandler) {
  const [drag, setDrag] = useState<DragState | null>(null);
  // Held in refs so the always-on window handlers never close over a stale
  // value, and so attaching them does not depend on a state change landing.
  const session = useRef<{
    item: PlopItem;
    origin: DOMRect;
    startX: number;
    startY: number;
    pointerId: number;
    active: boolean;
  } | null>(null);
  const drop = useRef(onDrop);
  drop.current = onDrop;

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const s = session.current;
      if (!s || event.pointerId !== s.pointerId) return;
      const dx = event.clientX - s.startX;
      const dy = event.clientY - s.startY;
      if (!s.active && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      s.active = true;
      setDrag({ item: s.item, origin: s.origin, dx, dy, returning: false });
    };

    const up = (event: PointerEvent) => {
      const s = session.current;
      if (!s || event.pointerId !== s.pointerId) return;
      session.current = null;
      if (!s.active) return; // never moved: it was a click, not a drag

      const under = document.elementFromPoint(event.clientX, event.clientY);
      const target = under?.closest(DROP_SELECTOR);
      if (target) {
        drop.current(s.item, target);
        setDrag(null);
        return;
      }

      // Missed. Fly home, then restore the original.
      setDrag((current) => (current ? { ...current, returning: true } : null));
      setTimeout(() => setDrag(null), RETURN_MS);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  const start = (item: PlopItem, event: PointerEvent) => {
    // Only a plain left-button press starts a drag.
    if (event.button !== 0) return;
    // Stops the press turning into a text selection as the pointer travels.
    event.preventDefault();
    const el = event.currentTarget as HTMLElement;
    session.current = {
      item,
      origin: el.getBoundingClientRect(),
      startX: event.clientX,
      startY: event.clientY,
      pointerId: event.pointerId,
      active: false,
    };
  };

  return {
    drag,
    start,
    /** True while this item is the one being carried. */
    isDragging: (item: PlopItem) => drag?.item.id === item.id,
  };
}

/** The card that follows the pointer. Rendered outside the clipped surface. */
export function DragGhost({
  drag,
  children,
}: {
  drag: DragState | null;
  children: preact.ComponentChildren;
}) {
  if (!drag) return null;
  const { origin, dx, dy, returning } = drag;
  return (
    <div
      class={`plop-ghost${returning ? " is-returning" : ""}`}
      aria-hidden="true"
      style={{
        left: `${origin.left}px`,
        top: `${origin.top}px`,
        width: `${origin.width}px`,
        height: `${origin.height}px`,
        transform: returning ? "none" : `translate(${dx}px, ${dy}px)`,
      }}
    >
      {children}
    </div>
  );
}
