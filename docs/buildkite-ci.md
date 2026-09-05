# Buildkite CI

Buildkite runs the suite on our own agents while keeping the control plane
hosted. The pipeline lives in [`.buildkite/pipeline.yml`](../.buildkite/pipeline.yml);
the image its steps run in, and the scripts they call, are alongside it.

It replaced the GitHub Actions CI workflows outright — see
[What happened to GitHub Actions](#what-happened-to-github-actions). Two
workflows remain, and neither runs tests.

## The pipeline

| Group | Steps | Jobs |
| --- | --- | --- |
| Static analysis | lint (web), typecheck (web), typecheck (packages), lint + typecheck (native) | 4 |
| Tests | unit (web), unit (native) | 2 |
| E2E | Playwright | 1 |
| Build | `next build` | 1 |

Ten jobs, and nothing declares `depends_on`, so they all start at once and the
build is as long as its slowest job. That is deliberate: a lint failure is
worth knowing about at the same time as a test failure, not after it.

There is no Docker step. `docker-publish.yml` already builds the image on
master with a warm layer cache, and repeating it here would be an uncached
from-scratch install-and-build for the same signal.

## Nothing is sharded, and that was measured

Both candidates were tried and neither paid.

**The web unit suite** takes about 63 seconds. Split three ways
(433/579/511 tests), the largest shard still took about 60 — because the run is
only ~60s of serial suite time in total and one file,
`tests/unit/hardcover-status.test.ts`, is 22s of it. Sharding splits files; it
cannot split a file. That 22 seconds is the floor on any number of agents, so
three agents each paying for their own `pnpm install` would have bought three
seconds. The way to make this suite faster is to make that file faster.

**The E2E suite** used to be the obvious candidate: ~54s against `next dev`,
sharded three ways to ~31s each. That is no longer the shape of the problem.
It now builds once and serves the build, which took the whole suite to ~12s
including the build (see [e2e-performance.md](./e2e-performance.md)). At that
size sharding is worse than useless — each shard is a complete independent run
with its own build, server and first-run wizard, so three would each spend ~6s
getting ready to run ~2s of tests, and build three times instead of once.

The general lesson, which is why this section exists rather than a
`parallelism` setting: both suites had a fixed cost that did not divide. Look
for that before reaching for more agents. If either grows back to minutes,
Buildkite's `parallelism: N` and the runners' `--shard` flags are still there —
but measure first.

## How steps run

Every step runs inside the container built from
[`.buildkite/Dockerfile.ci`](../.buildkite/Dockerfile.ci), via the
`docker-compose` plugin pointed at
[`.buildkite/docker-compose.ci.yml`](../.buildkite/docker-compose.ci.yml). The
plugin config is a YAML anchor in the pipeline, so every step gets the same
container and there is one place to bump the version.

That shape is the point. **The agents stay generic** — Buildkite and Docker,
nothing else — so the same fleet runs this repo and the Ruby, Python, Go and
Rust ones alongside it, each bringing its own image. The alternative, baking
Node into the agent, needs a fleet per language and makes the toolchain a
thing you deploy rather than a thing you commit.

It also means the toolchain is versioned with the code that needs it. Bumping
Node is a pull request against this repo, reviewable next to whatever needed
the bump, rather than an out-of-band change to a host.

### What the agents need

Only two things:

- **Docker**, with a daemon the job can reach.
- **Nothing else.** No Node, no pnpm, no browser libraries.

`.buildkite/lib/common.sh` still checks for Node 24 and corepack, and fails
with a pointer to the plugin rather than a confusing pnpm error — that check
exists to catch a step that lost its `plugins:` block, not to describe an agent
requirement.

### Caches

`/var/cache/shelvarr-ci/` on the agent host holds the pnpm store and the
Playwright browsers, bind-mounted into the container.

Bind mounts rather than named volumes for a specific reason: the plugin gives
each build its own Compose project, and a named volume belongs to one. Sharing
it across builds does work, but Compose warns on every job that the volume
"was created for project &lt;other&gt;" — noise that reads like a fault. A bind
mount has no project to belong to.

Both caches are safe for concurrent use — the pnpm store is content-addressed,
and Playwright locks around downloads — so jobs landing on one host share a
single copy rather than fighting over it.

### Why steps go through run.sh

The plugin runs step commands with `/bin/sh -e -c`. `common.sh` is bash:
`source` is not `.`, and `set -o pipefail` is not POSIX, so dash rejects both
and every step dies with `source: not found`. Rather than write the pipeline in
two shells, each step is

```
.buildkite/steps/run.sh <command>
```

where the shebang guarantees bash. `run.sh` sources `common.sh` and then
`exec`s what it was given.

The container runs as the agent's uid (`propagate-uid-gid`), not root, so the
files a build leaves in the checkout belong to the agent and its next
`git clean` can remove them. Root-owned leftovers would break the *second*
build on an agent, which is a memorable way to find out. `$HOME` is `/tmp` for
the same reason: corepack needs somewhere writable and the container's uid has
no home directory.

### Getting a build to run at all

Two things that are not in this repository:

- **The pipeline's Steps setting** must be `buildkite-agent pipeline upload`.
  A new pipeline is seeded with `echo "ran on $BUILDKITE_AGENT_NAME"` instead,
  and until it is replaced, `.buildkite/pipeline.yml` is never read — the build
  goes green having run an echo, which is worse than failing.
- **The queue must match.** The pipeline targets `default-queue`, which is what
  Buildkite's "Default cluster" actually names its queue; `default` is the easy
  assumption and is wrong. A job's **Timeline** tab prints the queue it was
  dispatched to. Override both ends with `SHELVARR_QUEUE` if yours differs.

Builds appear at all only once the pipeline is pointed at the repository with
no branch filter excluding the branch you pushed. The Buildkite GitHub App is
installed org-wide, so the GitHub half needs nothing.

## Fork safety

The GitHub Actions split exists because a `pull_request` run executes the
workflow file from the *fork's* head, so a fork can rewrite `runs-on` and put
its own code on our hardware. The trigger, not the file, has to be the
boundary there.

Buildkite has the same exposure in the same shape — the pipeline file is read
from the branch being built, so a fork controls it — and the same answer, but
it is a pipeline setting rather than a second file: under **Pipeline Settings →
GitHub**, "Build pull requests from third-party forked repositories" must stay
**off**. There is nothing in this repository that can turn it on.

This is the one piece of the old setup that did not survive the move as code.
GitHub Actions could express it in a file — the fork-facing suite ran on
GitHub-hosted runners, and the self-hosted one hung off a trigger forks cannot
raise — so it was reviewable in a pull request. Here it is a checkbox, which
means it can be switched on without leaving a trace in the repository. Worth
knowing when auditing.

If forks ever do need building, run them on a separate pipeline pointed at a
disposable queue. Do not enable it on this one.

## Required status checks

The `Shelvarr rules` ruleset gates merges on required status checks. It used to
name `ci.yml`'s three job IDs — `lint-and-typecheck`, `test`, `e2e` — and those
workflows no longer exist, so **the ruleset has to name Buildkite's check
instead**. Until it does, one of two things is true depending on the ruleset:
pull requests wait forever on checks that will never report, or nothing gates
merges at all. Neither is a state to leave it in.

By default Buildkite reports one commit status for the whole pipeline,
`buildkite/shelvarr` (the context is `buildkite/<pipeline-slug>`), rather than
one per step. So the ruleset requires a single context where it used to require
three, and a red step anywhere in the pipeline turns that one context red.

## What happened to GitHub Actions

`ci.yml` and `ci-self-hosted.yml` are gone; this pipeline does their job. The
elaborate split between them existed because Shelvarr is a public repository
sharing an org with self-hosted runners: a `pull_request` run executes the
workflow file from the fork's head, so fork code could rewrite `runs-on` and
land on our hardware. The answer was to keep the fork-facing suite on
GitHub-hosted runners and hang the self-hosted one off a `push` trigger forks
cannot raise. That is [Fork safety](#fork-safety) above, in a different shape.

Two workflows remain, neither of which runs tests:

| Workflow | Trigger | Why it stayed |
| --- | --- | --- |
| `docker-publish.yml` | push to `main`/`master`, `v*` tags, dispatch | Builds `linux/arm64` under QEMU, which needs privileged binfmt registration — host-wide state, better left on a throwaway runner |
| `release-native.yml` | `v*` tags | Builds an Android APK with Gradle, which needs the Android SDK that GitHub-hosted `ubuntu-latest` ships preinstalled |

`docker-publish.yml` used to chain off a successful `workflow_run` of **CI
(self-hosted)** so it only published what had passed. With that workflow gone
it publishes on a push to the default branch instead, and the ruleset provides
the guarantee more directly: nothing reaches `master` without a green required
check on the pull request.

### The self-hosted runner group

Nothing in this repository uses `runs-on: self-hosted` any more. The org's
`public-ci` runner group (id 3) was created solely for these workflows, so its
runners can go back to `Default`, where the private repositories can use them:

```sh
gh api orgs/markcipolla/actions/runner-groups/3/runners --jq '.runners[].id'
gh api --method PUT orgs/markcipolla/actions/runner-groups/1/runners/<RUNNER_ID>
```

Leave the empty group in place or delete it; it grants nothing on its own once
no workflow targets it.
