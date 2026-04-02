import { createNetworkStub } from "@secure-exec/core";
import { getBrowserSystemDriverOptions, } from "./driver.js";
const BROWSER_OPTION_VALIDATORS = [
    {
        label: "memoryLimit",
        hasValue: (options) => options.memoryLimit !== undefined,
    },
    {
        label: "cpuTimeLimitMs",
        hasValue: (options) => options.cpuTimeLimitMs !== undefined,
    },
    {
        label: "timingMitigation",
        hasValue: (options) => options.timingMitigation !== undefined,
    },
];
function serializePermissions(permissions) {
    if (!permissions) {
        return undefined;
    }
    const serialize = (fn) => typeof fn === "function" ? fn.toString() : undefined;
    return {
        fs: serialize(permissions.fs),
        network: serialize(permissions.network),
        childProcess: serialize(permissions.childProcess),
        env: serialize(permissions.env),
    };
}
function resolveWorkerUrl(workerUrl) {
    if (workerUrl instanceof URL) {
        return workerUrl;
    }
    if (workerUrl) {
        return new URL(workerUrl, import.meta.url);
    }
    return new URL("./worker.js", import.meta.url);
}
function toBrowserWorkerExecOptions(options) {
    if (!options) {
        return undefined;
    }
    return {
        filePath: options.filePath,
        env: options.env,
        cwd: options.cwd,
        stdin: options.stdin,
    };
}
function validateBrowserRuntimeOptions(options) {
    const unsupported = BROWSER_OPTION_VALIDATORS
        .filter((validator) => validator.hasValue(options))
        .map((validator) => validator.label);
    if (unsupported.length === 0) {
        return;
    }
    throw new Error(`Browser runtime does not support Node-only options: ${unsupported.join(", ")}`);
}
function validateBrowserExecOptions(options) {
    const unsupported = [];
    if (options?.cpuTimeLimitMs !== undefined) {
        unsupported.push("cpuTimeLimitMs");
    }
    if (options?.timingMitigation !== undefined) {
        unsupported.push("timingMitigation");
    }
    if (unsupported.length === 0) {
        return;
    }
    throw new Error(`Browser runtime does not support Node-only exec options: ${unsupported.join(", ")}`);
}
export class BrowserRuntimeDriver {
    options;
    worker;
    pending = new Map();
    defaultOnStdio;
    networkAdapter;
    ready;
    nextId = 1;
    disposed = false;
    constructor(options, factoryOptions = {}) {
        this.options = options;
        if (typeof Worker === "undefined") {
            throw new Error("Browser runtime requires a global Worker implementation");
        }
        this.defaultOnStdio = options.onStdio;
        this.networkAdapter = options.system.network ?? createNetworkStub();
        this.worker = new Worker(resolveWorkerUrl(factoryOptions.workerUrl), {
            type: "module",
        });
        this.worker.onmessage = this.handleWorkerMessage;
        this.worker.onerror = this.handleWorkerError;
        const browserSystemOptions = getBrowserSystemDriverOptions(options.system);
        const initPayload = {
            processConfig: options.runtime.process,
            osConfig: options.runtime.os,
            permissions: serializePermissions(options.system.permissions),
            filesystem: browserSystemOptions.filesystem,
            networkEnabled: browserSystemOptions.networkEnabled,
            payloadLimits: options.payloadLimits,
        };
        this.ready = this.callWorker("init", initPayload).then(() => undefined);
        this.ready.catch(() => undefined);
    }
    get network() {
        const adapter = this.networkAdapter;
        return {
            fetch: (url, options) => adapter.fetch(url, options),
            dnsLookup: (hostname) => adapter.dnsLookup(hostname),
            httpRequest: (url, options) => adapter.httpRequest(url, options),
        };
    }
    handleWorkerError = (event) => {
        const error = event.error instanceof Error
            ? event.error
            : new Error(event.message
                ? `Browser runtime worker error: ${event.message} (${event.filename}:${event.lineno}:${event.colno})`
                : "Browser runtime worker error");
        this.rejectAllPending(error);
    };
    handleWorkerMessage = (event) => {
        const message = event.data;
        if (message.type === "stdio") {
            const pending = this.pending.get(message.requestId);
            const hook = pending?.hook ?? this.defaultOnStdio;
            if (!hook) {
                return;
            }
            try {
                hook({ channel: message.channel, message: message.message });
            }
            catch {
                // Ignore host hook errors so sandbox execution can continue.
            }
            return;
        }
        const pending = this.pending.get(message.id);
        if (!pending) {
            return;
        }
        this.pending.delete(message.id);
        if (message.ok) {
            pending.resolve(message.result);
            return;
        }
        const error = new Error(message.error.message);
        if (message.error.stack) {
            error.stack = message.error.stack;
        }
        error.code = message.error.code;
        pending.reject(error);
    };
    rejectAllPending(error) {
        const entries = Array.from(this.pending.values());
        this.pending.clear();
        for (const pending of entries) {
            pending.reject(error);
        }
    }
    callWorker(type, payload, hook) {
        if (this.disposed) {
            return Promise.reject(new Error("Browser runtime has been disposed"));
        }
        const id = this.nextId++;
        const message = payload === undefined
            ? { id, type }
            : { id, type, payload };
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject, hook });
            this.worker.postMessage(message);
        });
    }
    async run(code, filePath) {
        await this.ready;
        const hook = this.defaultOnStdio;
        return this.callWorker("run", {
            code,
            filePath,
            captureStdio: Boolean(hook),
        }, hook);
    }
    async exec(code, options) {
        validateBrowserExecOptions(options);
        await this.ready;
        const hook = options?.onStdio ?? this.defaultOnStdio;
        return this.callWorker("exec", {
            code,
            options: toBrowserWorkerExecOptions(options),
            captureStdio: Boolean(hook),
        }, hook);
    }
    dispose() {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this.worker.terminate();
        this.rejectAllPending(new Error("Browser runtime has been disposed"));
    }
    async terminate() {
        this.dispose();
    }
}
export function createBrowserRuntimeDriverFactory(factoryOptions = {}) {
    return {
        createRuntimeDriver(options) {
            validateBrowserRuntimeOptions(options);
            return new BrowserRuntimeDriver(options, factoryOptions);
        },
    };
}
