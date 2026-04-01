# Common WASM Runtime Artifacts

## Classification

- Area: registry packaging
- Type: compatibility feature
- Scope: bundled runtime assets for the common software set
- Risk: low code risk, medium repository-size risk

## Summary

The fork now carries the `wasm/` runtime payloads required by the common software packages:

- `coreutils`
- `sed`
- `grep`
- `gawk`
- `findutils`
- `diffutils`
- `tar`
- `gzip`

Without these directories, the source repo builds the JavaScript wrappers but does not ship the binaries those wrappers load at runtime, so commands like `sh`, `echo`, `wc`, and `sleep` never register in the VM.

## Concrete Evidence

- Registry package wrappers resolve commands from `../wasm` at runtime.
- The repository docs state that `registry/software/*/wasm/` is gitignored and normally populated by `make copy-wasm`.
- A source-only checkout therefore lacks the runtime payloads even after `tsc` succeeds.
- In a vendored dependency setup, that causes `AgentOs.create({ software: [common] })` to boot without shell commands.

## Root Cause

The upstream repo is optimized for source development and package publishing, not for being consumed directly as a dependency source tree. The published npm packages include the runtime artifacts, but the GitHub source checkout intentionally omits them.

## Expected Behavior

- A fork consumed directly as a dependency should provide the runtime assets needed by its exported packages.
- `@rivet-dev/agent-os-common` should be runnable from the fork without requiring an external Rust/WASI build pipeline.

## Current Behavior

- The common software packages in this branch now include their `wasm/` payloads.
- `.gitignore` allows those specific directories to be tracked.
- Source consumers can install the fork and get working shell commands immediately.

## Acceptance Criteria

- `registry/software/coreutils/wasm/` exists in the repo.
- `registry/software/sed/wasm/` exists in the repo.
- `registry/software/grep/wasm/` exists in the repo.
- `registry/software/gawk/wasm/` exists in the repo.
- `registry/software/findutils/wasm/` exists in the repo.
- `registry/software/diffutils/wasm/` exists in the repo.
- `registry/software/tar/wasm/` exists in the repo.
- `registry/software/gzip/wasm/` exists in the repo.
- A source consumer can execute common shell commands without separately running `make copy-wasm`.

## Non-Goals

- Do not change runtime registration logic.
- Do not add C/Rust toolchain bootstrapping to application repos that vendor this fork.
