# Future-Fix Prompt: PI Adapter Config/Model Support

Use a fresh git worktree off the target branch before making changes. You are not alone in the main checkout. Do not work in the shared worktree.

## Objective

Audit and harden the PI SDK ACP adapter so it exposes PI session state through ACP without regressing the existing compatibility surface. The current desired behavior is additive:

- keep `modes` and `session/set_mode`
- add `configOptions` and `models`
- add `session/set_config_option`
- add unstable `session/set_model`

Stay in the adapter/package layer unless a strictly minimal adjacent type or metadata change is required for the adapter feature itself.

## Mandatory Working Style

- Use subagents heavily.
- Create a dedicated worktree first.
- Split the work across at least 3 subagents with non-overlapping responsibilities.
- Have the orchestrator do only synthesis, conflict resolution, and final validation.
- Do not let one subagent both implement and sign off on its own work.

## Required Subagents

1. Protocol audit subagent
- Inspect the real ACP SDK types in use.
- Inspect the real PI SDK APIs in use.
- Produce a short evidence report covering:
  - what the adapter advertises now
  - what ACP surfaces exist and are relevant
  - what PI session/model APIs can back them
  - any compatibility constraints around `modes`

2. Implementation subagent
- Patch only the allowed adapter/package files.
- Keep `modes` / `session/set_mode` intact.
- Add the missing ACP config/model surfaces additively.
- Use real PI SDK state and mutators.

3. Verification subagent
- Add or refine focused tests only around the PI adapter feature.
- Run the narrowest relevant commands.
- Record exact commands, exit codes, warnings, and failures.
- Distinguish pre-existing environment/package issues from feature regressions.

4. Docs subagent
- Update feature documentation with:
  - classification
  - evidence
  - root cause
  - expected behavior
  - current behavior
  - acceptance criteria
- Keep docs concrete and implementation-backed.

## Files In Scope

- `registry/agent/pi/src/adapter.ts`
- `packages/core/tests/pi-sdk-adapter.test.ts` if needed
- minimal adjacent package metadata/types/docs only if directly required
- `docs/features/pi-adapter-config-model-support.md`
- `docs/features/pi-adapter-config-model-support.prompt.md`

Do not touch unrelated files. Do not revert changes you did not make.

## Technical Requirements

- `session/new` must keep returning `modes`.
- `session/new` must also return session-scoped `configOptions`.
- `session/new` must also return unstable `models` state when PI has a current model.
- `session/set_mode` must continue to mutate thinking level.
- `session/set_config_option` must support:
  - `thought_level`
  - `model`
- `session/set_model` must support model mutation.
- Model mutation must use the real PI SDK session and model registry.
- Config/model changes must return the full updated `configOptions`.
- Emit ACP config update notifications after successful config/model changes.

## Validation Requirements

- Run the narrowest relevant build/test commands only.
- If the workspace has missing installs or unrelated build blockers, isolate them and continue as far as possible.
- Report exact commands and exact outcomes.
- Include residual risks if any validation cannot be completed cleanly.

## Final Deliverable

Return:

- a concise summary of what changed
- the exact verification commands and results
- every modified file
- any unresolved risk or environment limitation
