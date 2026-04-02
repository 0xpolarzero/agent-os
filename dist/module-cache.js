/**
 * Module cache for compiled WebAssembly modules.
 *
 * Compiles WASM binaries to WebAssembly.Module on first use and caches them
 * for fast re-instantiation. Concurrent compilations of the same binary are
 * deduplicated — only one compile runs, all callers await the same promise.
 */
import { readFile } from 'node:fs/promises';
export class ModuleCache {
    _cache = new Map();
    _pending = new Map();
    /** Resolve a binary path to a compiled WebAssembly.Module, using cache. */
    async resolve(binaryPath) {
        // Fast path: already compiled
        const cached = this._cache.get(binaryPath);
        if (cached)
            return cached;
        // Dedup: if another caller is already compiling this binary, await it
        const inflight = this._pending.get(binaryPath);
        if (inflight)
            return inflight;
        // Compile and cache
        const promise = this._compile(binaryPath);
        this._pending.set(binaryPath, promise);
        try {
            const module = await promise;
            this._cache.set(binaryPath, module);
            return module;
        }
        finally {
            this._pending.delete(binaryPath);
        }
    }
    /** Remove a specific entry from the cache. */
    invalidate(binaryPath) {
        this._cache.delete(binaryPath);
    }
    /** Remove all entries from the cache. */
    clear() {
        this._cache.clear();
    }
    /** Number of cached modules. */
    get size() {
        return this._cache.size;
    }
    async _compile(binaryPath) {
        const bytes = await readFile(binaryPath);
        return WebAssembly.compile(bytes);
    }
}
//# sourceMappingURL=module-cache.js.map