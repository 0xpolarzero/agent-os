/**
 * Host directory mount backend.
 *
 * Projects a host directory into the VM with symlink escape prevention.
 * All paths are canonicalized and validated to stay within the host root.
 * Read-only by default.
 */
import { type VirtualFileSystem } from "@secure-exec/core";
export interface HostDirBackendOptions {
    /** Absolute path to the host directory to project into the VM. */
    hostPath: string;
    /** If true (default), write operations throw EROFS. */
    readOnly?: boolean;
}
/**
 * Create a VirtualFileSystem that projects a host directory into the VM.
 * Symlink escape and path traversal attacks are blocked by canonicalizing
 * all resolved paths and verifying they remain under `hostPath`.
 */
export declare function createHostDirBackend(options: HostDirBackendOptions): VirtualFileSystem;
