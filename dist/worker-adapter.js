/**
 * Worker adapter layer for browser and Node.js.
 *
 * Provides a unified Worker abstraction that works in both browser
 * (Web Workers) and Node.js (worker_threads), normalizing the API
 * for spawn, messaging, and termination.
 */
// Environment detection
const isBrowser = typeof globalThis.window !== 'undefined'
    && typeof globalThis.document !== 'undefined';
/**
 * Wraps a Node.js worker_threads.Worker with a browser-like interface.
 */
class NodeWorkerHandle {
    _worker;
    _messageHandlers = [];
    _errorHandlers = [];
    _exitHandlers = [];
    constructor(worker) {
        this._worker = worker;
        this._worker.on('message', (data) => {
            for (const handler of this._messageHandlers) {
                handler(data);
            }
        });
        this._worker.on('error', (err) => {
            for (const handler of this._errorHandlers) {
                handler(err);
            }
        });
        this._worker.on('exit', (code) => {
            for (const handler of this._exitHandlers) {
                handler(code);
            }
        });
    }
    postMessage(data, transferList) {
        this._worker.postMessage(data, transferList);
    }
    onMessage(handler) {
        this._messageHandlers.push(handler);
    }
    onError(handler) {
        this._errorHandlers.push(handler);
    }
    onExit(handler) {
        this._exitHandlers.push(handler);
    }
    terminate() {
        return this._worker.terminate();
    }
    get threadId() {
        return this._worker.threadId;
    }
}
/**
 * Wraps a browser Web Worker with the same interface as NodeWorkerHandle.
 */
class BrowserWorkerHandle {
    _worker;
    _messageHandlers = [];
    _errorHandlers = [];
    constructor(worker) {
        this._worker = worker;
        this._worker.onmessage = (event) => {
            for (const handler of this._messageHandlers) {
                handler(event.data);
            }
        };
        this._worker.onerror = (event) => {
            const err = new Error(event.message || 'Worker error');
            for (const handler of this._errorHandlers) {
                handler(err);
            }
        };
    }
    postMessage(data, transferList) {
        if (transferList) {
            this._worker.postMessage(data, transferList);
        }
        else {
            this._worker.postMessage(data);
        }
    }
    onMessage(handler) {
        this._messageHandlers.push(handler);
    }
    onError(handler) {
        this._errorHandlers.push(handler);
    }
    onExit(_handler) {
        // Web Workers don't have an exit event equivalent.
        // Termination is fire-and-forget.
    }
    terminate() {
        this._worker.terminate();
    }
}
/**
 * Unified Worker abstraction for browser and Node.js.
 */
export class WorkerAdapter {
    _environment;
    constructor() {
        this._environment = isBrowser ? 'browser' : 'node';
    }
    get environment() {
        return this._environment;
    }
    async spawn(script, options = {}) {
        if (this._environment === 'node') {
            return this._spawnNode(script, options);
        }
        else {
            return this._spawnBrowser(script, options);
        }
    }
    async _spawnNode(script, options) {
        const { Worker } = await import('node:worker_threads');
        // If the script is a .ts file, pass --import tsx so the worker can load TypeScript
        const scriptStr = typeof script === 'string' ? script : script.href;
        const execArgv = scriptStr.endsWith('.ts') ? ['--import', 'tsx'] : [];
        const worker = new Worker(script, {
            workerData: options.workerData,
            transferList: options.transferList,
            execArgv,
        });
        return new NodeWorkerHandle(worker);
    }
    async _spawnBrowser(script, options) {
        const worker = new globalThis.Worker(script, { type: 'module' });
        const handle = new BrowserWorkerHandle(worker);
        // In browser, pass workerData as an initial message since
        // Web Workers don't have a workerData constructor option.
        if (options.workerData !== undefined) {
            handle.postMessage({
                type: '__workerData',
                data: options.workerData,
            }, options.transferList);
        }
        return handle;
    }
    static isSharedArrayBufferAvailable() {
        return typeof SharedArrayBuffer !== 'undefined';
    }
}
//# sourceMappingURL=worker-adapter.js.map