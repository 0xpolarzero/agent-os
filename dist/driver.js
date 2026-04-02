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
import { AF_INET, AF_INET6, AF_UNIX, SOCK_STREAM, SOCK_DGRAM, resolveProcSelfPath, } from '@secure-exec/core';
import { WorkerAdapter } from './worker-adapter.js';
import { SIGNAL_BUFFER_BYTES, DATA_BUFFER_BYTES, RPC_WAIT_TIMEOUT_MS, SIG_IDX_STATE, SIG_IDX_ERRNO, SIG_IDX_INT_RESULT, SIG_IDX_DATA_LEN, SIG_IDX_PENDING_SIGNAL, SIG_STATE_READY, } from './syscall-rpc.js';
import { ERRNO_MAP, ERRNO_EIO } from './wasi-constants.js';
import { isWasmBinary, isWasmBinarySync } from './wasm-magic.js';
import { resolvePermissionTier } from './permission-check.js';
import { ModuleCache } from './module-cache.js';
import { readdir, stat } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { connect as tlsConnect } from 'node:tls';
import { lookup } from 'node:dns/promises';
// wasi-libc bottom-half socket constants differ from the kernel's POSIX-facing
// constants, so normalize them at the host_net boundary.
const WASI_AF_INET = 1;
const WASI_AF_INET6 = 2;
const WASI_AF_UNIX = 3;
const WASI_SOCK_DGRAM = 5;
const WASI_SOCK_STREAM = 6;
const WASI_SOCK_TYPE_FLAGS = 0x6000;
function normalizeSocketDomain(domain) {
    switch (domain) {
        case WASI_AF_INET:
            return AF_INET;
        case WASI_AF_INET6:
            return AF_INET6;
        case WASI_AF_UNIX:
            return AF_UNIX;
        default:
            return domain;
    }
}
function normalizeSocketType(type) {
    switch (type & ~WASI_SOCK_TYPE_FLAGS) {
        case WASI_SOCK_DGRAM:
            return SOCK_DGRAM;
        case WASI_SOCK_STREAM:
            return SOCK_STREAM;
        default:
            return type & ~WASI_SOCK_TYPE_FLAGS;
    }
}
function scopedProcPath(pid, path) {
    return resolveProcSelfPath(path, pid);
}
function decodeSocketOptionValue(optval) {
    if (optval.byteLength === 0 || optval.byteLength > 6) {
        throw Object.assign(new Error('EINVAL: invalid socket option length'), { code: 'EINVAL' });
    }
    // Decode little-endian integers exactly as wasi-libc passes them to host_net.
    let value = 0;
    for (let index = 0; index < optval.byteLength; index++) {
        value += optval[index] * (2 ** (index * 8));
    }
    return value;
}
function encodeSocketOptionValue(value, byteLength) {
    if (!Number.isInteger(byteLength) || byteLength <= 0 || byteLength > 6) {
        throw Object.assign(new Error('EINVAL: invalid socket option length'), { code: 'EINVAL' });
    }
    const encoded = new Uint8Array(byteLength);
    let remaining = value;
    for (let index = 0; index < byteLength; index++) {
        encoded[index] = remaining % 0x100;
        remaining = Math.floor(remaining / 0x100);
    }
    return encoded;
}
function decodeSignalMask(maskLow, maskHigh) {
    const mask = new Set();
    // Expand the wasm-side 64-bit sigset payload into the kernel's signal set.
    for (let bit = 0; bit < 32; bit++) {
        if (((maskLow >>> bit) & 1) !== 0)
            mask.add(bit + 1);
        if (((maskHigh >>> bit) & 1) !== 0)
            mask.add(bit + 33);
    }
    return mask;
}
function serializeSockAddr(addr) {
    return 'host' in addr ? `${addr.host}:${addr.port}` : addr.path;
}
function getKernelWorkerUrl() {
    const siblingWorkerUrl = new URL('./kernel-worker.js', import.meta.url);
    if (existsSync(siblingWorkerUrl)) {
        return siblingWorkerUrl;
    }
    return new URL('../dist/kernel-worker.js', import.meta.url);
}
/**
 * All commands available in the WasmVM runtime.
 * Used as fallback when no commandDirs are configured (legacy mode).
 * @deprecated Use commandDirs option instead — commands are discovered from filesystem.
 */
export const WASMVM_COMMANDS = [
    // Shell
    'sh', 'bash',
    // Text processing
    'grep', 'egrep', 'fgrep', 'rg', 'sed', 'awk', 'jq', 'yq',
    // Find
    'find', 'fd',
    // Built-in implementations
    'cat', 'chmod', 'column', 'cp', 'dd', 'diff', 'du', 'expr', 'file', 'head',
    'ln', 'logname', 'ls', 'mkdir', 'mktemp', 'mv', 'pathchk', 'rev', 'rm',
    'sleep', 'sort', 'split', 'stat', 'strings', 'tac', 'tail', 'test',
    '[', 'touch', 'tree', 'tsort', 'whoami',
    // Compression & Archiving
    'gzip', 'gunzip', 'zcat', 'tar', 'zip', 'unzip',
    // Data Processing (C programs)
    'sqlite3',
    // Network (C programs)
    'curl', 'wget',
    // Build tools (C programs)
    'make',
    // Version control (C programs)
    'git', 'git-remote-http', 'git-remote-https',
    // Shim commands
    'env', 'envsubst', 'nice', 'nohup', 'stdbuf', 'timeout', 'xargs',
    // uutils: text/encoding
    'base32', 'base64', 'basenc', 'basename', 'comm', 'cut',
    'dircolors', 'dirname', 'echo', 'expand', 'factor', 'false',
    'fmt', 'fold', 'join', 'nl', 'numfmt', 'od', 'paste',
    'printenv', 'printf', 'ptx', 'seq', 'shuf', 'tr', 'true',
    'unexpand', 'uniq', 'wc', 'yes',
    // uutils: checksums
    'b2sum', 'cksum', 'md5sum', 'sha1sum', 'sha224sum', 'sha256sum',
    'sha384sum', 'sha512sum', 'sum',
    // uutils: file operations
    'link', 'pwd', 'readlink', 'realpath', 'rmdir', 'shred', 'tee',
    'truncate', 'unlink',
    // uutils: system info
    'arch', 'date', 'nproc', 'uname',
    // uutils: ls variants
    'dir', 'vdir',
    // Stubbed commands
    'hostname', 'hostid', 'more', 'sync', 'tty',
    'chcon', 'runcon',
    'chgrp', 'chown',
    'chroot',
    'df',
    'groups', 'id',
    'install',
    'kill',
    'mkfifo', 'mknod',
    'pinky', 'who', 'users', 'uptime',
    'stty',
    // Codex CLI (host_process spawn via wasi-spawn)
    'codex',
    // Codex headless agent (non-TUI entry point)
    'codex-exec',
    // Internal test: WasiChild host_process spawn validation
    'spawn-test-host',
    // Internal test: wasi-http HTTP client validation via host_net
    'http-test',
];
Object.freeze(WASMVM_COMMANDS);
/**
 * Default permission tiers for known first-party commands.
 * User-provided permissions override these defaults.
 */
export const DEFAULT_FIRST_PARTY_TIERS = {
    // Shell — needs proc_spawn for pipelines and subcommands
    'sh': 'full',
    'bash': 'full',
    // Shims — spawn child processes as their core function
    'env': 'full',
    'timeout': 'full',
    'xargs': 'full',
    'nice': 'full',
    'nohup': 'full',
    'stdbuf': 'full',
    // Build tools — spawns child processes to run recipes
    'make': 'full',
    // Codex CLI — spawns child processes via wasi-spawn
    'codex': 'full',
    // Codex headless agent — spawns processes + uses network
    'codex-exec': 'full',
    // Internal test — exercises WasiChild host_process spawn
    'spawn-test-host': 'full',
    // Internal test — exercises wasi-http HTTP client via host_net
    'http-test': 'full',
    // Version control — reads/writes .git objects, remote operations use network
    'git': 'full',
    'git-remote-http': 'full',
    'git-remote-https': 'full',
    // Read-only tools — never need to write files
    'grep': 'read-only',
    'egrep': 'read-only',
    'fgrep': 'read-only',
    'rg': 'read-only',
    'cat': 'read-only',
    'head': 'read-only',
    'tail': 'read-only',
    'wc': 'read-only',
    'sort': 'read-only',
    'uniq': 'read-only',
    'diff': 'read-only',
    'find': 'read-only',
    'fd': 'read-only',
    'tree': 'read-only',
    'file': 'read-only',
    'du': 'read-only',
    'ls': 'read-only',
    'dir': 'read-only',
    'vdir': 'read-only',
    'strings': 'read-only',
    'stat': 'read-only',
    'rev': 'read-only',
    'column': 'read-only',
    'cut': 'read-only',
    'tr': 'read-only',
    'paste': 'read-only',
    'join': 'read-only',
    'fold': 'read-only',
    'expand': 'read-only',
    'nl': 'read-only',
    'od': 'read-only',
    'comm': 'read-only',
    'basename': 'read-only',
    'dirname': 'read-only',
    'realpath': 'read-only',
    'readlink': 'read-only',
    'pwd': 'read-only',
    'echo': 'read-only',
    'envsubst': 'read-only',
    'printf': 'read-only',
    'true': 'read-only',
    'false': 'read-only',
    'yes': 'read-only',
    'seq': 'read-only',
    'test': 'read-only',
    '[': 'read-only',
    'expr': 'read-only',
    'factor': 'read-only',
    'date': 'read-only',
    'uname': 'read-only',
    'nproc': 'read-only',
    'whoami': 'read-only',
    'id': 'read-only',
    'groups': 'read-only',
    'base64': 'read-only',
    'md5sum': 'read-only',
    'sha256sum': 'read-only',
    'tac': 'read-only',
    'tsort': 'read-only',
    // Network — needs socket access for HTTP, can write with -o/-O
    'curl': 'full',
    'wget': 'full',
    // Data processing — need write for file-based databases
    'sqlite3': 'read-write',
};
/**
 * Create a WasmVM RuntimeDriver that can be mounted into the kernel.
 */
export function createWasmVmRuntime(options) {
    return new WasmVmRuntimeDriver(options);
}
class WasmVmRuntimeDriver {
    name = 'wasmvm';
    // Dynamic commands list — populated from filesystem scan or legacy WASMVM_COMMANDS
    _commands = [];
    // Command name → binary path map (commandDirs mode only)
    _commandPaths = new Map();
    _commandDirs;
    // Legacy mode: single binary path
    _wasmBinaryPath;
    _legacyMode;
    // Per-command permission tiers
    _permissions;
    _kernel = null;
    _activeWorkers = new Map();
    _workerAdapter = new WorkerAdapter();
    _moduleCache = new ModuleCache();
    // TLS-upgraded sockets bypass kernel recv — direct host TLS I/O
    _tlsSockets = new Map();
    // Per-PID queue of signals pending cooperative delivery to WASM trampoline
    _wasmPendingSignals = new Map();
    get commands() { return this._commands; }
    constructor(options) {
        this._commandDirs = options?.commandDirs ?? [];
        this._wasmBinaryPath = options?.wasmBinaryPath ?? '';
        this._permissions = options?.permissions ?? {};
        // Legacy mode when wasmBinaryPath is set and commandDirs is not
        this._legacyMode = !options?.commandDirs && !!options?.wasmBinaryPath;
        if (this._legacyMode) {
            // Deprecated path — use static command list
            this._commands = [...WASMVM_COMMANDS];
        }
        // Emit deprecation warning for wasmBinaryPath
        if (options?.wasmBinaryPath && options?.commandDirs) {
            console.warn('WasmVmRuntime: wasmBinaryPath is deprecated and ignored when commandDirs is set. ' +
                'Use commandDirs only.');
        }
        else if (options?.wasmBinaryPath) {
            console.warn('WasmVmRuntime: wasmBinaryPath is deprecated. Use commandDirs instead.');
        }
    }
    async init(kernel) {
        this._kernel = kernel;
        // Scan commandDirs for WASM binaries (skip in legacy mode)
        if (!this._legacyMode && this._commandDirs.length > 0) {
            await this._scanCommandDirs();
        }
    }
    /**
     * On-demand discovery: synchronously check commandDirs for a binary.
     * Called by the kernel when CommandRegistry.resolve() returns null.
     */
    tryResolve(command) {
        // Not applicable in legacy mode
        if (this._legacyMode)
            return false;
        // Normalize path-based commands (/bin/ls → ls) so lookup matches basename keys
        const commandName = command.includes('/') ? basename(command) : command;
        // Already known
        if (this._commandPaths.has(commandName))
            return true;
        for (const dir of this._commandDirs) {
            const fullPath = join(dir, commandName);
            try {
                if (!existsSync(fullPath))
                    continue;
                // Skip directories
                const st = statSync(fullPath);
                if (st.isDirectory())
                    continue;
            }
            catch {
                continue;
            }
            // Sync 4-byte WASM magic check
            if (!isWasmBinarySync(fullPath))
                continue;
            this._commandPaths.set(commandName, fullPath);
            if (!this._commands.includes(commandName))
                this._commands.push(commandName);
            return true;
        }
        return false;
    }
    spawn(command, args, ctx) {
        const kernel = this._kernel;
        if (!kernel)
            throw new Error('WasmVM driver not initialized');
        // Resolve binary path for this command
        const binaryPath = this._resolveBinaryPath(command);
        // Exit plumbing — resolved once, either on success or error
        let resolveExit;
        let exitResolved = false;
        const exitPromise = new Promise((resolve) => {
            resolveExit = (code) => {
                if (exitResolved)
                    return;
                exitResolved = true;
                resolve(code);
            };
        });
        // Set up stdin pipe for writeStdin/closeStdin — skip if FD 0 is already
        // a PTY slave, pipe, or file (shell redirect/pipe wiring must be preserved)
        const stdinIsPty = kernel.isatty(ctx.pid, 0);
        const stdinAlreadyRouted = stdinIsPty || this._isFdKernelRouted(ctx.pid, 0) || this._isFdRegularFile(ctx.pid, 0);
        let stdinWriteFd;
        if (!stdinAlreadyRouted) {
            const stdinPipe = kernel.pipe(ctx.pid);
            kernel.fdDup2(ctx.pid, stdinPipe.readFd, 0);
            kernel.fdClose(ctx.pid, stdinPipe.readFd);
            stdinWriteFd = stdinPipe.writeFd;
        }
        const proc = {
            onStdout: null,
            onStderr: null,
            onExit: null,
            writeStdin: (data) => {
                if (stdinWriteFd !== undefined)
                    kernel.fdWrite(ctx.pid, stdinWriteFd, data);
            },
            closeStdin: () => {
                if (stdinWriteFd !== undefined) {
                    try {
                        kernel.fdClose(ctx.pid, stdinWriteFd);
                    }
                    catch { /* already closed */ }
                }
            },
            kill: (signal) => {
                const worker = this._activeWorkers.get(ctx.pid);
                if (worker) {
                    worker.terminate();
                    this._activeWorkers.delete(ctx.pid);
                }
                // Encode signal-killed exit status (POSIX: low 7 bits = signal number)
                const signalStatus = signal & 0x7f;
                resolveExit(signalStatus);
                proc.onExit?.(signalStatus);
            },
            wait: () => exitPromise,
        };
        // Launch worker asynchronously — spawn() returns synchronously per contract
        this._launchWorker(command, args, ctx, proc, resolveExit, binaryPath).catch((err) => {
            const errBytes = new TextEncoder().encode(`${err instanceof Error ? err.message : String(err)}\n`);
            ctx.onStderr?.(errBytes);
            proc.onStderr?.(errBytes);
            resolveExit(1);
            proc.onExit?.(1);
        });
        return proc;
    }
    async dispose() {
        for (const worker of this._activeWorkers.values()) {
            try {
                await worker.terminate();
            }
            catch { /* best effort */ }
        }
        this._activeWorkers.clear();
        // Clean up TLS-upgraded sockets (kernel sockets cleaned up by kernel.dispose)
        for (const sock of this._tlsSockets.values()) {
            try {
                sock.destroy();
            }
            catch { /* best effort */ }
        }
        this._tlsSockets.clear();
        this._moduleCache.clear();
        this._kernel = null;
    }
    // -------------------------------------------------------------------------
    // Command discovery
    // -------------------------------------------------------------------------
    /** Scan all command directories, validating WASM magic bytes. */
    async _scanCommandDirs() {
        this._commandPaths.clear();
        this._commands = [];
        for (const dir of this._commandDirs) {
            let entries;
            try {
                entries = await readdir(dir);
            }
            catch {
                // Directory doesn't exist or isn't readable — skip
                continue;
            }
            for (const entry of entries) {
                // Skip dotfiles
                if (entry.startsWith('.'))
                    continue;
                const fullPath = join(dir, entry);
                // Skip directories
                try {
                    const st = await stat(fullPath);
                    if (st.isDirectory())
                        continue;
                }
                catch {
                    continue;
                }
                // Validate WASM magic bytes
                if (!(await isWasmBinary(fullPath)))
                    continue;
                // First directory containing the command wins (PATH semantics)
                if (!this._commandPaths.has(entry)) {
                    this._commandPaths.set(entry, fullPath);
                    this._commands.push(entry);
                }
            }
        }
    }
    /** Resolve permission tier for a command with wildcard and default tier support. */
    _resolvePermissionTier(command) {
        // No permissions config → fully unrestricted (backward compatible)
        if (Object.keys(this._permissions).length === 0)
            return 'full';
        // Normalize path-based commands (/bin/ls → ls) so tier lookup matches basename keys
        const commandName = command.includes('/') ? basename(command) : command;
        // User config checked first (exact, glob, *), defaults as fallback layer
        return resolvePermissionTier(commandName, this._permissions, DEFAULT_FIRST_PARTY_TIERS);
    }
    /** Resolve binary path for a command. */
    _resolveBinaryPath(command) {
        const commandName = command.includes('/') ? basename(command) : command;
        // commandDirs mode: look up per-command binary path
        const perCommand = this._commandPaths.get(commandName);
        if (perCommand)
            return perCommand;
        // Legacy mode: all commands use a single binary
        if (this._legacyMode)
            return this._wasmBinaryPath;
        // Fallback to wasmBinaryPath if set (shouldn't reach here normally)
        return this._wasmBinaryPath;
    }
    // -------------------------------------------------------------------------
    // FD helpers
    // -------------------------------------------------------------------------
    /** Check if a process's FD is routed through kernel (pipe or PTY). */
    _isFdKernelRouted(pid, fd) {
        if (!this._kernel)
            return false;
        try {
            const stat = this._kernel.fdStat(pid, fd);
            if (stat.filetype === 6)
                return true; // FILETYPE_PIPE
            return this._kernel.isatty(pid, fd); // PTY slave
        }
        catch {
            return false;
        }
    }
    /** Check if a process's FD points to a regular file (e.g. shell < redirect). */
    _isFdRegularFile(pid, fd) {
        if (!this._kernel)
            return false;
        try {
            const stat = this._kernel.fdStat(pid, fd);
            return stat.filetype === 4; // FILETYPE_REGULAR_FILE
        }
        catch {
            return false;
        }
    }
    // -------------------------------------------------------------------------
    // Worker lifecycle
    // -------------------------------------------------------------------------
    async _launchWorker(command, args, ctx, proc, resolveExit, binaryPath) {
        const kernel = this._kernel;
        // Pre-compile module via cache for fast re-instantiation on subsequent spawns
        let wasmModule;
        try {
            wasmModule = await this._moduleCache.resolve(binaryPath);
        }
        catch (err) {
            // Fail fast with a clear error — don't launch a worker with an undefined module
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(`wasmvm: failed to compile module for '${command}' at ${binaryPath}: ${msg}`);
        }
        // Create shared buffers for RPC
        const signalBuf = new SharedArrayBuffer(SIGNAL_BUFFER_BYTES);
        const dataBuf = new SharedArrayBuffer(DATA_BUFFER_BYTES);
        // Check if stdio FDs are kernel-routed (pipe, PTY, or regular file redirect)
        const stdinPiped = this._isFdKernelRouted(ctx.pid, 0);
        const stdinIsFile = this._isFdRegularFile(ctx.pid, 0);
        const stdoutPiped = this._isFdKernelRouted(ctx.pid, 1);
        const stdoutIsFile = this._isFdRegularFile(ctx.pid, 1);
        const stderrPiped = this._isFdKernelRouted(ctx.pid, 2);
        const stderrIsFile = this._isFdRegularFile(ctx.pid, 2);
        // Detect which FDs are TTYs (PTY slaves) for brush-shell interactive mode
        const ttyFds = [];
        for (const fd of [0, 1, 2]) {
            if (kernel.isatty(ctx.pid, fd))
                ttyFds.push(fd);
        }
        const permissionTier = this._resolvePermissionTier(command);
        const workerData = {
            wasmBinaryPath: binaryPath,
            command,
            args,
            pid: ctx.pid,
            ppid: ctx.ppid,
            env: ctx.env,
            cwd: ctx.cwd,
            signalBuf,
            dataBuf,
            // Tell worker which stdio channels are kernel-routed (pipe, PTY, or file redirect)
            stdinFd: (stdinPiped || stdinIsFile) ? 99 : undefined,
            stdoutFd: (stdoutPiped || stdoutIsFile) ? 99 : undefined,
            stderrFd: (stderrPiped || stderrIsFile) ? 99 : undefined,
            ttyFds: ttyFds.length > 0 ? ttyFds : undefined,
            wasmModule,
            permissionTier,
        };
        const workerUrl = getKernelWorkerUrl();
        this._workerAdapter.spawn(workerUrl, { workerData }).then((worker) => {
            this._activeWorkers.set(ctx.pid, worker);
            worker.onMessage((raw) => {
                const msg = raw;
                this._handleWorkerMessage(msg, ctx, kernel, signalBuf, dataBuf, proc, resolveExit);
            });
            worker.onError((err) => {
                const errBytes = new TextEncoder().encode(`wasmvm: ${err.message}\n`);
                ctx.onStderr?.(errBytes);
                proc.onStderr?.(errBytes);
                this._activeWorkers.delete(ctx.pid);
                resolveExit(1);
                proc.onExit?.(1);
            });
            worker.onExit((_code) => {
                this._activeWorkers.delete(ctx.pid);
            });
        }, (err) => {
            // Worker creation failed (binary not found, etc.)
            const errMsg = err instanceof Error ? err.message : String(err);
            const errBytes = new TextEncoder().encode(`wasmvm: ${errMsg}\n`);
            ctx.onStderr?.(errBytes);
            proc.onStderr?.(errBytes);
            resolveExit(127);
            proc.onExit?.(127);
        });
    }
    // -------------------------------------------------------------------------
    // Worker message handling
    // -------------------------------------------------------------------------
    _handleWorkerMessage(msg, ctx, kernel, signalBuf, dataBuf, proc, resolveExit) {
        switch (msg.type) {
            case 'stdout':
                ctx.onStdout?.(msg.data);
                proc.onStdout?.(msg.data);
                break;
            case 'stderr':
                ctx.onStderr?.(msg.data);
                proc.onStderr?.(msg.data);
                break;
            case 'exit':
                this._activeWorkers.delete(ctx.pid);
                this._wasmPendingSignals.delete(ctx.pid);
                resolveExit(msg.code);
                proc.onExit?.(msg.code);
                break;
            case 'syscall':
                this._handleSyscall(msg, ctx.pid, kernel, signalBuf, dataBuf);
                break;
            case 'ready':
                // Worker is ready — could be used for stdin/lifecycle signaling
                break;
        }
    }
    // -------------------------------------------------------------------------
    // Syscall RPC handler — dispatches worker requests to KernelInterface
    // -------------------------------------------------------------------------
    async _handleSyscall(msg, pid, kernel, signalBuf, dataBuf) {
        const signal = new Int32Array(signalBuf);
        const data = new Uint8Array(dataBuf);
        let errno = 0;
        let intResult = 0;
        let responseData = null;
        try {
            switch (msg.call) {
                case 'fdRead': {
                    const result = await kernel.fdRead(pid, msg.args.fd, msg.args.length);
                    if (result.length > DATA_BUFFER_BYTES) {
                        errno = 76; // EIO — response exceeds SAB capacity
                        break;
                    }
                    data.set(result, 0);
                    responseData = result;
                    break;
                }
                case 'fdWrite': {
                    intResult = await kernel.fdWrite(pid, msg.args.fd, new Uint8Array(msg.args.data));
                    break;
                }
                case 'fdPread': {
                    const result = await kernel.fdPread(pid, msg.args.fd, msg.args.length, BigInt(msg.args.offset));
                    if (result.length > DATA_BUFFER_BYTES) {
                        errno = 76; // EIO — response exceeds SAB capacity
                        break;
                    }
                    data.set(result, 0);
                    responseData = result;
                    break;
                }
                case 'fdPwrite': {
                    intResult = await kernel.fdPwrite(pid, msg.args.fd, new Uint8Array(msg.args.data), BigInt(msg.args.offset));
                    break;
                }
                case 'fdOpen': {
                    intResult = kernel.fdOpen(pid, msg.args.path, msg.args.flags, msg.args.mode);
                    break;
                }
                case 'fdSeek': {
                    const offset = await kernel.fdSeek(pid, msg.args.fd, BigInt(msg.args.offset), msg.args.whence);
                    intResult = Number(offset);
                    break;
                }
                case 'fdClose': {
                    kernel.fdClose(pid, msg.args.fd);
                    break;
                }
                case 'fdStat': {
                    const stat = kernel.fdStat(pid, msg.args.fd);
                    // Pack stat into data buffer: filetype(i32) + flags(i32) + rights(f64 for bigint)
                    const view = new DataView(dataBuf);
                    view.setInt32(0, stat.filetype, true);
                    view.setInt32(4, stat.flags, true);
                    view.setFloat64(8, Number(stat.rights), true);
                    responseData = new Uint8Array(0); // signal data-in-buffer
                    Atomics.store(signal, SIG_IDX_DATA_LEN, 16);
                    break;
                }
                case 'spawn': {
                    // proc_spawn → kernel.spawn() — the critical cross-runtime routing
                    // Includes FD overrides for pipe wiring (brush-shell pipeline stages)
                    const spawnCtx = {
                        env: msg.args.env,
                        cwd: msg.args.cwd,
                        ppid: pid,
                    };
                    // Forward FD overrides — only pass non-default values
                    const stdinFd = msg.args.stdinFd;
                    const stdoutFd = msg.args.stdoutFd;
                    const stderrFd = msg.args.stderrFd;
                    if (stdinFd !== undefined && stdinFd !== 0)
                        spawnCtx.stdinFd = stdinFd;
                    if (stdoutFd !== undefined && stdoutFd !== 1)
                        spawnCtx.stdoutFd = stdoutFd;
                    if (stderrFd !== undefined && stderrFd !== 2)
                        spawnCtx.stderrFd = stderrFd;
                    const managed = kernel.spawn(msg.args.command, msg.args.spawnArgs, spawnCtx);
                    intResult = managed.pid;
                    // Exit code is delivered via the waitpid RPC — no async write needed
                    break;
                }
                case 'waitpid': {
                    const result = await kernel.waitpid(msg.args.pid, msg.args.options);
                    // WNOHANG returns null if process is still running (encode as -1 for WASM side)
                    intResult = result ? result.status : -1;
                    break;
                }
                case 'kill': {
                    kernel.kill(msg.args.pid, msg.args.signal);
                    break;
                }
                case 'getcwd': {
                    // Return the calling process's current working directory from the kernel process table
                    const entry = kernel.processTable.get(pid);
                    const cwdStr = entry?.cwd ?? '/';
                    const cwdBytes = new TextEncoder().encode(cwdStr);
                    data.set(cwdBytes, 0);
                    responseData = cwdBytes;
                    break;
                }
                case 'sigaction': {
                    // proc_sigaction → register signal disposition in kernel process table
                    const sigNum = msg.args.signal;
                    const action = msg.args.action;
                    const maskLow = msg.args.maskLow ?? 0;
                    const maskHigh = msg.args.maskHigh ?? 0;
                    const flags = (msg.args.flags ?? 0) >>> 0;
                    let handler;
                    if (action === 0) {
                        handler = 'default';
                    }
                    else if (action === 1) {
                        handler = 'ignore';
                    }
                    else {
                        // action=2: user handler — queue signal for cooperative delivery
                        handler = (sig) => {
                            let queue = this._wasmPendingSignals.get(pid);
                            if (!queue) {
                                queue = [];
                                this._wasmPendingSignals.set(pid, queue);
                            }
                            queue.push(sig);
                        };
                    }
                    kernel.processTable.sigaction(pid, sigNum, {
                        handler,
                        mask: decodeSignalMask(maskLow >>> 0, maskHigh >>> 0),
                        flags,
                    });
                    break;
                }
                case 'pipe': {
                    // fd_pipe → create kernel pipe in this process's FD table
                    const pipeFds = kernel.pipe(pid);
                    // Pack read + write FDs: low 16 bits = readFd, high 16 bits = writeFd
                    intResult = (pipeFds.readFd & 0xFFFF) | ((pipeFds.writeFd & 0xFFFF) << 16);
                    break;
                }
                case 'openpty': {
                    // pty_open → allocate PTY master/slave pair in this process's FD table
                    const ptyFds = kernel.openpty(pid);
                    // Pack master + slave FDs: low 16 bits = masterFd, high 16 bits = slaveFd
                    intResult = (ptyFds.masterFd & 0xFFFF) | ((ptyFds.slaveFd & 0xFFFF) << 16);
                    break;
                }
                case 'fdDup': {
                    intResult = kernel.fdDup(pid, msg.args.fd);
                    break;
                }
                case 'fdDup2': {
                    kernel.fdDup2(pid, msg.args.oldFd, msg.args.newFd);
                    break;
                }
                case 'fdDupMin': {
                    intResult = kernel.fdDupMin(pid, msg.args.fd, msg.args.minFd);
                    break;
                }
                case 'vfsStat':
                case 'vfsLstat': {
                    const path = scopedProcPath(pid, msg.args.path);
                    const stat = msg.call === 'vfsLstat'
                        ? await kernel.vfs.lstat(path)
                        : await kernel.vfs.stat(path);
                    const enc = new TextEncoder();
                    const json = JSON.stringify({
                        ino: stat.ino,
                        type: stat.isDirectory ? 'dir' : stat.isSymbolicLink ? 'symlink' : 'file',
                        mode: stat.mode,
                        uid: stat.uid,
                        gid: stat.gid,
                        nlink: stat.nlink,
                        size: stat.size,
                        atime: stat.atimeMs,
                        mtime: stat.mtimeMs,
                        ctime: stat.ctimeMs,
                    });
                    const bytes = enc.encode(json);
                    if (bytes.length > DATA_BUFFER_BYTES) {
                        errno = 76; // EIO — response exceeds SAB capacity
                        break;
                    }
                    data.set(bytes, 0);
                    responseData = bytes;
                    break;
                }
                case 'vfsReaddir': {
                    const entries = await kernel.vfs.readDir(scopedProcPath(pid, msg.args.path));
                    const bytes = new TextEncoder().encode(JSON.stringify(entries));
                    if (bytes.length > DATA_BUFFER_BYTES) {
                        errno = 76; // EIO — response exceeds SAB capacity
                        break;
                    }
                    data.set(bytes, 0);
                    responseData = bytes;
                    break;
                }
                case 'vfsMkdir': {
                    await kernel.vfs.mkdir(scopedProcPath(pid, msg.args.path));
                    break;
                }
                case 'vfsUnlink': {
                    await kernel.vfs.removeFile(scopedProcPath(pid, msg.args.path));
                    break;
                }
                case 'vfsRmdir': {
                    await kernel.vfs.removeDir(scopedProcPath(pid, msg.args.path));
                    break;
                }
                case 'vfsRename': {
                    await kernel.vfs.rename(scopedProcPath(pid, msg.args.oldPath), scopedProcPath(pid, msg.args.newPath));
                    break;
                }
                case 'vfsSymlink': {
                    await kernel.vfs.symlink(msg.args.target, scopedProcPath(pid, msg.args.linkPath));
                    break;
                }
                case 'vfsReadlink': {
                    const normalizedPath = msg.args.path;
                    const target = normalizedPath === '/proc/self'
                        ? '/proc/' + pid
                        : await kernel.vfs.readlink(scopedProcPath(pid, normalizedPath));
                    const bytes = new TextEncoder().encode(target);
                    if (bytes.length > DATA_BUFFER_BYTES) {
                        errno = 76; // EIO — response exceeds SAB capacity
                        break;
                    }
                    data.set(bytes, 0);
                    responseData = bytes;
                    break;
                }
                case 'vfsReadFile': {
                    const content = await kernel.vfs.readFile(scopedProcPath(pid, msg.args.path));
                    if (content.length > DATA_BUFFER_BYTES) {
                        errno = 76; // EIO — response exceeds SAB capacity
                        break;
                    }
                    data.set(content, 0);
                    responseData = content;
                    break;
                }
                case 'vfsWriteFile': {
                    await kernel.vfs.writeFile(scopedProcPath(pid, msg.args.path), new Uint8Array(msg.args.data));
                    break;
                }
                case 'vfsExists': {
                    const exists = await kernel.vfs.exists(scopedProcPath(pid, msg.args.path));
                    intResult = exists ? 1 : 0;
                    break;
                }
                case 'vfsRealpath': {
                    const normalizedPath = msg.args.path;
                    const resolved = normalizedPath === '/proc/self'
                        ? '/proc/' + pid
                        : await kernel.vfs.realpath(scopedProcPath(pid, normalizedPath));
                    const bytes = new TextEncoder().encode(resolved);
                    if (bytes.length > DATA_BUFFER_BYTES) {
                        errno = 76; // EIO — response exceeds SAB capacity
                        break;
                    }
                    data.set(bytes, 0);
                    responseData = bytes;
                    break;
                }
                case 'vfsChmod': {
                    await kernel.vfs.chmod(scopedProcPath(pid, msg.args.path), msg.args.mode);
                    break;
                }
                // ----- Networking (TCP sockets via kernel socket table) -----
                case 'netSocket': {
                    intResult = kernel.socketTable.create(normalizeSocketDomain(msg.args.domain), normalizeSocketType(msg.args.type), msg.args.protocol, pid);
                    break;
                }
                case 'netConnect': {
                    const socketId = msg.args.fd;
                    const socket = kernel.socketTable.get(socketId);
                    const addr = msg.args.addr;
                    // Parse "host:port" or unix path
                    const lastColon = addr.lastIndexOf(':');
                    if (lastColon === -1) {
                        if (socket && socket.domain !== AF_UNIX) {
                            errno = ERRNO_MAP.EINVAL;
                            break;
                        }
                        // Unix domain socket path
                        await kernel.socketTable.connect(socketId, { path: addr });
                    }
                    else {
                        const host = addr.slice(0, lastColon);
                        const port = parseInt(addr.slice(lastColon + 1), 10);
                        if (isNaN(port)) {
                            errno = ERRNO_MAP.EINVAL;
                            break;
                        }
                        // Route through kernel socket table (host adapter handles real TCP)
                        await kernel.socketTable.connect(socketId, { host, port });
                    }
                    break;
                }
                case 'netSend': {
                    const socketId = msg.args.fd;
                    // TLS-upgraded sockets write directly to host TLS socket
                    const tlsSock = this._tlsSockets.get(socketId);
                    if (tlsSock) {
                        const tlsData = Buffer.from(msg.args.data);
                        await new Promise((resolve, reject) => {
                            tlsSock.write(tlsData, (err) => err ? reject(err) : resolve());
                        });
                        intResult = tlsData.length;
                        break;
                    }
                    const sendData = new Uint8Array(msg.args.data);
                    intResult = kernel.socketTable.send(socketId, sendData, msg.args.flags ?? 0);
                    break;
                }
                case 'netRecv': {
                    const socketId = msg.args.fd;
                    const maxLen = msg.args.length;
                    const flags = msg.args.flags ?? 0;
                    // TLS-upgraded sockets read directly from host TLS socket
                    const tlsRecvSock = this._tlsSockets.get(socketId);
                    if (tlsRecvSock) {
                        const tlsRecvData = await new Promise((resolve) => {
                            const onData = (chunk) => {
                                cleanupTls();
                                if (chunk.length > maxLen) {
                                    tlsRecvSock.unshift(chunk.subarray(maxLen));
                                    resolve(new Uint8Array(chunk.subarray(0, maxLen)));
                                }
                                else {
                                    resolve(new Uint8Array(chunk));
                                }
                            };
                            const onEnd = () => { cleanupTls(); resolve(new Uint8Array(0)); };
                            const onError = () => { cleanupTls(); resolve(new Uint8Array(0)); };
                            const cleanupTls = () => {
                                tlsRecvSock.removeListener('data', onData);
                                tlsRecvSock.removeListener('end', onEnd);
                                tlsRecvSock.removeListener('error', onError);
                            };
                            tlsRecvSock.once('data', onData);
                            tlsRecvSock.once('end', onEnd);
                            tlsRecvSock.once('error', onError);
                        });
                        if (tlsRecvData.length > DATA_BUFFER_BYTES) {
                            errno = 76;
                            break;
                        }
                        if (tlsRecvData.length > 0)
                            data.set(tlsRecvData, 0);
                        responseData = tlsRecvData;
                        intResult = tlsRecvData.length;
                        break;
                    }
                    // Kernel socket recv — may need to wait for data from read pump
                    let recvResult = kernel.socketTable.recv(socketId, maxLen, flags);
                    if (recvResult === null) {
                        // Check if more data might arrive (socket still connected, EOF not received)
                        const ksock = kernel.socketTable.get(socketId);
                        if (ksock && (ksock.state === 'connected' || ksock.state === 'write-closed')) {
                            const mightHaveMore = ksock.external
                                ? !ksock.peerWriteClosed
                                : (ksock.peerId !== undefined && !ksock.peerWriteClosed);
                            if (mightHaveMore) {
                                await ksock.readWaiters.enqueue(30000).wait();
                                recvResult = kernel.socketTable.recv(socketId, maxLen, flags);
                            }
                        }
                    }
                    const recvData = recvResult ?? new Uint8Array(0);
                    if (recvData.length > DATA_BUFFER_BYTES) {
                        errno = 76;
                        break;
                    }
                    if (recvData.length > 0)
                        data.set(recvData, 0);
                    responseData = recvData;
                    intResult = recvData.length;
                    break;
                }
                case 'netTlsConnect': {
                    const socketId = msg.args.fd;
                    // Access the kernel socket's host socket for TLS upgrade
                    const ksockTls = kernel.socketTable.get(socketId);
                    if (!ksockTls) {
                        errno = ERRNO_MAP.EBADF;
                        break;
                    }
                    if (!ksockTls.external || !ksockTls.hostSocket) {
                        errno = ERRNO_MAP.EINVAL; // Can't TLS-upgrade loopback sockets
                        break;
                    }
                    // Extract underlying net.Socket from host adapter
                    const realSock = ksockTls.hostSocket.socket;
                    if (!realSock) {
                        errno = ERRNO_MAP.EINVAL;
                        break;
                    }
                    // Detach kernel read pump by clearing hostSocket
                    ksockTls.hostSocket = undefined;
                    const hostname = msg.args.hostname;
                    const tlsOpts = {
                        socket: realSock,
                        servername: hostname, // SNI
                    };
                    if (msg.args.verifyPeer === false) {
                        tlsOpts.rejectUnauthorized = false;
                    }
                    try {
                        const tlsSock = await new Promise((resolve, reject) => {
                            const s = tlsConnect(tlsOpts, () => resolve(s));
                            s.on('error', reject);
                        });
                        // TLS socket bypasses kernel — send/recv go directly through _tlsSockets
                        this._tlsSockets.set(socketId, tlsSock);
                    }
                    catch {
                        errno = ERRNO_MAP.ECONNREFUSED;
                    }
                    break;
                }
                case 'netGetaddrinfo': {
                    const host = msg.args.host;
                    const port = msg.args.port;
                    try {
                        // Resolve all addresses (IPv4 + IPv6)
                        const result = await lookup(host, { all: true });
                        const addresses = result.map((r) => ({
                            addr: r.address,
                            family: r.family,
                        }));
                        const json = JSON.stringify(addresses);
                        const bytes = new TextEncoder().encode(json);
                        if (bytes.length > DATA_BUFFER_BYTES) {
                            errno = 76; // EIO — response exceeds SAB capacity
                            break;
                        }
                        data.set(bytes, 0);
                        responseData = bytes;
                        intResult = bytes.length;
                    }
                    catch (err) {
                        // dns.lookup returns ENOTFOUND for unknown hosts
                        const code = err.code;
                        if (code === 'ENOTFOUND' || code === 'EAI_NONAME' || code === 'ENODATA') {
                            errno = ERRNO_MAP.ENOENT;
                        }
                        else {
                            errno = ERRNO_MAP.EINVAL;
                        }
                    }
                    break;
                }
                case 'netSetsockopt': {
                    const socketId = msg.args.fd;
                    const optvalBytes = new Uint8Array(msg.args.optval);
                    const optval = decodeSocketOptionValue(optvalBytes);
                    kernel.socketTable.setsockopt(socketId, msg.args.level, msg.args.optname, optval);
                    break;
                }
                case 'netGetsockopt': {
                    const socketId = msg.args.fd;
                    const optlen = msg.args.optvalLen;
                    const optval = kernel.socketTable.getsockopt(socketId, msg.args.level, msg.args.optname);
                    if (optval === undefined) {
                        errno = ERRNO_MAP.EINVAL;
                        break;
                    }
                    const encoded = encodeSocketOptionValue(optval, optlen);
                    if (encoded.length > DATA_BUFFER_BYTES) {
                        errno = ERRNO_EIO;
                        break;
                    }
                    data.set(encoded, 0);
                    responseData = encoded;
                    intResult = encoded.length;
                    break;
                }
                case 'kernelSocketGetLocalAddr': {
                    const socketId = msg.args.fd;
                    const addrBytes = new TextEncoder().encode(serializeSockAddr(kernel.socketTable.getLocalAddr(socketId)));
                    if (addrBytes.length > DATA_BUFFER_BYTES) {
                        errno = ERRNO_EIO;
                        break;
                    }
                    data.set(addrBytes, 0);
                    responseData = addrBytes;
                    intResult = addrBytes.length;
                    break;
                }
                case 'kernelSocketGetRemoteAddr': {
                    const socketId = msg.args.fd;
                    const addrBytes = new TextEncoder().encode(serializeSockAddr(kernel.socketTable.getRemoteAddr(socketId)));
                    if (addrBytes.length > DATA_BUFFER_BYTES) {
                        errno = ERRNO_EIO;
                        break;
                    }
                    data.set(addrBytes, 0);
                    responseData = addrBytes;
                    intResult = addrBytes.length;
                    break;
                }
                case 'netPoll': {
                    const fds = msg.args.fds;
                    const timeout = msg.args.timeout;
                    const pollKernel = kernel;
                    const revents = [];
                    let ready = 0;
                    // WASI poll constants
                    const POLLIN = 0x1;
                    const POLLOUT = 0x2;
                    const POLLHUP = 0x2000;
                    const POLLNVAL = 0x4000;
                    // Check readiness helper: kernel socket table first, then kernel FD table
                    const checkFd = (fd, events) => {
                        // TLS-upgraded sockets — use host socket readability
                        const tlsSockPoll = this._tlsSockets.get(fd);
                        if (tlsSockPoll) {
                            let rev = 0;
                            if ((events & POLLIN) && tlsSockPoll.readableLength > 0)
                                rev |= POLLIN;
                            if ((events & POLLOUT) && tlsSockPoll.writable)
                                rev |= POLLOUT;
                            if (tlsSockPoll.destroyed)
                                rev |= POLLHUP;
                            return rev;
                        }
                        // Kernel socket table
                        const ksock = kernel.socketTable.get(fd);
                        if (ksock) {
                            const ps = kernel.socketTable.poll(fd);
                            let rev = 0;
                            if ((events & POLLIN) && ps.readable)
                                rev |= POLLIN;
                            if ((events & POLLOUT) && ps.writable)
                                rev |= POLLOUT;
                            if (ps.hangup)
                                rev |= POLLHUP;
                            return rev;
                        }
                        // Kernel FD table (pipes, files)
                        try {
                            const ps = kernel.fdPoll(pid, fd);
                            if (ps.invalid)
                                return POLLNVAL;
                            let rev = 0;
                            if ((events & POLLIN) && ps.readable)
                                rev |= POLLIN;
                            if ((events & POLLOUT) && ps.writable)
                                rev |= POLLOUT;
                            if (ps.hangup)
                                rev |= POLLHUP;
                            return rev;
                        }
                        catch {
                            return POLLNVAL;
                        }
                    };
                    // Recompute readiness after each wait cycle.
                    const refreshReadiness = () => {
                        ready = 0;
                        revents.length = 0;
                        for (const entry of fds) {
                            const rev = checkFd(entry.fd, entry.events);
                            revents.push(rev);
                            if (rev !== 0)
                                ready++;
                        }
                    };
                    // Wait for any polled FD to change state, then re-check them all.
                    const waitForFdActivity = async (waitMs) => {
                        await new Promise((resolve) => {
                            let settled = false;
                            const cleanups = [];
                            const finish = () => {
                                if (settled)
                                    return;
                                settled = true;
                                for (const cleanup of cleanups)
                                    cleanup();
                                resolve();
                            };
                            const timer = setTimeout(finish, waitMs);
                            cleanups.push(() => clearTimeout(timer));
                            for (const entry of fds) {
                                const tlsSockWait = this._tlsSockets.get(entry.fd);
                                if (tlsSockWait) {
                                    if (entry.events & POLLIN) {
                                        const onReadable = () => finish();
                                        const onEnd = () => finish();
                                        tlsSockWait.once('readable', onReadable);
                                        tlsSockWait.once('end', onEnd);
                                        cleanups.push(() => {
                                            tlsSockWait.removeListener('readable', onReadable);
                                            tlsSockWait.removeListener('end', onEnd);
                                        });
                                    }
                                    continue;
                                }
                                const ksock = kernel.socketTable.get(entry.fd);
                                if (ksock) {
                                    if (entry.events & POLLIN) {
                                        const waitQueue = ksock.state === 'listening'
                                            ? ksock.acceptWaiters
                                            : ksock.readWaiters;
                                        const handle = waitQueue.enqueue();
                                        void handle.wait().then(finish);
                                        cleanups.push(() => waitQueue.remove(handle));
                                    }
                                    continue;
                                }
                                if (!pollKernel.fdPollWait) {
                                    continue;
                                }
                                if ((entry.events & (POLLIN | POLLOUT)) === 0) {
                                    continue;
                                }
                                void pollKernel.fdPollWait(pid, entry.fd, waitMs).then(finish).catch(() => { });
                            }
                        });
                    };
                    refreshReadiness();
                    if (ready === 0 && timeout !== 0) {
                        const deadline = timeout > 0 ? Date.now() + timeout : null;
                        while (ready === 0) {
                            const waitMs = timeout < 0
                                ? RPC_WAIT_TIMEOUT_MS
                                : Math.max(0, deadline - Date.now());
                            if (waitMs === 0) {
                                break;
                            }
                            await waitForFdActivity(waitMs);
                            refreshReadiness();
                            if (timeout > 0 && Date.now() >= deadline) {
                                break;
                            }
                        }
                    }
                    // Encode revents as JSON
                    const pollJson = JSON.stringify(revents);
                    const pollBytes = new TextEncoder().encode(pollJson);
                    if (pollBytes.length > DATA_BUFFER_BYTES) {
                        errno = ERRNO_EIO;
                        break;
                    }
                    data.set(pollBytes, 0);
                    responseData = pollBytes;
                    intResult = ready;
                    break;
                }
                case 'netBind': {
                    const socketId = msg.args.fd;
                    const socket = kernel.socketTable.get(socketId);
                    const addr = msg.args.addr;
                    // Parse "host:port" or unix path
                    const lastColon = addr.lastIndexOf(':');
                    if (lastColon === -1) {
                        if (socket && socket.domain !== AF_UNIX) {
                            errno = ERRNO_MAP.EINVAL;
                            break;
                        }
                        // Unix domain socket path
                        await kernel.socketTable.bind(socketId, { path: addr });
                    }
                    else {
                        const host = addr.slice(0, lastColon);
                        const port = parseInt(addr.slice(lastColon + 1), 10);
                        if (isNaN(port)) {
                            errno = ERRNO_MAP.EINVAL;
                            break;
                        }
                        await kernel.socketTable.bind(socketId, { host, port });
                    }
                    break;
                }
                case 'netListen': {
                    const socketId = msg.args.fd;
                    const backlog = msg.args.backlog;
                    await kernel.socketTable.listen(socketId, backlog);
                    break;
                }
                case 'netAccept': {
                    const socketId = msg.args.fd;
                    // accept() returns null if no pending connection — wait for one
                    let newSockId = kernel.socketTable.accept(socketId);
                    if (newSockId === null) {
                        const listenerSock = kernel.socketTable.get(socketId);
                        if (listenerSock) {
                            await listenerSock.acceptWaiters.enqueue(30000).wait();
                            newSockId = kernel.socketTable.accept(socketId);
                        }
                    }
                    if (newSockId === null) {
                        errno = ERRNO_MAP.EAGAIN;
                        break;
                    }
                    intResult = newSockId;
                    // Return the remote address of the accepted socket
                    const acceptedSock = kernel.socketTable.get(newSockId);
                    let addrStr = '';
                    if (acceptedSock?.remoteAddr) {
                        addrStr = serializeSockAddr(acceptedSock.remoteAddr);
                    }
                    const addrBytes = new TextEncoder().encode(addrStr);
                    if (addrBytes.length <= DATA_BUFFER_BYTES) {
                        data.set(addrBytes, 0);
                        responseData = addrBytes;
                    }
                    break;
                }
                case 'netSendTo': {
                    const socketId = msg.args.fd;
                    const sendData = new Uint8Array(msg.args.data);
                    const flags = msg.args.flags ?? 0;
                    const addr = msg.args.addr;
                    // Parse "host:port" destination address
                    const lastColon = addr.lastIndexOf(':');
                    if (lastColon === -1) {
                        errno = ERRNO_MAP.EINVAL;
                        break;
                    }
                    const host = addr.slice(0, lastColon);
                    const port = parseInt(addr.slice(lastColon + 1), 10);
                    if (isNaN(port)) {
                        errno = ERRNO_MAP.EINVAL;
                        break;
                    }
                    intResult = kernel.socketTable.sendTo(socketId, sendData, flags, { host, port });
                    break;
                }
                case 'netRecvFrom': {
                    const socketId = msg.args.fd;
                    const maxLen = msg.args.length;
                    const flags = msg.args.flags ?? 0;
                    // recvFrom may return null if no datagram queued — wait for one
                    let result = kernel.socketTable.recvFrom(socketId, maxLen, flags);
                    if (result === null) {
                        const sock = kernel.socketTable.get(socketId);
                        if (sock) {
                            await sock.readWaiters.enqueue(30000).wait();
                            result = kernel.socketTable.recvFrom(socketId, maxLen, flags);
                        }
                    }
                    if (result === null) {
                        errno = ERRNO_MAP.EAGAIN;
                        break;
                    }
                    // Pack [data | addr] into combined buffer, intResult = data length
                    const addrStr = serializeSockAddr(result.srcAddr);
                    const addrBytes = new TextEncoder().encode(addrStr);
                    const combined = new Uint8Array(result.data.length + addrBytes.length);
                    combined.set(result.data, 0);
                    combined.set(addrBytes, result.data.length);
                    if (combined.length > DATA_BUFFER_BYTES) {
                        errno = ERRNO_EIO;
                        break;
                    }
                    data.set(combined, 0);
                    responseData = combined;
                    intResult = result.data.length;
                    break;
                }
                case 'netClose': {
                    const socketId = msg.args.fd;
                    // Clean up TLS socket if upgraded
                    const tlsCleanup = this._tlsSockets.get(socketId);
                    if (tlsCleanup) {
                        tlsCleanup.destroy();
                        this._tlsSockets.delete(socketId);
                    }
                    kernel.socketTable.close(socketId, pid);
                    break;
                }
                default:
                    errno = ERRNO_MAP.ENOSYS; // ENOSYS
            }
        }
        catch (err) {
            errno = mapErrorToErrno(err);
        }
        // Guard against SAB data buffer overflow
        if (errno === 0 && responseData && responseData.length > DATA_BUFFER_BYTES) {
            errno = 76; // EIO — response exceeds 1MB SAB capacity
            responseData = null;
        }
        // Piggyback pending signal for cooperative delivery to WASM trampoline
        const pendingQueue = this._wasmPendingSignals.get(pid);
        const pendingSig = pendingQueue?.length ? pendingQueue.shift() : 0;
        // Write response to signal buffer — always set DATA_LEN so workers
        // never read stale lengths from previous calls (e.g. 0-byte EOF reads)
        Atomics.store(signal, SIG_IDX_DATA_LEN, responseData ? responseData.length : 0);
        Atomics.store(signal, SIG_IDX_ERRNO, errno);
        Atomics.store(signal, SIG_IDX_INT_RESULT, intResult);
        Atomics.store(signal, SIG_IDX_PENDING_SIGNAL, pendingSig);
        Atomics.store(signal, SIG_IDX_STATE, SIG_STATE_READY);
        Atomics.notify(signal, SIG_IDX_STATE);
    }
}
/** Map errors to WASI errno codes. Prefers structured .code, falls back to string matching. */
export function mapErrorToErrno(err) {
    if (!(err instanceof Error))
        return ERRNO_EIO;
    // Prefer structured code field (KernelError, VfsError)
    const code = err.code;
    if (code && code in ERRNO_MAP)
        return ERRNO_MAP[code];
    // Fallback: match error code in message string
    const msg = err.message;
    for (const [name, errno] of Object.entries(ERRNO_MAP)) {
        if (msg.includes(name))
            return errno;
    }
    return ERRNO_EIO;
}
//# sourceMappingURL=driver.js.map