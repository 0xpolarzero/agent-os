// Session lifecycle management for ACP agent sessions
export class Session {
    _client;
    _sessionId;
    _agentType;
    _eventHandlers = [];
    _permissionHandlers = [];
    _modes;
    _models;
    _configOptions;
    _capabilities;
    _agentInfo;
    _events = [];
    _nextSequence = 0;
    _closed = false;
    _onClose;
    constructor(client, sessionId, agentType, initData, onClose) {
        this._client = client;
        this._sessionId = sessionId;
        this._agentType = agentType;
        this._onClose = onClose;
        this._modes = initData?.modes ?? null;
        this._models = initData?.models ?? null;
        this._configOptions = initData?.configOptions ?? [];
        this._capabilities = initData?.capabilities ?? {};
        this._agentInfo = initData?.agentInfo ?? null;
        // Forward notifications to appropriate handlers and store in event history
        const handler = (notification) => {
            // Store all notifications in event history
            this._events.push({
                sequenceNumber: this._nextSequence++,
                notification,
            });
            if (notification.method === "session/update") {
                for (const h of this._eventHandlers) {
                    h(notification);
                }
            }
            else if (notification.method === "request/permission") {
                const params = (notification.params ?? {});
                const request = {
                    permissionId: params.permissionId,
                    description: params.description,
                    params,
                };
                for (const h of this._permissionHandlers) {
                    h(request);
                }
            }
        };
        this._client.onNotification(handler);
    }
    get sessionId() {
        return this._sessionId;
    }
    get agentType() {
        return this._agentType;
    }
    /** Agent capability flags from the initialize response. */
    get capabilities() {
        return this._capabilities;
    }
    /** Agent identity information from the initialize response. */
    get agentInfo() {
        return this._agentInfo;
    }
    /** Whether this session has been closed. */
    get closed() {
        return this._closed;
    }
    _throwIfClosed() {
        if (this._closed) {
            throw new Error(`Session ${this._sessionId} is closed`);
        }
    }
    /**
     * Send a prompt to the agent and wait for the final response.
     * Session/update notifications arrive via onSessionEvent() while this resolves.
     */
    async prompt(text) {
        this._throwIfClosed();
        return this._client.request("session/prompt", {
            sessionId: this._sessionId,
            prompt: [{ type: "text", text }],
        });
    }
    /** Subscribe to session/update notifications from the agent. */
    onSessionEvent(handler) {
        this._eventHandlers.push(handler);
    }
    /** Remove a previously registered session event handler. */
    removeSessionEventHandler(handler) {
        const idx = this._eventHandlers.indexOf(handler);
        if (idx !== -1) {
            this._eventHandlers.splice(idx, 1);
        }
    }
    /** Subscribe to permission requests from the agent. */
    onPermissionRequest(handler) {
        this._permissionHandlers.push(handler);
    }
    /** Remove a previously registered permission request handler. */
    removePermissionRequestHandler(handler) {
        const idx = this._permissionHandlers.indexOf(handler);
        if (idx !== -1) {
            this._permissionHandlers.splice(idx, 1);
        }
    }
    /**
     * Respond to a permission request from the agent.
     * @param permissionId - The ID from the PermissionRequest
     * @param reply - 'once' to allow this action, 'always' to always allow, 'reject' to deny
     */
    async respondPermission(permissionId, reply) {
        this._throwIfClosed();
        return this._client.request("request/permission", {
            sessionId: this._sessionId,
            permissionId,
            reply,
        });
    }
    /**
     * Set the session mode (e.g., "plan", "normal").
     * Sends session/set_mode via ACP.
     */
    async setMode(modeId) {
        this._throwIfClosed();
        return this._client.request("session/set_mode", {
            sessionId: this._sessionId,
            modeId,
        });
    }
    /** Returns available modes from the agent's reported session state. */
    getModes() {
        return this._modes;
    }
    /**
     * Set the model for this session.
     * Sends session/set_model via ACP.
     */
    async setModel(model) {
        this._throwIfClosed();
        return this._client.request("session/set_model", {
            sessionId: this._sessionId,
            modelId: model,
        });
    }
    /** Returns the current model state reported by the agent. */
    getModelState() {
        return this._models;
    }
    /**
     * Set the thought/reasoning level for this session.
     * Finds the config option with category "thought_level" and sends session/set_config_option.
     */
    async setThoughtLevel(level) {
        return this._setConfigByCategory("thought_level", level);
    }
    /** Returns available config options from the agent's reported session state. */
    getConfigOptions() {
        return this._configOptions;
    }
    /**
     * Send session/set_config_option for a config option identified by category.
     * If no matching config option is found, sends with the category as the configId.
     */
    async _setConfigByCategory(category, value) {
        this._throwIfClosed();
        const option = this._configOptions.find((o) => o.category === category);
        const configId = option?.id ?? category;
        return this._client.request("session/set_config_option", {
            sessionId: this._sessionId,
            configId,
            value,
        });
    }
    /**
     * Returns the event history as an array of JsonRpcNotification objects.
     * Supports optional filtering by sequence number and method.
     */
    getEvents(options) {
        let events = this._events;
        const since = options?.since;
        const method = options?.method;
        if (since !== undefined) {
            events = events.filter((e) => e.sequenceNumber > since);
        }
        if (method !== undefined) {
            events = events.filter((e) => e.notification.method === method);
        }
        return events.map((e) => e.notification);
    }
    /**
     * Returns the full sequenced event history.
     * Each entry includes the notification and its sequence number.
     */
    getSequencedEvents(options) {
        let events = this._events;
        const since = options?.since;
        const method = options?.method;
        if (since !== undefined) {
            events = events.filter((e) => e.sequenceNumber > since);
        }
        if (method !== undefined) {
            events = events.filter((e) => e.notification.method === method);
        }
        return [...events];
    }
    /** Cancel ongoing agent work for this session. */
    async cancel() {
        this._throwIfClosed();
        return this._client.request("session/cancel", {
            sessionId: this._sessionId,
        });
    }
    /**
     * Send an arbitrary JSON-RPC request to the agent.
     * Automatically injects sessionId into params if not already present.
     * Use this for ACP methods that don't have typed wrappers yet.
     */
    async rawSend(method, params) {
        this._throwIfClosed();
        const mergedParams = { sessionId: this._sessionId, ...params };
        return this._client.request(method, mergedParams);
    }
    /** Kill the agent process and clear event history. */
    close() {
        if (this._closed)
            return;
        this._closed = true;
        this._events = [];
        this._client.close();
        this._onClose?.();
    }
}
