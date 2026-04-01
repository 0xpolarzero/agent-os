# PI Adapter Config/Model Support

## Summary

The PI SDK ACP adapter had an additive ACP feature gap: it exposed thinking level only through `modes` / `session/set_mode`, but it did not advertise session-scoped `configOptions` or `models`, and it did not implement `session/set_config_option` or `session/set_model`.

This change keeps the existing compatibility surface intact and adds the missing ACP config/model surfaces on top of it.

## Classification

- Type: additive adapter capability gap
- Scope: `registry/agent/pi` ACP adapter only
- Risk: medium interoperability risk, low product risk
- Regression constraint: do not remove `modes` / `setSessionMode`

## Concrete Evidence

### Adapter evidence before the fix

- `registry/agent/pi/src/adapter.ts` returned only `sessionId` and `modes` from `newSession()`.
- `registry/agent/pi/src/adapter.ts` implemented `setSessionMode()` only.
- `registry/agent/pi/src/adapter.ts` did not implement `setSessionConfigOption()`.
- `registry/agent/pi/src/adapter.ts` did not implement `unstable_setSessionModel()`.
- The adapter already had real PI SDK state available through `AgentSession`, including:
  - `session.model`
  - `session.modelRegistry`
  - `session.setModel()`
  - `session.thinkingLevel`
  - `session.setThinkingLevel()`
  - `session.getAvailableThinkingLevels()`

### Verification evidence added with this change

- `packages/core/tests/pi-sdk-adapter.test.ts` now verifies:
  - `session/new` returns `modes`, `configOptions`, and `models`
  - `session/set_mode` still works for thinking-level mutation
  - `session/set_config_option` mutates `thought_level`
  - `session/set_config_option` mutates `model`
  - `session/set_model` mutates model state
  - config changes emit `session/update` with `config_option_update`

## Root Cause

The adapter projected PI thinking levels into ACP `modes` for expediency and stopped there. It never translated the PI session's real model registry and session-scoped state into ACP `configOptions` / `models`, even though the underlying SDK already exposed the necessary primitives.

That produced two protocol mismatches:

- ACP clients that depend on `configOptions` could not discover or mutate PI model/thought state.
- ACP clients that use unstable model state had no `models` / `session/set_model` path.

## Expected Behavior

For each new PI session, the adapter should:

- Keep advertising `modes` for backwards compatibility with existing clients.
- Also advertise `configOptions` with:
  - `model`
  - `thought_level`
- Also advertise unstable `models` state with:
  - `currentModelId`
  - `availableModels`

For mutations, the adapter should:

- Keep `session/set_mode` working as the compatibility path for thinking level.
- Support `session/set_config_option` for:
  - `model`
  - `thought_level`
- Support unstable `session/set_model`.
- Emit `config_option_update` notifications after config/model changes so clients can refresh the full option set.

## Current Behavior Before This Change

- `session/new` exposed only `modes`.
- `session/set_mode` changed thinking level.
- No ACP config option discovery existed.
- No ACP model state discovery existed.
- No ACP config option mutation existed.
- No ACP unstable model mutation existed.

## Implemented Behavior Now

- `session/new` returns:
  - `modes`
  - `configOptions`
  - `models`
- `session/set_mode` still updates thinking level and now also keeps config state synchronized.
- `session/set_config_option` supports:
  - `model`
  - `thought_level`
- `session/set_model` supports model mutation through the real PI SDK session.
- Model and config mutations emit `config_option_update`.

## Acceptance Criteria

- `registry/agent/pi/src/adapter.ts` keeps `modes` and `setSessionMode`.
- `registry/agent/pi/src/adapter.ts` adds `configOptions` to `session/new`.
- `registry/agent/pi/src/adapter.ts` adds `models` to `session/new`.
- `registry/agent/pi/src/adapter.ts` implements `setSessionConfigOption`.
- `registry/agent/pi/src/adapter.ts` implements `unstable_setSessionModel`.
- Model mutation uses `AgentSession.setModel()` rather than a parallel adapter-side cache.
- Thought mutation uses `AgentSession.setThinkingLevel()`.
- Config/model responses return full updated `configOptions`.
- Focused PI adapter tests cover discovery plus both mutation paths.

## Notes

- This is intentionally adapter-layer only.
- No core API redesign is required for the additive ACP surfaces themselves.
- Clients that only understand the existing mode surface continue to work.
