import type { ManagedProcess } from "@secure-exec/core";
import { type JsonRpcNotification, type JsonRpcResponse } from "./protocol.js";
export type NotificationHandler = (notification: JsonRpcNotification) => void;
export declare class AcpClient {
    private _process;
    private _nextId;
    private _pending;
    private _notificationHandlers;
    private _closed;
    private _timeoutMs;
    private _stdoutIterator;
    private _readerClosed;
    constructor(process: ManagedProcess, stdoutLines: AsyncIterable<string>, options?: {
        timeoutMs?: number;
    });
    request(method: string, params?: unknown): Promise<JsonRpcResponse>;
    notify(method: string, params?: unknown): void;
    onNotification(handler: NotificationHandler): void;
    close(): void;
    private _startReading;
    private _watchExit;
    private _rejectAll;
    private _closeReader;
}
