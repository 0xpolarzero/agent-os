/**
 * Python runtime driver for kernel integration.
 *
 * Wraps Pyodide behind the kernel RuntimeDriver interface. Each spawn()
 * reuses a single shared Worker thread (Pyodide is expensive to load).
 * Python's os.system() and subprocess are monkey-patched to route through
 * KernelInterface.spawn() via a kernelSpawn RPC method.
 */
import type { KernelRuntimeDriver as RuntimeDriver } from '@secure-exec/core';
export interface PythonRuntimeOptions {
    /** CPU time limit in ms for each Python execution (no limit by default). */
    cpuTimeLimitMs?: number;
}
/**
 * Create a Python RuntimeDriver that can be mounted into the kernel.
 */
export declare function createPythonRuntime(options?: PythonRuntimeOptions): RuntimeDriver;
