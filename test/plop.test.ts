/**
 * The smallest set of checks that fail if something real breaks.
 *
 *   node --test
 *
 * Node 24 strips the types itself; there is no test framework and no build
 * step here on purpose.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canPreview, formatSize, glyphFor, isEnabledOn, splitName } from "../src/types.ts";
import { compareVersions, isNewer } from "../src/version.ts";

test("splitName separates the stem from the extension", () => {
  assert.deepEqual(splitName("ArsPalette.png"), ["ArsPalette", ".png"]);
  assert.deepEqual(splitName("archive.tar.gz"), ["archive.tar", ".gz"]);
  assert.deepEqual(splitName("Makefile"), ["Makefile", ""]);
  // A leading dot is the whole name, not an extension.
  assert.deepEqual(splitName(".gitignore"), [".gitignore", ""]);
});

test("formatSize picks a unit and keeps the string short", () => {
  assert.equal(formatSize(512), "512B");
  assert.equal(formatSize(105_000), "103KB");
  assert.equal(formatSize(1536), "1.5KB");
  assert.equal(formatSize(5 * 1024 ** 3), "5.0GB");
});

const asFile = (mimeType: string) => ({
  id: "x",
  kind: "file" as const,
  name: "x",
  mimeType,
  size: 1,
  createdAt: 0,
});

test("glyphFor routes a type to its stand-in icon", () => {
  assert.equal(glyphFor(asFile("video/mp4")), "fileVideo");
  assert.equal(glyphFor(asFile("video/quicktime")), "fileVideo");
  assert.equal(glyphFor(asFile("audio/mpeg")), "fileSound");
  assert.equal(glyphFor(asFile("audio/x-wav")), "fileSound");
  // Any image without a usable thumbnail, not just svg.
  assert.equal(glyphFor(asFile("image/svg+xml")), "fileImage");
  assert.equal(glyphFor(asFile("image/tiff")), "fileImage");
  // Everything else falls back to the plain document.
  assert.equal(glyphFor(asFile("application/pdf")), "file");
  assert.equal(glyphFor(asFile("")), "file");
  assert.equal(glyphFor({ id: "t", kind: "text", content: "hi", createdAt: 0 }), "text");
  // Case is not the caller's problem.
  assert.equal(glyphFor(asFile("VIDEO/MP4")), "fileVideo");
});

test("canPreview allows only what a browser will really render", () => {
  for (const type of ["image/png", "image/jpeg", "image/gif", "image/webp"]) {
    assert.equal(canPreview(type), true, type);
  }
  // These are images but produce a broken or unpredictable thumbnail.
  for (const type of ["image/svg+xml", "image/tiff", "image/heic", "video/mp4"]) {
    assert.equal(canPreview(type), false, type);
  }
});

test("versions compare numerically, not as strings", () => {
  // The case that makes lexicographic comparison wrong, and would hide a
  // real update from the user.
  assert.equal(isNewer("0.10.0", "0.9.0"), true);
  assert.equal(isNewer("0.9.0", "0.10.0"), false);

  assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
  assert.ok(compareVersions("1.2.3", "1.2.4") < 0);
  assert.ok(compareVersions("2.0.0", "1.99.99") > 0);
  // A shorter version is padded, not treated as larger.
  assert.equal(compareVersions("1.2", "1.2.0"), 0);
  assert.ok(compareVersions("1.2.1", "1.2") > 0);
});

test("isEnabledOn lets the global switch win", () => {
  const off = { enabledGlobally: false, siteRules: {}, theme: null };
  // No site rule can override Plop being off everywhere.
  assert.equal(isEnabledOn({ ...off, siteRules: { "a.com": true } }, "a.com"), false);

  const on = { enabledGlobally: true, siteRules: {}, theme: null };
  // A host with no rule is allowed: the per-site switch is an opt-out.
  assert.equal(isEnabledOn(on, "never-seen.com"), true);
  assert.equal(isEnabledOn({ ...on, siteRules: { "a.com": false } }, "a.com"), false);
  assert.equal(isEnabledOn({ ...on, siteRules: { "a.com": false } }, "b.com"), true);
});

/**
 * The glass edge stops animating, silently, if any of these three slip. All
 * three have bitten this technique before — see DESIGN.md § Glass edge.
 */
test("glass edge keeps the three conditions its rotation depends on", () => {
  const css = readFileSync(new URL("../src/styles/glass.css", import.meta.url), "utf8");

  // 1. The custom property must be registered, or the gradient is just a
  //    string and the value snaps at the end of the animation.
  assert.match(css, /@property\s+--plop-edge-angle\s*\{[^}]*syntax:\s*"<angle>"/s);

  // 2. Keyframes may contain literals only — Chrome drops the whole animation
  //    if a registered property is assembled with var() or calc().
  for (const [, body] of css.matchAll(/@keyframes[^{]+\{((?:[^{}]|\{[^}]*\})*)\}/g)) {
    assert.doesNotMatch(body, /var\(|calc\(/, "keyframes must use literal values");
  }

  // 3. The gradient angle must be a number, not a keyword: keywords do not
  //    interpolate, so the highlight cannot travel.
  assert.doesNotMatch(css, /linear-gradient\(\s*to\s+/);
});

test("pinned files survive a round trip through extension storage", async () => {
  await import("../dev/chrome-storage.ts");
  const store = await import("../src/storage.ts");

  // Every byte value, so a lossy base64 step would show.
  const bytes = Uint8Array.from({ length: 256 * 3 }, (_, i) => i % 256);
  const file = new File([bytes], "photo.png", { type: "image/png", lastModified: 7 });
  const item = {
    id: "temporary", kind: "file", name: "photo.png", mimeType: "image/png",
    size: file.size, file, createdAt: 1,
  } as const;

  assert.equal(await store.put("pinned", item), true);
  await store.put("pinned", { id: "t", kind: "text", content: "hi", createdAt: 2 });

  const [text, back] = await store.list("pinned");
  assert.ok(text.kind === "text", "newest first");
  assert.ok(back.kind === "file" && back.file);
  assert.ok(back.id.startsWith("h-"), "stored under a content id, not the caller's");
  assert.deepEqual(new Uint8Array(await back.file.arrayBuffer()), bytes);
  assert.equal(back.file.name, "photo.png");
  assert.equal(back.file.type, "image/png");
  assert.ok(back.preview?.startsWith("blob:"), "preview minted on read");

  // Recents are kept separately: dropping one never touches a pin.
  await store.put("recents", item);
  await store.remove("recents", back.id);
  assert.equal((await store.list("pinned")).length, 2);

  await store.trim("pinned", 1);
  assert.deepEqual((await store.list("pinned")).map((i) => i.kind), ["text"]);

  assert.equal(
    await store.put("pinned", { ...item, size: store.MAX_STORED_BYTES + 1 }),
    false,
    "oversized files are uploaded but not kept"
  );
});

test("the same content is kept once, under its newest details", async () => {
  await import("../dev/chrome-storage.ts");
  const store = await import("../src/storage.ts");
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const as = (name: string, createdAt: number) => ({
    id: `clip-${createdAt}`, kind: "file" as const, name, mimeType: "image/png",
    size: bytes.length, file: new File([bytes], name, { type: "image/png" }), createdAt,
  });

  // Same bytes three times, under different names and throwaway ids.
  await store.put("recents", as("Clipboard.png", 10));
  await store.put("recents", as("Clipboard.png", 20));
  await store.put("recents", as("renamed.png", 30));
  // Different bytes, same name: a different file.
  await store.put("recents", { ...as("Clipboard.png", 40), file: new File([new Uint8Array([9])], "Clipboard.png"), size: 1 });

  const items = await store.list("recents");
  assert.equal(items.length, 2);
  assert.equal(items[1].kind === "file" && items[1].name, "renamed.png");
  assert.equal(items[1].createdAt, 30, "reusing a file moves it to the front");

  await store.put("recents", { id: "x", kind: "text", content: "same", createdAt: 50 });
  await store.put("recents", { id: "y", kind: "text", content: "same", createdAt: 60 });
  assert.equal((await store.list("recents")).filter((i) => i.kind === "text").length, 1);
});

test("items saved before content ids are merged on first read", async () => {
  await import("../dev/chrome-storage.ts");
  const store = await import("../src/storage.ts");
  const data = btoa(String.fromCharCode(5, 6, 7));
  const row = (id: string, createdAt: number) =>
    ({ id, kind: "file", name: `${id}.png`, mimeType: "image/png", size: 3, createdAt });

  // The 0.1.1 layout: random ids, the same screenshot saved twice, plus a row
  // whose bytes went missing.
  await chrome.storage.local.set({
    "plop:pinned": [row("old-b", 2), row("old-a", 1), row("lost", 0)],
    "plop:pinned:file:old-a": { name: "old-a.png", type: "image/png", lastModified: 0, data },
    "plop:pinned:file:old-b": { name: "old-b.png", type: "image/png", lastModified: 0, data },
  });

  const items = await store.list("pinned");
  assert.equal(items.length, 1, "duplicates merged, the unrecoverable row dropped");
  assert.ok(items[0].id.startsWith("h-"));
  assert.equal(items[0].kind === "file" && items[0].name, "old-b.png", "newest details win");
  const left = Object.keys(await chrome.storage.local.get([
    "plop:pinned:file:old-a", "plop:pinned:file:old-b",
  ]));
  assert.deepEqual(left, [], "old file keys removed");
});
