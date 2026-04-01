import type { AgentConfig } from "./agents.js";
export interface SoftwareDescriptor {
    name: string;
    type: "agent" | "tool" | "wasm-commands";
}
export interface AgentSoftwareDescriptor extends SoftwareDescriptor {
    type: "agent";
    /**
     * Root directory of this npm package on the host. Used to resolve
     * dependencies listed in `requires` from this package's node_modules/.
     */
    packageDir: string;
    /** npm packages that must be available inside the VM. */
    requires: string[];
    agent: {
        /** Unique agent ID used in createSession(id). */
        id: string;
        /** npm package name of the ACP adapter. Must be in requires. */
        acpAdapter: string;
        /** npm package name of the agent CLI. Must be in requires. */
        agentPackage: string;
        /** Static env vars passed when spawning the adapter. */
        staticEnv?: Record<string, string>;
        /** Dynamic env vars computed at boot time. */
        env?: (ctx: SoftwareContext) => Record<string, string>;
        /**
         * Prepare agent-specific spawn overrides for OS instruction injection.
         * When provided, replaces the default instruction injection behavior.
         */
        prepareInstructions?: AgentConfig["prepareInstructions"];
    };
}
export interface ToolSoftwareDescriptor extends SoftwareDescriptor {
    type: "tool";
    /**
     * Root directory of this npm package on the host. Used to resolve
     * dependencies listed in `requires` from this package's node_modules/.
     */
    packageDir: string;
    /** npm packages that must be available inside the VM. */
    requires: string[];
    /** Map of bin command name -> npm package name. */
    bins: Record<string, string>;
}
export interface WasmCommandSoftwareDescriptor extends SoftwareDescriptor {
    type: "wasm-commands";
    /** Absolute path to directory containing WASM command binaries on the host. */
    commandDir: string;
    /** Symlink aliases: aliasName -> targetCommandName. */
    aliases?: Record<string, string>;
    /** Permission tier assignments. */
    permissions?: {
        full?: string[];
        readWrite?: string[];
        readOnly?: string[] | "*";
    };
}
/**
 * Any object with a commandDir property is treated as a WASM command package.
 * This allows registry packages (e.g., @rivet-dev/agent-os-coreutils) to be
 * passed directly to the `software` option without wrapping.
 */
export interface WasmCommandDirDescriptor {
    readonly commandDir: string;
    [key: string]: unknown;
}
export type AnySoftwareDescriptor = AgentSoftwareDescriptor | ToolSoftwareDescriptor | WasmCommandSoftwareDescriptor | WasmCommandDirDescriptor;
/** Input type for the `software` option. Accepts descriptors or arrays of descriptors (for meta-packages). */
export type SoftwareInput = AnySoftwareDescriptor | AnySoftwareDescriptor[];
export interface SoftwareContext {
    /**
     * Resolve the bin entry for an npm package to a VM-side path.
     * Uses require.resolve on the HOST, then maps to /root/node_modules/...
     *
     * Example: ctx.resolveBin("@mariozechner/pi-coding-agent", "pi")
     *   -> "/root/node_modules/@mariozechner/pi-coding-agent/dist/cli.js"
     */
    resolveBin(packageName: string, binName?: string): string;
    /**
     * Resolve a package's root directory to a VM-side path.
     *
     * Example: ctx.resolvePackage("pi-acp")
     *   -> "/root/node_modules/pi-acp"
     */
    resolvePackage(packageName: string): string;
}
/** Host-to-VM path mapping for ModuleAccessFileSystem. */
export interface SoftwareRoot {
    hostPath: string;
    vmPath: string;
}
/**
 * Define a software descriptor. This is a type-safe identity function that
 * validates the descriptor shape at compile time.
 */
export declare function defineSoftware<T extends AnySoftwareDescriptor>(desc: T): T;
/** Result of processing all software descriptors at boot time. */
export interface ProcessedSoftware {
    /** WASM command directories to pass to the WasmVM driver. */
    commandDirs: string[];
    /** Host-to-VM path mappings for ModuleAccessFileSystem. */
    softwareRoots: SoftwareRoot[];
    /** Agent configs registered by agent software. */
    agentConfigs: Map<string, AgentConfig>;
}
/**
 * Process an array of software descriptors at boot time.
 * Collects WASM command dirs, module access roots, and agent configurations.
 *
 * Any object with a `commandDir` property (e.g., registry packages) is treated
 * as a WASM command source. Typed descriptors with `type: "agent"` or `type: "tool"`
 * are processed for module mounting and agent registration.
 */
export declare function processSoftware(software: SoftwareInput[]): ProcessedSoftware;
