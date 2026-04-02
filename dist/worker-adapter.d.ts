/**
 * Browser worker adapter.
 *
 * Wraps the Web Worker API for spawning Workers.
 * Requires COOP/COEP headers for SharedArrayBuffer support.
 */
export interface WorkerHandle {
    postMessage(data: unknown, transferList?: Transferable[]): void;
    onMessage(handler: (data: unknown) => void): void;
    onError(handler: (err: Error) => void): void;
    onExit(handler: (code: number) => void): void;
    terminate(): void;
}
export declare class BrowserWorkerAdapter {
    /**
     * Spawn a Web Worker for the given script URL.
     */
    static create(scriptUrl: string | URL, options?: {
        workerData?: unknown;
    }): WorkerHandle;
}
