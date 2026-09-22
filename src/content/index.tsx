/**
 * Content script: the part of Plop that lives on somebody else's page.
 *
 * It watches for a click on an upload control, and when it finds one it stops
 * the native dialog and opens the widget instead. Everything it renders is
 * inside a Shadow DOM so the host page's CSS cannot reach it and Plop's own
 * CSS cannot leak out.
 *
 * Interception is conservative by design. If Plop is switched off, if the
 * control asks for something Plop cannot serve, or if anything at all goes
 * wrong, the click is left alone and the page behaves exactly as it would
 * without the extension.
 */

import { render } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import tokensCss from "../styles/tokens.css?inline";
import glassCss from "../styles/glass.css?inline";
import plopCss from "../styles/plop.css?inline";

import { PlopWidget } from "../ui/widget";
import { usePresence } from "../ui/presence";
import { itemsFromPaste, readClipboard } from "../clipboard";
import * as store from "../storage";
import { fileInputFor, isOutOfScope } from "./detect";
import { DEFAULT_SETTINGS, onSettingsChanged, readSettings } from "../settings-store";
import {
  fillFileInput,
  isEnabledOn,
  type PlopItem,
  type PlopSettings,
  type PlopTheme,
} from "../types";

const RECENTS_LIMIT = 12;
/** Gap between the control that opened Plop and the widget beneath it. */
const ANCHOR_GAP = 12;

function resolveTheme(preference: PlopTheme | null): PlopTheme {
  if (preference) return preference;
  return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/* ---------------------------------------------------------------------- */

type Anchor = { input: HTMLInputElement; rect: DOMRect };

function Plop({ host }: { host: string }) {
  const [settings, setSettings] = useState<PlopSettings>(DEFAULT_SETTINGS);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const [clipboard, setClipboard] = useState<PlopItem[]>([]);
  const [clipboardNote, setClipboardNote] = useState<string | undefined>();
  const [recents, setRecents] = useState<PlopItem[]>([]);
  const [pinned, setPinned] = useState<PlopItem[]>([]);
  const widget = usePresence(anchor !== null);
  // Set while Plop deliberately lets one click through to the native dialog.
  const passthrough = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void readSettings().then(setSettings);
    return onSettingsChanged(setSettings);
  }, []);

  const reload = useCallback(async () => {
    setRecents(await store.list("recents"));
    setPinned(await store.list("pinned"));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const enabled = isEnabledOn(settings, host);
  const close = useCallback(() => setAnchor(null), []);

  useEffect(() => {
    if (!enabled) setAnchor(null);
  }, [enabled]);

  /** Parks the widget under the control, clamped to the viewport. */
  const place = useCallback((rect: DOMRect) => {
    const width = 440; // --plop-widget-width
    const left = Math.min(
      Math.max(12, rect.left + rect.width / 2 - width / 2),
      Math.max(12, window.innerWidth - width - 12)
    );
    // Flip above the control when there is no room beneath it.
    const below = rect.bottom + ANCHOR_GAP;
    const fitsBelow = below + 260 < window.innerHeight;
    setAt({ left, top: fitsBelow ? below : Math.max(12, rect.top - 260) });
  }, []);

  /* ---- interception -------------------------------------------------- */

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!enabled || event.button !== 0) return;
      const target = event.target as Element | null;
      if (!target) return;
      // Never intercept a click on Plop's own UI.
      if ((target as Element & { closest?: unknown }).closest?.("#plop-root")) return;

      const input = fileInputFor(target);
      if (!input || isOutOfScope(input)) return;

      // A click Plop asked for: let it reach the browser untouched.
      if (passthrough.current === input) {
        passthrough.current = null;
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      // Anchor to whatever the user actually clicked, since a hidden input
      // has no useful box of its own.
      const visible = target instanceof HTMLElement ? target : input;
      const rect = visible.getBoundingClientRect();
      const box = rect.width && rect.height ? rect : input.getBoundingClientRect();
      setAnchor({ input, rect: box });
      place(box);

      void readClipboard().then((result) => {
        setClipboard(result.ok ? result.items : []);
        setClipboardNote(result.ok ? undefined : result.reason);
      });
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [enabled, place]);

  /* ---- paste --------------------------------------------------------- */

  useEffect(() => {
    if (!anchor) return;
    const onPaste = (event: ClipboardEvent) => {
      const items = itemsFromPaste(event);
      if (!items.length) return;
      event.preventDefault();
      setClipboard((current) => [...items, ...current]);
      setClipboardNote(undefined);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [anchor]);

  /* ---- keeping position ---------------------------------------------- */

  useEffect(() => {
    if (!anchor) return;
    const reposition = () => place(anchor.input.getBoundingClientRect().width
      ? anchor.input.getBoundingClientRect()
      : anchor.rect);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [anchor, place]);

  /* ---- actions -------------------------------------------------------- */

  const remember = async (item: PlopItem) => {
    await store.put("recents", item);
    await store.trim("recents", RECENTS_LIMIT);
    await reload();
  };

  const deliver = async (item: PlopItem) => {
    if (!anchor || item.kind !== "file" || !item.file) return;
    fillFileInput(anchor.input, [item.file]);
    close();
    await remember(item);
  };

  const browse = () => {
    if (!anchor) return;
    // Hand the click back to the page: Plop steps aside for exactly one.
    passthrough.current = anchor.input;
    const input = anchor.input;
    close();
    input.click();
  };

  const togglePin = async (item: PlopItem) => {
    if (pinned.some((p) => p.id === item.id)) await store.remove("pinned", item.id);
    else await store.put("pinned", item);
    await reload();
  };

  if (!widget.mounted || !at) return null;

  return (
    <div
      class="plop-root plop-layer"
      data-theme={resolveTheme(settings.theme)}
      style={{ left: `${at.left}px`, top: `${at.top}px` }}
    >
      <PlopWidget
        clipboard={clipboard}
        pinned={pinned}
        recents={recents}
        pinnedIds={new Set(pinned.map((p) => p.id))}
        clipboardEmpty={clipboard.length === 0}
        clipboardNote={clipboardNote}
        onPick={deliver}
        onDrop={(item) => void deliver(item)}
        onTogglePin={togglePin}
        onBrowse={browse}
        onOpenSettings={() => chrome.runtime.sendMessage({ type: "plop:open-options" })}
        onClose={close}
        exiting={widget.exiting}
      />
    </div>
  );
}

/**
 * Makes Inter available to the widget.
 *
 * A shadow root ignores `@font-face`, so the face has to be registered on the
 * host document. This adds a font and changes nothing else about the page.
 */
async function registerFont() {
  if (document.fonts.check('1em "Inter Variable"')) return;
  try {
    const face = new FontFace(
      "Inter Variable",
      `url(${chrome.runtime.getURL("fonts/inter-latin-wght-normal.woff2")})`,
      { weight: "100 900", style: "normal" }
    );
    document.fonts.add(await face.load());
  } catch {
    /* no font: the widget falls back to the system stack and still works */
  }
}

/* ---------------------------------------------------------------------- */

function mount() {
  if (document.getElementById("plop-root")) return;

  const host = document.createElement("div");
  host.id = "plop-root";
  // The host itself must not disturb the page's layout or hit-testing.
  host.style.cssText = "all: initial; position: fixed; inset: 0 auto auto 0; z-index: 2147483647;";
  const shadow = host.attachShadow({ mode: "open" });

  const sheet = document.createElement("style");
  sheet.textContent = `${tokensCss}\n${glassCss}\n${plopCss}\n
    .plop-layer { position: fixed; z-index: 2147483647; }`;
  shadow.append(sheet);

  const mountPoint = document.createElement("div");
  shadow.append(mountPoint);
  document.documentElement.append(host);

  void registerFont();
  render(<Plop host={location.hostname} />, mountPoint);
}

// `document_idle` already waits for the document, but a page can replace its
// own body afterwards; mounting on the documentElement survives that.
mount();
