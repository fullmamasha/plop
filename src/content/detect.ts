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
  }

  // Deliberately no search for an input "near" the target. A button that
  // opens a hidden input does so by calling input.click(), and that click
  // arrives here with the input itself as its target — so it is caught above
  // without guessing. Guessing is what went wrong before: a look for a child
  // input at every ancestor reached <body>, and on a page with a hidden
  // input directly in <body> every click anywhere opened Plop.
  //
  // ponytail: input.showPicker() opens a dialog without dispatching a click,
  // so those controls get the native dialog. Catching it would mean patching
  // the page's own HTMLInputElement.prototype from its main world.

  return null;
}

/**
 * True when Plop should not interfere: a control asking for a directory, or
 * for capture from a camera, is not something Plop can serve.
 */
export function isOutOfScope(input: HTMLInputElement): boolean {
  return input.hasAttribute("webkitdirectory") || input.hasAttribute("capture");
}
