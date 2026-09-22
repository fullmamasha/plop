/**
 * Dev gallery — not part of the extension.
 *
 * Two boards:
 *   · Live         — one widget and one settings panel wired together. The
 *                    theme switcher in the panel re-themes both surfaces,
 *                    pinning a card fills the panel's list, and back again.
 *                    This is the board to poke at.
 *   · Side by side — both themes frozen next to each other, for comparing
 *                    against the Figma renders.
 *
 * `?zoom=2` scales the page for close visual comparison.
 */

import "@fontsource-variable/inter";
import "../src/styles/tokens.css";
import "../src/styles/glass.css";
import "../src/styles/plop.css";
import "./gallery.css";

import { render } from "preact";
import { useRef, useState } from "preact/hooks";
import { PlopWidget } from "../src/ui/widget";
import { SettingsPanel, type UpdateState } from "../src/ui/settings";
import { canPreview, type PlopItem, type PlopTheme } from "../src/types";
import { UploadField } from "./upload-field";
import * as mock from "./mock";

const systemTheme = (): PlopTheme =>
  matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";

/** A widget and a panel sharing state, so the two surfaces drive each other. */
function Board({
  theme,
  live,
  onSetTheme,
}: {
  theme: PlopTheme;
  /** Frozen reference boards skip the reveal animation. */
  live: boolean;
  onSetTheme: (theme: PlopTheme) => void;
}) {
  const [settings, setSettings] = useState(mock.settings);
  // One list backs both surfaces: pinning a card in the widget is the same
  // action as the row appearing under "Pinned files" in settings.
  const [pinned, setPinned] = useState(mock.pinned);
  const [update, setUpdate] = useState<UpdateState>({
    kind: "available",
    version: "0.2.0",
  });
  const [installing, setInstalling] = useState(false);
  // "Select from PC" opens a real picker; what comes back becomes Recents,
  // carrying the actual File so it can be handed to an upload field later.
  const [recents, setRecents] = useState(mock.recents);
  const picker = useRef<HTMLInputElement>(null);
  const pinPicker = useRef<HTMLInputElement>(null);

  const itemsFrom = (files: FileList | null): PlopItem[] =>
    [...(files ?? [])].map((file, i) => ({
      id: `picked-${Date.now()}-${i}`,
      kind: "file",
      name: file.name,
      mimeType: file.type,
      size: file.size,
      preview: canPreview(file.type) ? URL.createObjectURL(file) : undefined,
      file,
      createdAt: Date.now(),
    }));

  const pinnedIds = new Set(pinned.map((p) => p.id));

  const togglePin = (item: PlopItem) => {
    setPinned((current) =>
      current.some((p) => p.id === item.id)
        ? current.filter((p) => p.id !== item.id)
        : [...current, item]
    );
  };

  const runUpdate = () => {
    setInstalling(true);
    setTimeout(() => {
      setInstalling(false);
      setUpdate({ kind: "current" });
    }, 2600);
  };

  return (
    <div
      class={`plop-root${live ? "" : " plop-root--static"}`}
      data-theme={theme}
    >
      <div class="stage__row">
        <PlopWidget
          clipboard={mock.clipboard}
          pinned={pinned}
          recents={recents}
          pinnedIds={pinnedIds}
          onPick={(item) => console.log("pick", item)}
          onDrop={(item: PlopItem, target: Element) => {
            const field = target.closest(".upload") as
              | (HTMLElement & { plopAccept?: (item: PlopItem) => void })
              | null;
            if (field?.plopAccept) field.plopAccept(item);
            else console.log("drop", item);
          }}
          onTogglePin={togglePin}
          onBrowse={() => picker.current?.click()}
          onOpenSettings={() => console.log("settings")}
          onClose={() => console.log("close")}
        />
      </div>

      {/* The native picker "Select from PC" hands off to. */}
      <input
        ref={picker}
        type="file"
        multiple
        class="upload__input"
        onChange={(event) => {
          setRecents((current) => [
            ...itemsFrom(event.currentTarget.files),
            ...current,
          ]);
          event.currentTarget.value = "";
        }}
      />

      {/* "Add" under Pinned files opens the same OS dialog. */}
      <input
        ref={pinPicker}
        type="file"
        multiple
        class="upload__input"
        onChange={(event) => {
          setPinned((current) => [
            ...current,
            ...itemsFrom(event.currentTarget.files),
          ]);
          event.currentTarget.value = "";
        }}
      />

      <UploadField />

      <div class="stage__row">
        <SettingsPanel
          version="1.05.23"
          update={update}
          installing={installing}
          settings={settings}
          site="figma.com"
          pinned={pinned}
          pinnedLimit={10}
          theme={theme}
          onToggleGlobal={(on) =>
            setSettings({ ...settings, enabledGlobally: on })
          }
          onToggleSite={(on) =>
            setSettings({
              ...settings,
              siteRules: { ...settings.siteRules, "figma.com": on },
            })
          }
          onSetTheme={onSetTheme}
          onAddPin={() => pinPicker.current?.click()}
          onRemovePin={(item) =>
            setPinned(pinned.filter((p) => p.id !== item.id))
          }
          onCheckUpdate={() => setUpdate({ kind: "current" })}
          onUpdate={runUpdate}
          onClose={() => console.log("close settings")}
        />
      </div>
    </div>
  );
}

function Stage({
  title,
  theme,
  live = false,
  onSetTheme,
}: {
  title: string;
  theme: PlopTheme;
  live?: boolean;
  onSetTheme: (theme: PlopTheme) => void;
}) {
  return (
    <section class="stage">
      <h2 class="stage__title">{title}</h2>
      <Board theme={theme} live={live} onSetTheme={onSetTheme} />
    </section>
  );
}

function Gallery() {
  const [theme, setTheme] = useState<PlopTheme>(systemTheme);

  return (
    <>
      <main class="gallery">
        <Stage
          title={`Live — theme follows the switcher (${theme})`}
          theme={theme}
          live
          onSetTheme={setTheme}
        />
      </main>

      <main class="gallery">
        <Stage title="Dark" theme="dark" onSetTheme={() => {}} />
        <Stage title="Light" theme="light" onSetTheme={() => {}} />
      </main>
    </>
  );
}

/** `?zoom=2` scales the whole page for close visual comparison with Figma. */
const zoom = Number(new URLSearchParams(location.search).get("zoom")) || 1;
if (zoom !== 1) document.documentElement.style.zoom = String(zoom);

render(<Gallery />, document.getElementById("app")!);
