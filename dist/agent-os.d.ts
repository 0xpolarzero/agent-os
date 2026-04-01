import { type Kernel, type KernelExecOptions, type KernelExecResult, type ProcessInfo as KernelProcessInfo, type KernelSpawnOptions, type OpenShellOptions, type Permissions, type VirtualFileSystem, type VirtualStat } from "@secure-exec/core";
import { type ToolKit } from "./host-tools.js";
/** Process tree node: extends kernel ProcessInfo with child references. */
export interface ProcessTreeNode extends KernelProcessInfo {
    children: ProcessTreeNode[];
}
/** A directory entry with metadata. */
export interface DirEntry {
    /** Absolute path to the entry. */
    path: string;
    type: "file" | "directory" | "symlink";
    size: number;
}
/** Options for readdirRecursive(). */
export interface ReaddirRecursiveOptions {
    /** Maximum depth to recurse (0 = only immediate children). */
    maxDepth?: number;
    /** Directory names to skip. */
    exclude?: string[];
}
/** Entry for batch write operations. */
export interface BatchWriteEntry {
    path: string;
    content: string | Uint8Array;
}
/** Result of a single file in a batch write. */
export interface BatchWriteResult {
    path: string;
    success: boolean;
    error?: string;
}
/** Result of a single file in a batch read. */
export interface BatchReadResult {
    path: string;
    content: Uint8Array | null;
    error?: string;
}
/** Entry in the agent registry, describing an available agent type. */
export interface AgentRegistryEntry {
    id: AgentType;
    acpAdapter: string;
    agentPackage: string;
    installed: boolean;
}
import { type AgentType } from "./agents.js";
import { type SoftwareInput } from "./packages.js";
import type { ScheduleDriver } from "./cron/schedule-driver.js";
import type { CronEventHandler, CronJob, CronJobInfo, CronJobOptions } from "./cron/types.js";
import { type AgentCapabilities, type AgentInfo, type GetEventsOptions, type PermissionReply, type SequencedEvent, type SessionConfigOption, type SessionEventHandler, type SessionModelState, type SessionModeState, type PermissionRequestHandler } from "./session.js";
import type { JsonRpcResponse } from "./protocol.js";
/** Configuration for mounting a filesystem driver at a path. */
export interface MountConfig {
    /** Path inside the VM to mount at. */
    path: string;
    /** The filesystem driver to mount. */
    driver: VirtualFileSystem;
    /** If true, write operations throw EROFS. */
    readOnly?: boolean;
}
export interface AgentOsOptions {
    /**
     * Software to install in the VM. Each entry provides agents, tools,
     * or WASM commands. Any object with a `commandDir` property (e.g.,
     * registry packages like @rivet-dev/agent-os-coreutils) is treated
     * as a WASM command source automatically. Arrays are flattened, so
     * meta-packages that export arrays of sub-packages work directly.
     */
    software?: SoftwareInput[];
    /** Loopback ports to exempt from SSRF checks (for testing with host-side mock servers). */
    loopbackExemptPorts?: number[];
    /**
     * Host-side CWD for module access resolution. Sets the directory whose
     * node_modules are projected into the VM at /root/node_modules/.
     * Defaults to process.cwd().
     */
    moduleAccessCwd?: string;
    /** Filesystems to mount at boot time. */
    mounts?: MountConfig[];
    /** Additional instructions appended to the base OS instructions written to /etc/agentos/instructions.md. */
    additionalInstructions?: string;
    /** Custom schedule driver for cron jobs. Defaults to TimerScheduleDriver. */
    scheduleDriver?: ScheduleDriver;
    /** Host-side toolkits available to agents inside the VM. */
    toolKits?: ToolKit[];
    /**
     * Custom permission policy for the kernel. Controls access to filesystem,
     * network, child process, and environment operations. Defaults to allowAll.
     */
    permissions?: Permissions;
}
/** Configuration for a local MCP server (spawned as a child process). */
export interface McpServerConfigLocal {
    type: "local";
    /** Command to launch the MCP server. */
    command: string;
    /** Arguments for the command. */
    args?: string[];
    /** Environment variables for the server process. */
    env?: Record<string, string>;
}
/** Configuration for a remote MCP server (connected via URL). */
export interface McpServerConfigRemote {
    type: "remote";
    /** URL of the remote MCP server. */
    url: string;
    /** HTTP headers to include in requests to the server. */
    headers?: Record<string, string>;
}
export type McpServerConfig = McpServerConfigLocal | McpServerConfigRemote;
export interface CreateSessionOptions {
    /** Working directory for the agent session inside the VM. */
    cwd?: string;
    /** Environment variables to pass to the agent process. */
    env?: Record<string, string>;
    /** MCP servers to make available to the agent during the session. */
    mcpServers?: McpServerConfig[];
    /** Skip OS instructions injection entirely (default false). */
    skipOsInstructions?: boolean;
    /** Additional instructions appended to the base OS instructions. */
    additionalInstructions?: string;
}
export interface SessionInfo {
    sessionId: string;
    agentType: string;
}
/** Information about a process spawned via AgentOs.spawn(). */
export interface SpawnedProcessInfo {
    pid: number;
    command: string;
    args: string[];
    running: boolean;
    exitCode: number | null;
}
export declare class AgentOs {
    readonly kernel: Kernel;
    private _sessions;
    private _processes;
    private _shells;
    private _shellCounter;
    private _moduleAccessCwd;
    private _softwareRoots;
    private _softwareAgentConfigs;
    private _cronManager;
    private _toolsServer;
    private _toolKits;
    private _shimFs;
    private _env;
    private constructor();
    static create(options?: AgentOsOptions): Promise<AgentOs>;
    exec(command: string, options?: KernelExecOptions): Promise<KernelExecResult>;
    spawn(command: string, args: string[], options?: KernelSpawnOptions): {
        pid: number;
    };
    /** Write data to a process's stdin. */
    writeProcessStdin(pid: number, data: string | Uint8Array): void;
    /** Close a process's stdin stream. */
    closeProcessStdin(pid: number): void;
    /** Subscribe to stdout data from a process. Returns an unsubscribe function. */
    onProcessStdout(pid: number, handler: (data: Uint8Array) => void): () => void;
    /** Subscribe to stderr data from a process. Returns an unsubscribe function. */
    onProcessStderr(pid: number, handler: (data: Uint8Array) => void): () => void;
    /** Subscribe to process exit. Returns an unsubscribe function. */
    onProcessExit(pid: number, handler: (exitCode: number) => void): () => void;
    /** Wait for a process to exit. Returns the exit code. */
    waitProcess(pid: number): Promise<number>;
    readFile(path: string): Promise<Uint8Array>;
    writeFile(path: string, content: string | Uint8Array): Promise<void>;
    writeFiles(entries: BatchWriteEntry[]): Promise<BatchWriteResult[]>;
    readFiles(paths: string[]): Promise<BatchReadResult[]>;
    /** Recursively create directories (mkdir -p). */
    private _mkdirp;
    mkdir(path: string): Promise<void>;
    readdir(path: string): Promise<string[]>;
    readdirRecursive(path: string, options?: ReaddirRecursiveOptions): Promise<DirEntry[]>;
    stat(path: string): Promise<VirtualStat>;
    exists(path: string): Promise<boolean>;
    mountFs(path: string, driver: VirtualFileSystem, options?: {
        readOnly?: boolean;
    }): void;
    unmountFs(path: string): void;
    move(from: string, to: string): Promise<void>;
    delete(path: string, options?: {
        recursive?: boolean;
    }): Promise<void>;
    fetch(port: number, request: Request): Promise<Response>;
    openShell(options?: OpenShellOptions): {
        shellId: string;
    };
    /** Write data to a shell's PTY input. */
    writeShell(shellId: string, data: string | Uint8Array): void;
    /** Subscribe to data output from a shell. Returns an unsubscribe function. */
    onShellData(shellId: string, handler: (data: Uint8Array) => void): () => void;
    /** Notify a shell of terminal resize. */
    resizeShell(shellId: string, cols: number, rows: number): void;
    /** Kill a shell process and remove it from tracking. */
    closeShell(shellId: string): void;
    /** Returns info about all processes spawned via spawn(). */
    listProcesses(): SpawnedProcessInfo[];
    /** Returns all kernel processes across all runtimes (WASM, Node, Python). */
    allProcesses(): KernelProcessInfo[];
    /** Returns processes organized as a tree using ppid relationships. */
    processTree(): ProcessTreeNode[];
    /** Returns info about a specific process by PID. Throws if not found. */
    getProcess(pid: number): SpawnedProcessInfo;
    /** Send SIGTERM to gracefully stop a process. No-op if already exited. */
    stopProcess(pid: number): void;
    /** Send SIGKILL to force-kill a process. No-op if already exited. */
    killProcess(pid: number): void;
    /** Returns all active sessions with their IDs and agent types. */
    listSessions(): SessionInfo[];
    /** Internal helper: retrieve a session or throw. */
    private _requireSession;
    /** Returns all registered agents with their installation status. */
    listAgents(): AgentRegistryEntry[];
    /**
     * Spawn an ACP-compatible coding agent inside the VM and return a Session.
     *
     * 1. Resolves the adapter binary from mounted node_modules
     * 2. Spawns it with streaming stdin and stdout capture
     * 3. Sends initialize + session/new
     * 4. Returns a Session for prompt/cancel/close
     */
    createSession(agentType: AgentType | string, options?: CreateSessionOptions): Promise<{
        sessionId: string;
    }>;
    /**
     * Resolve the bin entry point of an ACP adapter package.
     * Reads from the host filesystem since kernel.readFile() does NOT see
     * the ModuleAccessFileSystem overlay. Returns the VFS path for spawning.
     */
    private _resolveAdapterBin;
    /**
     * Resolve an agent config by ID. Package-provided configs take
     * precedence over the hardcoded AGENT_CONFIGS.
     */
    private _resolveAgentConfig;
    /**
     * Verify a session exists and is active.
     * Throws if the session is not found.
     */
    resumeSession(sessionId: string): {
        sessionId: string;
    };
    /**
     * Gracefully destroy a session: cancel any pending work, close the client,
     * and remove from tracking. Unlike close() which is abrupt, this attempts
     * a graceful shutdown sequence.
     */
    destroySession(sessionId: string): Promise<void>;
    /** Send a prompt to the agent and wait for the final response. */
    prompt(sessionId: string, text: string): Promise<JsonRpcResponse>;
    /** Cancel ongoing agent work for a session. */
    cancelSession(sessionId: string): Promise<JsonRpcResponse>;
    /** Kill the agent process and clear event history for a session. */
    closeSession(sessionId: string): void;
    /** Returns the sequenced event history for a session. */
    getSessionEvents(sessionId: string, options?: GetEventsOptions): SequencedEvent[];
    /** Respond to a permission request from an agent. */
    respondPermission(sessionId: string, permissionId: string, reply: PermissionReply): Promise<JsonRpcResponse>;
    /** Set the session mode (e.g., "plan", "normal"). */
    setSessionMode(sessionId: string, modeId: string): Promise<JsonRpcResponse>;
    /** Returns available modes from the agent's reported capabilities. */
    getSessionModes(sessionId: string): SessionModeState | null;
    /** Returns the current model state reported by the agent. */
    getSessionModelState(sessionId: string): SessionModelState | null;
    /** Set the model for a session. */
    setSessionModel(sessionId: string, model: string): Promise<JsonRpcResponse>;
    /** Set the thought/reasoning level for a session. */
    setSessionThoughtLevel(sessionId: string, level: string): Promise<JsonRpcResponse>;
    /** Returns available config options for a session. */
    getSessionConfigOptions(sessionId: string): SessionConfigOption[];
    /** Returns the agent's capability flags for a session. */
    getSessionCapabilities(sessionId: string): AgentCapabilities | null;
    /** Returns agent identity information for a session. */
    getSessionAgentInfo(sessionId: string): AgentInfo | null;
    /** Send an arbitrary JSON-RPC request to a session's agent. */
    rawSessionSend(sessionId: string, method: string, params?: Record<string, unknown>): Promise<JsonRpcResponse>;
    /** Subscribe to session/update notifications for a session. Returns an unsubscribe function. */
    onSessionEvent(sessionId: string, handler: SessionEventHandler): () => void;
    /** Subscribe to permission requests for a session. Returns an unsubscribe function. */
    onPermissionRequest(sessionId: string, handler: PermissionRequestHandler): () => void;
    /** Schedule a cron job. Returns a handle with the job ID and a cancel method. */
    scheduleCron(options: CronJobOptions): CronJob;
    /** List all registered cron jobs. */
    listCronJobs(): CronJobInfo[];
    /** Cancel a cron job by ID. */
    cancelCronJob(id: string): void;
    /** Subscribe to cron lifecycle events (fire, complete, error). */
    onCronEvent(handler: CronEventHandler): void;
    dispose(): Promise<void>;
}
