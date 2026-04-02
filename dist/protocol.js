// JSON-RPC 2.0 types and helpers for ACP communication
export function serializeMessage(msg) {
    return `${JSON.stringify(msg)}\n`;
}
export function deserializeMessage(line) {
    try {
        const parsed = JSON.parse(line);
        if (parsed?.jsonrpc !== "2.0")
            return null;
        return parsed;
    }
    catch {
        return null;
    }
}
export function isResponse(msg) {
    return "id" in msg;
}
