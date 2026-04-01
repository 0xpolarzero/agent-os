import type { AcpClient } from "./acp-client.js";
import type { JsonRpcNotification, JsonRpcResponse } from "./protocol.js";
export type SessionEventHandler = (event: JsonRpcNotification) => void;
/** Permission request from an agent (e.g., before running a shell command or editing a file). */
export interface PermissionRequest {
    /** Unique identifier for this permission request. */
    permissionId: string;
    /** Description of what the agent wants to do. */
    description?: string;
    /** The raw params from the JSON-RPC notification. */
    params: Record<string, unknown>;
}
/** Reply to a permission request. */
export type PermissionReply = "once" | "always" | "reject";
export type PermissionRequestHandler = (request: PermissionRequest) => void;
/** A mode the agent supports (e.g., "plan", "normal", "full-access"). */
export interface SessionMode {
    id: string;
    label?: string;
    description?: string;
}
/** Current mode state reported by the agent. */
export interface SessionModeState {
    currentModeId: string;
    availableModes: SessionMode[];
}
/** A model the agent supports for a session. */
export interface SessionModel {
    modelId: string;
    name: string;
    description?: string;
}
/** Current model state reported by the agent. */
export interface SessionModelState {
    currentModelId: string;
    availableModels: SessionModel[];
}
/** A configuration option the agent supports. */
export interface SessionConfigOption {
    id: string;
    category?: string;
    label?: string;
    description?: string;
    currentValue?: string;
    allowedValues?: Array<{
        id: string;
        label?: string;
    }>;
}
/** Boolean capability flags reported by the agent during initialize. */
export interface AgentCapabilities {
    permissions?: boolean;
    plan_mode?: boolean;
    questions?: boolean;
    tool_calls?: boolean;
    text_messages?: boolean;
    images?: boolean;
    file_attachments?: boolean;
    session_lifecycle?: boolean;
    error_events?: boolean;
    reasoning?: boolean;
    status?: boolean;
    streaming_deltas?: boolean;
    mcp_tools?: boolean;
}
/** Agent identity information from the initialize response. */
export interface AgentInfo {
    name: string;
    version?: string;
}
/** Options for constructing a Session, including capabilities from initialize/session-new. */
export interface SessionInitData {
    modes?: SessionModeState;
    models?: SessionModelState;
    configOptions?: SessionConfigOption[];
    capabilities?: AgentCapabilities;
    agentInfo?: AgentInfo;
}
/** A notification with an assigned sequence number for ordering. */
export interface SequencedEvent {
    sequenceNumber: number;
    notification: JsonRpcNotification;
}
/** Options for filtering event history. */
export interface GetEventsOptions {
    /** Return only events with sequence number greater than this value. */
    since?: number;
    /** Return only events with this JSON-RPC method. */
    method?: string;
}
export declare class Session {
    private _client;
    private _sessionId;
    private _agentType;
    private _eventHandlers;
    private _permissionHandlers;
    private _modes;
    private _models;
    private _configOptions;
    private _capabilities;
    private _agentInfo;
    private _events;
    private _nextSequence;
    private _closed;
    private _onClose?;
    constructor(client: AcpClient, sessionId: string, agentType: string, initData?: SessionInitData, onClose?: () => void);
    get sessionId(): string;
    get agentType(): string;
    /** Agent capability flags from the initialize response. */
    get capabilities(): AgentCapabilities;
    /** Agent identity information from the initialize response. */
    get agentInfo(): AgentInfo | null;
    /** Whether this session has been closed. */
    get closed(): boolean;
    private _throwIfClosed;
    /**
     * Send a prompt to the agent and wait for the final response.
     * Session/update notifications arrive via onSessionEvent() while this resolves.
     */
    prompt(text: string): Promise<JsonRpcResponse>;
    /** Subscribe to session/update notifications from the agent. */
    onSessionEvent(handler: SessionEventHandler): void;
    /** Remove a previously registered session event handler. */
    removeSessionEventHandler(handler: SessionEventHandler): void;
    /** Subscribe to permission requests from the agent. */
    onPermissionRequest(handler: PermissionRequestHandler): void;
    /** Remove a previously registered permission request handler. */
    removePermissionRequestHandler(handler: PermissionRequestHandler): void;
    /**
     * Respond to a permission request from the agent.
     * @param permissionId - The ID from the PermissionRequest
     * @param reply - 'once' to allow this action, 'always' to always allow, 'reject' to deny
     */
    respondPermission(permissionId: string, reply: PermissionReply): Promise<JsonRpcResponse>;
    /**
     * Set the session mode (e.g., "plan", "normal").
     * Sends session/set_mode via ACP.
     */
    setMode(modeId: string): Promise<JsonRpcResponse>;
    /** Returns available modes from the agent's reported capabilities. */
    getModes(): SessionModeState | null;
    /**
     * Set the model for this session.
     * Sends session/set_model via ACP.
     */
    setModel(model: string): Promise<JsonRpcResponse>;
    /** Returns the current model state reported by the agent. */
    getModelState(): SessionModelState | null;
    /**
     * Set the thought/reasoning level for this session.
     * Finds the config option with category "thought_level" and sends session/set_config_option.
     */
    setThoughtLevel(level: string): Promise<JsonRpcResponse>;
    /** Returns available config options from the agent. */
    getConfigOptions(): SessionConfigOption[];
    /**
     * Send session/set_config_option for a config option identified by category.
     * If no matching config option is found, sends with the category as the configId.
     */
    private _setConfigByCategory;
    /**
     * Returns the event history as an array of JsonRpcNotification objects.
     * Supports optional filtering by sequence number and method.
     */
    getEvents(options?: GetEventsOptions): JsonRpcNotification[];
    /**
     * Returns the full sequenced event history.
     * Each entry includes the notification and its sequence number.
     */
    getSequencedEvents(options?: GetEventsOptions): SequencedEvent[];
    /** Cancel ongoing agent work for this session. */
    cancel(): Promise<JsonRpcResponse>;
    /**
     * Send an arbitrary JSON-RPC request to the agent.
     * Automatically injects sessionId into params if not already present.
     * Use this for ACP methods that don't have typed wrappers yet.
     */
    rawSend(method: string, params?: Record<string, unknown>): Promise<JsonRpcResponse>;
    /** Kill the agent process and clear event history. */
    close(): void;
}
