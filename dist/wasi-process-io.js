/**
 * Process and FD-stat bridge interface for WASI polyfill kernel delegation.
 *
 * Abstracts process state (args, env, exit) and FD stat so the polyfill
 * does not directly touch FDTable entries for stat or hold its own
 * args/env copies. When mounted in the kernel, implementations wrap
 * KernelInterface with a bound pid. For testing, a standalone
 * implementation wraps an in-memory FDTable + options.
 */
export {};
//# sourceMappingURL=wasi-process-io.js.map