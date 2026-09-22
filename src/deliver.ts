/**
 * Handing an item to something on the page.
 *
 * Plop has three kinds of destination, and each takes things differently:
 *
 *   · a file input — real File objects, through a DataTransfer;
 *   · a text field or rich editor — text typed in at the caret, or a file
 *     offered the way a paste would offer it;
 *   · nothing at all — the user opened Plop with the shortcut and has not
 *     said where things go yet; a drag is the only way from there.
 *
 * Everything here goes in the way the user's own input would, so the site
 * sees ordinary input events, and Ctrl+Z undoes typed-in text.
 */

import { fillFileInput, splitName, type PlopItem } from "./types.ts";

/** Input types that hold plain text a user types. */
const TEXT_INPUTS = new Set(["text", "search", "email", "url", "tel", "password", ""]);

export function isFileInput(el: Element | null): el is HTMLInputElement {
  return el instanceof HTMLInputElement && el.type === "file";
}

/** A field the user could type into right now. */
export function isEditable(el: Element | null): el is HTMLElement {
  if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly;
  if (el instanceof HTMLInputElement) {
    return TEXT_INPUTS.has(el.type) && !el.disabled && !el.readOnly;
  }
  return el instanceof HTMLElement && el.isContentEditable;
}

/**
 * The field that owns `el`, if any. Inside a rich editor the element under
 * the pointer is some paragraph or span; what takes focus is the editor
 * itself, the outermost element still editable.
 */
export function editableAt(el: Element | null): HTMLElement | null {
  if (!isEditable(el)) return null;
  let host: HTMLElement = el;
  while (host.parentElement?.isContentEditable) host = host.parentElement;
  return host;
}

/** A text item as the file an upload field needs. */
export function textAsFile(content: string): File {
  return new File([content], "Clipboard.txt", { type: "text/plain" });
}

/**
 * Whether a file input's `accept` list allows this file. An input without
 * one takes anything.
 */
export function accepts(input: HTMLInputElement, file: File): boolean {
  const rules = input.accept.split(",").map((rule) => rule.trim().toLowerCase()).filter(Boolean);
  if (!rules.length) return true;
  const ext = splitName(file.name)[1].toLowerCase();
  const type = file.type.toLowerCase();
  return rules.some((rule) =>
    rule.startsWith(".")
      ? rule === ext
      : rule.endsWith("/*")
        ? type.startsWith(rule.slice(0, -1))
        : rule === type
  );
}

/**
 * Remembers where the caret is in a field, so it can be put back after the
 * user has clicked around inside Plop. Returns the function that restores it.
 */
export function saveCaret(el: HTMLElement): () => void {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const start = el.selectionStart;
    const end = el.selectionEnd;
    return () => {
      el.focus();
      if (start !== null && end !== null) el.setSelectionRange(start, end);
    };
  }
  const selection = getSelection();
  const range =
    selection?.rangeCount && el.contains(selection.anchorNode)
      ? selection.getRangeAt(0).cloneRange()
      : null;
  return () => {
    el.focus();
    if (!range) return;
    const current = getSelection();
    current?.removeAllRanges();
    current?.addRange(range);
  };
}

/** Puts the caret where a drop landed: at the point in a rich editor, at the
 *  end of a plain field (which has no way to ask "which character is here"). */
export function caretAtPoint(el: HTMLElement, x: number, y: number) {
  el.focus();
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.setSelectionRange(el.value.length, el.value.length);
    return;
  }
  const range = document.caretRangeFromPoint?.(x, y);
  if (!range) return;
  const selection = getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/**
 * Types text in at the caret of the focused field. `insertText` is the one
 * route that behaves like typing: the site gets its input events and the
 * browser's undo history records it.
 */
export function insertText(el: HTMLElement, text: string): boolean {
  if (document.execCommand("insertText", false, text)) return true;
  // Some fields refuse execCommand; write the value directly as a fallback.
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.setRangeText(text, el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length, "end");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }
  return false;
}

/**
 * Offers a file to a rich editor the way pasting one would. Editors that take
 * pasted files (mail, chat, docs) read it and cancel the event, which is how
 * Plop knows it landed.
 */
export function pasteFile(el: HTMLElement, file: File): boolean {
  const clipboardData = new DataTransfer();
  clipboardData.items.add(file);
  const event = new ClipboardEvent("paste", {
    clipboardData,
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  return !el.dispatchEvent(event);
}

export type Delivery = { ok: true } | { ok: false; reason: string };

/**
 * Hands `item` to `target`. `restoreCaret` puts the caret back where the user
 * left it before anything is typed; pass it when the user has been clicking
 * inside Plop since.
 */
export function deliverTo(
  target: HTMLElement | null,
  item: PlopItem,
  restoreCaret?: () => void
): Delivery {
  if (!target) {
    return { ok: false, reason: "Click into a field first, or drag this onto one." };
  }

  if (isFileInput(target)) {
    const file = item.kind === "text" ? textAsFile(item.content) : item.file;
    if (!file) return { ok: false, reason: "This item has no file to upload." };
    if (!accepts(target, file)) {
      const ext = splitName(file.name)[1] || file.type || "this kind of";
      return { ok: false, reason: `This field doesn't take ${ext} files.` };
    }
    fillFileInput(target, [file]);
    return { ok: true };
  }

  restoreCaret?.();
  if (item.kind === "text") {
    return insertText(target, item.content)
      ? { ok: true }
      : { ok: false, reason: "This field didn't take the text." };
  }
  if (item.file && pasteFile(target, item.file)) return { ok: true };
  return { ok: false, reason: "This field doesn't take files. Try an upload area." };
}
