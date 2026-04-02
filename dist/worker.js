import { transform } from "sucrase";
import { createCommandExecutorStub, createFsStub, createNetworkStub, filterEnv, wrapFileSystem, wrapNetworkAdapter, } from "@secure-exec/core/internal/shared/permissions";
import { createInMemoryFileSystem } from "@secure-exec/core/internal/shared/in-memory-fs";
import { isESM, transformDynamicImport, } from "@secure-exec/core/internal/shared/esm-utils";
import { getRequireSetupCode } from "@secure-exec/core/internal/shared/require-setup";
import { exposeCustomGlobal, exposeMutableRuntimeStateGlobal, } from "@secure-exec/core/internal/shared/global-exposure";
import { getIsolateRuntimeSource } from "@secure-exec/core/internal/generated/isolate-runtime";
import { POLYFILL_CODE_MAP } from "@secure-exec/core/internal/generated/polyfills";
import { loadFile, resolveModule } from "@secure-exec/core/internal/package-bundler";
import { mkdir } from "@secure-exec/core/internal/fs-helpers";
import { createBrowserNetworkAdapter, createOpfsFileSystem, } from "./driver.js";
import { validatePermissionSource } from "./permission-validation.js";
let filesystem = null;
let networkAdapter = null;
let commandExecutor = null;
let permissions;
let initialized = false;
const dynamicImportCache = new Map();
const MAX_ERROR_MESSAGE_CHARS = 8192;
const MAX_STDIO_MESSAGE_CHARS = 8192;
const MAX_STDIO_DEPTH = 6;
const MAX_STDIO_OBJECT_KEYS = 60;
const MAX_STDIO_ARRAY_ITEMS = 120;
// Payload size defaults matching the Node runtime path
const DEFAULT_BASE64_TRANSFER_BYTES = 16 * 1024 * 1024;
const DEFAULT_JSON_PAYLOAD_BYTES = 4 * 1024 * 1024;
const PAYLOAD_LIMIT_ERROR_CODE = "ERR_SANDBOX_PAYLOAD_TOO_LARGE";
let base64TransferLimitBytes = DEFAULT_BASE64_TRANSFER_BYTES;
let jsonPayloadLimitBytes = DEFAULT_JSON_PAYLOAD_BYTES;
const encoder = new TextEncoder();
function getUtf8ByteLength(text) {
    return encoder.encode(text).byteLength;
}
function assertPayloadByteLength(payloadLabel, actualBytes, maxBytes) {
    if (actualBytes <= maxBytes)
        return;
    const error = new Error(`[${PAYLOAD_LIMIT_ERROR_CODE}] ${payloadLabel}: payload is ${actualBytes} bytes, limit is ${maxBytes} bytes`);
    error.code = PAYLOAD_LIMIT_ERROR_CODE;
    throw error;
}
function assertTextPayloadSize(payloadLabel, text, maxBytes) {
    assertPayloadByteLength(payloadLabel, getUtf8ByteLength(text), maxBytes);
}
const dynamicImportModule = new Function("specifier", "return import(specifier);");
function boundErrorMessage(message) {
    if (message.length <= MAX_ERROR_MESSAGE_CHARS) {
        return message;
    }
    return `${message.slice(0, MAX_ERROR_MESSAGE_CHARS)}...[Truncated]`;
}
function boundStdioMessage(message) {
    if (message.length <= MAX_STDIO_MESSAGE_CHARS) {
        return message;
    }
    return `${message.slice(0, MAX_STDIO_MESSAGE_CHARS)}...[Truncated]`;
}
function revivePermission(source) {
    if (!source)
        return undefined;
    // Validate source before eval to prevent code injection
    if (!validatePermissionSource(source))
        return undefined;
    try {
        const fn = new Function(`return (${source});`)();
        if (typeof fn === "function")
            return fn;
        return undefined;
    }
    catch {
        return undefined;
    }
}
/** Deserialize permission callbacks that were stringified for transfer across the Worker boundary. */
function revivePermissions(serialized) {
    if (!serialized)
        return undefined;
    const perms = {};
    perms.fs = revivePermission(serialized.fs);
    perms.network = revivePermission(serialized.network);
    perms.childProcess = revivePermission(serialized.childProcess);
    perms.env = revivePermission(serialized.env);
    return perms;
}
/**
 * Wrap a sync function in the bridge calling convention (`applySync`) so
 * bridge code can call it the same way it calls bridge References.
 */
function makeApplySync(fn) {
    const applySync = (_ctx, args) => fn(...args);
    return {
        applySync,
        applySyncPromise: applySync,
    };
}
function makeApplySyncPromise(fn) {
    return {
        applySyncPromise(_ctx, args) {
            return fn(...args);
        },
    };
}
function makeApplyPromise(fn) {
    return {
        apply(_ctx, args) {
            return fn(...args);
        },
    };
}
// Save real postMessage before sandbox code can replace it
const _realPostMessage = self.postMessage.bind(self);
function postResponse(message) {
    _realPostMessage(message);
}
function postStdio(requestId, channel, message) {
    const payload = {
        type: "stdio",
        requestId,
        channel,
        message,
    };
    _realPostMessage(payload);
}
function formatConsoleValue(value, seen = new WeakSet(), depth = 0) {
    if (value === null) {
        return "null";
    }
    if (value === undefined) {
        return "undefined";
    }
    if (typeof value === "string") {
        return value;
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    if (typeof value === "bigint") {
        return `${value.toString()}n`;
    }
    if (typeof value === "symbol") {
        return value.toString();
    }
    if (typeof value === "function") {
        return `[Function ${value.name || "anonymous"}]`;
    }
    if (typeof value !== "object") {
        return String(value);
    }
    if (seen.has(value)) {
        return "[Circular]";
    }
    if (depth >= MAX_STDIO_DEPTH) {
        return "[MaxDepth]";
    }
    seen.add(value);
    try {
        if (Array.isArray(value)) {
            const out = value
                .slice(0, MAX_STDIO_ARRAY_ITEMS)
                .map((item) => formatConsoleValue(item, seen, depth + 1));
            if (value.length > MAX_STDIO_ARRAY_ITEMS) {
                out.push('"[Truncated]"');
            }
            return `[${out.join(", ")}]`;
        }
        const entries = [];
        for (const key of Object.keys(value).slice(0, MAX_STDIO_OBJECT_KEYS)) {
            entries.push(`${key}: ${formatConsoleValue(value[key], seen, depth + 1)}`);
        }
        if (Object.keys(value).length > MAX_STDIO_OBJECT_KEYS) {
            entries.push('"[Truncated]"');
        }
        return `{ ${entries.join(", ")} }`;
    }
    catch {
        return "[Unserializable]";
    }
    finally {
        seen.delete(value);
    }
}
function emitStdio(requestId, channel, args) {
    const message = boundStdioMessage(args.map((arg) => formatConsoleValue(arg)).join(" "));
    postStdio(requestId, channel, message);
}
/**
 * Initialize the worker-side runtime: set up filesystem, network, bridge
 * globals, and load the bridge bundle. Called once before any exec/run.
 */
async function initRuntime(payload) {
    if (initialized)
        return;
    permissions = revivePermissions(payload.permissions);
    // Apply payload limits (use defaults if not configured)
    base64TransferLimitBytes = payload.payloadLimits?.base64TransferBytes ?? DEFAULT_BASE64_TRANSFER_BYTES;
    jsonPayloadLimitBytes = payload.payloadLimits?.jsonPayloadBytes ?? DEFAULT_JSON_PAYLOAD_BYTES;
    const baseFs = payload.filesystem === "memory"
        ? createInMemoryFileSystem()
        : await createOpfsFileSystem();
    filesystem = wrapFileSystem(baseFs, permissions);
    if (payload.networkEnabled) {
        networkAdapter = wrapNetworkAdapter(createBrowserNetworkAdapter(), permissions);
    }
    else {
        networkAdapter = createNetworkStub();
    }
    commandExecutor = createCommandExecutorStub();
    const fsOps = filesystem ?? createFsStub();
    const processConfig = payload.processConfig ?? {};
    processConfig.env = filterEnv(processConfig.env, permissions);
    exposeCustomGlobal("_processConfig", processConfig);
    exposeCustomGlobal("_osConfig", payload.osConfig ?? {});
    // Set up filesystem bridge globals before loading runtime shims.
    const readFileRef = makeApplySyncPromise(async (path) => {
        const text = await fsOps.readTextFile(path);
        assertTextPayloadSize(`fs.readFile ${path}`, text, jsonPayloadLimitBytes);
        return text;
    });
    const writeFileRef = makeApplySyncPromise(async (path, content) => {
        return fsOps.writeFile(path, content);
    });
    const readFileBinaryRef = makeApplySyncPromise(async (path) => {
        const data = await fsOps.readFile(path);
        assertPayloadByteLength(`fs.readFileBinary ${path}`, data.byteLength, base64TransferLimitBytes);
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    });
    const writeFileBinaryRef = makeApplySyncPromise(async (path, binaryContent) => {
        assertPayloadByteLength(`fs.writeFileBinary ${path}`, binaryContent.byteLength, base64TransferLimitBytes);
        return fsOps.writeFile(path, binaryContent);
    });
    const readDirRef = makeApplySyncPromise(async (path) => {
        const entries = await fsOps.readDirWithTypes(path);
        const json = JSON.stringify(entries);
        assertTextPayloadSize(`fs.readDir ${path}`, json, jsonPayloadLimitBytes);
        return json;
    });
    const mkdirRef = makeApplySyncPromise(async (path) => {
        return mkdir(fsOps, path);
    });
    const rmdirRef = makeApplySyncPromise(async (path) => {
        return fsOps.removeDir(path);
    });
    const existsRef = makeApplySyncPromise(async (path) => {
        return fsOps.exists(path);
    });
    const statRef = makeApplySyncPromise(async (path) => {
        const statInfo = await fsOps.stat(path);
        return JSON.stringify(statInfo);
    });
    const unlinkRef = makeApplySyncPromise(async (path) => {
        return fsOps.removeFile(path);
    });
    const renameRef = makeApplySyncPromise(async (oldPath, newPath) => {
        return fsOps.rename(oldPath, newPath);
    });
    exposeCustomGlobal("_fs", {
        readFile: readFileRef,
        writeFile: writeFileRef,
        readFileBinary: readFileBinaryRef,
        writeFileBinary: writeFileBinaryRef,
        readDir: readDirRef,
        mkdir: mkdirRef,
        rmdir: rmdirRef,
        exists: existsRef,
        stat: statRef,
        unlink: unlinkRef,
        rename: renameRef,
    });
    exposeCustomGlobal("_loadPolyfill", makeApplySyncPromise(async (moduleName) => {
        const name = moduleName.replace(/^node:/, "");
        const polyfillMap = POLYFILL_CODE_MAP;
        return polyfillMap[name] ?? null;
    }));
    exposeCustomGlobal("_resolveModule", makeApplySyncPromise(async (request, fromDir) => {
        return resolveModule(request, fromDir, fsOps);
    }));
    exposeCustomGlobal("_loadFile", makeApplySyncPromise(async (path) => {
        const source = await loadFile(path, fsOps);
        if (source === null)
            return null;
        let code = source;
        if (isESM(source, path)) {
            code = transform(code, { transforms: ["imports"] }).code;
        }
        return transformDynamicImport(code);
    }));
    exposeCustomGlobal("_scheduleTimer", {
        apply(_ctx, args) {
            return new Promise((resolve) => {
                setTimeout(resolve, args[0]);
            });
        },
    });
    const netAdapter = networkAdapter ?? createNetworkStub();
    exposeCustomGlobal("_networkFetchRaw", makeApplyPromise(async (url, optionsJson) => {
        const options = JSON.parse(optionsJson);
        const result = await netAdapter.fetch(url, options);
        return JSON.stringify(result);
    }));
    exposeCustomGlobal("_networkDnsLookupRaw", makeApplyPromise(async (hostname) => {
        const result = await netAdapter.dnsLookup(hostname);
        return JSON.stringify(result);
    }));
    exposeCustomGlobal("_networkHttpRequestRaw", makeApplyPromise(async (url, optionsJson) => {
        const options = JSON.parse(optionsJson);
        const result = await netAdapter.httpRequest(url, options);
        return JSON.stringify(result);
    }));
    const execAdapter = commandExecutor ?? createCommandExecutorStub();
    let nextSessionId = 1;
    const sessions = new Map();
    const getDispatch = () => globalThis._childProcessDispatch;
    exposeCustomGlobal("_childProcessSpawnStart", makeApplySync((command, argsJson, optionsJson) => {
        const args = JSON.parse(argsJson);
        const options = JSON.parse(optionsJson);
        const sessionId = nextSessionId++;
        const proc = execAdapter.spawn(command, args, {
            cwd: options.cwd,
            env: options.env,
            onStdout: (data) => {
                getDispatch()?.(sessionId, "stdout", data);
            },
            onStderr: (data) => {
                getDispatch()?.(sessionId, "stderr", data);
            },
        });
        proc.wait().then((code) => {
            getDispatch()?.(sessionId, "exit", code);
            sessions.delete(sessionId);
        });
        sessions.set(sessionId, proc);
        return sessionId;
    }));
    exposeCustomGlobal("_childProcessStdinWrite", makeApplySync((sessionId, data) => {
        sessions.get(sessionId)?.writeStdin(data);
    }));
    exposeCustomGlobal("_childProcessStdinClose", makeApplySync((sessionId) => {
        sessions.get(sessionId)?.closeStdin();
    }));
    exposeCustomGlobal("_childProcessKill", makeApplySync((sessionId, signal) => {
        sessions.get(sessionId)?.kill(signal);
    }));
    exposeCustomGlobal("_childProcessSpawnSync", makeApplySyncPromise(async (command, argsJson, optionsJson) => {
        const args = JSON.parse(argsJson);
        const options = JSON.parse(optionsJson);
        const stdoutChunks = [];
        const stderrChunks = [];
        const proc = execAdapter.spawn(command, args, {
            cwd: options.cwd,
            env: options.env,
            onStdout: (data) => stdoutChunks.push(data),
            onStderr: (data) => stderrChunks.push(data),
        });
        const exitCode = await proc.wait();
        const decoder = new TextDecoder();
        const stdout = stdoutChunks.map((c) => decoder.decode(c)).join("");
        const stderr = stderrChunks.map((c) => decoder.decode(c)).join("");
        return JSON.stringify({ stdout, stderr, code: exitCode });
    }));
    if (!("SharedArrayBuffer" in globalThis)) {
        class SharedArrayBufferShim {
            backing;
            constructor(length) {
                this.backing = new ArrayBuffer(length);
            }
            get byteLength() {
                return this.backing.byteLength;
            }
            get growable() {
                return false;
            }
            get maxByteLength() {
                return this.backing.byteLength;
            }
            slice(start, end) {
                return this.backing.slice(start, end);
            }
        }
        Object.defineProperty(globalThis, "SharedArrayBuffer", {
            value: SharedArrayBufferShim,
            configurable: true,
            writable: true,
        });
    }
    let bridgeModule;
    try {
        bridgeModule = await dynamicImportModule("@secure-exec/nodejs/internal/bridge");
    }
    catch {
        // Vite browser tests may need a second attempt during source execution.
        try {
            bridgeModule = await dynamicImportModule("@secure-exec/nodejs/internal/bridge");
        }
        catch {
            throw new Error("Failed to load bridge module from @secure-exec/nodejs");
        }
    }
    exposeCustomGlobal("_fsModule", bridgeModule.default);
    eval(getIsolateRuntimeSource("globalExposureHelpers"));
    exposeMutableRuntimeStateGlobal("_moduleCache", {});
    exposeMutableRuntimeStateGlobal("_pendingModules", {});
    exposeMutableRuntimeStateGlobal("_currentModule", { dirname: "/" });
    eval(getRequireSetupCode());
    // Block dangerous Web APIs that bypass bridge permission checks
    const dangerousApis = [
        "XMLHttpRequest",
        "WebSocket",
        "importScripts",
        "indexedDB",
        "caches",
        "BroadcastChannel",
    ];
    for (const api of dangerousApis) {
        try {
            delete self[api];
        }
        catch {
            // May not exist or may be non-configurable
        }
        Object.defineProperty(self, api, {
            get() {
                throw new ReferenceError(`${api} is not available in sandbox`);
            },
            configurable: false,
        });
    }
    // Lock down self.onmessage so sandbox code cannot hijack the control channel
    const currentHandler = self.onmessage;
    Object.defineProperty(self, "onmessage", {
        value: currentHandler,
        writable: false,
        configurable: false,
    });
    // Block self.postMessage so sandbox code cannot forge responses to host
    Object.defineProperty(self, "postMessage", {
        get() {
            throw new TypeError("postMessage is not available in sandbox");
        },
        configurable: false,
    });
    initialized = true;
}
function resetModuleState(cwd) {
    exposeMutableRuntimeStateGlobal("_moduleCache", {});
    exposeMutableRuntimeStateGlobal("_pendingModules", {});
    exposeMutableRuntimeStateGlobal("_currentModule", { dirname: cwd });
}
function setDynamicImportFallback() {
    exposeMutableRuntimeStateGlobal("__dynamicImport", function (specifier) {
        const cached = dynamicImportCache.get(specifier);
        if (cached)
            return Promise.resolve(cached);
        try {
            const runtimeRequire = globalThis.require;
            if (typeof runtimeRequire !== "function") {
                throw new Error("require is not available in browser runtime");
            }
            const mod = runtimeRequire(specifier);
            return Promise.resolve({ default: mod, ...mod });
        }
        catch (e) {
            return Promise.reject(new Error(`Cannot dynamically import '${specifier}': ${String(e)}`));
        }
    });
}
function captureConsole(requestId, captureStdio) {
    const original = console;
    if (!captureStdio) {
        const sandboxConsole = {
            log: () => undefined,
            info: () => undefined,
            warn: () => undefined,
            error: () => undefined,
        };
        globalThis.console = sandboxConsole;
        return {
            restore: () => {
                globalThis.console = original;
            },
        };
    }
    const sandboxConsole = {
        log: (...args) => emitStdio(requestId, "stdout", args),
        info: (...args) => emitStdio(requestId, "stdout", args),
        warn: (...args) => emitStdio(requestId, "stderr", args),
        error: (...args) => emitStdio(requestId, "stderr", args),
    };
    globalThis.console = sandboxConsole;
    return {
        restore: () => {
            globalThis.console = original;
        },
    };
}
function updateProcessConfig(options) {
    const proc = globalThis.process;
    if (!proc)
        return;
    if (options?.cwd && typeof proc.chdir === "function") {
        proc.chdir(options.cwd);
    }
    if (options?.env) {
        const filtered = filterEnv(options.env, permissions);
        const currentEnv = proc.env && typeof proc.env === "object"
            ? proc.env
            : {};
        proc.env = { ...currentEnv, ...filtered };
    }
    if (options?.stdin !== undefined) {
        exposeMutableRuntimeStateGlobal("_stdinData", options.stdin);
        exposeMutableRuntimeStateGlobal("_stdinPosition", 0);
        exposeMutableRuntimeStateGlobal("_stdinEnded", false);
        exposeMutableRuntimeStateGlobal("_stdinFlowMode", false);
    }
}
/**
 * Execute user code as a script (process-style). Transforms ESM/dynamic
 * imports, sets up module/exports globals, and waits for active handles.
 */
async function execScript(requestId, code, options, captureStdio = false) {
    resetModuleState(options?.cwd ?? "/");
    updateProcessConfig(options);
    setDynamicImportFallback();
    const { restore } = captureConsole(requestId, captureStdio);
    try {
        let transformed = code;
        if (isESM(code, options?.filePath)) {
            transformed = transform(transformed, { transforms: ["imports"] }).code;
        }
        transformed = transformDynamicImport(transformed);
        exposeMutableRuntimeStateGlobal("module", { exports: {} });
        const moduleRef = globalThis.module;
        exposeMutableRuntimeStateGlobal("exports", moduleRef.exports);
        if (options?.filePath) {
            const dirname = options.filePath.includes("/")
                ? options.filePath.substring(0, options.filePath.lastIndexOf("/")) || "/"
                : "/";
            exposeMutableRuntimeStateGlobal("__filename", options.filePath);
            exposeMutableRuntimeStateGlobal("__dirname", dirname);
            exposeMutableRuntimeStateGlobal("_currentModule", {
                dirname,
                filename: options.filePath,
            });
        }
        // Await the eval result so async IIFEs / top-level promise expressions
        // resolve before we check for active handles.
        const evalResult = eval(transformed);
        if (evalResult && typeof evalResult === "object" && typeof evalResult.then === "function") {
            await evalResult;
        }
        const waitForActiveHandles = globalThis
            ._waitForActiveHandles;
        if (typeof waitForActiveHandles === "function") {
            await waitForActiveHandles();
        }
        const exitCode = globalThis.process
            ?.exitCode ?? 0;
        return {
            code: exitCode,
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const exitMatch = message.match(/process\.exit\((\d+)\)/);
        if (exitMatch) {
            const exitCode = Number.parseInt(exitMatch[1], 10);
            return {
                code: exitCode,
            };
        }
        return {
            code: 1,
            errorMessage: boundErrorMessage(message),
        };
    }
    finally {
        restore();
    }
}
async function runScript(requestId, code, filePath, captureStdio = false) {
    const execResult = await execScript(requestId, code, { filePath }, captureStdio);
    const moduleObj = globalThis.module;
    return {
        ...execResult,
        exports: moduleObj?.exports,
    };
}
self.onmessage = async (event) => {
    const message = event.data;
    try {
        if (message.type === "init") {
            await initRuntime(message.payload);
            postResponse({ type: "response", id: message.id, ok: true, result: true });
            return;
        }
        if (!initialized) {
            throw new Error("Sandbox worker not initialized");
        }
        if (message.type === "exec") {
            const result = await execScript(message.id, message.payload.code, message.payload.options, message.payload.captureStdio);
            postResponse({ type: "response", id: message.id, ok: true, result });
            return;
        }
        if (message.type === "run") {
            const result = await runScript(message.id, message.payload.code, message.payload.filePath, message.payload.captureStdio);
            postResponse({ type: "response", id: message.id, ok: true, result });
            return;
        }
        if (message.type === "dispose") {
            postResponse({ type: "response", id: message.id, ok: true, result: true });
            close();
        }
    }
    catch (err) {
        const error = err;
        postResponse({
            type: "response",
            id: message.id,
            ok: false,
            error: {
                message: error?.message ?? String(err),
                stack: error?.stack,
                code: error?.code,
            },
        });
    }
};
