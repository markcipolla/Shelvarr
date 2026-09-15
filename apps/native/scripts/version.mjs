// Version arithmetic shared by the release scripts.

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/;

/** Parses "1.2.3" into [1, 2, 3], or returns null if it isn't a three-part version. */
export function parseVersion(version) {
  const match = VERSION_RE.exec(String(version));
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** Orders two valid versions the way `sort` wants: negative if a < b. */
export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}

/** "1.2.3" -> "1.2.4". */
export function bumpPatch(version) {
  const [major, minor, patch] = parseVersion(version);
  return `${major}.${minor}.${patch + 1}`;
}

// Android's versionCode is a signed 32-bit integer that only has to increase,
// so pack the version into fixed decimal fields: 1.2.3 -> 1002003. An earlier
// scheme packed them into hundreds (1.2.0 -> 10200), which capped a release
// train at 99 patches — too few now that patches are cut automatically. Every
// code this produces is larger than every code that one did for the same major,
// so installs still move forwards across the change.
// 2146.999.999 is the largest version that still fits a signed 32-bit int.
export const MAX_MAJOR = 2146;
export const MAX_FIELD = 999;

export function versionCode(version) {
  const [major, minor, patch] = parseVersion(version);
  return major * 1_000_000 + minor * 1_000 + patch;
}
