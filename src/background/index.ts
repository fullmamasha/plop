/**
 * Service worker.
 *
 * Chrome already checks the Web Store for updates on its own schedule and
 * downloads them in the background. Plop's job is only to notice when one is
 * ready, remember it, and apply it when the user asks. There is no polling,
 * no timer and no update server here on purpose.
 */

import {
  clearPendingUpdate,
  readPendingUpdate,
  setPendingUpdate,
} from "../settings-store";
import { installedVersion } from "../version";

/** Chrome has downloaded a new version and is waiting for a good moment. */
chrome.runtime.onUpdateAvailable.addListener(async ({ version }) => {
  await setPendingUpdate(version);
});

/** A marker for a version that is already installed is stale; drop it. */
async function reconcilePendingUpdate() {
  // readPendingUpdate clears the marker itself when it is no longer newer
  // than what is installed.
  await readPendingUpdate();
}

chrome.runtime.onStartup.addListener(reconcilePendingUpdate);
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === "update") await clearPendingUpdate();
  else await reconcilePendingUpdate();
});

/* ---------------------------------------------------------------------- */

export type UpdateStatus =
  | { state: "current"; version: string }
  | { state: "available"; version: string; pending: string }
  | { state: "throttled"; version: string };

type Message =
  | { type: "plop:check-update" }
  | { type: "plop:apply-update" };

chrome.runtime.onMessage.addListener((message: Message, _sender, respond) => {
  if (message.type === "plop:check-update") {
    void checkForUpdate().then(respond);
    return true; // keep the channel open for the async reply
  }

  if (message.type === "plop:apply-update") {
    // Chrome swaps in the already-downloaded version on reload. Files are
    // never replaced by hand.
    chrome.runtime.reload();
    return false;
  }

  return false;
});

async function checkForUpdate(): Promise<UpdateStatus> {
  const version = installedVersion() ?? "0.0.0";

  // Only ever called from an explicit user action. Chrome throttles this, and
  // a throttled answer is normal rather than an error: automatic checks are
  // still happening in the background.
  let status: string | undefined;
  let offered: string | undefined;
  try {
    const result = await chrome.runtime.requestUpdateCheck();
    status = result.status;
    offered = result.version;
  } catch {
    return { state: "throttled", version };
  }

  if (status === "throttled") return { state: "throttled", version };

  if (status === "update_available") {
    const pending = offered ?? (await readPendingUpdate()) ?? version;
    await setPendingUpdate(pending);
    return { state: "available", version, pending };
  }

  const pending = await readPendingUpdate();
  return pending
    ? { state: "available", version, pending }
    : { state: "current", version };
}
