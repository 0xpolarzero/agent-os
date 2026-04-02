/**
 * File I/O bridge interface for WASI polyfill kernel delegation.
 *
 * Abstracts file data access so the polyfill does not directly touch
 * VFS inodes. When mounted in the kernel, implementations wrap
 * KernelInterface with a bound pid. For testing, a standalone
 * implementation wraps an in-memory VFS + FDTable.
 */
export {};
//# sourceMappingURL=wasi-file-io.js.map