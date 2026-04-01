import { createInMemoryFileSystem } from "@secure-exec/core";
import type { ToolKit } from "./host-tools.js";
/**
 * Generate a POSIX shell shim for a toolkit CLI binary.
 * Written to /usr/local/bin/agentos-{name}.
 */
export declare function generateToolkitShim(toolkitName: string): string;
/**
 * Generate the master /usr/local/bin/agentos shim.
 * Supports: agentos list-tools [toolkit]
 */
export declare function generateMasterShim(): string;
/**
 * Create a pre-populated InMemoryFileSystem with all CLI shims.
 * Returns the filesystem ready to be mounted at /usr/local/bin.
 */
export declare function createShimFilesystem(toolkits: ToolKit[]): Promise<ReturnType<typeof createInMemoryFileSystem>>;
