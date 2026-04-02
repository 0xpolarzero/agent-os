import type { NetworkAdapter, NodeRuntimeDriver, NodeRuntimeDriverFactory, RuntimeDriverOptions } from "@secure-exec/core";
import type { ExecOptions, ExecResult, RunResult } from "@secure-exec/core";
export interface BrowserRuntimeDriverFactoryOptions {
    workerUrl?: URL | string;
}
export declare class BrowserRuntimeDriver implements NodeRuntimeDriver {
    private readonly options;
    private readonly worker;
    private readonly pending;
    private readonly defaultOnStdio?;
    private readonly networkAdapter;
    private readonly ready;
    private nextId;
    private disposed;
    constructor(options: RuntimeDriverOptions, factoryOptions?: BrowserRuntimeDriverFactoryOptions);
    get network(): Pick<NetworkAdapter, "fetch" | "dnsLookup" | "httpRequest">;
    private handleWorkerError;
    private handleWorkerMessage;
    private rejectAllPending;
    private callWorker;
    run<T = unknown>(code: string, filePath?: string): Promise<RunResult<T>>;
    exec(code: string, options?: ExecOptions): Promise<ExecResult>;
    dispose(): void;
    terminate(): Promise<void>;
}
export declare function createBrowserRuntimeDriverFactory(factoryOptions?: BrowserRuntimeDriverFactoryOptions): NodeRuntimeDriverFactory;
