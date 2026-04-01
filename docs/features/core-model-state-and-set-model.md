# Core Model State And `setSessionModel`

## Classification

- Area: `@rivet-dev/agent-os-core`
- Type: protocol conformance gap
- Severity: medium
- Scope: session initialization state, public API typing, model mutation path

## Concrete evidence

- ACP draft schema defines a dedicated `SessionModelState` with `currentModelId` and `availableModels`, and a native `session/set_model` request with params `{ sessionId, modelId }`.
  - Source: <https://agentclientprotocol.com/protocol/draft/schema>
- Before this change, core exposed modes/config options/capabilities/agent info but not typed model state.
  - Evidence area: `packages/core/src/session.ts`, `packages/core/src/agent-os.ts`, `packages/core/src/index.ts`
- Before this change, `Session.setModel()` routed model mutation through `session/set_config_option` by resolving a config option in the `"model"` category.
  - Evidence area: `packages/core/src/session.ts`
- The comprehensive session suite now proves both session model-state preservation and native ACP model mutation.
  - Evidence area: `packages/core/tests/session-comprehensive.test.ts`

## Root cause

Core implemented model changes as a convenience wrapper over config options before ACP's dedicated model APIs were wired through. That left two mismatches:

1. Session setup had no typed surface for ACP model state.
2. `setSessionModel()` mutated config options instead of calling native `session/set_model`.

## Expected behavior

- Session initialization should preserve agent-reported model state.
- Public core types and getters should expose that model state.
- `setSessionModel(sessionId, modelId)` should send ACP `session/set_model`.
- Model state should be sourced from `session/new` only, matching the session-setup response shape used by core.

## Current behavior

- `SessionInitData` now includes `models?: SessionModelState`.
- `Session` stores model state and exposes `getModelState()`.
- `AgentOs` exposes `getSessionModelState(sessionId)`.
- `@rivet-dev/agent-os-core` re-exports `SessionModel` and `SessionModelState`.
- `AgentOs.createSession()` reads model state from `session/new.result.models` only.
- `Session.setModel()` now sends `session/set_model` with `{ sessionId, modelId }`.

## Acceptance criteria

- `packages/core/src/session.ts` defines typed model state and uses `session/set_model`.
- `packages/core/src/agent-os.ts` carries model state into session construction and exposes a getter.
- `packages/core/src/index.ts` re-exports the new model types.
- `packages/core/tests/session-comprehensive.test.ts` covers:
  - native `session/set_model`
  - session model-state getter
  - `null` model state when `session/new` omits `models`
- No unrelated files or PI adapter code are modified.

## Non-goals

- Do not broaden into PI adapter changes.
- Do not infer or synthesize live model-state updates after `setSessionModel()`; this feature preserves agent-reported setup state and uses the correct ACP mutation path.
