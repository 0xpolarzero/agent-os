/**
 * JS host_user syscall implementations.
 *
 * Provides configurable user/group identity and terminal detection
 * for the WASM module via the host_user import functions:
 * getuid, getgid, geteuid, getegid, isatty, getpwuid.
 */
import type { WasiFDTable } from './wasi-types.js';
export interface UserManagerOptions {
    getMemory: () => WebAssembly.Memory | null;
    fdTable?: WasiFDTable;
    uid?: number;
    gid?: number;
    euid?: number;
    egid?: number;
    username?: string;
    homedir?: string;
    shell?: string;
    gecos?: string;
    ttyFds?: Set<number> | boolean;
}
export interface HostUserImports {
    getuid: (ret_uid: number) => number;
    getgid: (ret_gid: number) => number;
    geteuid: (ret_uid: number) => number;
    getegid: (ret_gid: number) => number;
    isatty: (fd: number, ret_bool: number) => number;
    getpwuid: (uid: number, buf_ptr: number, buf_len: number, ret_len: number) => number;
}
/**
 * Manages user/group identity and terminal detection for WASM processes.
 */
export declare class UserManager {
    private _getMemory;
    private _fdTable;
    private _uid;
    private _gid;
    private _euid;
    private _egid;
    private _username;
    private _homedir;
    private _shell;
    private _gecos;
    private _ttyFds;
    constructor(options: UserManagerOptions);
    /**
     * Get the WASI import object for host_user functions.
     * All functions follow the wasi-ext signatures (return errno, out-params via pointers).
     */
    getImports(): HostUserImports;
    private _getuid;
    private _getgid;
    private _geteuid;
    private _getegid;
    private _isatty;
    private _getpwuid;
}
//# sourceMappingURL=user.d.ts.map