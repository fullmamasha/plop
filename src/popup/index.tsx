/**
 * The extensions-menu popup: Plop's settings.
 *
 * This is the route that has to keep working when Plop is switched off
 * everywhere, so it depends on nothing from the content script.
 */

import "../styles/tokens.css";
import "../styles/glass.css";
import "../styles/plop.css";
import "./popup.css";

import { render } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import { SettingsPanel, type UpdateState } from "../ui/settings";
import * as store from "../storage";
import {
  DEFAULT_SETTINGS,
  readPendingUpdate,
  readSettings,
  writeSettings,
} from "../settings-store";
import { installedVersion } from "../version";
import {
  canPreview,
  type PlopItem,
  type PlopSettings,
  type PlopTheme,
} from "../types";

const PINNED_LIMIT = 10;

function resolveTheme(preference: PlopTheme | null): PlopTheme {
  if (preference) return preference;
  return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function Popup() {
  const [settings, setSettings] = useState<PlopSettings>(DEFAULT_SETTINGS);
  const [pinned, setPinned] = useState<PlopItem[]>([]);
  const [update, setUpdate] = useState<UpdateState>({ kind: "idle" });
  const [installing, setInstalling] = useState(false);
  const [site, setSite] = useState<string | undefined>();
  const pinPicker = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setPinned(await store.list("pinned"));
  }, []);

  useEffect(() => {
    void readSettings().then(setSettings);
    void reload();

    // An update Chrome already downloaded is worth surfacing on open. This
    // reads stored state only; it does not ask Chrome to check.
    void readPendingUpdate().then((pending) => {
      if (pending) setUpdate({ kind: "available", version: pending });
    });

    void chrome.tabs
      ?.query({ active: true, currentWindow: true })
      .then(([tab]) => {
        if (!tab?.url) return;
        try {
          setSite(new URL(tab.url).hostname);
        } catch {
          /* a chrome:// or extension page has no host worth showing */
        }
      });
  }, [reload]);

  const save = (next: PlopSettings) => {
    setSettings(next);
    void writeSettings(next);
  };

  const checkUpdate = () => {
    setUpdate({ kind: "checking" });
    void chrome.runtime
      .sendMessage({ type: "plop:check-update" })
      .then((status) => {
        if (status?.state === "available") {
          setUpdate({ kind: "available", version: status.pending });
        } else if (status?.state === "throttled") {
          setUpdate({ kind: "throttled" });
        } else {
          setUpdate({ kind: "current" });
        }
      })
      .catch(() => setUpdate({ kind: "throttled" }));
  };

  const addPins = async (files: FileList | null) => {
    for (const file of [...(files ?? [])]) {
      if (pinned.length >= PINNED_LIMIT) break;
      await store.put("pinned", {
        id: `file-${crypto.randomUUID()}`,
        kind: "file",
        name: file.name,
        mimeType: file.type,
        size: file.size,
        preview: canPreview(file.type) ? URL.createObjectURL(file) : undefined,
        file,
        createdAt: Date.now(),
      });
    }
    await reload();
  };

  const theme = resolveTheme(settings.theme);

  return (
    <div class="plop-root" data-theme={theme}>
      <input
        ref={pinPicker}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          void addPins(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />

      <SettingsPanel
        version={installedVersion() ?? "0.0.0"}
        update={update}
        installing={installing}
        settings={settings}
        site={site}
        pinned={pinned}
        pinnedLimit={PINNED_LIMIT}
        theme={theme}
        onCheckUpdate={checkUpdate}
        onToggleGlobal={(on) => save({ ...settings, enabledGlobally: on })}
        onToggleSite={(on) =>
          site && save({ ...settings, siteRules: { ...settings.siteRules, [site]: on } })
        }
        onSetTheme={(next) => save({ ...settings, theme: next })}
        onAddPin={() => pinPicker.current?.click()}
        onRemovePin={async (item) => {
          await store.remove("pinned", item.id);
          await reload();
        }}
        onUpdate={() => {
          setInstalling(true);
          void chrome.runtime.sendMessage({ type: "plop:apply-update" });
        }}
        onClose={() => window.close()}
      />
    </div>
  );
}

render(<Popup />, document.getElementById("app")!);
