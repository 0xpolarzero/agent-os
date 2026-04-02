/**
 * In-memory filesystem for browser environments.
 *
 * Expanded from the original secure-exec InMemoryFileSystem with POSIX
 * extensions (symlinks, hard links, chmod, chown, utimes, truncate)
 * needed by the kernel VFS interface.
 */
import type { VirtualDirEntry, VirtualFileSystem, VirtualStat } from "@secure-exec/core";
export declare class InMemoryFileSystem implements VirtualFileSystem {
    private entries;
    constructor();
    readFile(path: string): Promise<Uint8Array>;
    readTextFile(path: string): Promise<string>;
    readDir(path: string): Promise<string[]>;
    readDirWithTypes(path: string): Promise<VirtualDirEntry[]>;
    writeFile(path: string, content: string | Uint8Array): Promise<void>;
    createDir(path: string): Promise<void>;
    mkdir(path: string, options?: {
        recursive?: boolean;
    }): Promise<void>;
    exists(path: string): Promise<boolean>;
    stat(path: string): Promise<VirtualStat>;
    removeFile(path: string): Promise<void>;
    removeDir(path: string): Promise<void>;
    realpath(path: string): Promise<string>;
    rename(oldPath: string, newPath: string): Promise<void>;
    symlink(target: string, linkPath: string): Promise<void>;
    readlink(path: string): Promise<string>;
    lstat(path: string): Promise<VirtualStat>;
    link(oldPath: string, newPath: string): Promise<void>;
    chmod(path: string, mode: number): Promise<void>;
    chown(path: string, uid: number, gid: number): Promise<void>;
    utimes(path: string, atime: number, mtime: number): Promise<void>;
    truncate(path: string, length: number): Promise<void>;
    pread(path: string, offset: number, length: number): Promise<Uint8Array>;
    pwrite(path: string, offset: number, data: Uint8Array): Promise<void>;
    /**
     * Resolve symlinks to get the final path. Returns the normalized path
     * after following all symlinks.
     */
    private resolvePath;
    /** Resolve a path and return the entry (following symlinks). */
    private resolveEntry;
    private newDir;
    private toStat;
    private enoent;
}
export declare function createInMemoryFileSystem(): InMemoryFileSystem;
