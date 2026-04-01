/**
 * Shared filesystem conformance test suite.
 *
 * Driver authors call `defineFsDriverTests(config)` inside a vitest
 * `describe` block. The helper registers core tests that every VFS
 * implementation must pass, plus conditional tests gated on the
 * `capabilities` object.
 */
import type { VirtualFileSystem } from "@secure-exec/core";
export interface FsDriverTestCapabilities {
    symlinks: boolean;
    hardLinks: boolean;
    permissions: boolean;
    utimes: boolean;
    truncate: boolean;
    pread: boolean;
    mkdir: boolean;
    removeDir: boolean;
}
export interface FsDriverTestConfig {
    /** Human-readable name shown in the describe block. */
    name: string;
    /** Create a fresh VFS instance for each test. */
    createFs: () => Promise<VirtualFileSystem> | VirtualFileSystem;
    /** Optional teardown called after each test. */
    cleanup?: () => Promise<void> | void;
    /** Which optional capabilities the driver supports. */
    capabilities: FsDriverTestCapabilities;
}
export declare function defineFsDriverTests(config: FsDriverTestConfig): void;
