/** Shared domain types. Storage and UI both speak these — nothing else. */

export type PlopTheme = "dark" | "light";

/** A thing Plop can hand to a file input. */
export type PlopItem =
  | {
      id: string;
      kind: "file";
      /** Full name including extension, e.g. "ArsPalette.png". */
      name: string;
      mimeType: string;
      size: number;
      /** Object URL or data URL for the preview thumbnail; absent for non-visual files. */
      preview?: string;
      /**
       * The real file, when Plop has one. Only an item carrying this can be
       * handed to a host page's `<input type="file">`, which needs actual
       * `File` objects in a `DataTransfer`.
       */
      file?: File;
      createdAt: number;
    }
  | {
      id: string;
      kind: "text";
      content: string;
      createdAt: number;
    };

export type PlopSettings = {
  enabledGlobally: boolean;
  siteRules: Record<string, boolean>;
  /** null = follow the operating system. */
  theme: PlopTheme | null;
};

/** Splits "ArsPalette.png" into ["ArsPalette", ".png"]. No extension → ["name", ""]. */
export function splitName(name: string): [string, string] {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)}${units[unit]}`;
}

/**
 * Puts real files into a file input the way a user drop would. An input's
 * `files` is read-only except through a `DataTransfer`, so this is the only
 * way to fill one programmatically — and it is why an item without a `file`
 * handle cannot be delivered.
 */
export function fillFileInput(input: HTMLInputElement, files: File[]): boolean {
  if (!files.length) return false;
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

/**
 * Whether Plop should take over an upload control on this host.
 *
 * The global switch wins: with Plop off everywhere, no site rule can turn it
 * back on. A host with no rule of its own is allowed — the per-site switch is
 * an opt-*out*, so Plop works on a site the user has never visited before.
 */
export function isEnabledOn(settings: PlopSettings, host: string): boolean {
  if (!settings.enabledGlobally) return false;
  return settings.siteRules[host] !== false;
}

/**
 * Image types a browser will actually render in an `<img>`. Anything else —
 * SVG, TIFF, HEIC, RAW and friends — gets the image glyph instead of a broken
 * or unpredictable thumbnail.
 */
const PREVIEWABLE = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
]);

export function canPreview(mimeType: string): boolean {
  return PREVIEWABLE.has(mimeType.toLowerCase());
}

/** Which glyph stands in for an item that has no thumbnail. */
export type GlyphName = "file" | "fileImage" | "fileSound" | "fileVideo" | "text";

export function glyphFor(item: PlopItem): GlyphName {
  if (item.kind === "text") return "text";
  const type = item.mimeType.toLowerCase();
  if (type.startsWith("video/")) return "fileVideo";
  if (type.startsWith("audio/")) return "fileSound";
  if (type.startsWith("image/")) return "fileImage";
  return "file";
}
