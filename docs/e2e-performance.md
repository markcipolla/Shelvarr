# E2E performance

The suite went from 65 seconds to 12. This is what was measured and why the
settings are what they are.

## The numbers

All on one machine (11 cores, warm pnpm store, Chromium already downloaded),
single runs, `CI=1`. Single runs are noisy at these durations — treat the
shape as reliable and the last digit as not.

| Configuration | Wall time |
| --- | --- |
| `next dev`, 1 worker, with route warm-up — **the old default** | 65s |
| production build + `next start`, 1 worker | 10s |
| production build + `next start`, 2 workers | 7s |
| production build + `next start`, **4 workers** | **6s** |
| production build + `next start`, 8 workers | 6s |

Plus `next build` itself: about 6 seconds from cold. End to end from a clean
checkout — build and test, which is what `pnpm test:e2e` now does — **12s**.

Test counts are unchanged: 68 passed, 5 skipped. The old run reported 69
because the warm-up project counted as a test.

## Why it was slow

`next dev` compiles each route the first time it is asked for. That cost had to
land somewhere, and the suite dealt with it twice over:

- **`tests/e2e/warm.setup.ts`** walked eleven routes before any spec ran, so the
  compile happened once in a place that could afford it rather than stalling
  whichever spec hit a route first.
- **`workers: 1`** under CI, because one dev server serving several cold first
  hits at once means the slowest one outlasts an assertion.

Both are workarounds for compilation, not for anything about the tests. A
production build has no compilation at request time, so both disappear: the
warm-up project has nothing to warm, and the worker count stops being bounded
by the server.

## Why 4 workers

The curve above flattens between 4 and 8 — the fourth worker is worth about a
second, the fifth through eighth are worth nothing measurable. Four is the last
point that buys anything, and staying there rather than going higher leaves
headroom on an agent with fewer cores than this machine.

`E2E_WORKERS` overrides it. Since the curve is flat from 4 up, a smaller agent
can drop to 2 for about a second.

## Where the CI job's time goes

The numbers above are the suite. The `e2e` job around it is mostly not the
suite. Measured on a GitHub-hosted `ubuntu-latest` agent:

| Step | Before | After |
| --- | --- | --- |
| checkout, Node, pnpm | 3s | 3s |
| `pnpm install --frozen-lockfile` | 15s | 15s |
| `next build` (separate step) | 17s | — |
| `playwright install --with-deps chromium` | 20s | ~14s |
| `pnpm test:e2e` (build 16s + server 2s + **specs 16s**) | 33s | 33s |
| **Total** | **92s** | **~65s** |

Two things came out of that.

**The build ran twice.** The job had a `Build` step and then ran `test:e2e`,
which is `next build && playwright test`. Turbopack's second build was a full
rebuild, not an incremental one — same 8s compile — so the first one produced
17 seconds of output that nothing read. The separate step is gone; the job runs
`test:e2e`, which is also what you run locally.

The self-hosted job had the same duplication with a twist: it built, then
deleted `.next` in its disk-cleanup step because the suite "runs `next dev`",
then rebuilt inside `test:e2e`. That comment predated this document.

**The browser download is cached.** `~/.cache/ms-playwright`, keyed on the exact
Playwright version with no `restore-keys`, because a browser build is only valid
for the version that pinned it and a stale one is worse than a re-download. The
apt half of `--with-deps` (~12s) is not cacheable and still runs.

## Why this suite should not be sharded

Because sharding is a way to spend fixed cost to buy variable cost, and this job
has almost no variable cost left. Sixteen seconds of specs sit under ~50 seconds
of install, browser and build that every shard pays in full and independently —
its own checkout, its own `pnpm install`, its own browser, its own build, its own
server, its own first-run wizard. Two shards would take the job from ~65s to
~57s while using twice the agent minutes; three would make it slower than one.

Sharding made sense when the fixed cost was ~20s of warm-up against ~35s of
specs. Removing the fixed cost removed the reason to shard. If the specs grow
back to minutes, revisit — the machinery is a `--shard` flag away — but measure
first, and shard the specs, not the setup.

For the same reason, the within-run worker count is already at its ceiling:
`ubuntu-latest` has 4 vCPUs and the default is 4 workers.

And note the `e2e` job is not what a pull request waits on. `test` (the unit
suite) takes ~100s, so it is the long pole; e2e work below ~100s buys agent
minutes, not wall time.

## Running it

```sh
pnpm --filter @shelvarr/web test:e2e        # build, then run: what CI does
pnpm --filter @shelvarr/web test:e2e:dev    # dev server, no build step
```

`test:e2e:dev` exists for the local loop, where rebuilding to re-run one spec is
the slower option and hot reload is worth having. It keeps the warm-up project
and one worker, so it behaves like the old default.

## What was deliberately left alone

`retries: 2` and `expect.timeout: 15_000` were both sized for cold-compile
stalls that no longer happen, so both are now generous. They stay: CI agents are
slower than this machine, the cost of an over-long timeout is only paid on a
failure, and tightening them on the strength of laptop numbers is how a suite
becomes flaky on hardware you did not measure.
