# Core Session Metadata Hydration

## Classification

- Confirmed bug
- Scope: `@rivet-dev/agent-os-core` session creation hydration
- Type: correctness / protocol-contract mismatch
- Severity: medium

## Concrete Evidence

1. In `packages/core/src/agent-os.ts`, `AgentOs.createSession()` currently performs both ACP calls in order: `initialize`, then `session/new`.
2. The same method was hydrating `modes` and `configOptions` from the `initialize` response object instead of the `session/new` response object.
3. In `packages/core/tests/session-comprehensive.test.ts`, the comprehensive mock and helper were also modeling `modes` and `configOptions` as initialize-scoped data, which masked the bug instead of catching it.
4. ACP session metadata is session-scoped. `capabilities` and `agentInfo` are agent-scoped and belong to `initialize`; `modes` and `configOptions` belong to `session/new`.

## Root Cause

`AgentOs.createSession()` collapsed agent-scoped and session-scoped metadata into a single hydration source. Because the implementation copied `modes` and `configOptions` out of `initialize`, any adapter that correctly returned those fields only from `session/new` would produce incomplete session objects inside `agent-os-core`.

The comprehensive test fixture repeated the same mistake, so the test suite reinforced the incorrect contract instead of validating the real initialize/new-session split.

## Expected Behavior

- `initialize` hydrates only agent-scoped metadata:
  - `agentCapabilities`
  - `agentInfo`
- `session/new` hydrates only session-scoped metadata:
  - `modes`
  - `configOptions`
- `AgentOs.createSession()` preserves both groups on the resulting `Session`.

## Current Broken Behavior

- `AgentOs.createSession()` reads `modes` from `initialize`.
- `AgentOs.createSession()` reads `configOptions` from `initialize`.
- If an adapter returns session metadata only from `session/new`, `getSessionModes()` returns `null` and `getSessionConfigOptions()` returns `[]` even though the agent provided valid session metadata.

## Acceptance Criteria

- `packages/core/src/agent-os.ts` hydrates `capabilities` and `agentInfo` from `initialize`.
- `packages/core/src/agent-os.ts` hydrates `modes` and `configOptions` from `session/new`.
- `packages/core/tests/session-comprehensive.test.ts` models initialize/new-session separation correctly.
- The comprehensive suite contains a regression test that exercises the real `AgentOs.createSession()` path and fails if `modes` or `configOptions` are sourced from `initialize`.
- The fix remains narrowly scoped to this bug.

## Fix Summary

- Move session metadata hydration in `AgentOs.createSession()` from `initialize` to `session/new`.
- Keep capability and agent identity hydration on `initialize`.
- Update the comprehensive mock fixture and helper code so tests reflect the protocol contract.
- Add regression coverage that goes through the public `createSession()` path with a temporary mock adapter package.
