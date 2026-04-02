/**
 * Permission enforcement helpers for WasmVM command tiers.
 *
 * Pure functions used by kernel-worker.ts to check whether an operation
 * is allowed under the command's permission tier. Extracted for testability.
 */
import type { PermissionTier } from './syscall-rpc.js';
/** Check if the tier blocks write operations (file writes, VFS mutations). */
export declare function isWriteBlocked(tier: PermissionTier): boolean;
/** Check if the tier blocks subprocess spawning. Only 'full' allows proc_spawn. */
export declare function isSpawnBlocked(tier: PermissionTier): boolean;
/** Check if the tier blocks network operations. Only 'full' allows net_ functions. */
export declare function isNetworkBlocked(tier: PermissionTier): boolean;
/**
 * Validate a permission tier string, defaulting to 'isolated' for unknown values.
 * Prevents unknown tier strings from falling through inconsistently.
 */
export declare function validatePermissionTier(tier: string): PermissionTier;
/**
 * Check if a path is within the cwd subtree (for isolated tier read restriction).
 *
 * When `resolveRealPath` is provided, the resolved path is passed through it
 * to follow symlinks before checking the prefix — prevents symlink escape
 * where a link inside cwd points to a target outside cwd.
 */
export declare function isPathInCwd(path: string, cwd: string, resolveRealPath?: (p: string) => string): boolean;
/**
 * Resolve the permission tier for a command against a permissions config.
 * Priority: exact name match > longest glob pattern > '*' fallback > defaults > 'read-write'.
 *
 * When `defaults` is provided, it is only consulted if `permissions` has no match
 * (including no '*' catch-all). This ensures user-provided patterns (including '*')
 * always take priority over built-in default tiers.
 */
export declare function resolvePermissionTier(command: string, permissions: Record<string, PermissionTier>, defaults?: Readonly<Record<string, PermissionTier>>): PermissionTier;
//# sourceMappingURL=permission-check.d.ts.map