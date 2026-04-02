/**
 * WasmVM runtime driver for kernel integration.
 *
 * Discovers WASM command binaries from filesystem directories (commandDirs),
 * validates them by WASM magic bytes, and loads them on demand. Each spawn()
 * creates a Worker thread that loads the per-command binary and communicates
 * with the main thread via SharedArrayBuffer-based RPC for synchronous
 * WASI syscalls.
 *
 * proc_spawn from brush-shell routes through KernelInterface.spawn()
 * so pipeline stages can dispatch to any runtime (WasmVM, Node, Python).
 */
import type { KernelRuntimeDriver as RuntimeDriver } from '@secure-exec/core';
import { type PermissionTier } from './syscall-rpc.js';
/**
 * All commands available in the WasmVM runtime.
 * Used as fallback when no commandDirs are configured (legacy mode).
 * @deprecated Use commandDirs option instead — commands are discovered from filesystem.
 */
export declare const WASMVM_COMMANDS: readonly string[];
/**
 * Default permission tiers for known first-party commands.
 * User-provided permissions override these defaults.
 */
export declare const DEFAULT_FIRST_PARTY_TIERS: Readonly<Record<string, PermissionTier>>;
export interface WasmVmRuntimeOptions {
    /**
     * Path to a compiled WASM binary (legacy single-binary mode).
     * @deprecated Use commandDirs instead. Triggers legacy mode.
     */
    wasmBinaryPath?: string;
    /** Directories to scan for WASM command binaries, searched in order (PATH semantics). */
    commandDirs?: string[];
    /** Per-command permission tiers. Keys are command names, '*' sets the default. */
    permissions?: Record<string, PermissionTier>;
}
/**
 * Create a WasmVM RuntimeDriver that can be mounted into the kernel.
 */
export declare function createWasmVmRuntime(options?: WasmVmRuntimeOptions): RuntimeDriver;
/** Map errors to WASI errno codes. Prefers structured .code, falls back to string matching. */
export declare function mapErrorToErrno(err: unknown): number;
//# sourceMappingURL=driver.d.ts.map