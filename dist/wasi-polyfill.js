/**
 * WASI polyfill for wasi_snapshot_preview1.
 *
 * Implements all 46 wasi_snapshot_preview1 functions:
 * - Core fd and prestat operations (US-007)
 * - Path, directory, and filestat operations (US-008)
 * - Args, env, clock, random, proc_exit, and remaining stubs (US-009)
 */
import { FILETYPE_UNKNOWN, FILETYPE_REGULAR_FILE, FILETYPE_DIRECTORY, FILETYPE_CHARACTER_DEVICE, FILETYPE_SYMBOLIC_LINK, RIGHT_FD_DATASYNC, RIGHT_FD_READ, RIGHT_FD_SEEK, RIGHT_FD_FDSTAT_SET_FLAGS, RIGHT_FD_SYNC, RIGHT_FD_TELL, RIGHT_FD_WRITE, RIGHT_FD_ADVISE, RIGHT_FD_ALLOCATE, RIGHT_FD_READDIR, RIGHT_FD_FILESTAT_GET, RIGHT_FD_FILESTAT_SET_SIZE, RIGHT_FD_FILESTAT_SET_TIMES, RIGHT_PATH_CREATE_DIRECTORY, RIGHT_PATH_CREATE_FILE, RIGHT_PATH_LINK_SOURCE, RIGHT_PATH_LINK_TARGET, RIGHT_PATH_OPEN, RIGHT_PATH_READLINK, RIGHT_PATH_RENAME_SOURCE, RIGHT_PATH_RENAME_TARGET, RIGHT_PATH_FILESTAT_GET, RIGHT_PATH_FILESTAT_SET_SIZE, RIGHT_PATH_FILESTAT_SET_TIMES, RIGHT_PATH_SYMLINK, RIGHT_PATH_REMOVE_DIRECTORY, RIGHT_PATH_UNLINK_FILE, RIGHT_POLL_FD_READWRITE, ERRNO_SUCCESS, ERRNO_EBADF, ERRNO_EINVAL, } from './wasi-constants.js';
import { VfsError } from './wasi-types.js';
// Additional WASI errno codes
export const ERRNO_ESPIPE = 70;
export const ERRNO_EISDIR = 31;
export const ERRNO_ENOMEM = 48;
export const ERRNO_ENOSYS = 52;
export const ERRNO_ENOENT = 44;
export const ERRNO_EEXIST = 20;
export const ERRNO_ENOTDIR = 54;
export const ERRNO_ENOTEMPTY = 55;
export const ERRNO_ELOOP = 36;
export const ERRNO_EACCES = 2;
export const ERRNO_EPERM = 63;
export const ERRNO_EIO = 29;
// Map VfsError codes to WASI errno numbers
const ERRNO_MAP = {
    ENOENT: 44,
    EEXIST: 20,
    ENOTDIR: 54,
    EISDIR: 31,
    ENOTEMPTY: 55,
    EACCES: 2,
    EBADF: 8,
    EINVAL: 28,
    EPERM: 63,
};
/** Map a caught error to a WASI errno. VfsError maps via code; unknown errors → EIO. */
function vfsErrorToErrno(e) {
    if (e instanceof VfsError) {
        return ERRNO_MAP[e.code] ?? ERRNO_EIO;
    }
    return ERRNO_EIO;
}
// Re-export for convenience
export { ERRNO_SUCCESS, ERRNO_EBADF, ERRNO_EINVAL };
// WASI seek whence values
const WHENCE_SET = 0;
const WHENCE_CUR = 1;
const WHENCE_END = 2;
// WASI lookup flags
const LOOKUP_SYMLINK_FOLLOW = 1;
// WASI open flags (oflags)
const OFLAG_CREAT = 1;
const OFLAG_DIRECTORY = 2;
const OFLAG_EXCL = 4;
const OFLAG_TRUNC = 8;
// WASI fstflags (for set_times)
const FSTFLAG_ATIM = 1;
const FSTFLAG_ATIM_NOW = 2;
const FSTFLAG_MTIM = 4;
const FSTFLAG_MTIM_NOW = 8;
// WASI preopentype
const PREOPENTYPE_DIR = 0;
// WASI clock IDs
const CLOCKID_REALTIME = 0;
const CLOCKID_MONOTONIC = 1;
const CLOCKID_PROCESS_CPUTIME_ID = 2;
const CLOCKID_THREAD_CPUTIME_ID = 3;
// WASI subscription/event types for poll_oneoff
const EVENTTYPE_CLOCK = 0;
const EVENTTYPE_FD_READ = 1;
const EVENTTYPE_FD_WRITE = 2;
/** Normalize a POSIX path — resolve `.` and `..`, collapse slashes. */
function normalizePath(path) {
    const parts = path.split('/');
    const resolved = [];
    for (const p of parts) {
        if (p === '' || p === '.')
            continue;
        if (p === '..') {
            resolved.pop();
            continue;
        }
        resolved.push(p);
    }
    return '/' + resolved.join('/');
}
/**
 * Exception thrown by proc_exit to terminate WASM execution.
 * Callers should catch this to extract the exit code.
 */
export class WasiProcExit extends Error {
    exitCode;
    constructor(exitCode) {
        super(`proc_exit(${exitCode})`);
        this.exitCode = exitCode;
        this.name = 'WasiProcExit';
    }
}
// All rights for files
const RIGHTS_FILE_BASE = RIGHT_FD_DATASYNC | RIGHT_FD_READ | RIGHT_FD_SEEK |
    RIGHT_FD_FDSTAT_SET_FLAGS | RIGHT_FD_SYNC | RIGHT_FD_TELL | RIGHT_FD_WRITE |
    RIGHT_FD_ADVISE | RIGHT_FD_ALLOCATE | RIGHT_FD_FILESTAT_GET |
    RIGHT_FD_FILESTAT_SET_SIZE | RIGHT_FD_FILESTAT_SET_TIMES |
    RIGHT_POLL_FD_READWRITE;
// All rights for directories
const RIGHTS_DIR_BASE = RIGHT_FD_FDSTAT_SET_FLAGS | RIGHT_FD_SYNC |
    RIGHT_FD_READDIR | RIGHT_PATH_CREATE_DIRECTORY | RIGHT_PATH_CREATE_FILE |
    RIGHT_PATH_LINK_SOURCE | RIGHT_PATH_LINK_TARGET | RIGHT_PATH_OPEN |
    RIGHT_PATH_READLINK | RIGHT_PATH_RENAME_SOURCE | RIGHT_PATH_RENAME_TARGET |
    RIGHT_PATH_FILESTAT_GET | RIGHT_PATH_FILESTAT_SET_SIZE |
    RIGHT_PATH_FILESTAT_SET_TIMES | RIGHT_PATH_SYMLINK |
    RIGHT_PATH_REMOVE_DIRECTORY | RIGHT_PATH_UNLINK_FILE |
    RIGHT_FD_FILESTAT_GET | RIGHT_FD_FILESTAT_SET_TIMES;
// Files opened from a pre-opened directory can inherit these rights
const RIGHTS_DIR_INHERITING = RIGHTS_FILE_BASE | RIGHTS_DIR_BASE;
/**
 * Concatenate multiple Uint8Array chunks into one.
 */
function concatBytes(arrays) {
    if (arrays.length === 0)
        return new Uint8Array(0);
    if (arrays.length === 1)
        return arrays[0];
    const total = arrays.reduce((sum, a) => sum + a.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const a of arrays) {
        result.set(a, offset);
        offset += a.length;
    }
    return result;
}
/**
 * WASI polyfill implementing wasi_snapshot_preview1.
 *
 * Phase 1: Core fd and prestat operations (US-007).
 * Additional operations added in US-008, US-009.
 */
export class WasiPolyfill {
    fdTable;
    vfs;
    args;
    env;
    memory;
    exitCode;
    _fileIO;
    _processIO;
    _stdinData;
    _stdinOffset;
    _stdinReader;
    _stdoutWriter;
    _stderrWriter;
    _sleepHook;
    _stdoutChunks;
    _stderrChunks;
    _preopens;
    constructor(fdTable, vfs, options) {
        this.fdTable = fdTable;
        this.vfs = vfs;
        this._fileIO = options.fileIO;
        this.args = options.args ?? [];
        this.env = options.env ?? {};
        this._processIO = options.processIO;
        this.memory = options.memory ?? null;
        this.exitCode = null;
        // Stdin
        if (typeof options.stdin === 'string') {
            this._stdinData = new TextEncoder().encode(options.stdin);
        }
        else {
            this._stdinData = options.stdin ?? null;
        }
        this._stdinOffset = 0;
        // Streaming I/O callbacks (for parallel pipelines with ring buffers)
        this._stdinReader = null;
        this._stdoutWriter = null;
        this._stderrWriter = null;
        this._sleepHook = null;
        // Collected output
        this._stdoutChunks = [];
        this._stderrChunks = [];
        // Pre-opened directories: fd -> path
        this._preopens = new Map();
        this._setupPreopens();
    }
    _setupPreopens() {
        const fd = this.fdTable.open({ type: 'preopen', path: '/' }, {
            filetype: FILETYPE_DIRECTORY,
            rightsBase: RIGHTS_DIR_BASE,
            rightsInheriting: RIGHTS_DIR_INHERITING,
            fdflags: 0,
            path: '/',
        });
        this._preopens.set(fd, '/');
    }
    /**
     * Set the WASM memory reference (call after WebAssembly.instantiate).
     */
    setMemory(memory) {
        this.memory = memory;
    }
    /**
     * Set a blocking stdin reader for parallel pipeline mode.
     * The reader function should have signature: (buf, offset, length) => bytesRead
     * Returns 0 on EOF.
     */
    setStdinReader(reader) {
        this._stdinReader = reader;
    }
    /**
     * Set a blocking stdout writer for parallel pipeline mode.
     * The writer function should have signature: (buf, offset, length) => void
     */
    setStdoutWriter(writer) {
        this._stdoutWriter = writer;
    }
    /**
     * Set a blocking stderr writer for streaming mode.
     * The writer function should have signature: (buf, offset, length) => void
     */
    setStderrWriter(writer) {
        this._stderrWriter = writer;
    }
    /** Set a hook to run while clock sleeps block in poll_oneoff. */
    setSleepHook(hook) {
        this._sleepHook = hook;
    }
    /** Append raw data to the stdout collection (used by inline child execution). */
    appendStdout(data) {
        if (data.length > 0) {
            this._stdoutChunks.push(data.slice());
        }
    }
    /** Append raw data to the stderr collection (used by inline child execution). */
    appendStderr(data) {
        if (data.length > 0) {
            this._stderrChunks.push(data.slice());
        }
    }
    /** Get collected stdout as Uint8Array. */
    get stdout() {
        return concatBytes(this._stdoutChunks);
    }
    /** Get collected stderr as Uint8Array. */
    get stderr() {
        return concatBytes(this._stderrChunks);
    }
    /** Get collected stdout as string. */
    get stdoutString() {
        return new TextDecoder().decode(this.stdout);
    }
    /** Get collected stderr as string. */
    get stderrString() {
        return new TextDecoder().decode(this.stderr);
    }
    // --- Memory helpers ---
    _view() {
        return new DataView(this.memory.buffer);
    }
    _bytes() {
        return new Uint8Array(this.memory.buffer);
    }
    /**
     * Read an array of iovec structs from WASM memory.
     * Each iovec is { buf: u32, buf_len: u32 } = 8 bytes.
     */
    _readIovecs(iovs_ptr, iovs_len) {
        const view = this._view();
        const iovecs = [];
        for (let i = 0; i < iovs_len; i++) {
            const base = iovs_ptr + i * 8;
            iovecs.push({
                buf: view.getUint32(base, true),
                buf_len: view.getUint32(base + 4, true),
            });
        }
        return iovecs;
    }
    // --- Core FD operations ---
    /**
     * Read from a file descriptor into iovec buffers.
     * Handles stdio (stdin), VFS files, and pipes.
     */
    fd_read(fd, iovs_ptr, iovs_len, nread_ptr) {
        const entry = this.fdTable.get(fd);
        if (!entry)
            return ERRNO_EBADF;
        if (!(entry.rightsBase & RIGHT_FD_READ))
            return ERRNO_EBADF;
        const iovecs = this._readIovecs(iovs_ptr, iovs_len);
        const mem = this._bytes();
        let totalRead = 0;
        const resource = entry.resource;
        if (resource.type === 'stdio' && resource.name === 'stdin') {
            if (this._stdinReader) {
                // Streaming mode: read from ring buffer (blocks via Atomics.wait)
                for (const iov of iovecs) {
                    if (iov.buf_len === 0)
                        continue;
                    const tmpBuf = new Uint8Array(iov.buf_len);
                    const n = this._stdinReader(tmpBuf, 0, iov.buf_len);
                    if (n <= 0)
                        break; // EOF
                    mem.set(tmpBuf.subarray(0, n), iov.buf);
                    totalRead += n;
                    if (n < iov.buf_len)
                        break; // Short read -- don't block further
                }
            }
            else {
                // Buffered mode: read from pre-loaded stdin data
                if (!this._stdinData || this._stdinOffset >= this._stdinData.length) {
                    this._view().setUint32(nread_ptr, 0, true);
                    return ERRNO_SUCCESS;
                }
                for (const iov of iovecs) {
                    const remaining = this._stdinData.length - this._stdinOffset;
                    if (remaining <= 0)
                        break;
                    const n = Math.min(iov.buf_len, remaining);
                    mem.set(this._stdinData.subarray(this._stdinOffset, this._stdinOffset + n), iov.buf);
                    this._stdinOffset += n;
                    totalRead += n;
                }
            }
        }
        else if (resource.type === 'vfsFile') {
            // Delegate to kernel file I/O bridge
            const totalRequested = iovecs.reduce((sum, iov) => sum + iov.buf_len, 0);
            const result = this._fileIO.fdRead(fd, totalRequested);
            if (result.errno !== ERRNO_SUCCESS)
                return result.errno;
            // Scatter data into iovecs
            let offset = 0;
            for (const iov of iovecs) {
                const remaining = result.data.length - offset;
                if (remaining <= 0)
                    break;
                const n = Math.min(iov.buf_len, remaining);
                mem.set(result.data.subarray(offset, offset + n), iov.buf);
                offset += n;
                totalRead += n;
            }
        }
        else if (resource.type === 'pipe') {
            const pipe = resource.pipe;
            if (pipe && pipe.buffer) {
                // Assert: only one reader may consume from a pipe's read end.
                // If a different fd already claimed this pipe, throw to prevent
                // silent data corruption from double-consumption.
                if (pipe._readerId !== undefined && pipe._readerId !== fd) {
                    throw new Error(`Pipe read end consumed by multiple readers (fd ${pipe._readerId} and fd ${fd})`);
                }
                pipe._readerId = fd;
                for (const iov of iovecs) {
                    const remaining = pipe.writeOffset - pipe.readOffset;
                    if (remaining <= 0)
                        break;
                    const n = Math.min(iov.buf_len, remaining);
                    mem.set(pipe.buffer.subarray(pipe.readOffset, pipe.readOffset + n), iov.buf);
                    pipe.readOffset += n;
                    totalRead += n;
                }
            }
        }
        else {
            return ERRNO_EBADF;
        }
        this._view().setUint32(nread_ptr, totalRead, true);
        return ERRNO_SUCCESS;
    }
    /**
     * Write from iovec buffers to a file descriptor.
     * Handles stdio (stdout/stderr collection), VFS files, and pipes.
     */
    fd_write(fd, iovs_ptr, iovs_len, nwritten_ptr) {
        const entry = this.fdTable.get(fd);
        if (!entry)
            return ERRNO_EBADF;
        if (!(entry.rightsBase & RIGHT_FD_WRITE))
            return ERRNO_EBADF;
        const iovecs = this._readIovecs(iovs_ptr, iovs_len);
        const mem = this._bytes();
        let totalWritten = 0;
        const resource = entry.resource;
        if (resource.type === 'stdio') {
            for (const iov of iovecs) {
                if (iov.buf_len === 0)
                    continue;
                const chunk = mem.slice(iov.buf, iov.buf + iov.buf_len);
                if (resource.name === 'stdout') {
                    if (this._stdoutWriter) {
                        // Streaming mode: write to ring buffer (blocks via Atomics.wait)
                        this._stdoutWriter(chunk, 0, chunk.length);
                    }
                    else {
                        this._stdoutChunks.push(chunk);
                    }
                }
                else if (resource.name === 'stderr') {
                    if (this._stderrWriter) {
                        this._stderrWriter(chunk, 0, chunk.length);
                    }
                    else {
                        this._stderrChunks.push(chunk);
                    }
                }
                totalWritten += iov.buf_len;
            }
        }
        else if (resource.type === 'vfsFile') {
            // Collect all write data, then delegate to kernel file I/O bridge
            const chunks = [];
            for (const iov of iovecs) {
                if (iov.buf_len === 0)
                    continue;
                chunks.push(mem.slice(iov.buf, iov.buf + iov.buf_len));
                totalWritten += iov.buf_len;
            }
            if (totalWritten > 0) {
                const writeData = concatBytes(chunks);
                const result = this._fileIO.fdWrite(fd, writeData);
                if (result.errno !== ERRNO_SUCCESS)
                    return result.errno;
            }
        }
        else if (resource.type === 'pipe') {
            const pipe = resource.pipe;
            for (const iov of iovecs) {
                if (iov.buf_len === 0)
                    continue;
                const chunk = mem.slice(iov.buf, iov.buf + iov.buf_len);
                if (pipe) {
                    const needed = pipe.writeOffset + chunk.length;
                    if (needed > pipe.buffer.length) {
                        const newBuf = new Uint8Array(Math.max(needed, pipe.buffer.length * 2));
                        newBuf.set(pipe.buffer);
                        pipe.buffer = newBuf;
                    }
                    pipe.buffer.set(chunk, pipe.writeOffset);
                    pipe.writeOffset += chunk.length;
                }
                totalWritten += iov.buf_len;
            }
        }
        else {
            return ERRNO_EBADF;
        }
        this._view().setUint32(nwritten_ptr, totalWritten, true);
        return ERRNO_SUCCESS;
    }
    /**
     * Seek within a file descriptor. Delegates to kernel file I/O bridge.
     */
    fd_seek(fd, offset, whence, newoffset_ptr) {
        const entry = this.fdTable.get(fd);
        if (!entry)
            return ERRNO_EBADF;
        if (entry.filetype !== FILETYPE_REGULAR_FILE)
            return ERRNO_ESPIPE;
        if (!(entry.rightsBase & RIGHT_FD_SEEK))
            return ERRNO_EBADF;
        const offsetBig = typeof offset === 'bigint' ? offset : BigInt(offset);
        const result = this._fileIO.fdSeek(fd, offsetBig, whence);
        if (result.errno !== ERRNO_SUCCESS)
            return result.errno;
        // Sync local cursor so fd_tell returns consistent values
        entry.cursor = result.newOffset;
        this._view().setBigUint64(newoffset_ptr, result.newOffset, true);
        return ERRNO_SUCCESS;
    }
    /**
     * Get current file position.
     */
    fd_tell(fd, offset_ptr) {
        const entry = this.fdTable.get(fd);
        if (!entry)
            return ERRNO_EBADF;
        if (entry.filetype !== FILETYPE_REGULAR_FILE)
            return ERRNO_ESPIPE;
        if (!(entry.rightsBase & RIGHT_FD_TELL))
            return ERRNO_EBADF;
        this._view().setBigUint64(offset_ptr, entry.cursor, true);
        return ERRNO_SUCCESS;
    }
    /**
     * Close a file descriptor. Delegates to kernel file I/O bridge.
     */
    fd_close(fd) {
        this._preopens.delete(fd);
        return this._fileIO.fdClose(fd);
    }
    /**
     * Get file descriptor status.
     * Writes fdstat struct (24 bytes) at buf_ptr:
     *   offset 0: fs_filetype (u8)
     *   offset 2: fs_flags (u16 LE)
     *   offset 8: fs_rights_base (u64 LE)
     *   offset 16: fs_rights_inheriting (u64 LE)
     */
    fd_fdstat_get(fd, buf_ptr) {
        const stat = this._processIO.fdFdstatGet(fd);
        if (stat.errno !== ERRNO_SUCCESS)
            return stat.errno;
        const view = this._view();
        view.setUint8(buf_ptr, stat.filetype);
        view.setUint8(buf_ptr + 1, 0); // padding
        view.setUint16(buf_ptr + 2, stat.fdflags, true);
        view.setUint32(buf_ptr + 4, 0); // padding
        view.setBigUint64(buf_ptr + 8, stat.rightsBase, true);
        view.setBigUint64(buf_ptr + 16, stat.rightsInheriting, true);
        return ERRNO_SUCCESS;
    }
    /**
     * Set file descriptor flags.
     */
    fd_fdstat_set_flags(fd, flags) {
        const entry = this.fdTable.get(fd);
        if (!entry)
            return ERRNO_EBADF;
        if (!(entry.rightsBase & RIGHT_FD_FDSTAT_SET_FLAGS))
            return ERRNO_EBADF;
        entry.fdflags = flags;
        return ERRNO_SUCCESS;
    }
    /**
     * Get pre-opened directory info.
     * Writes prestat struct (8 bytes) at buf_ptr:
     *   offset 0: pr_type (u8) = 0 for dir
     *   offset 4: u.dir.pr_name_len (u32 LE)
     */
    fd_prestat_get(fd, buf_ptr) {
        const path = this._preopens.get(fd);
        if (path === undefined)
            return ERRNO_EBADF;
        const encoded = new TextEncoder().encode(path);
        const view = this._view();
        view.setUint8(buf_ptr, PREOPENTYPE_DIR);
        view.setUint8(buf_ptr + 1, 0);
        view.setUint16(buf_ptr + 2, 0);
        view.setUint32(buf_ptr + 4, encoded.length, true);
        return ERRNO_SUCCESS;
    }
    /**
     * Get the name of a pre-opened directory.
     */
    fd_prestat_dir_name(fd, path_ptr, path_len) {
        const path = this._preopens.get(fd);
        if (path === undefined)
            return ERRNO_EBADF;
        const encoded = new TextEncoder().encode(path);
        const len = Math.min(encoded.length, path_len);
        this._bytes().set(encoded.subarray(0, len), path_ptr);
        return ERRNO_SUCCESS;
    }
    // --- Helper methods for path/filestat operations (US-008) ---
    /**
     * Read a path string from WASM memory.
     */
    _readPathString(pathPtr, pathLen) {
        return new TextDecoder().decode(new Uint8Array(this.memory.buffer, pathPtr, pathLen));
    }
    /**
     * Resolve a WASI path relative to a directory fd.
     */
    _resolveWasiPath(dirfd, pathPtr, pathLen) {
        const pathStr = this._readPathString(pathPtr, pathLen);
        let basePath = this._preopens.get(dirfd);
        if (basePath === undefined) {
            const entry = this.fdTable.get(dirfd);
            if (!entry)
                return null;
            basePath = entry.path || '/';
        }
        let fullPath;
        if (pathStr.startsWith('/')) {
            fullPath = pathStr;
        }
        else {
            fullPath = basePath === '/' ? '/' + pathStr : basePath + '/' + pathStr;
        }
        // Normalize . and .. components (WASI paths may contain them)
        return normalizePath(fullPath);
    }
    /**
     * Convert VFS inode type to WASI filetype.
     */
    _inodeTypeToFiletype(type) {
        switch (type) {
            case 'file': return FILETYPE_REGULAR_FILE;
            case 'dir': return FILETYPE_DIRECTORY;
            case 'symlink': return FILETYPE_SYMBOLIC_LINK;
            case 'dev': return FILETYPE_CHARACTER_DEVICE;
            default: return FILETYPE_UNKNOWN;
        }
    }
    /**
     * Write a WASI filestat struct (64 bytes) at the given pointer.
     */
    _writeFilestat(ptr, ino, node) {
        const view = this._view();
        view.setBigUint64(ptr, 0n, true); // dev
        view.setBigUint64(ptr + 8, BigInt(ino), true); // ino
        view.setUint8(ptr + 16, this._inodeTypeToFiletype(node.type)); // filetype
        view.setUint8(ptr + 17, 0); // padding[0]
        view.setUint16(ptr + 18, node.mode & 0o7777, true); // POSIX permission bits (extension)
        view.setUint32(ptr + 20, 0, true); // padding[2..5]
        view.setBigUint64(ptr + 24, BigInt(node.nlink), true); // nlink
        view.setBigUint64(ptr + 32, BigInt(node.size), true); // size
        view.setBigUint64(ptr + 40, BigInt(node.atime) * 1000000n, true); // atim (ms->ns)
        view.setBigUint64(ptr + 48, BigInt(node.mtime) * 1000000n, true); // mtim (ms->ns)
        view.setBigUint64(ptr + 56, BigInt(node.ctime) * 1000000n, true); // ctim (ms->ns)
    }
    /**
     * Apply timestamp changes to a VFS inode based on fstflags.
     */
    _applyTimestamps(node, atim, mtim, fst_flags) {
        const now = Date.now();
        if (fst_flags & FSTFLAG_ATIM_NOW) {
            node.atime = now;
        }
        else if (fst_flags & FSTFLAG_ATIM) {
            const atimBig = typeof atim === 'bigint' ? atim : BigInt(atim);
            node.atime = Number(atimBig / 1000000n);
        }
        if (fst_flags & FSTFLAG_MTIM_NOW) {
            node.mtime = now;
        }
        else if (fst_flags & FSTFLAG_MTIM) {
            const mtimBig = typeof mtim === 'bigint' ? mtim : BigInt(mtim);
            node.mtime = Number(mtimBig / 1000000n);
        }
        node.ctime = now;
    }
    // --- Path operations (US-008) ---
    /**
     * Open a file or directory at a path relative to a directory fd.
     */
    path_open(dirfd, dirflags, path_ptr, path_len, oflags, fs_rights_base, fs_rights_inheriting, fdflags, opened_fd_ptr) {
        const dirEntry = this.fdTable.get(dirfd);
        if (!dirEntry)
            return ERRNO_EBADF;
        if (!(dirEntry.rightsBase & RIGHT_PATH_OPEN))
            return ERRNO_EBADF;
        const fullPath = this._resolveWasiPath(dirfd, path_ptr, path_len);
        if (!fullPath)
            return ERRNO_EBADF;
        // Intersect requested rights with directory's inheriting rights
        const rightsBase = (typeof fs_rights_base === 'bigint' ? fs_rights_base : BigInt(fs_rights_base)) & dirEntry.rightsInheriting;
        const rightsInheriting = (typeof fs_rights_inheriting === 'bigint' ? fs_rights_inheriting : BigInt(fs_rights_inheriting)) & dirEntry.rightsInheriting;
        // Delegate to kernel file I/O bridge
        const result = this._fileIO.fdOpen(fullPath, dirflags, oflags, fdflags, rightsBase, rightsInheriting);
        if (result.errno !== ERRNO_SUCCESS)
            return result.errno;
        this._view().setUint32(opened_fd_ptr, result.fd, true);
        return ERRNO_SUCCESS;
    }
    /**
     * Create a directory at a path relative to a directory fd.
     */
    path_create_directory(dirfd, path_ptr, path_len) {
        const dirEntry = this.fdTable.get(dirfd);
        if (!dirEntry)
            return ERRNO_EBADF;
        if (!(dirEntry.rightsBase & RIGHT_PATH_CREATE_DIRECTORY))
            return ERRNO_EBADF;
        const fullPath = this._resolveWasiPath(dirfd, path_ptr, path_len);
        if (!fullPath)
            return ERRNO_EBADF;
        try {
            this.vfs.mkdir(fullPath);
        }
        catch (e) {
            return vfsErrorToErrno(e);
        }
        return ERRNO_SUCCESS;
    }
    /**
     * Unlink a file at a path relative to a directory fd.
     */
    path_unlink_file(dirfd, path_ptr, path_len) {
        const dirEntry = this.fdTable.get(dirfd);
        if (!dirEntry)
            return ERRNO_EBADF;
        if (!(dirEntry.rightsBase & RIGHT_PATH_UNLINK_FILE))
            return ERRNO_EBADF;
        const fullPath = this._resolveWasiPath(dirfd, path_ptr, path_len);
        if (!fullPath)
            return ERRNO_EBADF;
        try {
            this.vfs.unlink(fullPath);
        }
        catch (e) {
            return vfsErrorToErrno(e);
        }
        return ERRNO_SUCCESS;
    }
    /**
     * Remove a directory at a path relative to a directory fd.
     */
    path_remove_directory(dirfd, path_ptr, path_len) {
        const dirEntry = this.fdTable.get(dirfd);
        if (!dirEntry)
            return ERRNO_EBADF;
        if (!(dirEntry.rightsBase & RIGHT_PATH_REMOVE_DIRECTORY))
            return ERRNO_EBADF;
        const fullPath = this._resolveWasiPath(dirfd, path_ptr, path_len);
        if (!fullPath)
            return ERRNO_EBADF;
        try {
            this.vfs.rmdir(fullPath);
        }
        catch (e) {
            return vfsErrorToErrno(e);
        }
        return ERRNO_SUCCESS;
    }
    /**
     * Rename a file or directory.
     */
    path_rename(old_dirfd, old_path_ptr, old_path_len, new_dirfd, new_path_ptr, new_path_len) {
        const oldDirEntry = this.fdTable.get(old_dirfd);
        if (!oldDirEntry)
            return ERRNO_EBADF;
        if (!(oldDirEntry.rightsBase & RIGHT_PATH_RENAME_SOURCE))
            return ERRNO_EBADF;
        const newDirEntry = this.fdTable.get(new_dirfd);
        if (!newDirEntry)
            return ERRNO_EBADF;
        if (!(newDirEntry.rightsBase & RIGHT_PATH_RENAME_TARGET))
            return ERRNO_EBADF;
        const oldPath = this._resolveWasiPath(old_dirfd, old_path_ptr, old_path_len);
        const newPath = this._resolveWasiPath(new_dirfd, new_path_ptr, new_path_len);
        if (!oldPath || !newPath)
            return ERRNO_EBADF;
        try {
            this.vfs.rename(oldPath, newPath);
        }
        catch (e) {
            return vfsErrorToErrno(e);
        }
        return ERRNO_SUCCESS;
    }
    /**
     * Create a symbolic link.
     */
    path_symlink(old_path_ptr, old_path_len, dirfd, new_path_ptr, new_path_len) {
        const dirEntry = this.fdTable.get(dirfd);
        if (!dirEntry)
            return ERRNO_EBADF;
        if (!(dirEntry.rightsBase & RIGHT_PATH_SYMLINK))
            return ERRNO_EBADF;
        const target = this._readPathString(old_path_ptr, old_path_len);
        const linkPath = this._resolveWasiPath(dirfd, new_path_ptr, new_path_len);
        if (!linkPath)
            return ERRNO_EBADF;
        try {
            this.vfs.symlink(target, linkPath);
        }
        catch (e) {
            return vfsErrorToErrno(e);
        }
        return ERRNO_SUCCESS;
    }
    /**
     * Read the target of a symbolic link.
     */
    path_readlink(dirfd, path_ptr, path_len, buf_ptr, buf_len, bufused_ptr) {
        const dirEntry = this.fdTable.get(dirfd);
        if (!dirEntry)
            return ERRNO_EBADF;
        if (!(dirEntry.rightsBase & RIGHT_PATH_READLINK))
            return ERRNO_EBADF;
        const fullPath = this._resolveWasiPath(dirfd, path_ptr, path_len);
        if (!fullPath)
            return ERRNO_EBADF;
        let target;
        try {
            target = this.vfs.readlink(fullPath);
        }
        catch (e) {
            return vfsErrorToErrno(e);
        }
        const encoded = new TextEncoder().encode(target);
        const writeLen = Math.min(encoded.length, buf_len);
        this._bytes().set(encoded.subarray(0, writeLen), buf_ptr);
        this._view().setUint32(bufused_ptr, writeLen, true);
        return ERRNO_SUCCESS;
    }
    /**
     * Get file status by path.
     */
    path_filestat_get(dirfd, flags, path_ptr, path_len, buf_ptr) {
        const dirEntry = this.fdTable.get(dirfd);
        if (!dirEntry)
            return ERRNO_EBADF;
        if (!(dirEntry.rightsBase & RIGHT_PATH_FILESTAT_GET))
            return ERRNO_EBADF;
        const fullPath = this._resolveWasiPath(dirfd, path_ptr, path_len);
        if (!fullPath)
            return ERRNO_EBADF;
        const followSymlinks = !!(flags & LOOKUP_SYMLINK_FOLLOW);
        const ino = this.vfs.getIno(fullPath, followSymlinks);
        if (ino === null)
            return ERRNO_ENOENT;
        const node = this.vfs.getInodeByIno(ino);
        if (!node)
            return ERRNO_ENOENT;
        this._writeFilestat(buf_ptr, ino, node);
        return ERRNO_SUCCESS;
    }
    /**
     * Set file timestamps by path.
     */
    path_filestat_set_times(dirfd, flags, path_ptr, path_len, atim, mtim, fst_flags) {
        const dirEntry = this.fdTable.get(dirfd);
        if (!dirEntry)
            return ERRNO_EBADF;
        if (!(dirEntry.rightsBase & RIGHT_PATH_FILESTAT_SET_TIMES))
            return ERRNO_EBADF;
        const fullPath = this._resolveWasiPath(dirfd, path_ptr, path_len);
        if (!fullPath)
            return ERRNO_EBADF;
        const followSymlinks = !!(flags & LOOKUP_SYMLINK_FOLLOW);
        const ino = this.vfs.getIno(fullPath, followSymlinks);
        if (ino === null)
            return ERRNO_ENOENT;
        const node = this.vfs.getInodeByIno(ino);
        if (!node)
            return ERRNO_ENOENT;
        this._applyTimestamps(node, atim, mtim, fst_flags);
        return ERRNO_SUCCESS;
    }
    // --- FD filestat operations (US-008) ---
    /**
     * Get file status by fd.
     */
    fd_filestat_get(fd, buf_ptr) {
        const entry = this.fdTable.get(fd);
        if (!entry)
            return ERRNO_EBADF;
        if (!(entry.rightsBase & RIGHT_FD_FILESTAT_GET))
            return ERRNO_EBADF;
        const resource = entry.resource;
        if (resource.type === 'vfsFile' || resource.type === 'preopen') {
            // Kernel-opened vfsFile resources have ino=0 (sentinel) — resolve by path
            const ino = (resource.type === 'vfsFile' && resource.ino !== 0)
                ? resource.ino
                : this.vfs.getIno(resource.path, true);
            if (ino === null)
                return ERRNO_EBADF;
            const node = this.vfs.getInodeByIno(ino);
            if (!node)
                return ERRNO_EBADF;
            this._writeFilestat(buf_ptr, ino, node);
        }
        else {
            // stdio, pipe, etc. -- return minimal stat
            const view = this._view();
            view.setBigUint64(buf_ptr, 0n, true); // dev
            view.setBigUint64(buf_ptr + 8, 0n, true); // ino
            view.setUint8(buf_ptr + 16, entry.filetype); // filetype
            for (let i = 17; i < 24; i++)
                view.setUint8(buf_ptr + i, 0);
            view.setBigUint64(buf_ptr + 24, 1n, true); // nlink
            view.setBigUint64(buf_ptr + 32, 0n, true); // size
            view.setBigUint64(buf_ptr + 40, 0n, true); // atim
            view.setBigUint64(buf_ptr + 48, 0n, true); // mtim
            view.setBigUint64(buf_ptr + 56, 0n, true); // ctim
        }
        return ERRNO_SUCCESS;
    }
    /**
     * Set file size by fd (truncate or extend).
     */
    fd_filestat_set_size(fd, size) {
        const entry = this.fdTable.get(fd);
        if (!entry)
            return ERRNO_EBADF;
        if (!(entry.rightsBase & RIGHT_FD_FILESTAT_SET_SIZE))
            return ERRNO_EBADF;
        if (entry.resource.type !== 'vfsFile')
            return ERRNO_EINVAL;
        const node = this.vfs.getInodeByIno(entry.resource.ino);
        if (!node || node.type !== 'file')
            return ERRNO_EINVAL;
        const newSize = Number(typeof size === 'bigint' ? size : BigInt(size));
        if (newSize === node.data.length)
            return ERRNO_SUCCESS;
        const newData = new Uint8Array(newSize);
        newData.set(node.data.subarray(0, Math.min(node.data.length, newSize)));
        node.data = newData;
        node.mtime = Date.now();
        node.ctime = Date.now();
        return ERRNO_SUCCESS;
    }
    /**
     * Set file timestamps by fd.
     */
    fd_filestat_set_times(fd, atim, mtim, fst_flags) {
        const entry = this.fdTable.get(fd);
        if (!entry)
            return ERRNO_EBADF;
        if (!(entry.rightsBase & RIGHT_FD_FILESTAT_SET_TIMES))
            return ERRNO_EBADF;
        if (entry.resource.type === 'vfsFile') {
            const node = this.vfs.getInodeByIno(entry.resource.ino);
            if (!node)
                return ERRNO_EBADF;
            this._applyTimestamps(node, atim, mtim, fst_flags);
        }
        else if (entry.resource.type === 'preopen') {
            const ino = this.vfs.getIno(entry.resource.path, true);
            if (ino === null)
                return ERRNO_EBADF;
            const node = this.vfs.getInodeByIno(ino);
            if (!node)
                return ERRNO_EBADF;
            this._applyTimestamps(node, atim, mtim, fst_flags);
        }
        // For stdio/pipes, silently succeed
        return ERRNO_SUCCESS;
    }
    // --- Directory operations (US-008) ---
    /**
     * Read directory entries from a directory fd.
     * Writes dirent structs (24-byte header + name) into the buffer.
     */
    fd_readdir(fd, buf_ptr, buf_len, cookie, bufused_ptr) {
        const entry = this.fdTable.get(fd);
        if (!entry)
            return ERRNO_EBADF;
        if (!(entry.rightsBase & RIGHT_FD_READDIR))
            return ERRNO_EBADF;
        let ino;
        if (entry.resource.type === 'preopen') {
            ino = this.vfs.getIno(entry.resource.path, true);
        }
        else if (entry.resource.type === 'vfsFile') {
            ino = entry.resource.ino;
        }
        else {
            return ERRNO_EBADF;
        }
        const node = this.vfs.getInodeByIno(ino);
        if (!node || node.type !== 'dir')
            return ERRNO_ENOTDIR;
        const entries = Array.from(node.entries.entries());
        const cookieNum = Number(typeof cookie === 'bigint' ? cookie : BigInt(cookie));
        const mem = this._bytes();
        const view = this._view();
        let offset = 0;
        for (let i = cookieNum; i < entries.length; i++) {
            const [name, childIno] = entries[i];
            const childNode = this.vfs.getInodeByIno(childIno);
            const nameBytes = new TextEncoder().encode(name);
            const headerSize = 24;
            const entrySize = headerSize + nameBytes.length;
            if (offset + entrySize > buf_len)
                break;
            // Write dirent header
            view.setBigUint64(buf_ptr + offset, BigInt(i + 1), true); // d_next
            view.setBigUint64(buf_ptr + offset + 8, BigInt(childIno), true); // d_ino
            view.setUint32(buf_ptr + offset + 16, nameBytes.length, true); // d_namlen
            view.setUint8(buf_ptr + offset + 20, childNode ? this._inodeTypeToFiletype(childNode.type) : FILETYPE_UNKNOWN); // d_type
            view.setUint8(buf_ptr + offset + 21, 0); // padding
            view.setUint8(buf_ptr + offset + 22, 0);
            view.setUint8(buf_ptr + offset + 23, 0);
            offset += headerSize;
            // Write name (guaranteed to fit — checked entrySize above)
            mem.set(nameBytes, buf_ptr + offset);
            offset += nameBytes.length;
        }
        view.setUint32(bufused_ptr, offset, true);
        return ERRNO_SUCCESS;
    }
    // --- Args and environ operations (US-009) ---
    /**
     * Write command-line arguments into WASM memory.
     * argv_ptr: pointer to array of u32 pointers (one per arg)
     * argv_buf_ptr: pointer to buffer where arg strings are written (null-terminated)
     */
    args_get(argv_ptr, argv_buf_ptr) {
        const args = this._processIO.getArgs();
        const view = this._view();
        const mem = this._bytes();
        const encoder = new TextEncoder();
        let bufOffset = argv_buf_ptr;
        for (let i = 0; i < args.length; i++) {
            view.setUint32(argv_ptr + i * 4, bufOffset, true);
            const encoded = encoder.encode(args[i]);
            mem.set(encoded, bufOffset);
            mem[bufOffset + encoded.length] = 0; // null terminator
            bufOffset += encoded.length + 1;
        }
        return ERRNO_SUCCESS;
    }
    /**
     * Get the sizes needed for args_get.
     * Writes argc (u32) at argc_ptr and total argv buffer size (u32) at argv_buf_size_ptr.
     */
    args_sizes_get(argc_ptr, argv_buf_size_ptr) {
        const args = this._processIO.getArgs();
        const view = this._view();
        const encoder = new TextEncoder();
        let bufSize = 0;
        for (const arg of args) {
            bufSize += encoder.encode(arg).length + 1; // +1 for null terminator
        }
        view.setUint32(argc_ptr, args.length, true);
        view.setUint32(argv_buf_size_ptr, bufSize, true);
        return ERRNO_SUCCESS;
    }
    /**
     * Write environment variables into WASM memory.
     * environ_ptr: pointer to array of u32 pointers (one per env entry)
     * environ_buf_ptr: pointer to buffer where "KEY=VALUE\0" strings are written
     */
    environ_get(environ_ptr, environ_buf_ptr) {
        const env = this._processIO.getEnviron();
        const view = this._view();
        const mem = this._bytes();
        const encoder = new TextEncoder();
        const entries = Object.entries(env);
        let bufOffset = environ_buf_ptr;
        for (let i = 0; i < entries.length; i++) {
            view.setUint32(environ_ptr + i * 4, bufOffset, true);
            const str = `${entries[i][0]}=${entries[i][1]}`;
            const encoded = encoder.encode(str);
            mem.set(encoded, bufOffset);
            mem[bufOffset + encoded.length] = 0; // null terminator
            bufOffset += encoded.length + 1;
        }
        return ERRNO_SUCCESS;
    }
    /**
     * Get the sizes needed for environ_get.
     * Writes environ count (u32) at environc_ptr and total buffer size (u32) at environ_buf_size_ptr.
     */
    environ_sizes_get(environc_ptr, environ_buf_size_ptr) {
        const env = this._processIO.getEnviron();
        const view = this._view();
        const encoder = new TextEncoder();
        const entries = Object.entries(env);
        let bufSize = 0;
        for (const [key, value] of entries) {
            bufSize += encoder.encode(`${key}=${value}`).length + 1;
        }
        view.setUint32(environc_ptr, entries.length, true);
        view.setUint32(environ_buf_size_ptr, bufSize, true);
        return ERRNO_SUCCESS;
    }
    // --- Clock, random, and process operations (US-009) ---
    /**
     * Get the resolution of a clock.
     * Writes resolution in nanoseconds as u64 at resolution_ptr.
     */
    clock_res_get(id, resolution_ptr) {
        const view = this._view();
        switch (id) {
            case CLOCKID_REALTIME:
                // Date.now() has ~1ms resolution
                view.setBigUint64(resolution_ptr, 1000000n, true);
                return ERRNO_SUCCESS;
            case CLOCKID_MONOTONIC:
                // performance.now() has ~1us resolution (in practice, may be less)
                view.setBigUint64(resolution_ptr, 1000n, true);
                return ERRNO_SUCCESS;
            case CLOCKID_PROCESS_CPUTIME_ID:
            case CLOCKID_THREAD_CPUTIME_ID:
                // Approximate -- no real CPU time tracking
                view.setBigUint64(resolution_ptr, 1000000n, true);
                return ERRNO_SUCCESS;
            default:
                return ERRNO_EINVAL;
        }
    }
    /**
     * Get the current time of a clock.
     * Writes time in nanoseconds as u64 at time_ptr.
     */
    clock_time_get(id, _precision, time_ptr) {
        const view = this._view();
        switch (id) {
            case CLOCKID_REALTIME: {
                const ms = Date.now();
                view.setBigUint64(time_ptr, BigInt(ms) * 1000000n, true);
                return ERRNO_SUCCESS;
            }
            case CLOCKID_MONOTONIC: {
                // Use performance.now() if available, fall back to Date.now()
                const nowMs = (typeof performance !== 'undefined' && performance.now)
                    ? performance.now()
                    : Date.now();
                // Convert ms (float) to nanoseconds
                const ns = BigInt(Math.round(nowMs * 1_000_000));
                view.setBigUint64(time_ptr, ns, true);
                return ERRNO_SUCCESS;
            }
            case CLOCKID_PROCESS_CPUTIME_ID:
            case CLOCKID_THREAD_CPUTIME_ID: {
                // Approximate with monotonic clock
                const nowMs = (typeof performance !== 'undefined' && performance.now)
                    ? performance.now()
                    : Date.now();
                const ns = BigInt(Math.round(nowMs * 1_000_000));
                view.setBigUint64(time_ptr, ns, true);
                return ERRNO_SUCCESS;
            }
            default:
                return ERRNO_EINVAL;
        }
    }
    /**
     * Fill a buffer with cryptographically secure random bytes.
     */
    random_get(buf_ptr, buf_len) {
        const mem = this._bytes();
        const target = mem.subarray(buf_ptr, buf_ptr + buf_len);
        // Use crypto.getRandomValues -- works in both browser and Node.js
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            // getRandomValues has a 65536-byte limit per call
            for (let offset = 0; offset < buf_len; offset += 65536) {
                const len = Math.min(65536, buf_len - offset);
                crypto.getRandomValues(target.subarray(offset, offset + len));
            }
        }
        else {
            // Fallback: Math.random (not cryptographically secure, but functional)
            for (let i = 0; i < buf_len; i++) {
                target[i] = Math.floor(Math.random() * 256);
            }
        }
        return ERRNO_SUCCESS;
    }
    /**
     * Terminate the process with an exit code.
     * Throws WasiProcExit to unwind the WASM call stack.
     */
    proc_exit(exitCode) {
        this.exitCode = exitCode;
        this._processIO.procExit(exitCode);
        throw new WasiProcExit(exitCode);
    }
    /**
     * Send a signal to the current process.
     * Not meaningful in WASM -- stub that returns ENOSYS.
     */
    proc_raise(_sig) {
        return ERRNO_ENOSYS;
    }
    /**
     * Yield the current thread's execution.
     * No-op in single-threaded WASM.
     */
    sched_yield() {
        return ERRNO_SUCCESS;
    }
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
    poll_oneoff(in_ptr, out_ptr, nsubscriptions, nevents_ptr) {
        const view = this._view();
        const nsubs = nsubscriptions;
        let nevents = 0;
        for (let i = 0; i < nsubs; i++) {
            const subBase = in_ptr + i * 48;
            const userdata = view.getBigUint64(subBase, true);
            const eventType = view.getUint8(subBase + 8);
            const evtBase = out_ptr + nevents * 32;
            view.setBigUint64(evtBase, userdata, true); // userdata
            view.setUint16(evtBase + 8, 0, true); // error = success
            view.setUint8(evtBase + 10, eventType); // type
            if (eventType === EVENTTYPE_CLOCK) {
                // Block for the requested duration (nanosleep/sleep via poll_oneoff)
                const timeoutNs = view.getBigUint64(subBase + 24, true);
                const flags = view.getUint16(subBase + 40, true);
                const isAbstime = (flags & 1) !== 0;
                let sleepMs;
                if (isAbstime) {
                    // Absolute time: sleep until the specified wallclock time
                    const targetMs = Number(timeoutNs / 1000000n);
                    sleepMs = Math.max(0, targetMs - Date.now());
                }
                else {
                    // Relative time: sleep for the specified duration
                    sleepMs = Number(timeoutNs / 1000000n);
                }
                if (sleepMs > 0) {
                    const buf = new Int32Array(new SharedArrayBuffer(4));
                    let remainingMs = sleepMs;
                    while (remainingMs > 0) {
                        const sliceMs = Math.min(remainingMs, 10);
                        Atomics.wait(buf, 0, 0, sliceMs);
                        remainingMs -= sliceMs;
                        this._sleepHook?.();
                    }
                }
            }
            else if (eventType === EVENTTYPE_FD_READ || eventType === EVENTTYPE_FD_WRITE) {
                // FD subscriptions -- report ready immediately
                view.setBigUint64(evtBase + 16, 0n, true); // nbytes
                view.setUint16(evtBase + 24, 0, true); // flags
            }
            nevents++;
        }
        view.setUint32(nevents_ptr, nevents, true);
        return ERRNO_SUCCESS;
    }
    // --- Stub/no-op fd operations (US-009) ---
    /**
     * Advise the system on intended file usage patterns.
     * No-op -- advisory only.
     */
    fd_advise(fd, _offset, _len, _advice) {
        const entry = this.fdTable.get(fd);
        if (!entry)
            return ERRNO_EBADF;
        return ERRNO_SUCCESS;
    }
    /**
     * Pre-allocate space for a file.
     * No-op in VFS (files grow dynamically).
     */
    fd_allocate(fd, _offset, _len) {
        const entry = this.fdTable.get(fd);
        if (!entry)
            return ERRNO_EBADF;
        return ERRNO_SUCCESS;
    }
    /**
     * Synchronize file data to storage.
     * No-op in in-memory VFS.
     */
    fd_datasync(fd) {
        const entry = this.fdTable.get(fd);
        if (!entry)
            return ERRNO_EBADF;
        return ERRNO_SUCCESS;
    }
    /**
     * Synchronize file data and metadata to storage.
     * No-op in in-memory VFS.
     */
    fd_sync(fd) {
        const entry = this.fdTable.get(fd);
        if (!entry)
            return ERRNO_EBADF;
        return ERRNO_SUCCESS;
    }
    /**
     * Set rights on a file descriptor (shrink only).
     * Minimal implementation -- just validates fd.
     */
    fd_fdstat_set_rights(fd, fs_rights_base, fs_rights_inheriting) {
        const entry = this.fdTable.get(fd);
        if (!entry)
            return ERRNO_EBADF;
        // Rights can only be shrunk, not expanded
        const base = typeof fs_rights_base === 'bigint' ? fs_rights_base : BigInt(fs_rights_base);
        const inheriting = typeof fs_rights_inheriting === 'bigint' ? fs_rights_inheriting : BigInt(fs_rights_inheriting);
        entry.rightsBase = entry.rightsBase & base;
        entry.rightsInheriting = entry.rightsInheriting & inheriting;
        return ERRNO_SUCCESS;
    }
    /**
     * Read from a file descriptor at a given offset without changing the cursor.
     * Delegates to kernel file I/O bridge.
     */
    fd_pread(fd, iovs_ptr, iovs_len, offset, nread_ptr) {
        const entry = this.fdTable.get(fd);
        if (!entry)
            return ERRNO_EBADF;
        if (!(entry.rightsBase & RIGHT_FD_READ))
            return ERRNO_EBADF;
        if (entry.filetype !== FILETYPE_REGULAR_FILE)
            return ERRNO_ESPIPE;
        const iovecs = this._readIovecs(iovs_ptr, iovs_len);
        const mem = this._bytes();
        const offsetBig = typeof offset === 'bigint' ? offset : BigInt(offset);
        const totalRequested = iovecs.reduce((sum, iov) => sum + iov.buf_len, 0);
        const result = this._fileIO.fdPread(fd, totalRequested, offsetBig);
        if (result.errno !== ERRNO_SUCCESS)
            return result.errno;
        let dataOffset = 0;
        let totalRead = 0;
        for (const iov of iovecs) {
            const remaining = result.data.length - dataOffset;
            if (remaining <= 0)
                break;
            const n = Math.min(iov.buf_len, remaining);
            mem.set(result.data.subarray(dataOffset, dataOffset + n), iov.buf);
            dataOffset += n;
            totalRead += n;
        }
        this._view().setUint32(nread_ptr, totalRead, true);
        return ERRNO_SUCCESS;
    }
    /**
     * Write to a file descriptor at a given offset without changing the cursor.
     * Delegates to kernel file I/O bridge.
     */
    fd_pwrite(fd, iovs_ptr, iovs_len, offset, nwritten_ptr) {
        const entry = this.fdTable.get(fd);
        if (!entry)
            return ERRNO_EBADF;
        if (!(entry.rightsBase & RIGHT_FD_WRITE))
            return ERRNO_EBADF;
        if (entry.filetype !== FILETYPE_REGULAR_FILE)
            return ERRNO_ESPIPE;
        const iovecs = this._readIovecs(iovs_ptr, iovs_len);
        const mem = this._bytes();
        const offsetBig = typeof offset === 'bigint' ? offset : BigInt(offset);
        const chunks = [];
        let totalWritten = 0;
        for (const iov of iovecs) {
            if (iov.buf_len === 0)
                continue;
            chunks.push(mem.slice(iov.buf, iov.buf + iov.buf_len));
            totalWritten += iov.buf_len;
        }
        if (totalWritten > 0) {
            const writeData = concatBytes(chunks);
            const result = this._fileIO.fdPwrite(fd, writeData, offsetBig);
            if (result.errno !== ERRNO_SUCCESS)
                return result.errno;
        }
        this._view().setUint32(nwritten_ptr, totalWritten, true);
        return ERRNO_SUCCESS;
    }
    /**
     * Renumber a file descriptor (atomically move oldFd to newFd).
     */
    fd_renumber(from_fd, to_fd) {
        this._preopens.delete(from_fd);
        this._preopens.delete(to_fd);
        return this.fdTable.renumber(from_fd, to_fd);
    }
    /**
     * Create a hard link.
     * Not supported in our VFS -- return ENOSYS.
     */
    path_link(_old_fd, _old_flags, _old_path_ptr, _old_path_len, _new_fd, _new_path_ptr, _new_path_len) {
        return ERRNO_ENOSYS;
    }
    // --- Socket stubs (US-009) -- all return ENOSYS ---
    sock_accept(_fd, _flags, _result_fd_ptr) {
        return ERRNO_ENOSYS;
    }
    sock_recv(_fd, _ri_data_ptr, _ri_data_len, _ri_flags, _ro_datalen_ptr, _ro_flags_ptr) {
        return ERRNO_ENOSYS;
    }
    sock_send(_fd, _si_data_ptr, _si_data_len, _si_flags, _so_datalen_ptr) {
        return ERRNO_ENOSYS;
    }
    sock_shutdown(_fd, _how) {
        return ERRNO_ENOSYS;
    }
    /**
     * Get the wasi_snapshot_preview1 import object.
     * All 46 wasi_snapshot_preview1 functions.
     */
    getImports() {
        return {
            // Core fd operations (US-007)
            fd_read: (fd, iovs_ptr, iovs_len, nread_ptr) => this.fd_read(fd, iovs_ptr, iovs_len, nread_ptr),
            fd_write: (fd, iovs_ptr, iovs_len, nwritten_ptr) => this.fd_write(fd, iovs_ptr, iovs_len, nwritten_ptr),
            fd_seek: (fd, offset, whence, newoffset_ptr) => this.fd_seek(fd, offset, whence, newoffset_ptr),
            fd_tell: (fd, offset_ptr) => this.fd_tell(fd, offset_ptr),
            fd_close: (fd) => this.fd_close(fd),
            fd_fdstat_get: (fd, buf_ptr) => this.fd_fdstat_get(fd, buf_ptr),
            fd_fdstat_set_flags: (fd, flags) => this.fd_fdstat_set_flags(fd, flags),
            fd_prestat_get: (fd, buf_ptr) => this.fd_prestat_get(fd, buf_ptr),
            fd_prestat_dir_name: (fd, path_ptr, path_len) => this.fd_prestat_dir_name(fd, path_ptr, path_len),
            // Path operations (US-008)
            path_open: (dirfd, dirflags, path_ptr, path_len, oflags, fs_rights_base, fs_rights_inheriting, fdflags, opened_fd_ptr) => this.path_open(dirfd, dirflags, path_ptr, path_len, oflags, fs_rights_base, fs_rights_inheriting, fdflags, opened_fd_ptr),
            path_create_directory: (dirfd, path_ptr, path_len) => this.path_create_directory(dirfd, path_ptr, path_len),
            path_unlink_file: (dirfd, path_ptr, path_len) => this.path_unlink_file(dirfd, path_ptr, path_len),
            path_remove_directory: (dirfd, path_ptr, path_len) => this.path_remove_directory(dirfd, path_ptr, path_len),
            path_rename: (old_dirfd, old_path_ptr, old_path_len, new_dirfd, new_path_ptr, new_path_len) => this.path_rename(old_dirfd, old_path_ptr, old_path_len, new_dirfd, new_path_ptr, new_path_len),
            path_symlink: (old_path_ptr, old_path_len, dirfd, new_path_ptr, new_path_len) => this.path_symlink(old_path_ptr, old_path_len, dirfd, new_path_ptr, new_path_len),
            path_readlink: (dirfd, path_ptr, path_len, buf_ptr, buf_len, bufused_ptr) => this.path_readlink(dirfd, path_ptr, path_len, buf_ptr, buf_len, bufused_ptr),
            path_filestat_get: (dirfd, flags, path_ptr, path_len, buf_ptr) => this.path_filestat_get(dirfd, flags, path_ptr, path_len, buf_ptr),
            path_filestat_set_times: (dirfd, flags, path_ptr, path_len, atim, mtim, fst_flags) => this.path_filestat_set_times(dirfd, flags, path_ptr, path_len, atim, mtim, fst_flags),
            // FD filestat and directory operations (US-008)
            fd_filestat_get: (fd, buf_ptr) => this.fd_filestat_get(fd, buf_ptr),
            fd_filestat_set_size: (fd, size) => this.fd_filestat_set_size(fd, size),
            fd_filestat_set_times: (fd, atim, mtim, fst_flags) => this.fd_filestat_set_times(fd, atim, mtim, fst_flags),
            fd_readdir: (fd, buf_ptr, buf_len, cookie, bufused_ptr) => this.fd_readdir(fd, buf_ptr, buf_len, cookie, bufused_ptr),
            // Args, env, clock, random, process (US-009)
            args_get: (argv_ptr, argv_buf_ptr) => this.args_get(argv_ptr, argv_buf_ptr),
            args_sizes_get: (argc_ptr, argv_buf_size_ptr) => this.args_sizes_get(argc_ptr, argv_buf_size_ptr),
            environ_get: (environ_ptr, environ_buf_ptr) => this.environ_get(environ_ptr, environ_buf_ptr),
            environ_sizes_get: (environc_ptr, environ_buf_size_ptr) => this.environ_sizes_get(environc_ptr, environ_buf_size_ptr),
            clock_res_get: (id, resolution_ptr) => this.clock_res_get(id, resolution_ptr),
            clock_time_get: (id, precision, time_ptr) => this.clock_time_get(id, precision, time_ptr),
            random_get: (buf_ptr, buf_len) => this.random_get(buf_ptr, buf_len),
            proc_exit: (exitCode) => this.proc_exit(exitCode),
            proc_raise: (sig) => this.proc_raise(sig),
            sched_yield: () => this.sched_yield(),
            poll_oneoff: (in_ptr, out_ptr, nsubscriptions, nevents_ptr) => this.poll_oneoff(in_ptr, out_ptr, nsubscriptions, nevents_ptr),
            // Stub fd operations (US-009)
            fd_advise: (fd, offset, len, advice) => this.fd_advise(fd, offset, len, advice),
            fd_allocate: (fd, offset, len) => this.fd_allocate(fd, offset, len),
            fd_datasync: (fd) => this.fd_datasync(fd),
            fd_sync: (fd) => this.fd_sync(fd),
            fd_fdstat_set_rights: (fd, fs_rights_base, fs_rights_inheriting) => this.fd_fdstat_set_rights(fd, fs_rights_base, fs_rights_inheriting),
            fd_pread: (fd, iovs_ptr, iovs_len, offset, nread_ptr) => this.fd_pread(fd, iovs_ptr, iovs_len, offset, nread_ptr),
            fd_pwrite: (fd, iovs_ptr, iovs_len, offset, nwritten_ptr) => this.fd_pwrite(fd, iovs_ptr, iovs_len, offset, nwritten_ptr),
            fd_renumber: (from_fd, to_fd) => this.fd_renumber(from_fd, to_fd),
            // Path stubs (US-009)
            path_link: (old_fd, old_flags, old_path_ptr, old_path_len, new_fd, new_path_ptr, new_path_len) => this.path_link(old_fd, old_flags, old_path_ptr, old_path_len, new_fd, new_path_ptr, new_path_len),
            // Socket stubs (US-009) -- all return ENOSYS
            sock_accept: (fd, flags, result_fd_ptr) => this.sock_accept(fd, flags, result_fd_ptr),
            sock_recv: (fd, ri_data_ptr, ri_data_len, ri_flags, ro_datalen_ptr, ro_flags_ptr) => this.sock_recv(fd, ri_data_ptr, ri_data_len, ri_flags, ro_datalen_ptr, ro_flags_ptr),
            sock_send: (fd, si_data_ptr, si_data_len, si_flags, so_datalen_ptr) => this.sock_send(fd, si_data_ptr, si_data_len, si_flags, so_datalen_ptr),
            sock_shutdown: (fd, how) => this.sock_shutdown(fd, how),
        };
    }
}
//# sourceMappingURL=wasi-polyfill.js.map