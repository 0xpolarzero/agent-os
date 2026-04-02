/**
 * Browser-compatible WasmVM runtime driver.
 *
 * Discovers commands from a JSON manifest fetched over the network.
 * WASM binaries are fetched on demand and compiled via
 * WebAssembly.compileStreaming() for streaming compilation.
 * Compiled modules are cached in memory for fast re-instantiation.
 * Persistent caching via Cache API (or IndexedDB fallback) stores
 * binaries across page loads. SHA-256 integrity is verified from the
 * manifest before any cached or fetched binary is used.
 */
import type { KernelRuntimeDriver as RuntimeDriver } from '@secure-exec/core';
/** Metadata for a single command in the manifest. */
export interface CommandManifestEntry {
    /** Binary size in bytes. */
    size: number;
    /** SHA-256 hex digest of the binary. */
    sha256: string;
}
/** JSON manifest mapping command names to binary metadata. */
export interface CommandManifest {
    /** Manifest schema version. */
    version: number;
    /** Base URL for fetching command binaries (trailing slash included). */
    baseUrl: string;
    /** Map of command name to metadata. */
    commands: Record<string, CommandManifestEntry>;
}
/** Persistent storage for WASM binary bytes across page loads. */
export interface BinaryStorage {
    get(key: string): Promise<Uint8Array | null>;
    put(key: string, bytes: Uint8Array): Promise<void>;
    delete(key: string): Promise<void>;
}
/** Cache API-backed storage. */
export declare class CacheApiBinaryStorage implements BinaryStorage {
    private _cacheName;
    constructor(cacheName?: string);
    get(key: string): Promise<Uint8Array | null>;
    put(key: string, bytes: Uint8Array): Promise<void>;
    delete(key: string): Promise<void>;
}
/** IndexedDB-backed storage (fallback when Cache API is unavailable). */
export declare class IndexedDbBinaryStorage implements BinaryStorage {
    private _dbName;
    private _storeName;
    constructor(dbName?: string);
    private _open;
    get(key: string): Promise<Uint8Array | null>;
    put(key: string, bytes: Uint8Array): Promise<void>;
    delete(key: string): Promise<void>;
}
/** Compute SHA-256 hex digest of binary data using Web Crypto API. */
export declare function sha256Hex(data: Uint8Array): Promise<string>;
export interface BrowserWasmVmRuntimeOptions {
    /** URL to the command manifest JSON. */
    registryUrl: string;
    /** Optional custom fetch function (for testing). */
    fetch?: typeof globalThis.fetch;
    /** Optional persistent binary storage (auto-detected if omitted). */
    binaryStorage?: BinaryStorage | null;
}
/**
 * Create a browser-compatible WasmVM RuntimeDriver that fetches commands
 * from a CDN using a JSON manifest.
 */
export declare function createBrowserWasmVmRuntime(options: BrowserWasmVmRuntimeOptions): RuntimeDriver;
//# sourceMappingURL=browser-driver.d.ts.map