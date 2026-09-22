/**
 * Where Plop keeps items that must outlive a page load.
 *
 * IndexedDB rather than `chrome.storage` or `localStorage` because the things
 * worth keeping are `File`/`Blob` objects: neither of the others can hold one,
 * and re-encoding a file as base64 to squeeze it into a string store would
 * triple its size for nothing.
 *
 * One store, keyed by item id, holding the item as-is — structured clone takes
 * the `File` along. Preview object URLs are *not* stored; they are minted on
 * read, because an object URL is only valid for the document that created it.
 */

import { canPreview, type PlopItem } from "./types";

const DB_NAME = "plop";
const DB_VERSION = 1;

export type Collection = "pinned" | "recents";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of ["pinned", "recents"] satisfies Collection[]) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: "id" });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(
  collection: Collection,
  mode: IDBTransactionMode,
  body: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(collection, mode);
        const request = body(tx.objectStore(collection));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => db.close();
      })
  );
}

/** Newest first. Previews are re-minted from the stored file. */
export async function list(collection: Collection): Promise<PlopItem[]> {
  const rows = await run<PlopItem[]>(collection, "readonly", (store) =>
    store.getAll()
  );
  return rows
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((item) =>
      item.kind === "file" && item.file && canPreview(item.mimeType)
        ? { ...item, preview: URL.createObjectURL(item.file) }
        : item
    );
}

export async function put(collection: Collection, item: PlopItem) {
  // An object URL belongs to the document that made it, so it is never stored.
  const { preview: _preview, ...rest } =
    item.kind === "file" ? item : { ...item, preview: undefined };
  await run(collection, "readwrite", (store) => store.put(rest));
}

export async function remove(collection: Collection, id: string) {
  await run(collection, "readwrite", (store) => store.delete(id));
}

/** Keeps a collection to its most recent `max` items. */
export async function trim(collection: Collection, max: number) {
  const rows = await run<PlopItem[]>(collection, "readonly", (store) =>
    store.getAll()
  );
  const doomed = rows
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(max)
    .map((item) => item.id);
  for (const id of doomed) await remove(collection, id);
}
