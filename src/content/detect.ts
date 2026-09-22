/**
 * Finding the file input behind an upload control.
 *
 * The visible thing a user clicks is rarely the input itself. It is usually a
 * button or a styled label, with the real `<input type="file">` hidden
 * somewhere nearby. This module answers one question — "which input would this
 * click have opened?" — and nothing else, so the rule lives in one place
 * rather than being spread through the UI.
 */

/** A file input Plop is willing to take over. */
function usable(input: HTMLInputElement | null): HTMLInputElement | null {
  if (!input || input.type !== "file" || input.disabled) return null;
  return input;
}

/** Walks up out of nested shadow roots as well as the normal tree. */
function ancestors(start: Element): Element[] {
  const chain: Element[] = [];
  let node: Element | null = start;
  while (node) {
    chain.push(node);
    const parent: Element | null =
      node.parentElement ??
      ((node.getRootNode() as ShadowRoot).host as Element | undefined) ??
      null;
    node = parent;
  }
  return chain;
}

/**
 * The file input a click on `target` would open, or null when the click has
 * nothing to do with uploading.
 */
export function fileInputFor(target: Element): HTMLInputElement | null {
  for (const node of ancestors(target)) {
    // The input itself.
    const direct = usable(node as HTMLInputElement);
    if (direct) return direct;

    // A label, whether it wraps the input or points at it by id.
    if (node instanceof HTMLLabelElement) {
      const bound = usable(node.control as HTMLInputElement | null);
      if (bound) return bound;
      const inside = usable(node.querySelector('input[type="file"]'));
      if (inside) return inside;
    }

    // A button or wrapper with the input hidden inside it. Kept to a shallow
    // look: a match further away than this is a guess, and guessing wrong
    // means hijacking a control that was never an upload.
    if (node instanceof HTMLElement && node !== target) {
      const nested = usable(node.querySelector(':scope > input[type="file"]'));
      if (nested) return nested;
    }
  }

  return null;
}

/**
 * True when Plop should not interfere: a control asking for a directory, or
 * for capture from a camera, is not something Plop can serve.
 */
export function isOutOfScope(input: HTMLInputElement): boolean {
  return input.hasAttribute("webkitdirectory") || input.hasAttribute("capture");
}
