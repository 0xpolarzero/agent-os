import { createCommandExecutorStub, createFsStub, createNetworkStub } from "@secure-exec/core/internal/shared/permissions";
import type { Permissions, VirtualFileSystem } from "@secure-exec/core/internal/kernel";
import type { NetworkAdapter } from "@secure-exec/core/internal/types";
import type { SystemDriver } from "@secure-exec/core/internal/runtime-driver";
export interface BrowserRuntimeSystemOptions {
    filesystem: "opfs" | "memory";
    networkEnabled: boolean;
}
/**
 * VFS backed by the Origin Private File System (OPFS) API. Falls back to
 * InMemoryFileSystem when OPFS is unavailable. Rename is not supported
 * (throws ENOSYS) since OPFS doesn't provide atomic rename.
 */
export declare class OpfsFileSystem implements VirtualFileSystem {
    private rootPromise;
    constructor();
    private getDirHandle;
    private getFileHandle;
    readFile(path: string): Promise<Uint8Array>;
    readTextFile(path: string): Promise<string>;
    readDir(path: string): Promise<string[]>;
    readDirWithTypes(path: string): Promise<Array<{
        name: string;
        isDirectory: boolean;
    }>>;
    writeFile(path: string, content: string | Uint8Array): Promise<void>;
    createDir(path: string): Promise<void>;
    mkdir(path: string, _options?: {
        recursive?: boolean;
    }): Promise<void>;
    exists(path: string): Promise<boolean>;
    stat(path: string): Promise<{
        mode: number;
        size: number;
        isDirectory: boolean;
        isSymbolicLink: boolean;
        atimeMs: number;
        mtimeMs: number;
        ctimeMs: number;
        birthtimeMs: number;
        ino: number;
        nlink: number;
        uid: number;
        gid: number;
    }>;
    removeFile(path: string): Promise<void>;
    removeDir(path: string): Promise<void>;
    rename(_oldPath: string, _newPath: string): Promise<void>;
    symlink(_target: string, _linkPath: string): Promise<void>;
    readlink(_path: string): Promise<string>;
    lstat(path: string): Promise<{
        mode: number;
        size: number;
        isDirectory: boolean;
        isSymbolicLink: boolean;
        atimeMs: number;
        mtimeMs: number;
        ctimeMs: number;
        birthtimeMs: number;
        ino: number;
        nlink: number;
        uid: number;
        gid: number;
    }>;
    link(_oldPath: string, _newPath: string): Promise<void>;
    chmod(_path: string, _mode: number): Promise<void>;
    chown(_path: string, _uid: number, _gid: number): Promise<void>;
    utimes(_path: string, _atime: number, _mtime: number): Promise<void>;
    truncate(path: string, length: number): Promise<void>;
    realpath(path: string): Promise<string>;
    pread(path: string, offset: number, length: number): Promise<Uint8Array>;
    pwrite(path: string, offset: number, data: Uint8Array): Promise<void>;
}
export interface BrowserDriverOptions {
    filesystem?: "opfs" | "memory";
    permissions?: Permissions;
    useDefaultNetwork?: boolean;
}
/** Create an OPFS-backed filesystem, falling back to in-memory if OPFS is unavailable. */
export declare function createOpfsFileSystem(): Promise<VirtualFileSystem>;
/** Network adapter that delegates to the browser's native `fetch`. DNS and http2 are unsupported. */
export declare function createBrowserNetworkAdapter(): NetworkAdapter;
/** Recover runtime-driver options from a browser SystemDriver instance. */
export declare function getBrowserSystemDriverOptions(systemDriver: SystemDriver): BrowserRuntimeSystemOptions;
/** Assemble a browser-side SystemDriver with permission-wrapped adapters. */
export declare function createBrowserDriver(options?: BrowserDriverOptions): Promise<SystemDriver>;
export { createCommandExecutorStub, createFsStub, createNetworkStub, };
