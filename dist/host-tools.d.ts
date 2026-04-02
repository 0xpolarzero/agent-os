import type { ZodType } from "zod";
/** Maximum length for tool and toolkit descriptions (characters). */
export declare const MAX_TOOL_DESCRIPTION_LENGTH = 200;
/**
 * A single tool that executes on the host.
 * Mirrors the shape of AI SDK's tool() but with host-execution semantics.
 */
export interface HostTool<INPUT = any, OUTPUT = any> {
    /** Description shown to the agent in --help and prompt docs. Max 200 characters. */
    description: string;
    /** Zod schema for the input. Drives CLI flag generation and validation. */
    inputSchema: ZodType<INPUT>;
    /** Runs on the host when the agent invokes the tool. */
    execute: (input: INPUT) => Promise<OUTPUT> | OUTPUT;
    /** Examples included in auto-generated prompt docs. */
    examples?: ToolExample<INPUT>[];
    /** Timeout in ms. Default: 30000. */
    timeout?: number;
}
export interface ToolExample<INPUT = any> {
    /** Human description of what this example does. */
    description: string;
    /** The input args for the example. */
    input: INPUT;
}
/**
 * A named group of tools. Becomes a CLI binary: agentos-{name}.
 */
export interface ToolKit {
    /** Toolkit name. Must be lowercase alphanumeric + hyphens. Becomes the CLI suffix: agentos-{name}. */
    name: string;
    /** Description shown in `agentos list-tools` and prompt docs. */
    description: string;
    /** The tools in this toolkit. Keys become subcommands. */
    tools: Record<string, HostTool>;
}
/** Helper to create a HostTool with type inference. */
export declare function hostTool<INPUT, OUTPUT>(def: HostTool<INPUT, OUTPUT>): HostTool<INPUT, OUTPUT>;
/** Helper to create a ToolKit. */
export declare function toolKit(def: ToolKit): ToolKit;
/**
 * Validate all description lengths in the given toolkits.
 * Throws if any toolkit or tool description exceeds MAX_TOOL_DESCRIPTION_LENGTH.
 */
export declare function validateToolkits(toolKits: ToolKit[]): void;
