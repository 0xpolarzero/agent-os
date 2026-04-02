import type { Kernel } from "@secure-exec/core";
/** Options passed alongside additionalInstructions in prepareInstructions. */
export interface PrepareInstructionsOptions {
    /** Auto-generated tool reference markdown to append to the prompt. */
    toolReference?: string;
    /** When true, skip reading the base OS instructions file. */
    skipBase?: boolean;
}
export interface AgentConfig {
    /** npm package name for the ACP adapter (spawned inside the VM) */
    acpAdapter: string;
    /** npm package name for the underlying agent */
    agentPackage: string;
    /**
     * Default env vars to pass when spawning the adapter. These are merged
     * UNDER prepareInstructions env and user env (lowest priority).
     * Typically set by package descriptors for computed paths (e.g. PI_ACP_PI_COMMAND).
     */
    defaultEnv?: Record<string, string>;
    /**
     * Prepare agent-specific spawn overrides for OS instruction injection.
     * Reads /etc/agentos/instructions.md from the VM filesystem (written at boot)
     * and returns extra CLI args and env vars to merge into the spawn call.
     *
     * IMPORTANT: Must extend (not replace) the user's existing config.
     * User-provided env vars and args always take priority — callers merge as:
     *   env: { ...prepareInstructions().env, ...userEnv }
     */
    prepareInstructions?(kernel: Kernel, cwd: string, additionalInstructions?: string, options?: PrepareInstructionsOptions): Promise<{
        args?: string[];
        env?: Record<string, string>;
    }>;
}
export type AgentType = "pi" | "pi-cli" | "opencode";
export declare const AGENT_CONFIGS: Record<AgentType, AgentConfig>;
