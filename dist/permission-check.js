/**
 * Permission enforcement helpers for WasmVM command tiers.
 *
 * Pure functions used by kernel-worker.ts to check whether an operation
 * is allowed under the command's permission tier. Extracted for testability.
 */
import { resolve as resolvePath, normalize } from 'node:path';
const VALID_TIERS = new Set(['full', 'read-write', 'read-only', 'isolated']);
/** Check if the tier blocks write operations (file writes, VFS mutations). */
export function isWriteBlocked(tier) {
    return tier === 'read-only' || tier === 'isolated';
}
/** Check if the tier blocks subprocess spawning. Only 'full' allows proc_spawn. */
export function isSpawnBlocked(tier) {
    return tier !== 'full';
}
/** Check if the tier blocks network operations. Only 'full' allows net_ functions. */
export function isNetworkBlocked(tier) {
    return tier !== 'full';
}
/**
 * Validate a permission tier string, defaulting to 'isolated' for unknown values.
 * Prevents unknown tier strings from falling through inconsistently.
 */
export function validatePermissionTier(tier) {
    if (VALID_TIERS.has(tier))
        return tier;
    return 'isolated';
}
/**
 * Check if a path is within the cwd subtree (for isolated tier read restriction).
 *
 * When `resolveRealPath` is provided, the resolved path is passed through it
 * to follow symlinks before checking the prefix — prevents symlink escape
 * where a link inside cwd points to a target outside cwd.
 */
export function isPathInCwd(path, cwd, resolveRealPath) {
    const normalizedCwd = normalize(cwd).replace(/\/+$/, '');
    let normalizedPath = normalize(resolvePath(cwd, path)).replace(/\/+$/, '');
    if (resolveRealPath) {
        normalizedPath = normalize(resolveRealPath(normalizedPath)).replace(/\/+$/, '');
    }
    return normalizedPath === normalizedCwd || normalizedPath.startsWith(normalizedCwd + '/');
}
/**
 * Resolve the permission tier for a command against a permissions config.
 * Priority: exact name match > longest glob pattern > '*' fallback > defaults > 'read-write'.
 *
 * When `defaults` is provided, it is only consulted if `permissions` has no match
 * (including no '*' catch-all). This ensures user-provided patterns (including '*')
 * always take priority over built-in default tiers.
 */
export function resolvePermissionTier(command, permissions, defaults) {
    // Exact match first
    if (command in permissions)
        return permissions[command];
    // Find longest matching glob pattern (excluding '*' catch-all)
    let bestPattern = null;
    let bestLength = 0;
    for (const pattern of Object.keys(permissions)) {
        if (pattern === '*' || !pattern.includes('*'))
            continue;
        if (globMatch(pattern, command) && pattern.length > bestLength) {
            bestPattern = pattern;
            bestLength = pattern.length;
        }
    }
    if (bestPattern !== null)
        return permissions[bestPattern];
    // '*' catch-all fallback
    if ('*' in permissions)
        return permissions['*'];
    // Defaults layer — only consulted when permissions has no match
    if (defaults && command in defaults)
        return defaults[command];
    return 'read-write';
}
/** Simple glob matching: '*' matches any sequence of characters. */
function globMatch(pattern, str) {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp('^' + escaped.replace(/\*/g, '.*') + '$');
    return regex.test(str);
}
//# sourceMappingURL=permission-check.js.map