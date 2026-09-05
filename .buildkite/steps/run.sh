#!/usr/bin/env bash
# Run one command with the toolchain set up.
#
# Every step goes through here rather than sourcing common.sh inline, because
# the docker-compose plugin executes step commands with `/bin/sh -e -c` and
# common.sh is bash — `source` is not `.`, and `set -o pipefail` is not POSIX,
# so dash rejects both. Writing the pipeline in two shells is a trap waiting
# for the next person; a shebang is not.
#
#     command: .buildkite/steps/run.sh pnpm --filter @shelvarr/web lint

set -euo pipefail

source "$(dirname "$0")/../lib/common.sh"

exec "$@"
