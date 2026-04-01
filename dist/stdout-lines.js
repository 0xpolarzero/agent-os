// Helper to convert onStdout callback bytes into an AsyncIterable<string> of lines
/**
 * Creates a bridge between the spawn onStdout callback and the
 * AsyncIterable<string> expected by AcpClient.
 *
 * Bytes arriving via onStdout are buffered and split on newlines.
 * Complete lines are pushed to an async queue consumed by the iterable.
 */
export function createStdoutLineIterable() {
    let buffer = "";
    const queue = [];
    let resolve = null;
    let done = false;
    const onStdout = (data) => {
        if (done)
            return;
        buffer += new TextDecoder().decode(data);
        const lines = buffer.split("\n");
        // Keep the last (potentially incomplete) chunk in the buffer
        buffer = lines.pop() ?? "";
        for (const line of lines) {
            queue.push(line);
            if (resolve) {
                resolve();
                resolve = null;
            }
        }
    };
    const iterable = {
        [Symbol.asyncIterator]() {
            return {
                async next() {
                    while (queue.length === 0) {
                        if (done)
                            return { value: undefined, done: true };
                        await new Promise((r) => {
                            resolve = r;
                        });
                    }
                    const value = queue.shift();
                    return { value, done: false };
                },
                return() {
                    done = true;
                    if (resolve) {
                        resolve();
                        resolve = null;
                    }
                    return Promise.resolve({ value: undefined, done: true });
                },
            };
        },
    };
    return { onStdout, iterable };
}
