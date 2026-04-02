/**
 * Browser worker adapter.
 *
 * Wraps the Web Worker API for spawning Workers.
 * Requires COOP/COEP headers for SharedArrayBuffer support.
 */
export class BrowserWorkerAdapter {
    /**
     * Spawn a Web Worker for the given script URL.
     */
    static create(scriptUrl, options) {
        const worker = new Worker(scriptUrl, { type: "module" });
        // Send workerData as the initial message (Web Workers don't have
        // a constructor option for this like Node's worker_threads)
        if (options?.workerData !== undefined) {
            worker.postMessage({
                type: "init",
                workerData: options.workerData,
            });
        }
        return {
            postMessage(data, transferList) {
                worker.postMessage(data, transferList ?? []);
            },
            onMessage(handler) {
                worker.addEventListener("message", (e) => handler(e.data));
            },
            onError(handler) {
                worker.addEventListener("error", (e) => handler(new Error(e.message)));
            },
            onExit(_handler) {
                // Web Workers don't have an exit event — the terminate()
                // caller is responsible for cleanup
            },
            terminate() {
                worker.terminate();
            },
        };
    }
}
