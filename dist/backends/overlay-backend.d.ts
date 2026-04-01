/**
 * Overlay (copy-on-write) filesystem backend.
 *
 * Layers a writable upper filesystem over a read-only lower filesystem.
 * Reads check the upper first, then fall through to the lower.
 * Writes always go to the upper. Deletes record a "whiteout" in the upper
 * so that the file appears deleted even if it exists in the lower.
 */
import { type VirtualFileSystem } from "@secure-exec/core";
export interface OverlayBackendOptions {
    /** Read-only base layer. Never written to. */
    lower: VirtualFileSystem;
    /** Writable upper layer. Defaults to a fresh InMemoryFileSystem. */
    upper?: VirtualFileSystem;
}
/**
 * Create a copy-on-write overlay filesystem.
 * Reads fall through from upper to lower. Writes go to upper only.
 * Deletes record whiteout markers so files in lower appear removed.
 */
export declare function createOverlayBackend(options: OverlayBackendOptions): VirtualFileSystem;
