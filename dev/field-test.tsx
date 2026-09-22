/**
 * Field test — a bare page with one upload control in the middle of it.
 *
 * No fixtures. Clicking the control reads the real system clipboard and shows
 * the widget over real recents and pins, held in a stand-in for extension
 * storage. This is the page to open when the question is "does this actually
 * work", as opposed to "does this look right", which is what the gallery is
 * for.
 */

import "@fontsource-variable/inter";
import "../src/styles/tokens.css";
import "../src/styles/glass.css";
import "../src/styles/plop.css";
import "./field-test.css";
import "./chrome-storage";

import { render } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { PlopWidget } from "../src/ui/widget";
import { SettingsPanel } from "../src/ui/settings";
import { usePresence } from "../src/ui/presence";
import { itemsFromPaste, readClipboard } from "../src/clipboard";
import * as store from "../src/storage";
import {
  canPreview,
  fillFileInput,
  isEnabledOn,
  type PlopItem,
  type PlopSettings,
  type PlopTheme,
} from "../src/types";

const RECENTS_LIMIT = 12;
/** Gap between the control that opened Plop and the widget beneath it. */
const ANCHOR_GAP = 12;

const systemTheme = (): PlopTheme =>
  matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";

function itemFromFile(file: File): PlopItem {
  return {
    id: `file-${crypto.randomUUID()}`,
    kind: "file",
    name: file.name,
    mimeType: file.type,
    size: file.size,
    preview: canPreview(file.type) ? URL.createObjectURL(file) : undefined,
    file,
    createdAt: Date.now(),
  };
}

function FieldTest() {
  const [themeOverride, setThemeOverride] = useState<PlopTheme | null>(null);
  const theme = themeOverride ?? systemTheme();
  const input = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const pinPicker = useRef<HTMLInputElement>(null);
  const anchor = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);

  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<PlopSettings>({
    enabledGlobally: true,
    siteRules: {},
    theme: null,
  });
  const widget = usePresence(open);
  const panel = usePresence(settingsOpen);
  const [clipboard, setClipboard] = useState<PlopItem[]>([]);
  const [clipboardNote, setClipboardNote] = useState<string | undefined>();
  const [recents, setRecents] = useState<PlopItem[]>([]);
  const [pinned, setPinned] = useState<PlopItem[]>([]);
  const [delivered, setDelivered] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setRecents(await store.list("recents"));
    setPinned(await store.list("pinned"));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Parks the widget 12px under the control, clamped to the viewport. */
  const place = useCallback(() => {
    const el = anchor.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = 440; // --plop-widget-width
    const left = Math.max(
      12,
      Math.min(
        rect.left + rect.width / 2 - width / 2,
        window.innerWidth - width - 12
      )
    );
    setAt({ left, top: rect.bottom + ANCHOR_GAP });
  }, []);

  // Re-place whenever anything can have moved the anchor. The note is the
  // one that bites: this page is a centred column, so a line of text
  // appearing shifts the control upward after the widget has been placed.
  useEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, note, delivered, place]);

  const host = location.hostname;
  const enabled = isEnabledOn(settings, host);

  /** The click that opens Plop is also the gesture the clipboard read needs. */
  const openPlop = async () => {
    setNote(null);
    // Turned off here or everywhere: Plop stays out of the way entirely and
    // the control does what it would have done without the extension.
    if (!enabled) {
      setOpen(false);
      input.current?.click();
      return;
    }
    place();
    setOpen(true);
    const result = await readClipboard();
    setClipboard(result.ok ? result.items : []);
    setClipboardNote(result.ok ? undefined : result.reason);
  };

  // Switching Plop off puts it away immediately — leaving it on screen would
  // say the setting had not taken.
  useEffect(() => {
    if (!enabled) setOpen(false);
  }, [enabled]);

  const remember = async (item: PlopItem) => {
    await store.put("recents", item);
    await store.trim("recents", RECENTS_LIMIT);
    await reload();
  };

  const deliver = async (item: PlopItem) => {
    if (item.kind !== "file" || !item.file || !input.current) {
      setNote(
        item.kind === "text"
          ? "That is clipboard text — there is no file to hand to an upload field."
          : "That item has no file behind it."
      );
      return;
    }
    fillFileInput(input.current, [item.file]);
    setDelivered(item.file.name);
    setNote(null);
    setOpen(false);
    await remember(item);
  };

  /* Files copied in Explorer or Finder never reach `clipboard.read()`; a
     paste is the only way to get at them, so Plop listens for one while it is
     open. */
  useEffect(() => {
    if (!open) return;
    const onPaste = (event: ClipboardEvent) => {
      const items = itemsFromPaste(event);
      if (!items.length) return;
      event.preventDefault();
      setClipboard((current) => [...items, ...current]);
      setNote(null);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open]);

  const togglePin = async (item: PlopItem) => {
    if (pinned.some((p) => p.id === item.id)) await store.remove("pinned", item.id);
    else await store.put("pinned", item);
    await reload();
  };

  return (
    <main class="page">
      <h1 class="page__title">Plop field test</h1>
      <p class="page__hint">
        A real upload control. Click it to open Plop over your actual clipboard,
        recents and pins — nothing here is mocked.
      </p>

      {/* Stands in for the browser's extensions menu: the settings panel has
          to stay reachable even when Plop is switched off everywhere. */}
      <button
        type="button"
        class="toolbar-button"
        onClick={() => setSettingsOpen(true)}
      >
        Plop {enabled ? "" : "(off)"}
      </button>

      <button
        type="button"
        class="drop"
        ref={anchor}
        data-plop-dropzone
        onClick={openPlop}
      >
        <span class="drop__icon" aria-hidden="true">
          ⬆
        </span>
        <span class="drop__label">
          {delivered ? `Selected: ${delivered}` : "Click to upload a file"}
        </span>
        <span class="drop__sub">
          {enabled
            ? "Plop opens instead of the system dialog"
            : "Plop is off here — this opens the system dialog"}
        </span>
      </button>

      <input
        ref={input}
        type="file"
        class="visually-hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) setDelivered(file.name);
        }}
      />

      {/* "Add" under Pinned files opens the OS dialog too. */}
      <input
        ref={pinPicker}
        type="file"
        multiple
        class="visually-hidden"
        onChange={async (event) => {
          const files = [...(event.currentTarget.files ?? [])];
          event.currentTarget.value = "";
          for (const file of files) await store.put("pinned", itemFromFile(file));
          await reload();
        }}
      />

      {/* "Select from PC" hands off to this. */}
      <input
        ref={picker}
        type="file"
        multiple
        class="visually-hidden"
        onChange={async (event) => {
          const files = [...(event.currentTarget.files ?? [])];
          event.currentTarget.value = "";
          for (const file of files) await remember(itemFromFile(file));
          if (files[0] && input.current) {
            fillFileInput(input.current, [files[0]]);
            setDelivered(files[0].name);
          }
        }}
      />

      {note && <p class="page__note">{note}</p>}

      {widget.mounted && (
        <div
          class="plop-root plop-layer"
          data-theme={theme}
          style={at ? { left: `${at.left}px`, top: `${at.top}px` } : undefined}
        >
          <PlopWidget
            clipboard={clipboard}
            pinned={pinned}
            recents={recents}
            pinnedIds={new Set(pinned.map((p) => p.id))}
            onPick={deliver}
            onDrop={(item, target) => {
              if (target.closest(".drop") || target === input.current) {
                void deliver(item);
              }
            }}
            clipboardEmpty={clipboard.length === 0}
            clipboardNote={clipboardNote}
            onTogglePin={togglePin}
            onBrowse={() => {
              setOpen(false);
              picker.current?.click();
            }}
            onOpenSettings={() => setSettingsOpen(true)}
            onClose={() => setOpen(false)}
            exiting={widget.exiting}
          />
        </div>
      )}

      {panel.mounted && (
        <div class="plop-root plop-panel-layer" data-theme={theme}>
          <SettingsPanel
            version="1.05.23"
            settings={settings}
            site={location.hostname}
            pinned={pinned}
            pinnedLimit={10}
            theme={theme}
            onToggleGlobal={(on) =>
              setSettings({ ...settings, enabledGlobally: on })
            }
            onToggleSite={(on) =>
              setSettings({
                ...settings,
                siteRules: { ...settings.siteRules, [location.hostname]: on },
              })
            }
            onSetTheme={setThemeOverride}
            onAddPin={() => pinPicker.current?.click()}
            onRemovePin={async (item) => {
              await store.remove("pinned", item.id);
              await reload();
            }}
            onUpdate={() => {}}
            onClose={() => setSettingsOpen(false)}
            exiting={panel.exiting}
          />
        </div>
      )}
    </main>
  );
}

render(<FieldTest />, document.getElementById("app")!);
