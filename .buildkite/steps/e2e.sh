#!/usr/bin/env bash
# The Playwright suite.
#
# `test:e2e` builds the app and serves the build, rather than driving
# `next dev` — that is what took this from ~54s to ~12s, and what removed the
# reason to shard it across agents. See docs/e2e-performance.md.

set -euo pipefail

source "$(dirname "$0")/../lib/common.sh"

cd apps/web

# Installs nothing when the cached browser already matches the pinned version,
# which is the normal case: PLAYWRIGHT_BROWSERS_PATH points at a directory on
# the agent that outlives the container.
#
# There is deliberately no preflight check for Chromium's shared libraries
# here. An earlier version grepped ldconfig for libnss3 and failed the job with
# an explanation — and then fired on an agent where the image had installed
# those libraries and passed its own build-time check for them. A second source
# of truth that can disagree with the first is worse than none: Playwright
# reports a browser that will not start, and names the library, better than a
# hand-rolled guess at the same question.
pnpm exec playwright install chromium

exec pnpm test:e2e
