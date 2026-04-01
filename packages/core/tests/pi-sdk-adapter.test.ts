import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { LLMock } from "@copilotkit/llmock";
import type { ManagedProcess } from "@secure-exec/core";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "vitest";
import { AcpClient } from "../src/acp-client.js";
import { AgentOs } from "../src/agent-os.js";
import { createStdoutLineIterable } from "../src/stdout-lines.js";
import {
	DEFAULT_TEXT_FIXTURE,
	startLlmock,
	stopLlmock,
} from "./helpers/llmock-helper.js";

/**
 * Workspace root has shamefully-hoisted node_modules with @rivet-dev/agent-os-pi available.
 */
const MODULE_ACCESS_CWD = resolve(import.meta.dirname, "..");

/**
 * Resolve pi-sdk-acp bin path from host node_modules.
 * kernel.readFile() doesn't see the ModuleAccessFileSystem overlay,
 * so we read the host package.json directly and construct the VFS path.
 */
function resolvePiSdkBinPath(): string {
	const hostPkgJson = join(
		MODULE_ACCESS_CWD,
		"node_modules/@rivet-dev/agent-os-pi/package.json",
	);
	const pkg = JSON.parse(readFileSync(hostPkgJson, "utf-8"));

	let binEntry: string;
	if (typeof pkg.bin === "string") {
		binEntry = pkg.bin;
	} else if (typeof pkg.bin === "object" && pkg.bin !== null) {
		binEntry =
			(pkg.bin as Record<string, string>)["pi-sdk-acp"] ??
			Object.values(pkg.bin)[0];
	} else {
		throw new Error("No bin entry in @rivet-dev/agent-os-pi package.json");
	}

	return `/root/node_modules/@rivet-dev/agent-os-pi/${binEntry}`;
}

describe("pi-sdk-acp adapter manual spawn", () => {
	let vm: AgentOs;
	let mock: LLMock;
	let mockUrl: string;
	let mockPort: number;
	let client: AcpClient;

	beforeAll(async () => {
		const result = await startLlmock([DEFAULT_TEXT_FIXTURE]);
		mock = result.mock;
		mockUrl = result.url;
		mockPort = Number(new URL(result.url).port);
	});

	afterAll(async () => {
		await stopLlmock(mock);
	});

	beforeEach(async () => {
		vm = await AgentOs.create({
			loopbackExemptPorts: [mockPort],
			moduleAccessCwd: MODULE_ACCESS_CWD,
		});
	});

	afterEach(async () => {
		if (client) {
			client.close();
		}
		await vm.dispose();
	});

	/**
	 * Spawn pi-sdk-acp from the mounted node_modules overlay and wire up AcpClient.
	 */
	function spawnPiSdkAcp(): {
		proc: ManagedProcess;
		client: AcpClient;
		stderr: () => string;
	} {
		const binPath = resolvePiSdkBinPath();
		const { iterable, onStdout } = createStdoutLineIterable();

		let stderrOutput = "";
		const spawned = vm.kernel.spawn("node", [binPath], {
			streamStdin: true,
			onStdout,
			onStderr: (data: Uint8Array) => {
				stderrOutput += new TextDecoder().decode(data);
			},
			env: {
				HOME: "/home/user",
				ANTHROPIC_API_KEY: "mock-key",
				ANTHROPIC_BASE_URL: mockUrl,
			},
		});

		const acpClient = new AcpClient(spawned, iterable);
		return { proc: spawned, client: acpClient, stderr: () => stderrOutput };
	}

	async function initializeAndCreateSession(
		spawned: ReturnType<typeof spawnPiSdkAcp>,
	): Promise<Record<string, unknown>> {
		client = spawned.client;

		const initResponse = await client.request("initialize", {
			protocolVersion: 1,
			clientCapabilities: {},
		});
		expect(initResponse.error).toBeUndefined();

		const sessionResponse = await client.request("session/new", {
			cwd: "/home/user",
			mcpServers: [],
		});
		expect(sessionResponse.error).toBeUndefined();
		return sessionResponse.result as Record<string, unknown>;
	}

	test("initialize returns protocolVersion and agentInfo", async () => {
		const spawned = spawnPiSdkAcp();
		client = spawned.client;

		let response: Awaited<ReturnType<AcpClient["request"]>>;
		try {
			response = await client.request("initialize", {
				protocolVersion: 1,
				clientCapabilities: {},
			});
		} catch (err) {
			throw new Error(
				`Initialize failed. stderr: ${spawned.stderr()}\n${err}`,
			);
		}

		expect(
			response.error,
			`ACP error: ${JSON.stringify(response.error)}`,
		).toBeUndefined();
		expect(response.result).toBeDefined();

		const result = response.result as Record<string, unknown>;
		expect(result.protocolVersion).toBe(1);
		expect(result.agentInfo).toBeDefined();

		const agentInfo = result.agentInfo as Record<string, unknown>;
		expect(agentInfo.name).toBe("pi-sdk-acp");
	}, 60_000);

	test("session/new creates session via Pi SDK", async () => {
		const spawned = spawnPiSdkAcp();
		client = spawned.client;

		// Must initialize first
		let initResponse: Awaited<ReturnType<AcpClient["request"]>>;
		try {
			initResponse = await client.request("initialize", {
				protocolVersion: 1,
				clientCapabilities: {},
			});
		} catch (err) {
			throw new Error(
				`Initialize failed. stderr: ${spawned.stderr()}\n${err}`,
			);
		}
		expect(initResponse.error).toBeUndefined();

		// Send session/new. The SDK adapter creates a session in-process
		// via createAgentSession() — no subprocess spawning.
		let sessionResponse: Awaited<ReturnType<AcpClient["request"]>>;
		try {
			sessionResponse = await client.request("session/new", {
				cwd: "/home/user",
				mcpServers: [],
			});
		} catch (err) {
			throw new Error(
				`session/new failed. stderr: ${spawned.stderr()}\n${err}`,
			);
		}

		expect(sessionResponse.error).toBeUndefined();
		expect(sessionResponse.id).toBeDefined();
		expect(sessionResponse.jsonrpc).toBe("2.0");
		expect(sessionResponse.result).toBeDefined();
		expect(
			(sessionResponse.result as { sessionId?: string }).sessionId,
		).toBeTruthy();
	}, 90_000);

	test("session/prompt streams events and completes", async () => {
		const spawned = spawnPiSdkAcp();
		client = spawned.client;

		// Initialize
		const initResponse = await client.request("initialize", {
			protocolVersion: 1,
			clientCapabilities: {},
		});
		expect(initResponse.error).toBeUndefined();

		// Create session
		const sessionResponse = await client.request("session/new", {
			cwd: "/home/user",
			mcpServers: [],
		});
		expect(sessionResponse.error).toBeUndefined();
		const sessionId = (
			sessionResponse.result as { sessionId: string }
		).sessionId;

		// Collect all notifications
		const notifications: Array<{ method: string; params: unknown }> = [];
		client.onNotification((notification) => {
			notifications.push(notification);
		});

		// Send prompt. The mock LLM returns a simple text response.
		// The Pi SDK may or may not produce session/update notifications
		// depending on how well llmock matches the Anthropic streaming format.
		let promptResponse: Awaited<ReturnType<AcpClient["request"]>>;
		try {
			promptResponse = await client.request("session/prompt", {
				sessionId,
				prompt: [{ type: "text", text: "Say hello" }],
			});
		} catch (err) {
			throw new Error(
				`session/prompt failed. stderr: ${spawned.stderr()}\n${err}`,
			);
		}

		expect(
			promptResponse.error,
			`Prompt error: ${JSON.stringify(promptResponse.error)}. stderr: ${spawned.stderr()}`,
		).toBeUndefined();
		expect(promptResponse.result).toBeDefined();
		const promptResult = promptResponse.result as {
			stopReason: string;
		};
		// Stop reason should be either "end_turn" (success) or "cancelled"
		expect(["end_turn", "cancelled"]).toContain(promptResult.stopReason);

		// Verify any received notifications have the right structure
		for (const n of notifications) {
			expect(n.method).toBe("session/update");
		}
	}, 90_000);

	test("session/new advertises session-scoped config/model state", async () => {
		const spawned = spawnPiSdkAcp();
		const sessionResult = await initializeAndCreateSession(spawned);

		const sessionId = sessionResult.sessionId;
		expect(typeof sessionId).toBe("string");
		expect(sessionId).toBeTruthy();

		const configOptions = sessionResult.configOptions as Array<
			Record<string, unknown>
		>;
		expect(Array.isArray(configOptions)).toBe(true);

		const modes = sessionResult.modes as
			| {
					currentModeId: string;
					availableModes: Array<{ id: string; name: string }>;
			  }
			| undefined;
		expect(modes).toBeDefined();
		expect(modes?.currentModeId).toBeTruthy();
		expect(modes?.availableModes.length ?? 0).toBeGreaterThan(0);

		const modelOption = configOptions.find((option) => option.id === "model");
		expect(modelOption).toBeDefined();
		expect(modelOption?.category).toBe("model");
		expect(modelOption?.name).toBe("Model");

		const thoughtOption = configOptions.find(
			(option) => option.id === "thought_level",
		);
		expect(thoughtOption).toBeDefined();
		expect(thoughtOption?.category).toBe("thought_level");
		expect(thoughtOption?.name).toBe("Thinking Level");

		const models = sessionResult.models as
			| {
					currentModelId: string;
					availableModels: Array<{ modelId: string; name: string }>;
			  }
			| undefined;
		expect(models).toBeDefined();
		expect(models?.currentModelId).toBeTruthy();
		expect(models?.availableModels.length ?? 0).toBeGreaterThan(0);
		expect(
			models?.availableModels.some(
				(model) => model.modelId === models.currentModelId,
			),
		).toBe(true);

		expect(modelOption?.currentValue).toBe(models?.currentModelId);
		const modelChoices = modelOption?.options as
			| Array<{ value: string; name: string }>
			| undefined;
		expect(modelChoices?.length ?? 0).toBeGreaterThan(0);
		expect(
			modelChoices?.some((option) => option.value === models?.currentModelId),
		).toBe(true);
	}, 90_000);

	test("session/set_mode remains compatible with thinking-level mutation", async () => {
		const spawned = spawnPiSdkAcp();
		const sessionResult = await initializeAndCreateSession(spawned);
		const sessionId = sessionResult.sessionId as string;
		const notifications: Array<{ method: string; params: unknown }> = [];
		client.onNotification((notification) => {
			notifications.push(notification);
		});

		const modes = sessionResult.modes as {
			currentModeId: string;
			availableModes: Array<{ id: string; name: string }>;
		};
		const nextModeId = modes.availableModes.find(
			(mode) => mode.id !== modes.currentModeId,
		)?.id;
		expect(
			nextModeId,
			"expected at least two thinking-level modes for compatibility coverage",
		).toBeTruthy();

		const modeResponse = await client.request("session/set_mode", {
			sessionId,
			modeId: nextModeId,
		});
		expect(
			modeResponse.error,
			`session/set_mode failed. stderr: ${spawned.stderr()}`,
		).toBeUndefined();
		expect(modeResponse.result).toEqual({});

		const modeUpdate = notifications
			.filter((notification) => notification.method === "session/update")
			.map(
				(notification) =>
					(notification.params as {
						update?: { sessionUpdate?: string; currentModeId?: string };
					}).update,
			)
			.find((update) => update?.sessionUpdate === "current_mode_update");
		expect(modeUpdate?.currentModeId).toBe(nextModeId);
	}, 90_000);

	test("session config and model mutation update PI session state", async () => {
		const spawned = spawnPiSdkAcp();
		const sessionResult = await initializeAndCreateSession(spawned);
		const sessionId = sessionResult.sessionId as string;
		const notifications: Array<{ method: string; params: unknown }> = [];
		client.onNotification((notification) => {
			notifications.push(notification);
		});

		const configOptions = sessionResult.configOptions as Array<
			Record<string, unknown>
		>;
		const thoughtOption = configOptions.find(
			(option) => option.id === "thought_level",
		);
		expect(thoughtOption).toBeDefined();
		const thoughtChoices = (thoughtOption?.options as Array<{
			value: string;
			name: string;
		}>) ?? [{ value: String(thoughtOption?.currentValue ?? "off"), name: "off" }];
		const currentThought = String(thoughtOption?.currentValue ?? "off");
		const nextThought =
			thoughtChoices.find((choice) => choice.value !== currentThought)?.value ??
			currentThought;

		const thoughtResponse = await client.request("session/set_config_option", {
			sessionId,
			configId: "thought_level",
			value: nextThought,
		});
		expect(
			thoughtResponse.error,
			`thought mutation failed. stderr: ${spawned.stderr()}`,
		).toBeUndefined();
		const thoughtResult = thoughtResponse.result as {
			configOptions: Array<Record<string, unknown>>;
		};
		const updatedThought = thoughtResult.configOptions.find(
			(option) => option.id === "thought_level",
		);
		expect(updatedThought?.currentValue).toBe(nextThought);

		const models = sessionResult.models as {
			currentModelId: string;
			availableModels: Array<{ modelId: string; name: string }>;
		};
		const nextModelId = models.availableModels.find(
			(model) => model.modelId !== models.currentModelId,
		)?.modelId;
		expect(
			nextModelId,
			"expected at least two selectable PI models for mutation coverage",
		).toBeTruthy();

		const modelResponse = await client.request("session/set_config_option", {
			sessionId,
			configId: "model",
			value: nextModelId,
		});
		expect(
			modelResponse.error,
			`model mutation failed. stderr: ${spawned.stderr()}`,
		).toBeUndefined();
		const modelResult = modelResponse.result as {
			configOptions: Array<Record<string, unknown>>;
		};
		const updatedModel = modelResult.configOptions.find(
			(option) => option.id === "model",
		);
		expect(updatedModel?.currentValue).toBe(nextModelId);

		const restoreResponse = await client.request("session/set_model", {
			sessionId,
			modelId: models.currentModelId,
		});
		expect(
			restoreResponse.error,
			`session/set_model failed. stderr: ${spawned.stderr()}`,
		).toBeUndefined();
		expect(restoreResponse.result).toEqual({});

		const configUpdates = notifications
			.filter((notification) => notification.method === "session/update")
			.map(
				(notification) =>
					(notification.params as {
						update?: { sessionUpdate?: string; configOptions?: unknown };
					}).update,
			)
			.filter(
				(update): update is {
					sessionUpdate: string;
					configOptions: unknown;
				} =>
					update?.sessionUpdate === "config_option_update" &&
					update.configOptions !== undefined,
			);
		expect(configUpdates.length).toBeGreaterThanOrEqual(2);
	}, 90_000);
});
