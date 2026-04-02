/**
 * WASI file descriptor table.
 *
 * Manages open file descriptors, pre-allocating FDs 0/1/2 for stdin/stdout/stderr.
 * Used by kernel-worker.ts for per-command FD tracking.
 */
import { FDEntry } from './wasi-types.js';
import type { WasiFDTable, FDResource, FDOpenOptions } from './wasi-types.js';
export declare class FDTable implements WasiFDTable {
    private _fds;
    private _nextFd;
    private _freeFds;
    constructor();
    /**
     * Allocate the lowest available file descriptor number (POSIX semantics).
     * Reuses previously freed FDs before incrementing _nextFd.
     * _freeFds is kept sorted descending so pop() returns the lowest.
     */
    private _allocateFd;
    /**
     * Open a new file descriptor for a resource.
     */
    open(resource: FDResource, options?: FDOpenOptions): number;
    /**
     * Close a file descriptor.
     *
     * Returns WASI errno (0 = success, 8 = EBADF).
     */
    close(fd: number): number;
    /**
     * Get the entry for a file descriptor.
     */
    get(fd: number): FDEntry | null;
    /**
     * Duplicate a file descriptor to lowest available fd >= minFd (F_DUPFD).
     * Returns the new fd number, or -1 if the source fd is invalid.
     */
    dupMinFd(fd: number, minFd: number): number;
    /**
     * Duplicate a file descriptor, returning a new fd pointing to the same resource.
     *
     * Returns the new fd number, or -1 if the source fd is invalid.
     */
    dup(fd: number): number;
    /**
     * Duplicate a file descriptor to a specific fd number.
     * If newFd is already open, it is closed first.
     *
     * Returns WASI errno (0 = success, 8 = EBADF if oldFd invalid, 28 = EINVAL if same fd).
     */
    dup2(oldFd: number, newFd: number): number;
    /**
     * Check if a file descriptor is open.
     */
    has(fd: number): boolean;
    /**
     * Get the number of open file descriptors.
     */
    get size(): number;
    /**
     * Renumber a file descriptor (move oldFd to newFd, closing newFd if open).
     *
     * Returns WASI errno.
     */
    renumber(oldFd: number, newFd: number): number;
}
//# sourceMappingURL=fd-table.d.ts.map