# Future-Fix Prompt: Internal Workspace Protocol For Vendored Consumers

Use a fresh git worktree off the target branch before making changes. Do not work in the shared checkout.

## Objective

Make the `agent-os` monorepo consumable as a vendored workspace in Bun-based apps without breaking pnpm usage inside the monorepo itself.

The desired outcome is simple:

- internal monorepo package references use `workspace:*`
- Bun can install the vendored workspace graph cleanly
- pnpm workspace behavior still works

Do not add consumer-side patch scripts or runtime workarounds if the source metadata can be fixed directly.

## Mandatory Working Style

- Use subagents heavily.
- Create a dedicated worktree first.
- Split the work across at least 3 subagents with non-overlapping responsibilities.
- The orchestrator handles synthesis, conflict resolution, and final validation only.
- Do not let one subagent both implement and approve its own work.

## Required Subagents

1. Package-manager audit subagent
- Inspect Bun dependency protocol behavior for vendored workspaces.
- Inspect pnpm workspace behavior for the same manifests.
- Identify every internal `link:` reference that should become `workspace:*`.
- Produce a short evidence note with exact failing and expected install behavior.

2. Implementation subagent
- Update only internal monorepo package metadata.
- Replace internal relative `link:` references with `workspace:*`.
- Avoid runtime code changes.
- Keep the package graph semantically identical.

3. Verification subagent
- Validate with the narrowest useful commands.
- Confirm Bun can install the vendored monorepo in a parent workspace.
- Confirm the relevant packages still build.
- Record exact commands, exit codes, and any residual warnings.

4. Docs subagent
- Update feature docs with:
  - classification
  - evidence
  - root cause
  - expected behavior
  - implemented behavior
  - acceptance criteria
- Keep the docs concrete and tool-backed.

## Files In Scope

- workspace `package.json` files with internal `link:` references
- lockfile updates only if required by the workspace manager in use
- `docs/features/workspace-protocol-internal-deps.md`
- `docs/features/workspace-protocol-internal-deps.prompt.md`

Do not change runtime logic unless a packaging-level dead end makes it strictly necessary.

## Technical Requirements

- Replace internal monorepo `link:` package specs with `workspace:*`.
- Do not change external non-workspace dependencies.
- Do not introduce consumer-specific path rewrites.
- Preserve pnpm monorepo semantics.
- Make Bun vendored-workspace installs succeed without global `bun link` state.

## Validation Requirements

- Reproduce the Bun install failure before the change if practical.
- Re-run the Bun install after the change and confirm success.
- Build the minimum required package chain to show the workspace graph resolves correctly.
- Report exact commands and exact outcomes.

## Final Deliverable

Return:

- a concise summary of the metadata changes
- the exact verification commands and results
- every modified file
- any unresolved compatibility or tooling risk
