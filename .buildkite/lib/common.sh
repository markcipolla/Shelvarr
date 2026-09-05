#!/usr/bin/env bash
# Shared setup for every Buildkite step. Source it, do not execute it — the
# steps rely on the PATH it exports.
#
#     source .buildkite/lib/common.sh
#
# This runs inside the container from .buildkite/Dockerfile.ci, which supplies
# Node and Chromium's libraries but not pnpm — pnpm is pinned by the repo, so
# it is installed here from the version the repo asks for rather than baked
# into an image that would drift from it.
#
# The expensive part is a no-op on a warm agent: the pnpm store and the
# Playwright browsers live on named volumes that outlive the container, so
# `pnpm install` hardlinks from the store rather than downloading.

set -euo pipefail

: "${PNPM_VERSION:=9.15.0}"

# Corepack's shims normally go next to the `node` binary, which the container's
# uid cannot write to — it runs as the agent's user via propagate-uid-gid, not
# as root. $HOME is /tmp here for the same reason: world-writable, so it works
# whoever we turn out to be.
COREPACK_SHIMS="${HOME}/.local/bin"
mkdir -p "$COREPACK_SHIMS"
export PATH="${COREPACK_SHIMS}:${PATH}"

if ! command -v corepack >/dev/null 2>&1; then
  echo "^^^ +++"
  echo "No \`corepack\` here, so pnpm cannot be installed."
  echo "Node $(node --version 2>/dev/null || echo '(missing)') is on PATH; this needs Node 24 with corepack."
  echo "Steps are meant to run in the container from .buildkite/Dockerfile.ci —"
  echo "check the docker-compose plugin is attached to this step."
  exit 1
fi

# Checked before pnpm does anything, because the failure otherwise arrives as
# an unrelated-looking install or syntax error much further in.
node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -lt 24 ]; then
  echo "^^^ +++"
  echo "Node ${node_major} here; the root package.json requires >=24."
  echo "The CI image is built FROM node:24-bookworm, so this means the step ran"
  echo "somewhere else — check the docker-compose plugin is attached to it."
  exit 1
fi

corepack enable --install-directory "$COREPACK_SHIMS" pnpm >/dev/null
corepack prepare "pnpm@${PNPM_VERSION}" --activate >/dev/null

echo "--- :pnpm: Installing dependencies"
# --frozen-lockfile is the point of running this in CI: a lockfile that does
# not match package.json should fail the build rather than be silently updated.
pnpm install --frozen-lockfile
