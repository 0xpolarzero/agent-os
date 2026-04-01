# Fork Changes

This file tracks fork-only work in `0xpolarzero/agent-os` so we have a local record of additions that are not yet part of upstream `rivet-dev/agent-os`.

Last updated: 2026-04-01.

## Current Status

As of 2026-04-01:

- There are no open PRs on `0xpolarzero/agent-os`.
- There are no open PRs from `0xpolarzero/*` into `rivet-dev/agent-os`.
- The fork-only delta currently lives on `0xpolarzero/agent-os:main` through the merged PRs below.

## Merged Fork PRs

| PR | Merged | Overview |
| --- | --- | --- |
| [#1 fix(core): hydrate session metadata from session/new](https://github.com/0xpolarzero/agent-os/pull/1) | 2026-04-01 | Moves session metadata hydration to `session/new`, tightens handling for `modes` and `configOptions`, adds a missing `sessionId` guard during session creation, and extends regression coverage in core session tests. |
| [#2 feat(core): expose model state and use session/set_model](https://github.com/0xpolarzero/agent-os/pull/2) | 2026-04-01 | Adds typed model state to the core session API, hydrates it from `session/new`, switches model changes onto ACP `session/set_model`, and updates the core README, feature docs, and tests. |
| [#3 feat(pi): advertise config and model mutation](https://github.com/0xpolarzero/agent-os/pull/3) | 2026-04-01 | Extends the PI adapter to advertise `configOptions` and unstable `models`, adds `session/set_config_option` and `session/set_model`, preserves `session/set_mode` compatibility, and updates PI adapter docs and tests. |
| [#8 feat: add package snapshot workflow](https://github.com/0xpolarzero/agent-os/pull/8) | 2026-04-01 | Adds a manual GitHub Actions workflow and `scripts/package-snapshots.ts` helper for building standalone workspace package snapshots, rewriting workspace dependencies to tag tarballs, and emitting a publish manifest. |

## Combined Direction

- Session bootstrap is being normalized around `session/new` as the source of truth instead of `initialize`.
- Core session state is being expanded to expose model metadata and explicit model mutation APIs.
- The PI adapter is being brought up to parity so model and config discovery or mutation work end to end.
- Snapshot publishing can now be run from GitHub Actions for selected workspace packages without hand-preparing standalone tarball tags.

## Maintenance Notes

- Update this file whenever a fork PR is opened, merged, closed, renamed, or retargeted.
- Keep the PR links, status, and high-level summaries current so fork-specific work stays easy to audit.
