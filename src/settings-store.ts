/**
 * Preferences and the pending-update marker.
 *
 * `chrome.storage.sync` rather than IndexedDB: these are small values that
 * should follow the user between machines. Files stay in IndexedDB, which
 * sync storage could not hold anyway.
 */

import type { PlopSettings } from "./types";
import { installedVersion, isNewer } from "./version";

const SETTINGS_KEY = "settings";
const PENDING_KEY = "pendingUpdateVersion";

export const DEFAULT_SETTINGS: PlopSettings = {
  enabledGlobally: true,
  siteRules: {},
  theme: null,
};

export async function readSettings(): Promise<PlopSettings> {
  const stored = await chrome.storage.sync.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] as PlopSettings) };
}

export async function writeSettings(settings: PlopSettings): Promise<void> {
  await chrome.storage.sync.set({ [SETTINGS_KEY]: settings });
}

/** Calls back whenever settings change, including from another tab. */
export function onSettingsChanged(listener: (settings: PlopSettings) => void) {
  const handler = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string
  ) => {
    if (area !== "sync" || !changes[SETTINGS_KEY]) return;
    listener({
      ...DEFAULT_SETTINGS,
      ...(changes[SETTINGS_KEY].newValue as PlopSettings),
    });
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}

/* ---------------------------------------------------------------------- */

export async function setPendingUpdate(version: string): Promise<void> {
  await chrome.storage.local.set({ [PENDING_KEY]: version });
}

export async function clearPendingUpdate(): Promise<void> {
  await chrome.storage.local.remove(PENDING_KEY);
}

/**
 * The version waiting to be applied, or null.
 *
 * A marker left over from an update that has already been installed is
 * cleared here rather than being reported, so the UI cannot offer an update
 * the user already has.
 */
export async function readPendingUpdate(): Promise<string | null> {
  const stored = await chrome.storage.local.get(PENDING_KEY);
  const pending = stored[PENDING_KEY] as string | undefined;
  if (!pending) return null;

  const installed = installedVersion();
  if (installed && !isNewer(pending, installed)) {
    await clearPendingUpdate();
    return null;
  }
  return pending;
}
