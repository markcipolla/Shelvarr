#!/usr/bin/env node
// Prepares app.json for a tagged release build.
//
// The tag is the source of truth for what gets published, and app.json is the
// version the running app compares against GitHub, so this writes the tag's
// version into app.json before the APK is built — otherwise the updater would
// keep offering a build the user already has. Patch releases are tagged
// automatically and never touch the committed app.json, so the checked-in
// version is only ever a floor; see scripts/next-release.mjs and RELEASING.md.
//
// This also stamps the Android versionCode, which has to increase monotonically
// for the package installer to accept an update over an existing install.
//
// Usage: node scripts/prepare-release.mjs v1.2.0

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MAX_FIELD, MAX_MAJOR, parseVersion, versionCode } from './version.mjs';

const appJsonPath = join(dirname(dirname(fileURLToPath(import.meta.url))), 'app.json');

function fail(message) {
  console.error(`prepare-release: ${message}`);
  process.exit(1);
}

const tag = process.argv[2];
if (!tag) fail('expected a release tag argument, e.g. v1.2.0');

const version = tag.replace(/^v/, '');
const parsed = parseVersion(version);
if (!parsed) fail(`tag "${tag}" is not a three-part version like v1.2.0`);

const [major, minor, patch] = parsed;
if (major > MAX_MAJOR) {
  fail(`major must stay at or below ${MAX_MAJOR} to keep versionCode a 32-bit int (got ${version})`);
}
if (minor > MAX_FIELD || patch > MAX_FIELD) {
  fail(
    `minor and patch must each stay at or below ${MAX_FIELD} to keep versionCode ordered (got ${version})`
  );
}

const code = versionCode(version);
const appJson = JSON.parse(readFileSync(appJsonPath, 'utf8'));

if (appJson.expo.version !== version || appJson.expo.android.versionCode !== code) {
  appJson.expo.version = version;
  appJson.expo.android.versionCode = code;
  writeFileSync(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`);
}

console.log(`prepare-release: ${version} (versionCode ${code})`);
