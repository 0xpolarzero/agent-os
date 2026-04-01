#!/usr/bin/env node

/**
 * Pi SDK ACP Adapter
 *
 * ACP-compliant adapter that embeds the Pi coding agent SDK directly
 * instead of spawning a subprocess. This avoids loading ~100MB of TUI
 * code that the CLI pulls in even in headless mode.
 *
 * Speaks ACP JSON-RPC over stdin/stdout using @agentclientprotocol/sdk.
 * Internally calls createAgentSession() from @mariozechner/pi-coding-agent.
 */

import {
	type Agent,
	AgentSideConnection,
	RequestError,
	ndJsonStream,
} from "@agentclientprotocol/sdk";
import type {
	AuthenticateRequest,
	AuthenticateResponse,
	CancelNotification,
	InitializeRequest,
	InitializeResponse,
	ModelInfo,
	NewSessionRequest,
	NewSessionResponse,
	PromptRequest,
	PromptResponse,
	SessionConfigOption,
	SessionModelState,
	SessionNotification,
	SetSessionConfigOptionRequest,
	SetSessionConfigOptionResponse,
	SetSessionModelRequest,
	SetSessionModelResponse,
	SetSessionModeRequest,
	SetSessionModeResponse,
} from "@agentclientprotocol/sdk";
import type { AgentSessionEvent } from "@mariozechner/pi-coding-agent";
import {
	SessionManager,
	createAgentSession,
} from "@mariozechner/pi-coding-agent";
import type { AgentSession } from "@mariozechner/pi-coding-agent";
import type { Api, Model } from "@mariozechner/pi-ai";
import { isAbsolute, resolve as resolvePath } from "node:path";
import { readFileSync } from "node:fs";

const MODEL_CONFIG_ID = "model";
const THOUGHT_LEVEL_CONFIG_ID = "thought_level";

// ── CLI argument parsing ────────────────────────────────────────────

let appendSystemPrompt: string | undefined;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
	if (argv[i] === "--append-system-prompt" && i + 1 < argv.length) {
		appendSystemPrompt = argv[i + 1];
		i++;
	}
}

function toAcpModelId(model: Model<Api>): string {
	return `${model.provider}/${model.id}`;
}

function toModelInfo(model: Model<Api>): ModelInfo {
	return {
		modelId: toAcpModelId(model),
		name: model.name,
		description: `Provider: ${model.provider}`,
	};
}

// ── Agent implementation ────────────────────────────────────────────

class PiSdkAgent implements Agent {
	private conn: AgentSideConnection;
	private session: AgentSession | null = null;
	private sessionId = "";
	private cwd = "/home/user";
	private cancelRequested = false;
	private currentToolCalls = new Map<string, string>();
	private editSnapshots = new Map<
		string,
		{ path: string; oldText: string }
	>();
	private lastEmit: Promise<void> = Promise.resolve();

	constructor(conn: AgentSideConnection) {
		this.conn = conn;
	}

	async initialize(
		_params: InitializeRequest,
	): Promise<InitializeResponse> {
		return {
			protocolVersion: 1,
			agentInfo: {
				name: "pi-sdk-acp",
				title: "Pi SDK ACP adapter",
				version: "0.1.0",
			},
			agentCapabilities: {
				promptCapabilities: {
					image: true,
					audio: false,
					embeddedContext: false,
				},
			},
		};
	}

	async newSession(
		params: NewSessionRequest,
	): Promise<NewSessionResponse> {
		this.cwd = params.cwd;

		const { session } = await createAgentSession({
			cwd: params.cwd,
			sessionManager: SessionManager.inMemory(),
			...(appendSystemPrompt
				? {
						resourceLoader: new (
							await import("@mariozechner/pi-coding-agent")
						).DefaultResourceLoader({
							cwd: params.cwd,
							appendSystemPrompt,
						}),
					}
				: {}),
		});

		this.session = session;
		this.sessionId = session.sessionId;

		// Subscribe to Pi SDK events and translate to ACP notifications
		session.subscribe((event) => this.handlePiEvent(event));

		const models = await this.buildModelState(session);
		const configOptions = await this.buildConfigOptions(session, models);

		return {
			sessionId: this.sessionId,
			modes: this.buildModeState(session),
			configOptions,
			...(models ? { models } : {}),
		};
	}

	async prompt(params: PromptRequest): Promise<PromptResponse> {
		if (!this.session) {
			throw new Error("No session created");
		}

		this.cancelRequested = false;
		this.currentToolCalls.clear();

		// Extract text from prompt parts
		const promptParts = params.prompt ?? [];
		const text = promptParts
			.map((p: { type?: string; text?: string }) =>
				p.type === "text" ? (p.text ?? "") : "",
			)
			.join("");

		// session.prompt() resolves when the agent loop completes.
		// Events fire via subscribe() during execution and are translated
		// to ACP notifications in handlePiEvent().
		try {
			await this.session.prompt(text);
		} catch {
			// Prompt may throw on abort or error
		}

		// Flush any pending notifications before returning the response
		await this.lastEmit;

		const stopReason = this.cancelRequested ? "cancelled" : "end_turn";
		return {
			stopReason: stopReason as PromptResponse["stopReason"],
		};
	}

	async cancel(_params: CancelNotification): Promise<void> {
		this.cancelRequested = true;
		await this.session?.abort();
	}

	async setSessionMode(
		params: SetSessionModeRequest,
	): Promise<SetSessionModeResponse | void> {
		const session = this.requireSession(params.sessionId);
		const availableModes = session.getAvailableThinkingLevels();
		const matchedMode = availableModes.find(
			(modeId) => modeId === params.modeId,
		);
		if (!matchedMode) {
			throw RequestError.invalidParams(
				{
					modeId: params.modeId,
					availableModes,
				},
				`Unsupported mode "${params.modeId}"`,
			);
		}

		session.setThinkingLevel(matchedMode);
		await this.emitModeAndConfigUpdates(session);
		return {};
	}

	async unstable_setSessionModel(
		params: SetSessionModelRequest,
	): Promise<SetSessionModelResponse | void> {
		const session = this.requireSession(params.sessionId);
		const requestedModelId = String(params.modelId);
		const currentModel = session.model;
		if (currentModel && toAcpModelId(currentModel) === requestedModelId) {
			return {};
		}

		const model = await this.resolveModel(requestedModelId, session);
		await session.setModel(model);
		await this.emitModeAndConfigUpdates(session);
		return {};
	}

	async setSessionConfigOption(
		params: SetSessionConfigOptionRequest,
	): Promise<SetSessionConfigOptionResponse> {
		const session = this.requireSession(params.sessionId);

		if (params.configId === MODEL_CONFIG_ID) {
			const model = this.requireSelectValue(params, MODEL_CONFIG_ID);
			return this.setModelConfigOption(session, model);
		}

		if (params.configId === THOUGHT_LEVEL_CONFIG_ID) {
			const thinkingLevel = this.requireSelectValue(
				params,
				THOUGHT_LEVEL_CONFIG_ID,
			);
			const availableLevels = session.getAvailableThinkingLevels();
			const matchedLevel = availableLevels.find(
				(level) => level === thinkingLevel,
			);
			if (!matchedLevel) {
				throw RequestError.invalidParams(
					{
						configId: params.configId,
						value: thinkingLevel,
						availableValues: availableLevels,
					},
					`Unsupported thinking level "${thinkingLevel}"`,
				);
			}

			session.setThinkingLevel(matchedLevel);
			const configOptions = await this.buildConfigOptions(session);
			await this.emitModeAndConfigUpdates(session, configOptions);
			return { configOptions };
		}

		throw RequestError.invalidParams(
			{ configId: params.configId },
			`Unsupported config option "${params.configId}"`,
		);
	}

	async authenticate(
		_params: AuthenticateRequest,
	): Promise<AuthenticateResponse | void> {
		// Auth handled via env vars (ANTHROPIC_API_KEY)
	}

	private async buildModelState(
		session: AgentSession,
	): Promise<SessionModelState | undefined> {
		if (!session.model) return undefined;

		const currentModel = session.model;
		const availableModels = await session.modelRegistry.getAvailable();
		const modelInfos = new Map<string, ModelInfo>();

		for (const model of [currentModel, ...availableModels]) {
			modelInfos.set(toAcpModelId(model), toModelInfo(model));
		}

		return {
			currentModelId: toAcpModelId(currentModel),
			availableModels: Array.from(modelInfos.values()),
		};
	}

	private async resolveModel(
		modelId: string,
		session: AgentSession = this.session ?? null,
	): Promise<Model<Api>> {
		if (!session) {
			throw RequestError.invalidRequest(undefined, "No session created");
		}

		const slashIndex = modelId.indexOf("/");
		if (slashIndex !== -1) {
			const provider = modelId.slice(0, slashIndex);
			const providerModelId = modelId.slice(slashIndex + 1);
			const match = session.modelRegistry.find(provider, providerModelId);
			if (!match) {
				throw RequestError.invalidParams(
					{ modelId },
					`Unknown model: ${modelId}`,
				);
			}

			const apiKey = await session.modelRegistry.getApiKey(match);
			if (!apiKey) {
				throw RequestError.invalidParams(
					{ modelId },
					`Model is unavailable without credentials: ${modelId}`,
				);
			}

			return match;
		}

		const availableModels = await session.modelRegistry.getAvailable();
		const matches = availableModels.filter((model) => model.id === modelId);
		if (matches.length === 0) {
			throw RequestError.invalidParams(
				{ modelId },
				`Unknown model: ${modelId}`,
			);
		}
		if (matches.length > 1) {
			throw RequestError.invalidParams(
				{ modelId },
				`Ambiguous model ID "${modelId}". Use "provider/modelId" instead.`,
			);
		}

		return matches[0];
	}

	// ── Event translation ───────────────────────────────────────────

	private requireSession(sessionId: string): AgentSession {
		if (!this.session) {
			throw RequestError.invalidRequest(
				{ sessionId },
				"No active session",
			);
		}
		if (sessionId !== this.sessionId) {
			throw RequestError.invalidParams(
				{ sessionId },
				`Unknown session "${sessionId}"`,
			);
		}
		return this.session;
	}

	private requireSelectValue(
		params: SetSessionConfigOptionRequest,
		configId: string,
	): string {
		if ("type" in params && params.type === "boolean") {
			throw RequestError.invalidParams(
				{ configId, value: params.value },
				`Config option "${configId}" expects a select value`,
			);
		}
		return String(params.value);
	}

	private async setModelConfigOption(
		session: AgentSession,
		requestedModelId: string,
	): Promise<SetSessionConfigOptionResponse> {
		const currentModel = session.model;
		if (currentModel && toAcpModelId(currentModel) === requestedModelId) {
			return {
				configOptions: await this.buildConfigOptions(session),
			};
		}

		const model = await this.resolveModel(requestedModelId, session);
		await session.setModel(model);
		const configOptions = await this.buildConfigOptions(session);
		await this.emitModeAndConfigUpdates(session, configOptions);
		return { configOptions };
	}

	private async emitModeAndConfigUpdates(
		session: AgentSession,
		configOptions?: SessionConfigOption[],
	): Promise<void> {
		const resolvedConfigOptions =
			configOptions ?? (await this.buildConfigOptions(session));
		const modes = this.buildModeState(session);
		await this.emit({
			sessionUpdate: "current_mode_update",
			currentModeId: modes.currentModeId,
		});
		await this.emit({
			sessionUpdate: "config_option_update",
			configOptions: resolvedConfigOptions,
		});
	}

	private buildModeState(session: AgentSession): NewSessionResponse["modes"] {
		const availableModes = session.getAvailableThinkingLevels();
		const currentModeId =
			availableModes.find((modeId) => modeId === session.thinkingLevel) ??
			availableModes[0] ??
			"off";
		return {
			currentModeId,
			availableModes: availableModes.map((modeId) => ({
				id: modeId,
				name: `Thinking: ${modeId}`,
			})),
		};
	}

	private async buildConfigOptions(
		session: AgentSession,
		modelState?: SessionModelState,
	): Promise<SessionConfigOption[]> {
		const configOptions: SessionConfigOption[] = [];
		const resolvedModelState =
			modelState ?? (await this.buildModelState(session));
		if (resolvedModelState) {
			configOptions.push({
				type: "select",
				id: MODEL_CONFIG_ID,
				name: "Model",
				category: "model",
				currentValue: resolvedModelState.currentModelId,
				options: resolvedModelState.availableModels.map((model) => ({
					value: model.modelId,
					name: model.name,
					description: model.description,
				})),
			});
		}

		const availableLevels = session.getAvailableThinkingLevels();
		const currentThinkingLevel =
			availableLevels.find((level) => level === session.thinkingLevel) ??
			availableLevels[0] ??
			"off";
		configOptions.push({
			type: "select",
			id: THOUGHT_LEVEL_CONFIG_ID,
			name: "Thinking Level",
			category: "thought_level",
			currentValue: currentThinkingLevel,
			options: availableLevels.map((level) => ({
				value: level,
				name: level,
			})),
		});

		return configOptions;
	}

	private emit(update: SessionNotification["update"]): Promise<void> {
		this.lastEmit = this.lastEmit
			.then(() =>
				this.conn.sessionUpdate({
					sessionId: this.sessionId,
					update,
				}),
			)
			.catch(() => {});
		return this.lastEmit;
	}

	private handlePiEvent(event: AgentSessionEvent): void {
		switch (event.type) {
			case "message_update": {
				const ame = event.assistantMessageEvent;
				if (!ame) break;

				if (ame.type === "text_delta" && "delta" in ame) {
					this.emit({
						sessionUpdate: "agent_message_chunk",
						content: {
							type: "text",
							text: String((ame as { delta: string }).delta),
						},
					});
				} else if (ame.type === "thinking_delta" && "delta" in ame) {
					this.emit({
						sessionUpdate: "agent_thought_chunk",
						content: {
							type: "text",
							text: String((ame as { delta: string }).delta),
						},
					});
				} else if (
					ame.type === "toolcall_start" ||
					ame.type === "toolcall_delta" ||
					ame.type === "toolcall_end"
				) {
					this.handleToolCallMessage(ame);
				}
				break;
			}

			case "tool_execution_start":
				this.handleToolExecutionStart(event);
				break;

			case "tool_execution_update":
				this.handleToolExecutionUpdate(event);
				break;

			case "tool_execution_end":
				this.handleToolExecutionEnd(event);
				break;

			case "agent_end":
				// Agent loop finished. Notifications are flushed in prompt().
				break;
		}
	}

	private handleToolCallMessage(ame: Record<string, unknown>): void {
		const toolCall =
			(ame.toolCall as Record<string, unknown>) ??
			(
				(ame.partial as Record<string, unknown>)
					?.content as Array<Record<string, unknown>>
			)?.[(ame.contentIndex as number) ?? 0];

		if (!toolCall) return;

		const toolCallId = String(toolCall.id ?? "");
		const toolName = String(toolCall.name ?? "tool");

		if (!toolCallId) return;

		const rawInput = this.parseToolArgs(toolCall);
		const locations = this.toToolCallLocations(rawInput);
		const existingStatus = this.currentToolCalls.get(toolCallId);
		const status = existingStatus ?? "pending";

		if (!existingStatus) {
			this.currentToolCalls.set(toolCallId, "pending");
			this.emit({
				sessionUpdate: "tool_call",
				toolCallId,
				title: toolName,
				kind: toToolKind(toolName),
				status: status as "pending",
				locations,
				rawInput,
			});
		} else {
			this.emit({
				sessionUpdate: "tool_call_update",
				toolCallId,
				status: status as "pending",
				locations,
				rawInput,
			});
		}
	}

	private handleToolExecutionStart(event: {
		toolCallId: string;
		toolName: string;
		args: unknown;
	}): void {
		const { toolCallId, toolName, args } = event;
		const rawInput = args as Record<string, unknown> | undefined;

		// Snapshot for edit diff support
		if (toolName === "edit" && rawInput) {
			const p =
				typeof rawInput.path === "string" ? rawInput.path : undefined;
			if (p) {
				try {
					const abs = isAbsolute(p)
						? p
						: resolvePath(this.cwd, p);
					const oldText = readFileSync(abs, "utf8");
					this.editSnapshots.set(toolCallId, {
						path: p,
						oldText,
					});
				} catch {
					// File may not exist
				}
			}
		}

		const locations = this.toToolCallLocations(rawInput);

		if (!this.currentToolCalls.has(toolCallId)) {
			this.currentToolCalls.set(toolCallId, "in_progress");
			this.emit({
				sessionUpdate: "tool_call",
				toolCallId,
				title: toolName,
				kind: toToolKind(toolName),
				status: "in_progress",
				locations,
				rawInput,
			});
		} else {
			this.currentToolCalls.set(toolCallId, "in_progress");
			this.emit({
				sessionUpdate: "tool_call_update",
				toolCallId,
				status: "in_progress",
				locations,
				rawInput,
			});
		}
	}

	private handleToolExecutionUpdate(event: {
		toolCallId: string;
		partialResult: unknown;
	}): void {
		const { toolCallId, partialResult } = event;
		const text = toolResultToText(partialResult);

		this.emit({
			sessionUpdate: "tool_call_update",
			toolCallId,
			status: "in_progress",
			content: text
				? [{ type: "content", content: { type: "text", text } }]
				: undefined,
			rawOutput: partialResult as Record<string, unknown>,
		});
	}

	private handleToolExecutionEnd(event: {
		toolCallId: string;
		result: unknown;
		isError: boolean;
	}): void {
		const { toolCallId, result, isError } = event;
		const text = toolResultToText(result);
		const snapshot = this.editSnapshots.get(toolCallId);

		let content:
			| Array<
					| { type: "diff"; path: string; oldText: string; newText: string }
					| { type: "content"; content: { type: "text"; text: string } }
				>
			| undefined;

		// Generate diff for edit tool
		if (!isError && snapshot) {
			try {
				const abs = isAbsolute(snapshot.path)
					? snapshot.path
					: resolvePath(this.cwd, snapshot.path);
				const newText = readFileSync(abs, "utf8");
				if (newText !== snapshot.oldText) {
					content = [
						{
							type: "diff" as const,
							path: snapshot.path,
							oldText: snapshot.oldText,
							newText,
						},
						...(text
							? [
									{
										type: "content" as const,
										content: { type: "text" as const, text },
									},
								]
							: []),
					];
				}
			} catch {
				// File may have been deleted
			}
		}

		if (!content && text) {
			content = [
				{ type: "content" as const, content: { type: "text" as const, text } },
			];
		}

		this.emit({
			sessionUpdate: "tool_call_update",
			toolCallId,
			status: isError ? "failed" : "completed",
			content,
			rawOutput: result as Record<string, unknown>,
		});

		this.currentToolCalls.delete(toolCallId);
		this.editSnapshots.delete(toolCallId);
	}

	// ── Helpers ──────────────────────────────────────────────────────

	private parseToolArgs(
		toolCall: Record<string, unknown>,
	): Record<string, unknown> | undefined {
		if (
			toolCall.arguments &&
			typeof toolCall.arguments === "object"
		) {
			return toolCall.arguments as Record<string, unknown>;
		}
		const s = String(toolCall.partialArgs ?? "");
		if (!s) return undefined;
		try {
			return JSON.parse(s);
		} catch {
			return { partialArgs: s };
		}
	}

	private toToolCallLocations(
		args: Record<string, unknown> | undefined,
	): Array<{ path: string; line?: number }> | undefined {
		const path =
			typeof args?.path === "string" ? args.path : undefined;
		if (!path) return undefined;
		const resolvedPath = isAbsolute(path)
			? path
			: resolvePath(this.cwd, path);
		return [{ path: resolvedPath }];
	}
}

// ── Standalone helpers ──────────────────────────────────────────────

function toToolKind(
	toolName: string,
): "read" | "edit" | "other" {
	if (toolName === "read") return "read";
	if (toolName === "write" || toolName === "edit") return "edit";
	return "other";
}

function toolResultToText(result: unknown): string {
	if (!result) return "";
	const r = result as Record<string, unknown>;
	const content = r.content;
	if (Array.isArray(content)) {
		const texts = content
			.map((c: Record<string, unknown>) =>
				c?.type === "text" && typeof c.text === "string"
					? c.text
					: "",
			)
			.filter(Boolean);
		if (texts.length) return texts.join("");
	}
	const details = r.details as Record<string, unknown> | undefined;
	const stdout =
		(typeof details?.stdout === "string" ? details.stdout : undefined) ??
		(typeof r.stdout === "string" ? r.stdout : undefined) ??
		(typeof details?.output === "string" ? details.output : undefined) ??
		(typeof r.output === "string" ? r.output : undefined);
	const stderr =
		(typeof details?.stderr === "string" ? details.stderr : undefined) ??
		(typeof r.stderr === "string" ? r.stderr : undefined);
	const exitCode =
		(typeof details?.exitCode === "number"
			? details.exitCode
			: undefined) ??
		(typeof r.exitCode === "number" ? r.exitCode : undefined) ??
		(typeof details?.code === "number" ? details.code : undefined) ??
		(typeof r.code === "number" ? r.code : undefined);

	if (
		(typeof stdout === "string" && stdout.trim()) ||
		(typeof stderr === "string" && stderr.trim())
	) {
		const parts: string[] = [];
		if (typeof stdout === "string" && stdout.trim()) parts.push(stdout);
		if (typeof stderr === "string" && stderr.trim())
			parts.push(`stderr:\n${stderr}`);
		if (typeof exitCode === "number")
			parts.push(`exit code: ${exitCode}`);
		return parts.join("\n\n").trimEnd();
	}

	try {
		return JSON.stringify(result, null, 2);
	} catch {
		return String(result);
	}
}

// ── Entry point ─────────────────────────────────────────────────────

const input = new WritableStream<Uint8Array>({
	write(chunk) {
		return new Promise<void>((resolve) => {
			process.stdout.write(chunk, () => resolve());
		});
	},
});

const output = new ReadableStream<Uint8Array>({
	start(controller) {
		process.stdin.on("data", (chunk: Buffer) => {
			controller.enqueue(new Uint8Array(chunk));
		});
		process.stdin.on("end", () => controller.close());
		process.stdin.on("error", (err: Error) => controller.error(err));
	},
});

const stream = ndJsonStream(input, output);
const _connection = new AgentSideConnection(
	(conn) => new PiSdkAgent(conn),
	stream,
);

// Keep process alive
process.stdin.resume();

// Shutdown on stdin close
process.stdin.on("end", () => {
	process.exit(0);
});
