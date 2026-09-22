/** Fixture data for the dev gallery. Not shipped. */

import type { PlopItem, PlopSettings } from "../src/types";

import clipboardImg from "./samples/clipboard.jpg";
import pin1 from "./samples/pin-1.jpg";
import pin2 from "./samples/pin-2.jpg";
import pin3 from "./samples/pin-3.jpg";
import pin4 from "./samples/pin-4.jpg";
import recentImg from "./samples/recent.jpg";

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
  file("c1", "Fuckingpdr.json", 105_000, clipboardImg),
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
