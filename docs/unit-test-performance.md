# Unit test performance

The `test` job went from 83 seconds to 22. This is what was measured and why the
settings are what they are.

## The numbers

All on one machine (4 cores, warm pnpm store, warm tsx transform cache), `pnpm
--filter @shelvarr/web test`. Single runs are noisy, so each wall time below is
the median of the runs listed.

| | Wall time | Sum of files run one at a time |
| --- | --- | --- |
| Before | 83s (83.2, 83.8) | 203s |
| After | 22s (22.2, 22.2, 22.7) | 62s |

Test counts are unchanged apart from the four added below: 1516 → 1520.

CI agrees with the local shape. The GitHub-hosted `test` job reported
`duration_ms 80894` for the run itself, inside a ~100s job — so the suite was
roughly four-fifths of that job, and the rest is checkout, Node, and
`pnpm install`.

## Why it was slow

Almost none of it was work. Four services pause between outbound requests to
stay inside a third-party rate limit:

| | Pause |
| --- | --- |
| Hardcover — `graphqlFetch` spacing GraphQL calls | 1000ms, from a 60/min limit |
| ComicVine — `brake()` between requests | 1000ms |
| LibGen — `fetchWithRetry` backoff | 1000ms × attempt |
| GetComics — `fetchWithRetry` backoff | exponential from `BACKOFF_BASE_MS` |

Every one of those is real elapsed time, and the unit tests mock `fetch`. So
each pause was spent waiting on a request that had already returned.

`tests/unit/hardcover.test.ts` was the extreme case: **59.6 seconds, of which
about 59 were sleep.** Individual tests came in at a suspiciously exact 2001ms —
two mocked calls, two one-second waits. Because Node's test runner parallelises
across *files*, that one file was most of the suite's critical path all by
itself; no amount of extra concurrency could have helped.

The rest, in order: `queue-handlers-full.test.ts` at 26s (LibGen walks each
mirror, sleeping a second between the two attempts on every one),
`hardcover-status.test.ts` at 22.5s, `comics-library.test.ts` at 14.8s
(ComicVine's brake), `queue-complete.test.ts` at 8.8s.

## What changed

`packages/services/src/utils/pacing.ts` — one `pace(ms)` function that all four
services now call instead of hand-rolling `new Promise(r => setTimeout(r, n))`.
It is a no-op when `SHELVARR_DISABLE_REQUEST_PACING=1`, which `apps/web/.env.test`
sets.

The arithmetic that decides *how long* to pause did not move; only the sleeping
is switched off, and only where there is nothing to pace. Production and the E2E
suite never set the variable, so both keep the pauses. `pace` reads the variable
per call rather than at import so `tests/unit/pacing.test.ts` can exercise both
paths — an env lookup per outbound HTTP request costs nothing worth counting.

After: 59.6s → 0.7s for `hardcover.test.ts`, 22.5s → 0.5s for
`hardcover-status.test.ts`, 26s → 1.3s for `queue-handlers-full.test.ts`,
14.8s → 0.6s for `comics-library.test.ts`.

## Where the remaining 22 seconds go

It is now throughput-bound rather than critical-path-bound: 62s of work across
three worker processes is 21s, and the suite takes 22. No single file stands out
— the slowest is `components/Toast.test.tsx` at 6.6s, and the eight slowest are
all component tests.

Most of what is left is per-process startup. Node's test runner spawns a process
per file, and the floor is about **0.42s** for a plain TypeScript file (Node
boot, plus tsx registering its loader) and about **1.9s** for a `.tsx` one, which
additionally builds a JSDOM and imports React and Testing Library. Across 68
files that is a large fraction of the 62s, and it is not addressable without
changing test runners or merging files together.

## What was deliberately left alone

**Test concurrency.** Node defaults to `availableParallelism() - 1`, which is 3
on this machine and on a GitHub-hosted agent. Four is measurably better and
eight is not:

| `--test-concurrency` | Wall time |
| --- | --- |
| 3 (the default here) | 21.4s |
| 4 | 18.0s |
| 8 | 17.9s |

Roughly three seconds, and it is left on the table on purpose. The flag takes a
number, not a proportion, so pinning it to 4 would mean hardcoding this agent's
core count into every developer's machine — and slowing down every machine
larger than it, which is most of them. The default already scales.

**Sharding.** The same argument as the E2E suite, for the same reason: the
runner already parallelises across files within one job, and at 22s a second
agent would pay a fresh checkout and `pnpm install` — most of the job — to halve
the part that isn't those.

**The pauses themselves.** They are correct. ComicVine answers a burst with an
hour-long lockout, and the retries are what keep a flaky LibGen mirror from
sinking a download task. Nothing here makes them shorter in production.
