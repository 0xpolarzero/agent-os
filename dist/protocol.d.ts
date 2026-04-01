export interface JsonRpcRequest {
    jsonrpc: "2.0";
    id: number;
    method: string;
    params?: unknown;
}
export interface JsonRpcResponse {
    jsonrpc: "2.0";
    id: number;
    result?: unknown;
    error?: JsonRpcError;
}
export interface JsonRpcError {
    code: number;
    message: string;
    data?: unknown;
}
export interface JsonRpcNotification {
    jsonrpc: "2.0";
    method: string;
    params?: unknown;
}
export declare function serializeMessage(msg: JsonRpcRequest | JsonRpcNotification): string;
export declare function deserializeMessage(line: string): JsonRpcResponse | JsonRpcNotification | null;
export declare function isResponse(msg: JsonRpcResponse | JsonRpcNotification): msg is JsonRpcResponse;
