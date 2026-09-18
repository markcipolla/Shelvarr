# Deploying to Dokploy without downtime

Dokploy runs services on Docker Swarm. By default a redeploy stops the running
container and starts the new one, so every deploy is a stretch of "Bad Gateway"
lasting as long as the app takes to boot. Swarm can instead start the new
container, wait for it to report healthy, and only then move traffic across —
but only if there is a health check for it to wait on. That is all
["zero downtime" in Dokploy][dokploy] is.

[dokploy]: https://docs.dokploy.com/docs/core/applications/zero-downtime

## What the repository already provides

`GET /up` is the probe: public, unauthenticated, plain text, and cheap. It
means *ready to serve* — one trivial read against the open database, so a
container whose data volume is missing or whose schema failed to run answers
`503` rather than `200`. That distinction is the whole point; a health check
that only proves a process is listening will happily hand traffic to a broken
container.

```console
$ curl -s -w ' %{http_code}\n' http://localhost:3000/up
ok 200
```

`GET /api/health` answers the same question in JSON (`{"status":"ok",…}`). It
is what the Android app uses to test a server address, and where installs from
before `/up` existed point their healthcheck, so it stays. Aim anything new at
`/up`.

The image carries a `HEALTHCHECK` (see the `web` stage of the `Dockerfile`), so
a Swarm service inherits one even with nothing configured in the Dokploy UI.
Both Compose files declare the same check for non-Swarm use.

## Application settings

Under **Advanced → Swarm Settings**, two blocks matter. Durations there are
Docker API values, which means **nanoseconds** — `30000000000` is 30 seconds,
not 30 nanoseconds and not 30 seconds' worth of milliseconds.

**Health Check** — only needed to override what the image already declares, or
to lengthen the start period on a slow host:

```json
{
  "Test": ["CMD", "wget", "-q", "--spider", "http://127.0.0.1:3000/up"],
  "Interval": 30000000000,
  "Timeout": 10000000000,
  "StartPeriod": 30000000000,
  "Retries": 3
}
```

Dokploy's own example uses `curl`. The Shelvarr runtime image is Alpine and has
no curl; `wget` is busybox's and is there. A `Test` naming a binary the image
does not have fails every probe, which pins the service at unhealthy and makes
every deploy roll back.

**Update Config** — this is the part that actually removes the downtime.
`"Order": "start-first"` is what overlaps the containers; without it the old
one is stopped first and the health check merely delays the gap:

```json
{
  "Parallelism": 1,
  "Order": "start-first",
  "Delay": 10000000000,
  "FailureAction": "rollback",
  "Monitor": 60000000000,
  "MaxFailureRatio": 0
}
```

`FailureAction: rollback` means a new container that never reports healthy is
discarded and the old one keeps serving, rather than the site staying down
until someone notices.

## Two things to know before turning `start-first` on

**Both containers are briefly live on the same SQLite file.** The database is
opened in WAL mode with a 15-second busy timeout, and scheduled jobs are
claimed atomically in SQL, so two server processes over the same file is a
supported state — `apps/web/lib/config/index.ts` says so explicitly. The
overlap is seconds. What it is not safe for is two *different* versions whose
schemas disagree: migrations run at startup and are not reversible, so the old
container spends the overlap talking to a database the new one has already
migrated. The migrations so far only add columns or drop ones nothing reads any
more, which the old code tolerates. One that drops or renames a column the
previous release still reads needs a deploy with `Order: stop-first` instead.

**Do not publish a host port.** Dokploy routes to the service through Traefik
on the overlay network. If the service also publishes `3000:3000`, the new
container cannot bind the port while the old one holds it, so `start-first`
deadlocks: the rollout waits for a container that can never start. Leave ports
unpublished and reach the app through its domain.

## Checking it worked

```console
$ docker service ps <service> --no-trunc      # old task stays Running until the new one is Healthy
$ docker inspect --format '{{json .State.Health}}' <container> | jq
```

During a good deploy the domain answers throughout. If it does not, the useful
question is whether the new task ever reached `Healthy` — if it went straight
to `Failed`, the health check itself is usually what is wrong (wrong port,
wrong path, a binary the image lacks), not the app.
