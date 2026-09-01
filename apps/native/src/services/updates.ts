import { Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import {
  cacheDirectory,
  createDownloadResumable,
  deleteAsync,
  getContentUriAsync,
} from 'expo-file-system/legacy';
import { APP_VERSION, UPDATE_LATEST_RELEASE_URL } from '../utils/constants';

/** MIME type Android's package installer registers for APKs. */
const APK_MIME_TYPE = 'application/vnd.android.package-archive';
/** Intent.FLAG_GRANT_READ_URI_PERMISSION — lets the installer read our file. */
const FLAG_GRANT_READ_URI_PERMISSION = 1;

export interface AvailableUpdate {
  /** Release version without the leading `v`, e.g. `1.2.0`. */
  version: string;
  /** Release notes body, may be empty. */
  notes: string;
  apkUrl: string;
  /** Size in bytes, or 0 when GitHub omits it. */
  apkSize: number;
  releaseUrl: string;
}

interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size?: number;
}

interface GitHubRelease {
  tag_name?: string;
  body?: string;
  html_url?: string;
  assets?: GitHubAsset[];
}

/** `v1.2.3-beta.1` -> `1.2.3-beta.1`. */
function stripTagPrefix(tag: string): string {
  return tag.trim().replace(/^v/i, '');
}

/**
 * Numeric release components only. Prerelease suffixes are dropped, so
 * `1.2.0-rc.1` and `1.2.0` compare equal — good enough here, since a
 * prerelease is never published as `latest`.
 */
function parseVersion(version: string): number[] {
  return stripTagPrefix(version)
    .split(/[-+]/)[0]
    .split('.')
    .map((part) => {
      const n = Number.parseInt(part, 10);
      return Number.isNaN(n) ? 0 : n;
    });
}

/** True when `candidate` sorts strictly after `current`. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left !== right) return left > right;
  }
  return false;
}

/**
 * Asks GitHub for the latest release and returns it when it ships an APK newer
 * than the running build. Resolves to `null` when we're already current, when
 * the release has no APK attached, or on any platform that can't sideload.
 * Throws on network/API failures so callers can surface them.
 */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  if (Platform.OS !== 'android') return null;

  const response = await fetch(UPDATE_LATEST_RELEASE_URL, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status}`);
  }

  const release = (await response.json()) as GitHubRelease | null;
  const tag = release?.tag_name;
  if (!tag) return null;

  const version = stripTagPrefix(tag);
  if (!isNewerVersion(version, APP_VERSION)) return null;

  const apk = (release.assets ?? []).find((asset) =>
    asset.name?.toLowerCase().endsWith('.apk')
  );
  if (!apk) return null;

  return {
    version,
    notes: release.body?.trim() ?? '',
    apkUrl: apk.browser_download_url,
    apkSize: apk.size ?? 0,
    releaseUrl: release.html_url ?? '',
  };
}

/**
 * Downloads the release APK into the cache directory, replacing any partial
 * file from an earlier attempt. Returns the local file URI.
 */
export async function downloadUpdate(
  update: AvailableUpdate,
  onProgress?: (progress: number) => void
): Promise<string> {
  const target = `${cacheDirectory}shelvarr-${update.version}.apk`;
  await deleteAsync(target, { idempotent: true }).catch(() => {
    // A leftover file we can't remove is overwritten by the download anyway.
  });

  const download = createDownloadResumable(
    update.apkUrl,
    target,
    {},
    ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
      // GitHub redirects to a CDN that sometimes omits Content-Length; fall
      // back to the size the release metadata reported.
      const total =
        totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : update.apkSize;
      onProgress?.(total > 0 ? Math.min(1, Math.max(0, totalBytesWritten / total)) : 0);
    }
  );

  const result = await download.downloadAsync();
  if (!result) throw new Error('Update download failed');

  // downloadAsync resolves even on HTTP errors, writing the error body to the
  // file. Installing that would fail with an unhelpful parse error.
  if (result.status !== undefined && (result.status < 200 || result.status >= 300)) {
    await deleteAsync(result.uri, { idempotent: true }).catch(() => {});
    throw new Error(`Update download failed (HTTP ${result.status})`);
  }

  return result.uri;
}

/**
 * Hands the downloaded APK to Android's package installer. The user still
 * confirms the install, and on Android 8+ must have allowed this app to
 * install unknown apps — the system prompts for that itself.
 */
export async function installUpdate(fileUri: string): Promise<void> {
  const contentUri = await getContentUriAsync(fileUri);
  await IntentLauncher.startActivityAsync('android.intent.action.INSTALL_PACKAGE', {
    data: contentUri,
    type: APK_MIME_TYPE,
    flags: FLAG_GRANT_READ_URI_PERMISSION,
  });
}
