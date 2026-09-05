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

## Why this suite should not be sharded

At 12 seconds including the build, splitting across agents is worse than
useless. Each shard is a complete independent run — its own build, its own
server, its own first-run wizard — so three shards would each pay roughly six
seconds of build and setup to run two seconds of tests, and the build would
happen three times instead of once.

Sharding made sense when the fixed cost was ~20s of warm-up against ~35s of
specs. Removing the fixed cost removed the reason to shard. If the suite grows
back to minutes, revisit — the machinery is a `--shard` flag away — but measure
first.

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
