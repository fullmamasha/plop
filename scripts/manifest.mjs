/**
 * The extension manifest, generated from package.json so the version can only
 * ever be set in one place.
 */

import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

export const manifest = {
  manifest_version: 3,
  name: "Plop",
  version: pkg.version,
  description: pkg.description,
  minimum_chrome_version: "111",
  icons: {
    16: "icons/icon-16.png",
    32: "icons/icon-32.png",
    48: "icons/icon-48.png",
    128: "icons/icon-128.png",
  },
  action: {
    default_title: "Plop",
    default_popup: "popup.html",
    default_icon: {
      16: "icons/icon-16.png",
      32: "icons/icon-32.png",
    },
  },
  background: {
    service_worker: "background.js",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["http://*/*", "https://*/*"],
      js: ["content.js"],
      run_at: "document_idle",
      all_frames: false,
    },
  ],
  // unlimitedStorage: pinned files are kept in extension storage, whose
  // default quota is 10 MB. It adds no install warning.
  permissions: ["storage", "unlimitedStorage", "clipboardRead"],
  host_permissions: [],
  // The widget runs in a page's world, so its font has to be fetchable from
  // there. Nothing else is exposed.
  web_accessible_resources: [
    {
      resources: ["fonts/*.woff2"],
      matches: ["http://*/*", "https://*/*"],
    },
  ],
};

export const version = pkg.version;
