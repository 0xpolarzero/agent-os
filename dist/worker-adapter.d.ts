/**
 * Worker adapter layer for browser and Node.js.
 *
 * Provides a unified Worker abstraction that works in both browser
 * (Web Workers) and Node.js (worker_threads), normalizing the API
 * for spawn, messaging, and termination.
 */
/** Unified interface for worker handles. */
export interface WorkerHandle {
    postMessage(data: unknown, transferList?: Transferable[]): void;
    onMessage(handler: (data: unknown) => void): void;
    onError(handler: (err: Error) => void): void;
    onExit(handler: (code: number) => void): void;
    terminate(): void | Promise<number>;
}
export interface SpawnOptions {
    workerData?: unknown;
    transferList?: Transferable[];
}
/**
 * Unified Worker abstraction for browser and Node.js.
 */
export declare class WorkerAdapter {
    private _environment;
    constructor();
    get environment(): 'browser' | 'node';
    spawn(script: string | URL, options?: SpawnOptions): Promise<WorkerHandle>;
    private _spawnNode;
    private _spawnBrowser;
    static isSharedArrayBufferAvailable(): boolean;
}
//# sourceMappingURL=worker-adapter.d.ts.map