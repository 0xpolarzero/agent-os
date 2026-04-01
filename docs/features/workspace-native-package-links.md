# Workspace-Native Package Links

## Classification

- Area: repository packaging
- Type: compatibility feature
- Scope: internal monorepo package manifests only
- Risk: low runtime risk, medium packaging risk

## Summary

The monorepo now uses workspace-native dependency references instead of pnpm-style relative `link:` specifiers. Internal packages still depend on the same local code, but the dependency graph is now expressed with `workspace:*` so workspace-aware package managers can resolve it without global link setup.

The root package also declares workspace globs in `package.json`, which makes the repository readable by Bun in addition to pnpm.

## Concrete Evidence

- Before this change, internal package manifests used `link:` references such as:
  - `registry/package.json`
  - `packages/core/package.json`
  - `registry/tool/sandbox/package.json`
  - `examples/quickstart/package.json`
  - `registry/software/*/package.json`
- The repository already had a pnpm workspace definition in `pnpm-workspace.yaml`.
- Bun does not treat pnpm-style `link:` dependency strings as local workspace edges; it expects either workspace metadata or explicit linking.

## Root Cause

The repo was authored for pnpm and used `link:` to express local package relationships. That works in pnpm, but it is not a portable workspace declaration for Bun or other workspace-aware package managers that want to build the dependency graph from workspace manifests.

## Expected Behavior

- Internal package dependencies should use `workspace:*`.
- The repository root should advertise workspace globs in `package.json`.
- `bun install` should be able to resolve the monorepo without requiring manual `bun link` calls.
- pnpm should continue to work with the same package graph.

## Current Behavior

- All internal `link:` references have been replaced with `workspace:*`.
- `package.json` at the repository root now declares workspace globs for:
  - `registry`
  - `packages/*`
  - `examples/*`
  - `registry/software/*`
  - `registry/agent/*`
  - `registry/file-system/*`
  - `registry/tool/*`

## Acceptance Criteria

- No `link:` references remain in any `package.json`.
- Root `package.json` declares the monorepo workspace layout.
- Internal packages continue to reference each other locally through workspaces.
- The repo remains compatible with pnpm and becomes consumable by Bun without extra global linking.

## Non-Goals

- Do not change runtime code.
- Do not rewrite package names or exports.
- Do not introduce ad hoc `file:` paths as a workaround for local package resolution.
