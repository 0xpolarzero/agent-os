# Future-Fix Prompt: Workspace-Native Package Links

Use a fresh git worktree for the change. Do not work in the shared checkout.

## Objective

Convert the monorepo's internal package references from pnpm-style relative `link:` strings to workspace-native references that Bun and other workspace-aware package managers can resolve directly.

## Mandatory Working Style

- Use subagents heavily.
- Split the work into at least 3 subagents with non-overlapping responsibilities.
- Keep one orchestrator focused on synthesis, conflict resolution, and final validation.
- Do not let one subagent both implement and approve the change.

## Required Subagents

1. Manifest audit subagent
- Find every `link:` occurrence in `package.json` files.
- Confirm whether each target is an internal workspace package.
- Identify any root workspace metadata Bun will need.

2. Implementation subagent
- Replace internal `link:` refs with `workspace:*`.
- Add root workspace metadata if needed.
- Do not change runtime source code.

3. Verification subagent
- Prove there are no `link:` refs left in `package.json`.
- Run the narrowest install/build validation that exercises workspace resolution.
- Separate real regressions from pre-existing package-manager issues.

## Files In Scope

- `package.json`
- any `package.json` under `packages/`, `registry/`, or `examples/`
- `docs/features/workspace-native-package-links.md`
- `docs/features/workspace-native-package-links.prompt.md`

Do not touch unrelated source files.

## Technical Requirements

- Replace all internal monorepo dependency edges that currently use `link:` with `workspace:*`.
- Keep the dependency graph unchanged otherwise.
- Add root workspace metadata so Bun can see the workspace layout directly.
- Preserve pnpm compatibility.

## Validation Requirements

- Run `rg -n 'link:' -g 'package.json'` and ensure it returns no matches.
- Run `bun install` or the narrowest equivalent validation available in the repo.
- Report exact commands and outcomes.

## Final Deliverable

Return:

- a short summary of the packaging change
- the exact verification commands and results
- every modified file
- any remaining packaging limitation, if one exists
