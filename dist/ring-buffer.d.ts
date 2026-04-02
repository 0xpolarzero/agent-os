/**
 * SharedArrayBuffer-backed ring buffer for inter-Worker pipe communication.
 *
 * Layout (all Int32-aligned):
 *   [0]  writePos   - total bytes written (monotonic)
 *   [1]  readPos    - total bytes read (monotonic)
 *   [2]  closed     - 0 = open, 1 = writer closed (EOF)
 *   [3]  reserved
 *   [16..] data     - ring buffer payload
 *
 * Protocol:
 *   Writer: writes to data[writePos % capacity], blocks if full (writePos - readPos >= capacity)
 *   Reader: reads from data[readPos % capacity], blocks if empty (readPos >= writePos)
 *   EOF:    writer sets closed=1, notifies reader; reader returns 0 when empty+closed
 */
/**
 * Create a SharedArrayBuffer for use as a ring buffer.
 */
export declare function createRingBuffer(capacity?: number): SharedArrayBuffer;
/** Options for configuring ring buffer timeout behavior. */
export interface RingBufferOptions {
    /** Timeout per Atomics.wait attempt in ms (default: 5000). */
    waitTimeoutMs?: number;
    /** Max retries before giving up (default: 3). */
    maxRetries?: number;
}
/**
 * Writer end of a ring buffer pipe.
 */
export declare class RingBufferWriter {
    private _sab;
    private _header;
    private _data;
    private _capacity;
    private _waitTimeoutMs;
    private _maxRetries;
    constructor(sab: SharedArrayBuffer, options?: RingBufferOptions);
    /**
     * Write data into the ring buffer, blocking if full.
     */
    write(buf: Uint8Array, offset?: number, length?: number): number;
    /**
     * Signal EOF — no more data will be written.
     */
    close(): void;
}
/**
 * Reader end of a ring buffer pipe.
 */
export declare class RingBufferReader {
    private _sab;
    private _header;
    private _data;
    private _capacity;
    private _waitTimeoutMs;
    private _maxRetries;
    constructor(sab: SharedArrayBuffer, options?: RingBufferOptions);
    /**
     * Read data from the ring buffer, blocking if empty.
     * Returns 0 on EOF.
     */
    read(buf: Uint8Array, offset?: number, length?: number): number;
}
//# sourceMappingURL=ring-buffer.d.ts.map