/**
 * WASI polyfill for wasi_snapshot_preview1.
 *
 * Implements all 46 wasi_snapshot_preview1 functions:
 * - Core fd and prestat operations (US-007)
 * - Path, directory, and filestat operations (US-008)
 * - Args, env, clock, random, proc_exit, and remaining stubs (US-009)
 */
import { ERRNO_SUCCESS, ERRNO_EBADF, ERRNO_EINVAL } from './wasi-constants.js';
import type { WasiFDTable, WasiVFS } from './wasi-types.js';
import type { WasiFileIO } from './wasi-file-io.js';
import type { WasiProcessIO } from './wasi-process-io.js';
export declare const ERRNO_ESPIPE: number;
export declare const ERRNO_EISDIR: number;
export declare const ERRNO_ENOMEM: number;
export declare const ERRNO_ENOSYS: number;
export declare const ERRNO_ENOENT: number;
export declare const ERRNO_EEXIST: number;
export declare const ERRNO_ENOTDIR: number;
export declare const ERRNO_ENOTEMPTY: number;
export declare const ERRNO_ELOOP: number;
export declare const ERRNO_EACCES: number;
export declare const ERRNO_EPERM: number;
export declare const ERRNO_EIO: number;
export { ERRNO_SUCCESS, ERRNO_EBADF, ERRNO_EINVAL };
/**
 * Exception thrown by proc_exit to terminate WASM execution.
 * Callers should catch this to extract the exit code.
 */
export declare class WasiProcExit extends Error {
    exitCode: number;
    constructor(exitCode: number);
}
/** Callback for reading stdin in streaming/pipeline mode. */
type StdinReader = (buf: Uint8Array, offset: number, length: number) => number;
/** Callback for writing stdout in streaming/pipeline mode. */
type StdoutWriter = (buf: Uint8Array, offset: number, length: number) => number;
/** Options for constructing a WasiPolyfill instance. */
export interface WasiOptions {
    fileIO: WasiFileIO;
    processIO: WasiProcessIO;
    args?: string[];
    env?: Record<string, string>;
    stdin?: Uint8Array | string | null;
    memory?: {
        buffer: ArrayBuffer;
    } | null;
}
/** The wasi_snapshot_preview1 import object shape. */
export type WasiImports = Record<string, Function>;
/**
 * WASI polyfill implementing wasi_snapshot_preview1.
 *
 * Phase 1: Core fd and prestat operations (US-007).
 * Additional operations added in US-008, US-009.
 */
export declare class WasiPolyfill {
    fdTable: WasiFDTable;
    vfs: WasiVFS;
    args: string[];
    env: Record<string, string>;
    memory: {
        buffer: ArrayBuffer;
    } | null;
    exitCode: number | null;
    private _fileIO;
    private _processIO;
    private _stdinData;
    private _stdinOffset;
    private _stdinReader;
    private _stdoutWriter;
    private _stderrWriter;
    private _sleepHook;
    private _stdoutChunks;
    private _stderrChunks;
    private _preopens;
    constructor(fdTable: WasiFDTable, vfs: WasiVFS, options: WasiOptions);
    private _setupPreopens;
    /**
     * Set the WASM memory reference (call after WebAssembly.instantiate).
     */
    setMemory(memory: {
        buffer: ArrayBuffer;
    }): void;
    /**
     * Set a blocking stdin reader for parallel pipeline mode.
     * The reader function should have signature: (buf, offset, length) => bytesRead
     * Returns 0 on EOF.
     */
    setStdinReader(reader: StdinReader): void;
    /**
     * Set a blocking stdout writer for parallel pipeline mode.
     * The writer function should have signature: (buf, offset, length) => void
     */
    setStdoutWriter(writer: StdoutWriter): void;
    /**
     * Set a blocking stderr writer for streaming mode.
     * The writer function should have signature: (buf, offset, length) => void
     */
    setStderrWriter(writer: StdoutWriter): void;
    /** Set a hook to run while clock sleeps block in poll_oneoff. */
    setSleepHook(hook: (() => void) | null): void;
    /** Append raw data to the stdout collection (used by inline child execution). */
    appendStdout(data: Uint8Array): void;
    /** Append raw data to the stderr collection (used by inline child execution). */
    appendStderr(data: Uint8Array): void;
    /** Get collected stdout as Uint8Array. */
    get stdout(): Uint8Array;
    /** Get collected stderr as Uint8Array. */
    get stderr(): Uint8Array;
    /** Get collected stdout as string. */
    get stdoutString(): string;
    /** Get collected stderr as string. */
    get stderrString(): string;
    private _view;
    private _bytes;
    /**
     * Read an array of iovec structs from WASM memory.
     * Each iovec is { buf: u32, buf_len: u32 } = 8 bytes.
     */
    private _readIovecs;
    /**
     * Read from a file descriptor into iovec buffers.
     * Handles stdio (stdin), VFS files, and pipes.
     */
    fd_read(fd: number, iovs_ptr: number, iovs_len: number, nread_ptr: number): number;
    /**
     * Write from iovec buffers to a file descriptor.
     * Handles stdio (stdout/stderr collection), VFS files, and pipes.
     */
    fd_write(fd: number, iovs_ptr: number, iovs_len: number, nwritten_ptr: number): number;
    /**
     * Seek within a file descriptor. Delegates to kernel file I/O bridge.
     */
    fd_seek(fd: number, offset: number | bigint, whence: number, newoffset_ptr: number): number;
    /**
     * Get current file position.
     */
    fd_tell(fd: number, offset_ptr: number): number;
    /**
     * Close a file descriptor. Delegates to kernel file I/O bridge.
     */
    fd_close(fd: number): number;
    /**
     * Get file descriptor status.
     * Writes fdstat struct (24 bytes) at buf_ptr:
     *   offset 0: fs_filetype (u8)
     *   offset 2: fs_flags (u16 LE)
     *   offset 8: fs_rights_base (u64 LE)
     *   offset 16: fs_rights_inheriting (u64 LE)
     */
    fd_fdstat_get(fd: number, buf_ptr: number): number;
    /**
     * Set file descriptor flags.
     */
    fd_fdstat_set_flags(fd: number, flags: number): number;
    /**
     * Get pre-opened directory info.
     * Writes prestat struct (8 bytes) at buf_ptr:
     *   offset 0: pr_type (u8) = 0 for dir
     *   offset 4: u.dir.pr_name_len (u32 LE)
     */
    fd_prestat_get(fd: number, buf_ptr: number): number;
    /**
     * Get the name of a pre-opened directory.
     */
    fd_prestat_dir_name(fd: number, path_ptr: number, path_len: number): number;
    /**
     * Read a path string from WASM memory.
     */
    private _readPathString;
    /**
     * Resolve a WASI path relative to a directory fd.
     */
    private _resolveWasiPath;
    /**
     * Convert VFS inode type to WASI filetype.
     */
    private _inodeTypeToFiletype;
    /**
     * Write a WASI filestat struct (64 bytes) at the given pointer.
     */
    private _writeFilestat;
    /**
     * Apply timestamp changes to a VFS inode based on fstflags.
     */
    private _applyTimestamps;
    /**
     * Open a file or directory at a path relative to a directory fd.
     */
    path_open(dirfd: number, dirflags: number, path_ptr: number, path_len: number, oflags: number, fs_rights_base: number | bigint, fs_rights_inheriting: number | bigint, fdflags: number, opened_fd_ptr: number): number;
    /**
     * Create a directory at a path relative to a directory fd.
     */
    path_create_directory(dirfd: number, path_ptr: number, path_len: number): number;
    /**
     * Unlink a file at a path relative to a directory fd.
     */
    path_unlink_file(dirfd: number, path_ptr: number, path_len: number): number;
    /**
     * Remove a directory at a path relative to a directory fd.
     */
    path_remove_directory(dirfd: number, path_ptr: number, path_len: number): number;
    /**
     * Rename a file or directory.
     */
    path_rename(old_dirfd: number, old_path_ptr: number, old_path_len: number, new_dirfd: number, new_path_ptr: number, new_path_len: number): number;
    /**
     * Create a symbolic link.
     */
    path_symlink(old_path_ptr: number, old_path_len: number, dirfd: number, new_path_ptr: number, new_path_len: number): number;
    /**
     * Read the target of a symbolic link.
     */
    path_readlink(dirfd: number, path_ptr: number, path_len: number, buf_ptr: number, buf_len: number, bufused_ptr: number): number;
    /**
     * Get file status by path.
     */
    path_filestat_get(dirfd: number, flags: number, path_ptr: number, path_len: number, buf_ptr: number): number;
    /**
     * Set file timestamps by path.
     */
    path_filestat_set_times(dirfd: number, flags: number, path_ptr: number, path_len: number, atim: number | bigint, mtim: number | bigint, fst_flags: number): number;
    /**
     * Get file status by fd.
     */
    fd_filestat_get(fd: number, buf_ptr: number): number;
    /**
     * Set file size by fd (truncate or extend).
     */
    fd_filestat_set_size(fd: number, size: number | bigint): number;
    /**
     * Set file timestamps by fd.
     */
    fd_filestat_set_times(fd: number, atim: number | bigint, mtim: number | bigint, fst_flags: number): number;
    /**
     * Read directory entries from a directory fd.
     * Writes dirent structs (24-byte header + name) into the buffer.
     */
    fd_readdir(fd: number, buf_ptr: number, buf_len: number, cookie: number | bigint, bufused_ptr: number): number;
    /**
     * Write command-line arguments into WASM memory.
     * argv_ptr: pointer to array of u32 pointers (one per arg)
     * argv_buf_ptr: pointer to buffer where arg strings are written (null-terminated)
     */
    args_get(argv_ptr: number, argv_buf_ptr: number): number;
    /**
     * Get the sizes needed for args_get.
     * Writes argc (u32) at argc_ptr and total argv buffer size (u32) at argv_buf_size_ptr.
     */
    args_sizes_get(argc_ptr: number, argv_buf_size_ptr: number): number;
    /**
     * Write environment variables into WASM memory.
     * environ_ptr: pointer to array of u32 pointers (one per env entry)
     * environ_buf_ptr: pointer to buffer where "KEY=VALUE\0" strings are written
     */
    environ_get(environ_ptr: number, environ_buf_ptr: number): number;
    /**
     * Get the sizes needed for environ_get.
     * Writes environ count (u32) at environc_ptr and total buffer size (u32) at environ_buf_size_ptr.
     */
    environ_sizes_get(environc_ptr: number, environ_buf_size_ptr: number): number;
    /**
     * Get the resolution of a clock.
     * Writes resolution in nanoseconds as u64 at resolution_ptr.
     */
    clock_res_get(id: number, resolution_ptr: number): number;
    /**
     * Get the current time of a clock.
     * Writes time in nanoseconds as u64 at time_ptr.
     */
    clock_time_get(id: number, _precision: number | bigint, time_ptr: number): number;
    /**
     * Fill a buffer with cryptographically secure random bytes.
     */
    random_get(buf_ptr: number, buf_len: number): number;
    /**
     * Terminate the process with an exit code.
     * Throws WasiProcExit to unwind the WASM call stack.
     */
    proc_exit(exitCode: number): never;
    /**
     * Send a signal to the current process.
     * Not meaningful in WASM -- stub that returns ENOSYS.
     */
    proc_raise(_sig: number): number;
    /**
     * Yield the current thread's execution.
     * No-op in single-threaded WASM.
     */
    sched_yield(): number;
    /**
     * Minimal poll_oneoff supporting clock subscriptions (for sleep).
     *
     * Subscription layout (48 bytes):
     *   u64 userdata @ 0
     *   u8  type     @ 8  (0=clock, 1=fd_read, 2=fd_write)
     *   -- padding to offset 16 --
     *   For clock (type==0):
     *     u32 clock_id      @ 16
     *     u64 timeout        @ 24
     *     u64 precision      @ 32
     *     u16 flags          @ 40  (bit 0 = abstime)
     *
     * Event layout (32 bytes):
     *   u64 userdata  @ 0
     *   u16 error     @ 8
     *   u8  type      @ 10
     *   -- padding --
     *   u64 fd_readwrite.nbytes  @ 16
     *   u16 fd_readwrite.flags   @ 24
     */
    poll_oneoff(in_ptr: number, out_ptr: number, nsubscriptions: number, nevents_ptr: number): number;
    /**
     * Advise the system on intended file usage patterns.
     * No-op -- advisory only.
     */
    fd_advise(fd: number, _offset: number | bigint, _len: number | bigint, _advice: number): number;
    /**
     * Pre-allocate space for a file.
     * No-op in VFS (files grow dynamically).
     */
    fd_allocate(fd: number, _offset: number | bigint, _len: number | bigint): number;
    /**
     * Synchronize file data to storage.
     * No-op in in-memory VFS.
     */
    fd_datasync(fd: number): number;
    /**
     * Synchronize file data and metadata to storage.
     * No-op in in-memory VFS.
     */
    fd_sync(fd: number): number;
    /**
     * Set rights on a file descriptor (shrink only).
     * Minimal implementation -- just validates fd.
     */
    fd_fdstat_set_rights(fd: number, fs_rights_base: number | bigint, fs_rights_inheriting: number | bigint): number;
    /**
     * Read from a file descriptor at a given offset without changing the cursor.
     * Delegates to kernel file I/O bridge.
     */
    fd_pread(fd: number, iovs_ptr: number, iovs_len: number, offset: number | bigint, nread_ptr: number): number;
    /**
     * Write to a file descriptor at a given offset without changing the cursor.
     * Delegates to kernel file I/O bridge.
     */
    fd_pwrite(fd: number, iovs_ptr: number, iovs_len: number, offset: number | bigint, nwritten_ptr: number): number;
    /**
     * Renumber a file descriptor (atomically move oldFd to newFd).
     */
    fd_renumber(from_fd: number, to_fd: number): number;
    /**
     * Create a hard link.
     * Not supported in our VFS -- return ENOSYS.
     */
    path_link(_old_fd: number, _old_flags: number, _old_path_ptr: number, _old_path_len: number, _new_fd: number, _new_path_ptr: number, _new_path_len: number): number;
    sock_accept(_fd: number, _flags: number, _result_fd_ptr: number): number;
    sock_recv(_fd: number, _ri_data_ptr: number, _ri_data_len: number, _ri_flags: number, _ro_datalen_ptr: number, _ro_flags_ptr: number): number;
    sock_send(_fd: number, _si_data_ptr: number, _si_data_len: number, _si_flags: number, _so_datalen_ptr: number): number;
    sock_shutdown(_fd: number, _how: number): number;
    /**
     * Get the wasi_snapshot_preview1 import object.
     * All 46 wasi_snapshot_preview1 functions.
     */
    getImports(): WasiImports;
}
//# sourceMappingURL=wasi-polyfill.d.ts.map