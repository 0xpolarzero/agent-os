# Future Fix Prompt: Core Session Metadata Hydration

Work in a dedicated git worktree and keep the PR narrowly scoped to the session metadata hydration bug in `@rivet-dev/agent-os-core`.

Use subagents heavily:

1. Subagent A: inspect the ACP contract and the local core implementation.
   Deliver a short note that identifies which fields are initialize-scoped vs session-scoped, with exact file references.
2. Subagent B: patch `packages/core/src/agent-os.ts`.
   Change only the hydration logic so `capabilities` and `agentInfo` come from `initialize`, while `modes` and `configOptions` come from `session/new`.
3. Subagent C: patch test coverage.
   Update `packages/core/tests/session-comprehensive.test.ts` so the comprehensive mock returns agent metadata from `initialize` and session metadata from `session/new`, then add a regression test that exercises the real `AgentOs.createSession()` path.
4. Subagent D: write issue documentation.
   Produce `docs/issues/core-session-metadata-hydration.md` and `docs/issues/core-session-metadata-hydration.prompt.md` with evidence, root cause, expected behavior, current behavior, acceptance criteria, and the exact test command/results.

Constraints:

- Only touch these paths unless a minimal adjacent core test/doc is strictly required:
  - `packages/core/src/agent-os.ts`
  - `packages/core/tests/session-comprehensive.test.ts`
  - `docs/issues/core-session-metadata-hydration.md`
  - `docs/issues/core-session-metadata-hydration.prompt.md`
- Do not revert unrelated user changes.
- Keep the fix protocol-correct and narrow. Do not refactor unrelated session code.
- Do not move `capabilities` or `agentInfo` to `session/new`.
- Do not leave tests modeling the old incorrect contract.

Execution requirements:

- Run the narrowest relevant test command after patching.
- Report the exact command and the exact pass/fail result.
- Summarize every modified file at the end.

Expected deliverable:

A small PR that fixes `AgentOs.createSession()` metadata hydration, adds regression coverage for the initialize/session-new split, and leaves behind issue docs that another agent can use without re-discovering the bug.
