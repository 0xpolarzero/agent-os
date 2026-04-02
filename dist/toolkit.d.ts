/**
 * Sandbox toolkit exposing process management and command execution
 * as host tools for agents running inside an agentOS VM.
 */
import type { SandboxAgent } from "sandbox-agent";
import type { ToolKit } from "@rivet-dev/agent-os-core";
export interface SandboxToolkitOptions {
    /** A connected SandboxAgent client instance. */
    client: SandboxAgent;
}
/**
 * Create a ToolKit that exposes sandbox process management operations.
 */
export declare function createSandboxToolkit(options: SandboxToolkitOptions): ToolKit;
