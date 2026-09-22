/** Fixture data for the dev gallery. Not shipped. */

import type { PlopItem, PlopSettings } from "../src/types";

/** A flat two-colour gradient standing in for a photo thumbnail. */
const swatch = (from: string, to: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="1" height="1" fill="url(#g)"/></svg>`
  )}`;

const clipboardImg = swatch("#4f7cff", "#1c2d6b");
const pin1 = swatch("#f4a261", "#6a3d1f");
const pin2 = swatch("#f7c6c7", "#b5646b");
const pin3 = swatch("#c9d6df", "#52616b");
const pin4 = swatch("#9b5de5", "#3a1f6b");
const recentImg = swatch("#2ec4b6", "#0f4c47");

const file = (
  id: string,
  name: string,
  size: number,
  preview: string
): PlopItem => ({
  id,
  kind: "file",
  name,
  mimeType: "image/jpeg",
  size,
  preview,
  createdAt: 0,
});

export const clipboard: PlopItem[] = [
  file("c1", "Quarterlyreport.json", 105_000, clipboardImg),
  {
    id: "c2",
    kind: "text",
    content: "This is the text that being copied by the user, he can check it",
    createdAt: 0,
  },
  // No preview: renders as the file card.
  {
    id: "c3",
    kind: "file",
    name: "File.pdf",
    mimeType: "application/pdf",
    size: 105_000,
    createdAt: 0,
  },
];

export const pinned: PlopItem[] = [
  file("p1", "Supergoodmeal.webp", 105_000, pin1),
  file("p2", "Femalecosmet.jpg", 105_000, pin2),
  file("p3", "Sparkle.png", 105_000, pin3),
  file("p4", "ArsPalette.png", 105_000, pin4),
  {
    id: "p5",
    kind: "text",
    content:
      "This is something I would like to see tomorrow and the day after that, and probably the week after too.",
    createdAt: 0,
  },
];

export const recents: PlopItem[] = Array.from({ length: 4 }, (_, i) =>
  file(`r${i}`, "ArsPalette.png", 105_000, recentImg)
);

export const settings: PlopSettings = {
  enabledGlobally: true,
  siteRules: {},
  theme: null,
};
