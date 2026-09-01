#!/usr/bin/env node
// Prepares app.json for a tagged release build.
//
// The tag is the source of truth for what gets published, and app.json is the
// version the running app compares against GitHub, so the two must agree or the
// updater will offer a build the user already has. This also stamps the Android
// versionCode, which has to increase monotonically for the package installer to
// accept an update over an existing install.
//
// Usage: node scripts/prepare-release.mjs v1.2.0

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appJsonPath = join(dirname(dirname(fileURLToPath(import.meta.url))), 'app.json');

function fail(message) {
  console.error(`prepare-release: ${message}`);
  process.exit(1);
}

const tag = process.argv[2];
if (!tag) fail('expected a release tag argument, e.g. v1.2.0');

const tagVersion = tag.replace(/^v/, '');
if (!/^\d+\.\d+\.\d+$/.test(tagVersion)) {
  fail(`tag "${tag}" is not a three-part version like v1.2.0`);
}

const appJson = JSON.parse(readFileSync(appJsonPath, 'utf8'));
const appVersion = appJson.expo.version;
if (appVersion !== tagVersion) {
  fail(
    `tag "${tag}" does not match expo.version "${appVersion}" in app.json.\n` +
      'Bump the version in app.json and commit it before tagging the release.'
  );
}

const [major, minor, patch] = tagVersion.split('.').map(Number);
if (minor > 99 || patch > 99) {
  fail(`minor and patch must each stay below 100 to keep versionCode ordered (got ${tagVersion})`);
}

const versionCode = major * 10000 + minor * 100 + patch;
if (appJson.expo.android.versionCode !== versionCode) {
  appJson.expo.android.versionCode = versionCode;
  writeFileSync(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`);
}

console.log(`prepare-release: ${tagVersion} (versionCode ${versionCode})`);
