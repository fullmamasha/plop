/**
 * Version handling.
 *
 * `package.json` is the canonical version; the build writes it into
 * `manifest.json`, and the UI reads it back from the manifest at runtime. The
 * UI never hardcodes a version string.
 */

/** The running extension's version, or null outside an extension context. */
export function installedVersion(): string | null {
  return globalThis.chrome?.runtime?.getManifest?.().version ?? null;
}

/**
 * Compares two semver strings numerically.
 *
 * Returns a negative number when `a` is older, 0 when equal, positive when
 * newer. String comparison is wrong here: "0.10.0" sorts before "0.9.0"
 * lexicographically, which would hide a real update.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.split(".").map((part) => Number(part) || 0);
  const left = parse(a);
  const right = parse(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** True when `candidate` is strictly newer than `current`. */
export function isNewer(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0;
}
