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
import { identify, itemsFromPaste, readClipboard } from "../clipboard";
import * as store from "../storage";
import { fileInputFor, isOutOfScope } from "./detect";
import { deliverTo, isEditable, isFileInput, saveCaret } from "../deliver";
import { DEFAULT_SETTINGS, onSettingsChanged, readSettings } from "../settings-store";
import {
  canPreview,
  isEnabledOn,
  mergeNewestFirst,
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

type Anchor = {
  /** Where a picked item goes: a file input, a text field, or (opened with
   *  the shortcut over nothing in particular) nowhere until a drag says. */
  target: HTMLElement | null;
  /** The file input an upload click was for. Select from PC hands the click
   *  back to it; without one, Plop opens a file dialog of its own. */
  input: HTMLInputElement | null;
  /** The box Plop sits under. */
  rect: DOMRect;
  /** What the user pressed to open Plop, which also accepts a dropped card. */
  pressed: Element | null;
  /** Puts the caret back in a text field after clicks inside Plop moved it. */
  restoreCaret?: () => void;
};

/** Set by the mounted widget; the shortcut message calls it. */
let summon: (() => void) | null = null;

/** Where the pointer last was, so the shortcut can open Plop beside it. */
let pointer: { x: number; y: number } | null = null;
document.addEventListener(
  "pointermove",
  (event) => {
    pointer = { x: event.clientX, y: event.clientY };
  },
  { capture: true, passive: true }
);

/** The focused element, looking inside shadow roots on the way down. */
function deepActiveElement(): Element | null {
  let el = document.activeElement;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  return el;
}

/**
 * Lifts Plop above everything else on the page, every time it opens.
 *
 * A z-index is not enough. A modal `<dialog>` or a popover lives in the
 * browser's top layer, which paints over any z-index, and a modal dialog also
 * makes everything outside itself inert — so on a site like LinkedIn, whose
 * upload screen is a modal, Plop used to open *under* the modal's tint and
 * ignore every click. Plop's host is therefore a popover, re-shown on each
 * open so it lands above whatever joined the top layer since; and while a
 * modal dialog is open it moves inside it, the only place a modal leaves
 * interactive.
 */
function raise(root: HTMLElement, near: Element | null) {
  const modal =
    near?.closest("dialog:modal") ?? [...document.querySelectorAll("dialog:modal")].pop();
  const parent = modal ?? document.documentElement;
  // Also puts the host back if a page removed the dialog it was in.
  if (root.parentNode !== parent) parent.append(root);
  if (root.matches(":popover-open")) root.hidePopover();
  root.showPopover();
}

const hasBox = (el: Element) => {
  const { width, height } = el.getBoundingClientRect();
  return width > 0 && height > 0;
};

/** The last element pressed, while that press is recent enough to be the
 *  one that led to this click. */
let lastPress: { el: Element; at: number } | null = null;
document.addEventListener(
  "pointerdown",
  (event) => {
    if (event.isTrusted && event.target instanceof Element) {
      lastPress = { el: event.target, at: performance.now() };
    }
  },
  true
);
function recentPress(): Element | null {
  if (!lastPress || performance.now() - lastPress.at > 1000) return null;
  return lastPress.el.isConnected && hasBox(lastPress.el) ? lastPress.el : null;
}

function Plop({ root, site }: { root: HTMLElement; site: string }) {
  const [settings, setSettings] = useState<PlopSettings>(DEFAULT_SETTINGS);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const [clipboard, setClipboard] = useState<PlopItem[]>([]);
  const [clipboardNote, setClipboardNote] = useState<string | undefined>();
  const [recents, setRecents] = useState<PlopItem[]>([]);
  const [pinned, setPinned] = useState<PlopItem[]>([]);
  /** Why the last pick did not go through, e.g. a field that takes no files. */
  const [note, setNote] = useState<string | undefined>();
  const widget = usePresence(anchor !== null);
  const picker = useRef<HTMLInputElement>(null);
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

  const enabled = isEnabledOn(settings, site);
  const close = useCallback(() => setAnchor(null), []);

  // While open, the control that opened Plop also accepts a dragged card:
  // dropping an item back onto the button you clicked is the obvious gesture.
  useEffect(() => {
    const pressed = anchor?.pressed;
    if (!pressed) return;
    pressed.setAttribute("data-plop-dropzone", "");
    return () => pressed.removeAttribute("data-plop-dropzone");
  }, [anchor]);

  // A note belongs to the moment it explains.
  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(undefined), 4000);
    return () => clearTimeout(timer);
  }, [note]);

  /** Opens Plop for `next`: above everything, fresh lists, clipboard read. */
  const open = useCallback(
    (next: Anchor) => {
      raise(root, next.target ?? next.pressed);
      setNote(undefined);
      setAnchor(next);
      // Pins and recents change in other tabs and in the popup.
      void reload();
      void readClipboard().then((result) => {
        setClipboard(result.ok ? result.items : []);
        setClipboardNote(result.ok ? undefined : result.reason);
      });
    },
    [reload, root]
  );

  useEffect(() => {
    if (!enabled) setAnchor(null);
  }, [enabled]);

  /** Parks the widget under the control, clamped to the viewport. */
  const place = useCallback((rect: DOMRect) => {
    const width = 440; // --plop-widget-width
    // A control with no box — a hidden input a site clicked from script —
    // gives nothing to sit under, so Plop opens in the middle of the screen
    // like a dialog instead of in the corner.
    if (!rect.width && !rect.height) {
      setAt({
        left: Math.max(12, (window.innerWidth - width) / 2),
        top: Math.max(12, (window.innerHeight - 260) / 2),
      });
      return;
    }
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

      // Anchor to what the user actually pressed. When a site opens a hidden
      // input from script, the click's target is that input, which has no
      // box, so the element under the pointer a moment ago stands in for it.
      const visible = hasBox(target) ? target : recentPress() ?? target;
      const rect = visible.getBoundingClientRect();
      open({ target: input, input, rect, pressed: visible });
      place(rect);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [enabled, place, open]);

  /* ---- the shortcut --------------------------------------------------- */

  // Opens Plop at the pointer for whatever field has focus: text goes in at
  // its caret, files go in as a paste would. With nothing focused, cards can
  // still be dragged onto any field.
  useEffect(() => {
    summon = () => {
      if (!enabled) return;
      const active = deepActiveElement();
      const target = isFileInput(active) || isEditable(active) ? active : null;
      const rect = pointer
        ? new DOMRect(pointer.x, pointer.y, 1, 1)
        : new DOMRect(0, 0, 0, 0); // no pointer yet: the middle of the screen
      open({
        target,
        input: isFileInput(target) ? target : null,
        rect,
        pressed: null,
        restoreCaret: target && isEditable(target) ? saveCaret(target) : undefined,
      });
      place(rect);
    };
    return () => {
      summon = null;
    };
  }, [enabled, open, place]);

  /* ---- paste --------------------------------------------------------- */

  useEffect(() => {
    if (!anchor) return;
    const onPaste = (event: ClipboardEvent) => {
      // Pasting into the field Plop is working for is the user typing, not a
      // hand-off to Plop.
      const typing = anchor.target && isEditable(anchor.target);
      if (typing && deepActiveElement() === anchor.target) return;
      const items = itemsFromPaste(event);
      if (!items.length) return;
      event.preventDefault();
      void identify(items).then((found) =>
        setClipboard((current) => mergeNewestFirst(found, current))
      );
      setClipboardNote(undefined);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [anchor]);

  /* ---- keeping position ---------------------------------------------- */

  useEffect(() => {
    if (!anchor) return;
    // Follows the control it opened under as the page scrolls; opened at the
    // pointer, it stays where it appeared.
    const reposition = () =>
      place(anchor.pressed && hasBox(anchor.pressed) ? anchor.pressed.getBoundingClientRect() : anchor.rect);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [anchor, place]);

  /* ---- actions -------------------------------------------------------- */

  const remember = async (item: PlopItem) => {
    // Used again means newest again: it moves to the front of recents.
    await store.put("recents", { ...item, createdAt: Date.now() });
    await store.trim("recents", RECENTS_LIMIT);
    await reload();
  };

  const deliver = async (item: PlopItem) => {
    if (!anchor) return;
    const result = deliverTo(anchor.target, item, anchor.restoreCaret);
    if (!result.ok) return setNote(result.reason);
    close();
    await remember(item);
  };

  const browse = () => {
    if (!anchor) return;
    const input = anchor.input;
    if (!input) return picker.current?.click();
    // Hand the click back to the page: Plop steps aside for exactly one.
    passthrough.current = input;
    close();
    input.click();
  };

  /** Files chosen in Plop's own dialog go where a picked card would; with no
   *  field to go to, they join the clipboard row, ready to be dragged. */
  const picked = async (files: File[]) => {
    const items = await identify(
      files.map((file) => ({
        id: "",
        kind: "file" as const,
        name: file.name,
        mimeType: file.type,
        size: file.size,
        preview: canPreview(file.type) ? URL.createObjectURL(file) : undefined,
        file,
        createdAt: Date.now(),
      }))
    );
    if (!items.length) return;
    if (anchor?.target) return deliver(items[0]);
    setClipboard((current) => mergeNewestFirst(items, current));
  };

  const togglePin = async (item: PlopItem) => {
    if (pinned.some((p) => p.id === item.id)) await store.remove("pinned", item.id);
    else await store.put("pinned", item);
    await reload();
  };

  if (!widget.mounted || !at) return null;

  const pinnedIds = new Set(pinned.map((p) => p.id));

  return (
    <div
      class="plop-root plop-layer"
      data-theme={resolveTheme(settings.theme)}
      style={{ left: `${at.left}px`, top: `${at.top}px` }}
    >
      <PlopWidget
        clipboard={clipboard}
        pinned={pinned}
        // A pinned file is one click away already; recents skip it.
        recents={recents.filter((item) => !pinnedIds.has(item.id))}
        pinnedIds={pinnedIds}
        clipboardEmpty={clipboard.length === 0}
        clipboardNote={clipboardNote}
        note={note}
        onPick={(item) => void deliver(item)}
        onDrop={(item, _target, taken) => {
          // Taken: the page accepted it as a drop of its own; only tidy up.
          if (!taken) return void deliver(item);
          close();
          void remember(item);
        }}
        onTogglePin={togglePin}
        onBrowse={browse}
        onOpenSettings={() => void chrome.runtime.sendMessage({ type: "plop:open-settings" })}
        onClose={close}
        exiting={widget.exiting}
      />
      <input
        ref={picker}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          void picked([...(event.currentTarget.files ?? [])]);
          event.currentTarget.value = "";
        }}
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
  // A manual popover so it can enter the top layer; see raise(). The inline
  // reset also removes the browser's popover box (border, padding, canvas
  // background), leaving a zero-size host that does not disturb the page's
  // layout or hit-testing.
  host.popover = "manual";
  host.style.cssText =
    "all: initial; position: fixed; inset: 0 auto auto 0; overflow: visible; z-index: 2147483647;";
  const shadow = host.attachShadow({ mode: "open" });

  const sheet = document.createElement("style");
  sheet.textContent = `${tokensCss}\n${glassCss}\n${plopCss}\n
    .plop-layer { position: fixed; z-index: 2147483647; }`;
  shadow.append(sheet);

  const mountPoint = document.createElement("div");
  shadow.append(mountPoint);
  document.documentElement.append(host);

  void registerFont();
  render(<Plop root={host} site={location.hostname} />, mountPoint);
}

// The popup asks which site it is looking at; see popup/index.tsx.
chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.type === "plop:site") respond(location.hostname);
  if (message?.type === "plop:summon") summon?.();
});

// `document_idle` already waits for the document, but a page can replace its
// own body afterwards; mounting on the documentElement survives that.
mount();
