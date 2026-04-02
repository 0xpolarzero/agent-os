import { createServer, } from "node:http";
import { camelToKebab, getFieldInfos, getZodDescription, getZodEnumValues, parseArgv, } from "./host-tools-argv.js";
const DEFAULT_TIMEOUT = 30000;
function errorResponse(error, message) {
    return { ok: false, error, message };
}
function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
        req.on("error", reject);
    });
}
function sendJson(res, body) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
}
function toolkitNames(toolkits) {
    return [...toolkits.keys()].join(", ");
}
function toolNames(toolkit) {
    return Object.keys(toolkit.tools).join(", ");
}
async function handleCall(body, toolkits) {
    let parsed;
    try {
        parsed = JSON.parse(body);
    }
    catch {
        return errorResponse("VALIDATION_ERROR", "Invalid JSON in request body");
    }
    const { toolkit: tkName, tool: toolName, input, argv } = parsed;
    // Look up toolkit
    const tk = toolkits.get(tkName);
    if (!tk) {
        return errorResponse("TOOLKIT_NOT_FOUND", `No toolkit "${tkName}". Available: ${toolkitNames(toolkits)}`);
    }
    // Look up tool
    const tool = tk.tools[toolName];
    if (!tool) {
        return errorResponse("TOOL_NOT_FOUND", `No tool "${toolName}" in toolkit "${tkName}". Available: ${toolNames(tk)}`);
    }
    // If argv is provided, parse flags against the zod schema to produce input
    let resolvedInput = input ?? {};
    if (argv) {
        const argvResult = parseArgv(tool.inputSchema, argv);
        if (!argvResult.ok) {
            return errorResponse("VALIDATION_ERROR", argvResult.message);
        }
        resolvedInput = argvResult.input;
    }
    // Validate input against zod schema
    const parseResult = tool.inputSchema.safeParse(resolvedInput);
    if (!parseResult.success) {
        const message = parseResult.error.errors
            .map((e) => {
            const path = e.path.length > 0 ? `at "${e.path.join(".")}"` : "";
            return `${e.message}${path ? ` ${path}` : ""}`;
        })
            .join("; ");
        return errorResponse("VALIDATION_ERROR", message);
    }
    // Execute with timeout
    const timeout = tool.timeout ?? DEFAULT_TIMEOUT;
    try {
        const result = await Promise.race([
            Promise.resolve(tool.execute(parseResult.data)),
            new Promise((_, reject) => setTimeout(() => reject(new Error(`TIMEOUT`)), timeout)),
        ]);
        return { ok: true, result };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message === "TIMEOUT") {
            return errorResponse("TIMEOUT", `Tool "${toolName}" timed out after ${timeout}ms`);
        }
        return errorResponse("EXECUTION_ERROR", message);
    }
}
/**
 * Extract flag descriptors from a HostTool's zod input schema.
 */
function describeFlags(tool) {
    const fields = getFieldInfos(tool.inputSchema);
    const flags = [];
    const shape = tool.inputSchema._def.typeName === "ZodObject"
        ? tool.inputSchema._def.shape()
        : {};
    for (const field of fields.values()) {
        let type;
        if (field.innerTypeName === "ZodString") {
            type = "string";
        }
        else if (field.innerTypeName === "ZodNumber") {
            type = "number";
        }
        else if (field.innerTypeName === "ZodBoolean") {
            type = "boolean";
        }
        else if (field.innerTypeName === "ZodEnum") {
            const fieldSchema = shape[field.camelName];
            const values = fieldSchema
                ? getZodEnumValues(fieldSchema)
                : undefined;
            type = values ? values.join("|") : "enum";
        }
        else if (field.innerTypeName === "ZodArray") {
            const itemType = field.arrayItemTypeName === "ZodNumber" ? "number" : "string";
            type = `${itemType}[]`;
        }
        else {
            type = "string";
        }
        const fieldSchema = shape[field.camelName];
        const description = fieldSchema
            ? getZodDescription(fieldSchema)
            : undefined;
        const descriptor = {
            flag: `--${camelToKebab(field.camelName)}`,
            type,
            required: !field.isOptional,
        };
        if (description) {
            descriptor.description = description;
        }
        flags.push(descriptor);
    }
    return flags;
}
/**
 * Build a full tool descriptor with flags and examples.
 */
function describeTool(tool) {
    const descriptor = {
        description: tool.description,
        flags: describeFlags(tool),
    };
    if (tool.examples && tool.examples.length > 0) {
        descriptor.examples = tool.examples.map((ex) => ({
            description: ex.description,
            input: ex.input,
        }));
    }
    return descriptor;
}
function handleList(toolkits) {
    const result = [];
    for (const tk of toolkits.values()) {
        result.push({
            name: tk.name,
            description: tk.description,
            tools: Object.keys(tk.tools),
        });
    }
    return { ok: true, result: { toolkits: result } };
}
function handleListToolkit(toolkitName, toolkits) {
    const tk = toolkits.get(toolkitName);
    if (!tk) {
        return errorResponse("TOOLKIT_NOT_FOUND", `No toolkit "${toolkitName}". Available: ${toolkitNames(toolkits)}`);
    }
    const tools = {};
    for (const [name, tool] of Object.entries(tk.tools)) {
        tools[name] = {
            description: tool.description,
            flags: describeFlags(tool),
        };
    }
    return {
        ok: true,
        result: { name: tk.name, description: tk.description, tools },
    };
}
function handleDescribeToolkit(toolkitName, toolkits) {
    const tk = toolkits.get(toolkitName);
    if (!tk) {
        return errorResponse("TOOLKIT_NOT_FOUND", `No toolkit "${toolkitName}". Available: ${toolkitNames(toolkits)}`);
    }
    const tools = {};
    for (const [name, tool] of Object.entries(tk.tools)) {
        tools[name] = describeTool(tool);
    }
    return {
        ok: true,
        result: { name: tk.name, description: tk.description, tools },
    };
}
function handleDescribeTool(toolkitName, toolName, toolkits) {
    const tk = toolkits.get(toolkitName);
    if (!tk) {
        return errorResponse("TOOLKIT_NOT_FOUND", `No toolkit "${toolkitName}". Available: ${toolkitNames(toolkits)}`);
    }
    const tool = tk.tools[toolName];
    if (!tool) {
        return errorResponse("TOOL_NOT_FOUND", `No tool "${toolName}" in toolkit "${toolkitName}". Available: ${toolNames(tk)}`);
    }
    return {
        ok: true,
        result: {
            toolkit: toolkitName,
            tool: toolName,
            ...describeTool(tool),
        },
    };
}
/**
 * Start the host tools RPC server on 127.0.0.1:0.
 * Returns a handle with the assigned port.
 */
export function startHostToolsServer(toolkits) {
    const toolkitMap = new Map();
    for (const tk of toolkits) {
        toolkitMap.set(tk.name, tk);
    }
    return new Promise((resolve, reject) => {
        const server = createServer(async (req, res) => {
            const url = req.url ?? "/";
            const method = req.method ?? "GET";
            if (method === "POST" && url === "/call") {
                const body = await readBody(req);
                const result = await handleCall(body, toolkitMap);
                sendJson(res, result);
                return;
            }
            if (method === "GET" && url === "/list") {
                sendJson(res, handleList(toolkitMap));
                return;
            }
            // GET /list/<toolkit>
            if (method === "GET" && url.startsWith("/list/")) {
                const tkName = decodeURIComponent(url.slice("/list/".length));
                sendJson(res, handleListToolkit(tkName, toolkitMap));
                return;
            }
            // GET /describe/<toolkit>/<tool> (must match before /describe/<toolkit>)
            if (method === "GET" && url.startsWith("/describe/")) {
                const rest = url.slice("/describe/".length);
                const slashIdx = rest.indexOf("/");
                if (slashIdx !== -1) {
                    const tkName = decodeURIComponent(rest.slice(0, slashIdx));
                    const toolName = decodeURIComponent(rest.slice(slashIdx + 1));
                    sendJson(res, handleDescribeTool(tkName, toolName, toolkitMap));
                    return;
                }
                // GET /describe/<toolkit>
                const tkName = decodeURIComponent(rest);
                sendJson(res, handleDescribeToolkit(tkName, toolkitMap));
                return;
            }
            // Unknown route
            sendJson(res, errorResponse("INTERNAL_ERROR", `Unknown endpoint: ${method} ${url}`));
        });
        server.listen(0, "127.0.0.1", () => {
            const addr = server.address();
            if (!addr || typeof addr === "string") {
                reject(new Error("Failed to get server address"));
                return;
            }
            resolve({
                port: addr.port,
                registerToolkit(toolkit) {
                    toolkitMap.set(toolkit.name, toolkit);
                },
                close() {
                    return new Promise((res, rej) => {
                        server.close((err) => {
                            if (err)
                                rej(err);
                            else
                                res();
                        });
                    });
                },
            });
        });
        server.on("error", reject);
    });
}
