import type { ToolKit } from "./host-tools.js";
export interface HostToolsServer {
    /** The port the server is listening on. */
    port: number;
    /** Register additional toolkits. */
    registerToolkit(toolkit: ToolKit): void;
    /** Shut down the HTTP server. */
    close(): Promise<void>;
}
/**
 * Start the host tools RPC server on 127.0.0.1:0.
 * Returns a handle with the assigned port.
 */
export declare function startHostToolsServer(toolkits: ToolKit[]): Promise<HostToolsServer>;
