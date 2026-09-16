#!/usr/bin/env node
// Works out which version an automatic release should publish, if any.
//
// Patches are cut for you: once master is green, anything that changed the app
// since the last release goes out as `<latest>.<patch + 1>`. Three cases change
// that answer:
//
//   - Nothing under the app has changed since the last tag. A web-only run
//     shouldn't push an update notification to every phone for no new code.
//   - The commit already carries a version tag. Someone is cutting a release by
//     hand, and that tag's own workflow run is building it; nothing to do here.
//   - app.json is ahead of every tag. Someone bumped the minor or major version
//     in a pull request, so publish exactly that rather than burying it under a
//     patch bump of the older train.
//
// Prints a `tag=` line for GITHUB_OUTPUT. An empty tag means "don't release".
//
// Usage: node scripts/next-release.mjs >> "$GITHUB_OUTPUT"

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bumpPatch, compareVersions, parseVersion } from './version.mjs';

const nativeDir = dirname(dirname(fileURLToPath(import.meta.url)));
// Pathspecs below are repository-relative, so the git calls must be too, however
// the script was invoked.
const repoRoot = dirname(dirname(nativeDir));

// What the APK is built from: the app itself, and the one workspace package it
// depends on. Documentation is excluded — it ships with the repository, not the
// app.
const WATCHED_PATHS = ['apps/native', 'packages/types'];

function git(...args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

/** Every `v1.2.3` tag matching the filter, as bare versions. */
function taggedVersions(...filter) {
  return git('tag', '--list', 'v*', ...filter)
    .split('\n')
    .map((tag) => tag.trim().replace(/^v/, ''))
    .filter((version) => parseVersion(version));
}

function skip(why) {
  console.error(`next-release: ${why}`);
  console.log('tag=');
  process.exit(0);
}

const onThisCommit = taggedVersions('--points-at', 'HEAD');
if (onThisCommit.length > 0) {
  skip(`HEAD is already tagged v${onThisCommit.join(', v')} — leaving that release alone`);
}

const appVersion = JSON.parse(readFileSync(join(nativeDir, 'app.json'), 'utf8')).expo.version;
if (!parseVersion(appVersion)) {
  console.error(`next-release: expo.version "${appVersion}" in app.json is not a version like 1.2.0`);
  process.exit(1);
}

const released = taggedVersions().sort(compareVersions);
const latest = released[released.length - 1];

if (latest === undefined) {
  console.error('next-release: no release tags yet, publishing app.json as-is');
  console.log(`tag=v${appVersion}`);
  process.exit(0);
}

const changed = git('diff', '--name-only', `v${latest}..HEAD`, '--', ...WATCHED_PATHS)
  .split('\n')
  .filter((file) => file && !file.endsWith('.md'));

if (changed.length === 0) {
  skip(`nothing under ${WATCHED_PATHS.join(' or ')} has changed since v${latest}`);
}

const next = compareVersions(appVersion, latest) > 0 ? appVersion : bumpPatch(latest);

console.error(
  `next-release: v${next} — ${changed.length} file(s) changed since v${latest} (app.json ${appVersion})`
);
console.log(`tag=v${next}`);
