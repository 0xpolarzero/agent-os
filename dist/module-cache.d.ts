/**
 * Module cache for compiled WebAssembly modules.
 *
 * Compiles WASM binaries to WebAssembly.Module on first use and caches them
 * for fast re-instantiation. Concurrent compilations of the same binary are
 * deduplicated — only one compile runs, all callers await the same promise.
 */
export declare class ModuleCache {
    private _cache;
    private _pending;
    /** Resolve a binary path to a compiled WebAssembly.Module, using cache. */
    resolve(binaryPath: string): Promise<WebAssembly.Module>;
    /** Remove a specific entry from the cache. */
    invalidate(binaryPath: string): void;
    /** Remove all entries from the cache. */
    clear(): void;
    /** Number of cached modules. */
    get size(): number;
    private _compile;
}
//# sourceMappingURL=module-cache.d.ts.map