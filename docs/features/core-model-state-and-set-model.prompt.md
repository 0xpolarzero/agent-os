# Future Fix Prompt: Core Model State And Native ACP `set_model`

Use a dedicated git worktree on a feature branch. Keep the diff inside core plus these two feature docs.

## Classification

- Area: `@rivet-dev/agent-os-core`
- Type: protocol conformance fix
- Priority: medium

## Problem statement

`@rivet-dev/agent-os-core` must expose typed session model state and send native ACP `session/set_model` requests. Audit the current implementation for missing `models` state during session setup and any remaining `set_config_option` fallback for model mutation.

## Concrete evidence to collect first

1. Inspect:
   - `packages/core/src/session.ts`
   - `packages/core/src/agent-os.ts`
   - `packages/core/src/index.ts`
   - `packages/core/tests/session-comprehensive.test.ts`
2. Confirm ACP field names from the primary source:
   - <https://agentclientprotocol.com/protocol/draft/schema>
3. Write down the exact current behavior before editing.

## Expected behavior

- There is a typed exported `SessionModelState` with `currentModelId` and `availableModels`.
- Session setup preserves `models` when the agent returns it.
- `setSessionModel()` uses ACP `session/set_model` with `modelId`.
- Model state is sourced from `session/new`, not inferred from protocol-misaligned fallback fields.

## Current behavior to validate

- Whether `Session.setModel()` still uses `session/set_config_option`.
- Whether `AgentOs.createSession()` ignores `session/new.result.models`.
- Whether public exports or getters omit model state.

## Execution strategy

Use subagents heavily and in parallel. The orchestrating agent should stay in the worktree and integrate the results:

1. One subagent audits ACP schema expectations and returns exact request/response/state field names.
2. One subagent audits the core session/API implementation and proposes the minimal safe code changes.
3. One subagent audits test coverage and proposes the narrowest additions that prove both native mutation and strict `session/new` model-state sourcing.
4. The orchestrator reconciles the findings, applies the changes in the worktree, runs the narrowest relevant checks, and writes a concise evidence-based summary.

## Constraints

- Do not touch PI adapter code.
- Do not revert unrelated user changes.
- Do not use `as any`.
- Do not add workaround-style fallback behavior for protocol-misaligned implementations.

## Acceptance criteria

- Core types/getters/export surface include session model state.
- `setSessionModel()` sends native ACP `session/set_model`.
- Tests prove the native mutation path and that missing `session/new.models` yields no model state.
- The final report includes exact commands, exact results, and every modified file.
