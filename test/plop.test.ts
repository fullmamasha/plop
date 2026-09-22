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
