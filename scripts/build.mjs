/**
 * Builds the extension.
 *
 * Two passes, because a content script and everything else have different
 * rules. Chrome loads a content script as a classic script with no module
 * loader, so it has to be one self-contained file with no imports. The
 * service worker and the popup are modules and may be split normally.
 */

import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { build } from "vite";
import preact from "@preact/preset-vite";
import { manifest } from "./manifest.mjs";

const OUT = "dist";

// Pass 1: service worker and popup. Clears the directory.
await build({
  configFile: false,
  plugins: [preact()],
  build: {
    outDir: OUT,
    emptyOutDir: true,
    rollupOptions: {
      input: { background: "src/background/index.ts", popup: "popup.html" },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});

// Pass 2: the content script, as a single IIFE with nothing to import.
await build({
  configFile: false,
  plugins: [preact()],
  build: {
    outDir: OUT,
    emptyOutDir: false,
    lib: {
      entry: "src/content/index.tsx",
      formats: ["iife"],
      name: "PlopContent",
      fileName: () => "content.js",
    },
    rollupOptions: {
      output: { extend: true, inlineDynamicImports: true },
    },
  },
});

// The manifest is generated so the version lives only in package.json.
await writeFile(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2));

await mkdir(`${OUT}/icons`, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  await copyFile(`src/assets/app-icons/icon-${size}.png`, `${OUT}/icons/icon-${size}.png`);
}

// Only the subsets the UI actually needs; the package ships what it uses.
await mkdir(`${OUT}/fonts`, { recursive: true });
for (const subset of ["latin", "latin-ext"]) {
  const file = `inter-${subset}-wght-normal.woff2`;
  await copyFile(`node_modules/@fontsource-variable/inter/files/${file}`, `${OUT}/fonts/${file}`);
}

console.log(`Built ${OUT}/ for Chrome (manifest version ${manifest.version}).`);
