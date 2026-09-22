/**
 * Where Plop keeps items that must outlive a page load: pinned files and
 * recent uploads.
 *
 * `chrome.storage.local`, because it belongs to the extension. IndexedDB
 * looks like the natural home for files, but a content script's IndexedDB is
 * the *website's* — every site would get its own separate pins, the popup
 * would see none of them, and the site itself could read them. Extension
 * storage is one store shared by every page and the popup, invisible to
 * websites, and kept across extension updates (only uninstalling clears it).
 *
 * The cost is that it holds JSON, so file bytes are stored as base64. Each
 * collection is an index of metadata plus one key per file, so listing and
 * deleting never rewrite every file.
 *
 * ponytail: the index is read-modify-written, so two tabs pinning in the same
 * instant can drop one write. Fine for a user clicking; move to per-item keys
 * with a scan if it ever matters.
 */

import { canPreview, type PlopItem } from "./types.ts";

export type Collection = "pinned" | "recents";

/**
 * Largest file Plop will keep. Base64 grows a file by a third and every
 * listing reads the stored bytes back, so very large files are uploaded but
 * not remembered.
 */
export const MAX_STORED_BYTES = 25 * 1024 * 1024;

type StoredFile = { name: string; type: string; lastModified: number; data: string };
/** An item as kept in the index: everything but the bytes and the preview. */
type Row = Omit<Extract<PlopItem, { kind: "file" }>, "file" | "preview"> | Extract<PlopItem, { kind: "text" }>;

const indexKey = (c: Collection) => `plop:${c}`;
const fileKey = (c: Collection, id: string) => `plop:${c}:file:${id}`;

async function readIndex(collection: Collection): Promise<Row[]> {
  const stored = await chrome.storage.local.get(indexKey(collection));
  return (stored[indexKey(collection)] as Row[] | undefined) ?? [];
}

function writeIndex(collection: Collection, rows: Row[]) {
  return chrome.storage.local.set({ [indexKey(collection)]: rows });
}

/* ---- base64, chunked so a large file does not overflow the call stack ---- */

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function fromBase64(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/* ---------------------------------------------------------------------- */

/** Newest first. Previews are minted here, in the document that shows them. */
export async function list(collection: Collection): Promise<PlopItem[]> {
  const rows = await readIndex(collection);
  const keys = rows.filter((r) => r.kind === "file").map((r) => fileKey(collection, r.id));
  const files = keys.length ? await chrome.storage.local.get(keys) : {};

  return rows.map((row): PlopItem => {
    if (row.kind === "text") return row;
    const stored = files[fileKey(collection, row.id)] as StoredFile | undefined;
    if (!stored) return row;
    const file = new File([fromBase64(stored.data) as BlobPart], stored.name, {
      type: stored.type,
      lastModified: stored.lastModified,
    });
    return {
      ...row,
      file,
      preview: canPreview(row.mimeType) ? URL.createObjectURL(file) : undefined,
    };
  });
}

/** Adds or replaces an item. Returns false if the file is too large to keep. */
export async function put(collection: Collection, item: PlopItem): Promise<boolean> {
  const rows = (await readIndex(collection)).filter((r) => r.id !== item.id);

  if (item.kind === "file") {
    if (item.size > MAX_STORED_BYTES) return false;
    // An object URL belongs to the document that made it, so it is never stored.
    const { file, preview: _preview, ...row } = item;
    if (file) {
      const stored: StoredFile = {
        name: file.name,
        type: file.type,
        lastModified: file.lastModified,
        data: toBase64(new Uint8Array(await file.arrayBuffer())),
      };
      await chrome.storage.local.set({ [fileKey(collection, item.id)]: stored });
    }
    rows.push(row);
  } else {
    rows.push(item);
  }

  rows.sort((a, b) => b.createdAt - a.createdAt);
  await writeIndex(collection, rows);
  return true;
}

export async function remove(collection: Collection, id: string) {
  const rows = await readIndex(collection);
  await writeIndex(collection, rows.filter((r) => r.id !== id));
  await chrome.storage.local.remove(fileKey(collection, id));
}

/** Keeps a collection to its most recent `max` items. */
export async function trim(collection: Collection, max: number) {
  const rows = await readIndex(collection);
  if (rows.length <= max) return;
  await writeIndex(collection, rows.slice(0, max));
  await chrome.storage.local.remove(rows.slice(max).map((r) => fileKey(collection, r.id)));
}
