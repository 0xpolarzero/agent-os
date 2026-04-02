/**
 * Sandbox Agent filesystem backend.
 *
 * Delegates all VFS operations to the Sandbox Agent SDK over HTTP.
 * Self-contained implementation of the sandbox VFS backend.
 */
import type { SandboxAgent } from "sandbox-agent";
import { type VirtualFileSystem } from "@secure-exec/core";
export interface SandboxFsOptions {
    /** A connected SandboxAgent client instance. */
    client: SandboxAgent;
    /** Base path to scope all operations under. Defaults to "/". */
    basePath?: string;
}
/**
 * Create a VirtualFileSystem backed by the Sandbox Agent SDK.
 */
export declare function createSandboxFs(options: SandboxFsOptions): VirtualFileSystem;
