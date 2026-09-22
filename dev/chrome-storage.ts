/**
 * An in-memory `chrome.storage.local`, for the field test and the unit
 * checks, which run outside an extension. Only the calls Plop makes.
 *
 * ponytail: memory only, so the field test forgets pins on reload. Back it
 * with IndexedDB if that ever gets in the way.
 */

const data = new Map<string, unknown>();
const keysOf = (keys: string | string[]) => (Array.isArray(keys) ? keys : [keys]);
// Stored values go through JSON, as they do in Chrome, so a test catches a
// value that would not survive the real store.
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const local = {
  async get(keys: string | string[]) {
    const out: Record<string, unknown> = {};
    for (const key of keysOf(keys)) if (data.has(key)) out[key] = copy(data.get(key));
    return out;
  },
  async set(items: Record<string, unknown>) {
    for (const [key, value] of Object.entries(items)) data.set(key, copy(value));
  },
  async remove(keys: string | string[]) {
    for (const key of keysOf(keys)) data.delete(key);
  },
};

const g = globalThis as { chrome?: { storage?: { local?: unknown } } };
if (!g.chrome?.storage?.local) {
  g.chrome = { ...g.chrome, storage: { ...g.chrome?.storage, local } };
}

export {};
