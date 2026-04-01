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

	async function initializePiSdkSession() {
		const spawned = spawnPiSdkAcp();
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

		const sessionResult = sessionResponse.result as {
			sessionId: string;
			models?: {
				currentModelId: string;
				availableModels: Array<{
					modelId: string;
					name: string;
					description?: string;
				}>;
			};
		};

		return {
			spawned,
			initResponse,
			sessionResponse,
			sessionResult,
			sessionId: sessionResult.sessionId,
		};
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
		const { sessionResponse, sessionId } = await initializePiSdkSession();

		expect(sessionResponse.id).toBeDefined();
		expect(sessionResponse.jsonrpc).toBe("2.0");
		expect(sessionResponse.result).toBeDefined();
		expect(sessionId).toBeTruthy();
	}, 90_000);

	test("session/prompt streams events and completes", async () => {
		const { spawned, sessionId } = await initializePiSdkSession();

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

	test("session/new returns model state for the real PI adapter", async () => {
		const { sessionResult } = await initializePiSdkSession();

		expect(sessionResult.models).toBeDefined();
		expect(sessionResult.models?.currentModelId).toBeTruthy();
		expect(sessionResult.models?.availableModels.length).toBeGreaterThan(0);
		expect(
			sessionResult.models?.availableModels.some(
				(model) => model.modelId === sessionResult.models?.currentModelId,
			),
		).toBe(true);
	}, 90_000);

	test("session/set_model accepts advertised model IDs and rejects invalid ones", async () => {
		const { sessionId, sessionResult } = await initializePiSdkSession();

		expect(sessionResult.models).toBeDefined();
		const models = sessionResult.models!;
		const targetModel =
			models.availableModels.find(
				(model) => model.modelId !== models.currentModelId,
			) ?? models.availableModels[0];

		const setModelResponse = await client.request("session/set_model", {
			sessionId,
			modelId: targetModel.modelId,
		});
		expect(setModelResponse.error).toBeUndefined();
		expect(setModelResponse.result).toEqual({});

		const promptResponse = await client.request("session/prompt", {
			sessionId,
			prompt: [{ type: "text", text: "Say hello" }],
		});
		expect(promptResponse.error).toBeUndefined();
		expect(
			(promptResponse.result as { stopReason: string }).stopReason,
		).toBe("end_turn");

		const invalidModelResponse = await client.request("session/set_model", {
			sessionId,
			modelId: "definitely-not-a-real-model",
		});
		expect(invalidModelResponse.error).toBeDefined();
		expect(invalidModelResponse.error?.message).toContain("Unknown model");
	}, 90_000);
});
