import { deserializeMessage, isResponse, serializeMessage, } from "./protocol.js";
const DEFAULT_TIMEOUT_MS = 120_000;
export class AcpClient {
    _process;
    _nextId = 1;
    _pending = new Map();
    _notificationHandlers = [];
    _closed = false;
    _timeoutMs;
    _stdoutIterator = null;
    _readerClosed = false;
    constructor(process, stdoutLines, options) {
        this._process = process;
        this._timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this._startReading(stdoutLines);
        this._watchExit();
    }
    request(method, params) {
        if (this._closed) {
            return Promise.reject(new Error("AcpClient is closed"));
        }
        const id = this._nextId++;
        const msg = serializeMessage({ jsonrpc: "2.0", id, method, params });
        this._process.writeStdin(msg);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this._pending.delete(id);
                reject(new Error(`ACP request ${method} (id=${id}) timed out after ${this._timeoutMs}ms`));
            }, this._timeoutMs);
            this._pending.set(id, { resolve, reject, timer });
        });
    }
    notify(method, params) {
        if (this._closed)
            return;
        const msg = serializeMessage({ jsonrpc: "2.0", method, params });
        this._process.writeStdin(msg);
    }
    onNotification(handler) {
        this._notificationHandlers.push(handler);
    }
    close() {
        if (this._closed)
            return;
        this._closed = true;
        this._closeReader();
        this._rejectAll(new Error("AcpClient closed"));
        this._process.kill();
    }
    _startReading(stdoutLines) {
        void (async () => {
            const iterator = stdoutLines[Symbol.asyncIterator]();
            this._stdoutIterator = iterator;
            try {
                while (!this._closed) {
                    const { value: line, done } = await iterator.next();
                    if (done) {
                        break;
                    }
                    if (this._closed)
                        break;
                    const trimmed = line.trim();
                    if (!trimmed)
                        continue;
                    const msg = deserializeMessage(trimmed);
                    if (!msg)
                        continue; // Skip non-JSON lines
                    if (isResponse(msg)) {
                        const pending = this._pending.get(msg.id);
                        if (pending) {
                            this._pending.delete(msg.id);
                            clearTimeout(pending.timer);
                            pending.resolve(msg);
                        }
                    }
                    else {
                        for (const handler of this._notificationHandlers) {
                            handler(msg);
                        }
                    }
                }
            }
            catch {
                // Stream ended or errored
            }
            finally {
                if (this._stdoutIterator === iterator) {
                    this._stdoutIterator = null;
                }
            }
        })();
    }
    _watchExit() {
        this._process.wait().then(() => {
            this._closed = true;
            this._closeReader();
            this._rejectAll(new Error("Agent process exited"));
        });
    }
    _rejectAll(error) {
        for (const [id, pending] of this._pending) {
            clearTimeout(pending.timer);
            pending.reject(error);
            this._pending.delete(id);
        }
    }
    _closeReader() {
        if (this._readerClosed) {
            return;
        }
        this._readerClosed = true;
        const iterator = this._stdoutIterator;
        this._stdoutIterator = null;
        if (iterator && typeof iterator.return === "function") {
            void iterator.return();
        }
    }
}
