interface StdoutLineIterable {
    /** Pass this as the onStdout callback to kernel.spawn(). */
    onStdout: (data: Uint8Array) => void;
    /** Async iterable of newline-delimited stdout lines. */
    iterable: AsyncIterable<string>;
}
/**
 * Creates a bridge between the spawn onStdout callback and the
 * AsyncIterable<string> expected by AcpClient.
 *
 * Bytes arriving via onStdout are buffered and split on newlines.
 * Complete lines are pushed to an async queue consumed by the iterable.
 */
export declare function createStdoutLineIterable(): StdoutLineIterable;
export {};
