# Internal Workspace Protocol For Vendored Consumers

## Summary

The `agent-os` monorepo expressed many internal package relationships with pnpm-style relative `link:` specifiers. That works under pnpm, but Bun does not treat those package.json entries as local path dependencies inside a vendored workspace. For Bun consumers, install fails before any code can build.

This change rewrites internal monorepo package references from `link:...` to `workspace:*` so the fork remains valid under pnpm and becomes consumable as a vendored workspace under Bun.

It also adds the workspace layout to the monorepo root `package.json`, because Bun needs that root metadata when the repo is vendored into another workspace. `pnpm-workspace.yaml` alone is not sufficient for this Bun consumption path.

## Classification

- Type: additive packaging compatibility feature
- Scope: monorepo package metadata only
- Risk: low runtime risk, medium install-surface risk
- Regression constraint: preserve pnpm workspace behavior

## Concrete Evidence

### Behavior before the change

- Internal workspace references in `package.json` files used relative `link:` specifiers.
- Bun treated those entries as linked-package references rather than local workspace relationships.
- Bun also did not have root `package.json` workspace metadata to discover the vendored monorepo layout.
- A Bun install in a vendored test app failed with repeated errors such as:
  - `Package "@rivet-dev/agent-os-registry-types" is not linked`
  - `Package "@rivet-dev/agent-os-pi" is not linked`
  - `@rivet-dev/agent-os-codex@link:../../registry/software/codex failed to resolve`

### Behavior after the change

- Rewriting the same internal references to `workspace:*` allowed Bun to install the vendored monorepo successfully.
- A scratch Bun workspace then built the required packages in dependency order, including:
  - `@rivet-dev/agent-os-registry-types`
  - `@rivet-dev/agent-os-posix`
  - `@rivet-dev/agent-os-python`
  - `@rivet-dev/agent-os-common`
  - `@rivet-dev/agent-os-core`
  - `@rivet-dev/agent-os-pi`

## Root Cause

This is not an ACP or runtime bug. It is a package-manager interoperability gap.

- pnpm accepts the existing relative `link:` declarations inside the monorepo.
- Bun workspaces do not resolve those declarations as local relative packages during install.
- Bun also needs the vendored monorepo root to declare its workspace globs in `package.json`.
- `workspace:*` is the correct cross-workspace protocol for internal monorepo dependencies when the consumer wants Bun to understand the vendored package graph.

## Expected Behavior

- Internal monorepo dependencies should use `workspace:*`.
- The vendored monorepo root should declare its workspaces in `package.json`.
- pnpm should continue to resolve those relationships normally.
- Bun should be able to install the vendored monorepo as part of a parent workspace without manual `bun link` setup or package.json patching in the consumer repo.

## Implemented Behavior Now

- Internal `link:` package specifiers in workspace `package.json` files are replaced with `workspace:*`.
- The monorepo root `package.json` now declares the same workspace layout that already exists in `pnpm-workspace.yaml`.
- No runtime code paths are changed.
- The change is limited to monorepo dependency metadata so the fork can be consumed directly by Bun workspaces.

## Acceptance Criteria

- No internal workspace package references remain on `link:...` in `package.json`.
- The monorepo root `package.json` declares the workspace graph for Bun.
- pnpm workspace installs remain valid.
- Bun can install a vendored copy of the monorepo from a parent workspace using `workspace:*` dependencies.
- The parent consumer does not need global `bun link` state or one-off patching of vendored manifests.

## Notes

- This feature is required for `acai` because direct GitHub package dependencies against the monorepo root do not provide the individual workspace packages we need.
- A vendored fork plus `workspace:*` is the cleanest Bun-compatible consumption model found during investigation.
