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
org's `Default` group is no exception:

```console
$ gh api orgs/markcipolla/actions/runner-groups --jq '.runner_groups[] | {name, allows_public_repositories}'
{"name":"Default","allows_public_repositories":false}
```

Until that changes, `runs-on: self-hosted` in this repository queues forever
rather than failing — the job just never gets picked up.

**Do not flip that flag on `Default`.** `Default` holds the `dokploy-runner-*`
fleet, which has deploy access, and `visibility: all` means enabling public
repositories there would expose those runners to every public repository in the
org. Make a dedicated group instead:

```sh
# 1. A group only Shelvarr can use, that accepts a public repository.
REPO_ID=$(gh api repos/markcipolla/Shelvarr --jq .id)
gh api --method POST orgs/markcipolla/actions/runner-groups \
  -f name='public-ci' \
  -f visibility='selected' \
  -F allows_public_repositories=true \
  -F "selected_repository_ids[]=$REPO_ID"

GROUP_ID=$(gh api orgs/markcipolla/actions/runner-groups \
  --jq '.runner_groups[] | select(.name=="public-ci") | .id')

# 2. Move the runners you are willing to expose into it, one at a time.
gh api orgs/markcipolla/actions/runners --jq '.runners[] | "\(.id)\t\(.name)"'
gh api --method PUT "orgs/markcipolla/actions/runner-groups/$GROUP_ID/runners/<RUNNER_ID>"

# 3. Confirm.
gh api "orgs/markcipolla/actions/runner-groups/$GROUP_ID/runners" \
  --jq '.runners[] | .name'
```

Group membership is what gates access, so `runs-on: self-hosted` in
`ci-self-hosted.yml` resolves only to runners in a group this repository can
reach. No custom labels are needed.

### Harden the runners in that group

Commit `efa3ab0` moved CI off self-hosted partly because the runner ran jobs as
root with the Docker socket mounted, on the same network as the media server.
Confirm that is not true of whatever lands in `public-ci`, and prefer:

- `--ephemeral` registration, so a runner takes one job and is then destroyed.
- No Docker socket mount.
- A network segment with no route to the media server or to cloud metadata.

The trigger split means fork code should never run here — these are defence in
depth for the case where that assumption is wrong.

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
