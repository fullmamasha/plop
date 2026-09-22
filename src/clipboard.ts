/**
 * Reading the system clipboard.
 *
 * There are two clipboards, and they do not hold the same things:
 *
 *   · `navigator.clipboard.read()` — needs a user gesture and the
 *     `clipboard-read` permission. It only exposes what the browser is willing
 *     to hand over from the async clipboard: text, HTML, and images. **A file
 *     copied in Explorer or Finder is not there at all.** Copy a `.svg`,
 *     `.pdf` or `.md` and this returns nothing for it — not a bug in the read,
 *     a limit of the API.
 *
 *   · the `paste` event's `clipboardData.files` — real `File` objects of any
 *     type, but only available while the user is actually pasting.
 *
 * So Plop uses both: it reads what it can on opening, and listens for a paste
 * for everything else.
 */

import { canPreview, type PlopItem } from "./types";

export type ClipboardResult =
  | { ok: true; items: PlopItem[] }
  | { ok: false; reason: string };

/** Extension for a mime type, e.g. "image/svg+xml" → "svg". */
function extensionFor(mimeType: string): string {
  const subtype = mimeType.split("/")[1] ?? "bin";
  return subtype.split("+")[0];
}

function fileItem(file: File): PlopItem {
  return {
    id: `clip-${crypto.randomUUID()}`,
    kind: "file",
    name: file.name,
    mimeType: file.type,
    size: file.size,
    preview: canPreview(file.type) ? URL.createObjectURL(file) : undefined,
    file,
    createdAt: Date.now(),
  };
}

function textItem(content: string): PlopItem {
  return {
    id: `clip-${crypto.randomUUID()}`,
    kind: "text",
    content,
    createdAt: Date.now(),
  };
}

/** Items from a paste event — any file type, because these are real Files. */
export function itemsFromPaste(event: ClipboardEvent): PlopItem[] {
  const data = event.clipboardData;
  if (!data) return [];

  const files = [...data.files];
  if (files.length) return files.map(fileItem);

  const text = data.getData("text/plain").trim();
  return text ? [textItem(text)] : [];
}

export async function readClipboard(): Promise<ClipboardResult> {
  if (!navigator.clipboard?.read) {
    return {
      ok: false,
      reason:
        "The clipboard API is unavailable — it needs a secure context (https or localhost).",
    };
  }

  let contents: ClipboardItems;
  try {
    contents = await navigator.clipboard.read();
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Clipboard access was denied. Allow it for this site and try again."
          : `Could not read the clipboard: ${String(error)}`,
    };
  }

  const items: PlopItem[] = [];
  for (const entry of contents) {
    // Anything that is not plain text or HTML is treated as a file, whatever
    // its type — an earlier version only looked for `image/*`, which dropped
    // svg, pdf and everything else a web app can put on the clipboard.
    const fileType = entry.types.find(
      (type) => type !== "text/plain" && type !== "text/html"
    );
    if (fileType) {
      const blob = await entry.getType(fileType);
      const file = new File([blob], `Clipboard.${extensionFor(fileType)}`, {
        type: fileType,
      });
      items.push(fileItem(file));
      continue;
    }

    if (entry.types.includes("text/plain")) {
      const text = (await (await entry.getType("text/plain")).text()).trim();
      if (text) items.push(textItem(text));
    }
  }

  return items.length
    ? { ok: true, items }
    : {
        ok: false,
        reason:
          "Nothing readable on the clipboard. Files copied from Explorer or Finder are not visible to a web page — press Ctrl+V (Cmd+V) with Plop open to paste one in.",
      };
}
