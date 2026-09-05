# Self-hosted CI

Shelvarr is a **public** repository that shares an organisation with self-hosted
runners. That combination is the one GitHub warns about, so the split below is
deliberate: it is designed so that no amount of editing by a fork can put fork
code on our hardware.

## The two CI workflows

| Workflow | Trigger | Runner | Fork-reachable? |
| --- | --- | --- | --- |
| `ci.yml` ("CI") | `pull_request` | `ubuntu-latest` | **Yes** — this is the fork-facing gate |
| `ci-self-hosted.yml` ("CI (self-hosted)") | `push` to any branch, `workflow_dispatch` | `self-hosted` | No |
| `docker-publish.yml` | `workflow_run` of "CI (self-hosted)", `v*` tags, dispatch | `ubuntu-latest` | No |
| `release-native.yml` | `v*` tags | `ubuntu-latest` | No |

`ci.yml` is what the `Shelvarr rules` ruleset requires to merge. Its job IDs
(`lint-and-typecheck`, `test`, `e2e`) are the required status-check contexts, so
renaming one stops gating merges without any visible error.

## Why not one workflow with a `runs-on` expression

The widely-shared pattern is:

```yaml
runs-on: ${{ github.event.pull_request.head.repo.fork && 'ubuntu-latest' || 'self-hosted' }}
```

It routes correctly, and it is **not a security boundary**. For `pull_request`
events GitHub runs the workflow file from the pull request's merge ref — the
fork's copy — so a fork can simply change that line back to `self-hosted`. The
only thing left between a hostile pull request and the runner host is a
maintainer noticing a `.github/` diff before clicking "Approve and run".

The trigger split needs no such vigilance. Forks cannot raise a `push` event on
this repository; a fork's own pushes run in the fork's Actions context, which
cannot see our runners at all. `workflow_dispatch` requires write access.

A branch with an open pull request therefore runs both suites against the same
SHA — GitHub-hosted for the gate, self-hosted for speed. That duplication is
the price of the boundary. To trade it away, narrow `ci-self-hosted.yml` to
`branches: [master]`.

## Runner group setup (one-time, org settings)

By default org runner groups refuse public repositories, and the `markcipolla`
org's `Default` group is no exception. Until a group accepts this repository,
`runs-on: self-hosted` here does not fail — the jobs sit `queued` with no runner
assigned until GitHub's 24-hour self-hosted queue limit kills them. Scheduling
is a pull model with label matching, and GitHub cannot distinguish "no eligible
runner will ever exist" from "the runner is powered off right now", so it waits.

`Default` must stay as it is. It holds the `dokploy-runner-*` fleet, which has
deploy access, and its `visibility: all` means enabling public repositories
there would expose those runners to every public repository in the org. So a
dedicated group already exists instead:

```console
$ gh api orgs/markcipolla/actions/runner-groups/3 \
    --jq '{name, visibility, allows_public_repositories}'
{"name":"public-ci","visibility":"selected","allows_public_repositories":true}

$ gh api orgs/markcipolla/actions/runner-groups/3/repositories --jq '.repositories[].full_name'
markcipolla/Shelvarr
```

Group membership is what gates access, so `runs-on: self-hosted` in
`ci-self-hosted.yml` resolves only to runners in a group this repository can
reach. No custom labels are needed.

### Putting runners in it

Nothing that serves `Default` can serve `public-ci`. That pool is three warm
`dokploy-runner-*` containers plus burst capacity from the autoscaler, which
starts one ephemeral runner per queued `workflow_job` webhook. Both mount
`/var/run/docker.sock` — the autoscaler binds it into every runner it starts —
and that mount is root on the media-server host. It cannot simply be dropped either: `getmestre`, `household.email`,
`audiletome` and `niles` all start sibling containers or run `docker build`
through it. A socket-mounted runner is not safe to expose to a public repository
under any group configuration.

The autoscaler would not cover Shelvarr in any case: it sets no `RUNNER_GROUP`,
so the runners it starts register into `Default`, which refuses public repos.

`public-ci` is served by the `ci-runner-*` services in
`HomeServer/github_runner.yml`, built from a separate YAML anchor to the private
runners in the same file so the socket bind cannot be inherited by one:

- no Docker socket
- `EPHEMERAL: "true"` — one job per registration, then a clean re-register
- `RUN_AS_ROOT: "false"` and `no-new-privileges`
- its own bridge network; not attached to `dokploy-network`
- no shared tool-cache volume, so nothing a job writes reaches the next one
- `CI_RUNNER_PAT`, separate from `GITHUB_PAT` and scoped to self-hosted runner
  management only

```sh
# List runner IDs.
gh api orgs/markcipolla/actions/runners --jq '.runners[] | "\(.id)\t\(.name)"'

# A runner belongs to exactly one group. 1 = Default, 3 = public-ci.
gh api --method PUT orgs/markcipolla/actions/runner-groups/3/runners/<RUNNER_ID>
gh api --method PUT orgs/markcipolla/actions/runner-groups/1/runners/<RUNNER_ID>

# Confirm; expect only ci-runner-* in public-ci.
gh api orgs/markcipolla/actions/runner-groups/3/runners --jq '.runners[].name'
```

### Fork pull request approval

Set org-wide, so it covers every repository including ones added later:

```console
$ gh api orgs/markcipolla/actions/permissions/fork-pr-contributor-approval
{"approval_policy":"all_external_contributors"}
```

The default, `first_time_contributors`, stops asking once someone has one merged
contribution. Private repos are separately covered — `fork-pr-workflows-private-repos`
has `run_workflows_from_fork_pull_requests: false`.

This is a backstop, not the boundary. The trigger split is what keeps fork code
off the runners; approval only matters if that assumption is ever broken.

### Residual gaps

Known and accepted, in rough order of how much they would matter:

- `CI_RUNNER_PAT` sits in the container environment and a job can read it. Worst
  case is registering or removing org runners. A GitHub App minting short-lived
  registration tokens would close this.
- `EPHEMERAL` resets the registration, not the container. Docker restarts the
  same container, so its writable layer survives between jobs. True one-job
  containers need something outside Compose (ARC, or a systemd unit running
  `docker run --rm`).
- A separate Docker network isolates these runners from `dokploy-network`, but
  not from the host LAN — the media server is still routable via the gateway.
  Closing that needs host firewall rules, not Compose.
- Nothing in `ci-self-hosted.yml` currently needs Docker. If that changes, it has
  nowhere to run on this stack by design; use `ubuntu-latest` for that job.
- These two runners are always on, which is the standing cost HomeServer PR #40
  set out to remove. Teaching the autoscaler to key off the webhook's
  `repository.private` — public jobs get `RUNNER_GROUP=public-ci` and no socket
  bind — would delete them and give public repos burst capacity too.

## What is still on GitHub-hosted, and why

`docker-publish.yml` and `release-native.yml` are both fork-unreachable, so
fork safety is not what keeps them on `ubuntu-latest`. Toolchain availability
is:

- `release-native.yml` builds an Android APK with Gradle, which needs the
  Android SDK. GitHub-hosted `ubuntu-latest` ships it preinstalled; a
  self-hosted runner almost certainly does not, and the build would fail
  looking for `ANDROID_HOME`.
- `docker-publish.yml` builds `linux/arm64` via QEMU, which means
  `docker/setup-qemu-action` running a privileged `tonistiigi/binfmt`
  container. That may work on the dokploy runners, but binfmt registration is
  host-wide state, so it should be tried deliberately rather than assumed.

Both can move once the runner image is known to carry what they need.
