# Future Fix Prompt: Core Model State And Native ACP `set_model`

Use a dedicated git worktree on a feature branch. Keep the diff tightly scoped to core, the PI SDK adapter, tests, and these two feature docs.

## Classification

- Area: `@rivet-dev/agent-os-core`
- Type: protocol conformance fix
- Priority: medium

## Problem statement

`@rivet-dev/agent-os-core` must expose typed session model state and send native ACP `session/set_model` requests, and the default PI SDK adapter must support that path end to end. Audit the current implementation for missing `models` state during session setup and any remaining gaps in the PI adapter.

## Concrete evidence to collect first

1. Inspect:
   - `packages/core/src/session.ts`
   - `packages/core/src/agent-os.ts`
   - `packages/core/src/index.ts`
   - `packages/core/tests/session-comprehensive.test.ts`
   - `registry/agent/pi/src/adapter.ts`
   - `packages/core/tests/pi-sdk-adapter.test.ts`
   - `packages/core/tests/session.test.ts`
2. Confirm ACP field names from the primary source:
   - <https://agentclientprotocol.com/protocol/draft/schema>
3. Write down the exact current behavior before editing.

## Expected behavior

- There is a typed exported `SessionModelState` with `currentModelId` and `availableModels`.
- Session setup preserves `models` when the agent returns it.
- `setSessionModel()` uses ACP `session/set_model` with `modelId`.
- Model state is sourced from `session/new`, not inferred from protocol-misaligned fallback fields.
- The default PI SDK adapter returns `models` from `session/new` and accepts `session/set_model` for advertised model IDs.

## Current behavior to validate

- Whether `Session.setModel()` still uses `session/set_config_option`.
- Whether `AgentOs.createSession()` ignores `session/new.result.models`.
- Whether public exports or getters omit model state.
- Whether the PI SDK adapter returns `models` or implements ACP `session/set_model`.

## Execution strategy

1. Verify ACP field names from the SDK/schema.
2. Wire core session state and mutation to the native ACP model APIs.
3. Wire the PI SDK adapter to advertise model state and accept ACP `session/set_model`.
4. Add the narrowest tests that prove both core hydration and real adapter support.
5. Run focused checks and summarize exact results.

## Constraints

- Do not revert unrelated user changes.
- Do not use `as any`.
- Do not add workaround-style fallback behavior for protocol-misaligned implementations.

## Acceptance criteria

- Core types/getters/export surface include session model state.
- `setSessionModel()` sends native ACP `session/set_model`.
- Tests prove the native mutation path and that missing `session/new.models` yields no model state.
- The real PI SDK adapter returns `models` and accepts valid `session/set_model` requests.
- The final report includes exact commands, exact results, and every modified file.
