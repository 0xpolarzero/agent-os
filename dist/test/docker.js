/**
 * Docker test helpers for spinning up containers in integration tests.
 *
 * Uses the Docker CLI via child_process.execFile so no Docker SDK dependency
 * is required. Each helper returns a handle with a `stop()` method that
 * removes the container.
 */
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
const execFile = promisify(execFileCb);
// ---------------------------------------------------------------------------
// Generic container starter
// ---------------------------------------------------------------------------
/**
 * Start a Docker container and optionally wait for it to become healthy.
 */
export async function startContainer(options) {
    const containerName = options.name ?? `test-${randomUUID().slice(0, 8)}`;
    const args = [
        "run",
        "--detach",
        "--name",
        containerName,
        "--rm",
    ];
    // Port mappings
    if (options.ports) {
        for (const p of options.ports) {
            const proto = p.protocol ?? "tcp";
            args.push("--publish", `${p.host}:${p.container}/${proto}`);
        }
    }
    // Environment variables
    if (options.env) {
        for (const [k, v] of Object.entries(options.env)) {
            args.push("--env", `${k}=${v}`);
        }
    }
    // Health check
    if (options.healthCheck) {
        const hc = options.healthCheck;
        args.push("--health-cmd", hc.command);
        if (hc.interval)
            args.push("--health-interval", hc.interval);
        if (hc.startPeriod)
            args.push("--health-start-period", hc.startPeriod);
        if (hc.timeout)
            args.push("--health-timeout", hc.timeout);
        if (hc.retries !== undefined)
            args.push("--health-retries", String(hc.retries));
    }
    // Image
    args.push(options.image);
    // Command
    if (options.command) {
        args.push(...options.command);
    }
    // Start the container
    let stdout;
    try {
        const result = await execFile("docker", args);
        stdout = result.stdout;
    }
    catch (err) {
        if (err instanceof Error &&
            "code" in err &&
            err.code === "ENOENT") {
            throw new Error("Docker CLI not found. Ensure Docker is installed and the 'docker' command is on your PATH.");
        }
        // Re-check for daemon not running (docker exits with non-zero and stderr mentions "daemon")
        if (err instanceof Error && err.message?.includes("Cannot connect to the Docker daemon")) {
            throw new Error("Cannot connect to the Docker daemon. Is Docker running?");
        }
        throw err;
    }
    const containerId = stdout.trim();
    const stop = async () => {
        try {
            await execFile("docker", ["rm", "--force", containerId]);
        }
        catch {
            // Container may already be stopped.
        }
    };
    // Wait for healthy if a health check was configured
    if (options.healthCheck) {
        const timeout = options.healthTimeout ?? 30_000;
        await waitForHealthy(containerId, timeout);
    }
    // Resolve host ports
    const ports = {};
    if (options.ports) {
        for (const p of options.ports) {
            const proto = p.protocol ?? "tcp";
            const key = `${p.container}/${proto}`;
            const { stdout: portOut } = await execFile("docker", [
                "port",
                containerId,
                key,
            ]);
            // Output format: "0.0.0.0:49152" or "[::]:49152"
            const match = portOut.trim().match(/:(\d+)$/m);
            if (match) {
                ports[key] = parseInt(match[1], 10);
            }
            else {
                await stop();
                throw new Error(`Failed to resolve host port for container port ${key} on container ${containerId}. ` +
                    `docker port output: ${JSON.stringify(portOut.trim())}`);
            }
        }
    }
    return { id: containerId, name: containerName, ports, stop };
}
// ---------------------------------------------------------------------------
// Health check poller
// ---------------------------------------------------------------------------
async function waitForHealthy(containerId, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            // Check if the container has exited or crashed.
            const { stdout: stateOut } = await execFile("docker", [
                "inspect",
                "--format",
                "{{.State.Status}}",
                containerId,
            ]);
            const containerState = stateOut.trim();
            if (containerState === "exited" || containerState === "dead") {
                // Grab exit code and logs for a useful error message.
                let exitInfo = "";
                try {
                    const { stdout: exitOut } = await execFile("docker", [
                        "inspect",
                        "--format",
                        "{{.State.ExitCode}}",
                        containerId,
                    ]);
                    exitInfo = ` (exit code: ${exitOut.trim()})`;
                }
                catch {
                    // Best effort.
                }
                let logs = "";
                try {
                    const { stderr, stdout: logOut } = await execFile("docker", [
                        "logs",
                        "--tail",
                        "20",
                        containerId,
                    ]);
                    logs = (logOut + stderr).trim();
                }
                catch {
                    // Best effort.
                }
                throw new Error(`Container ${containerId} ${containerState}${exitInfo} before becoming healthy.` +
                    (logs ? `\nLast logs:\n${logs}` : ""));
            }
            // Check health status.
            const { stdout } = await execFile("docker", [
                "inspect",
                "--format",
                "{{.State.Health.Status}}",
                containerId,
            ]);
            const status = stdout.trim();
            if (status === "healthy")
                return;
        }
        catch (err) {
            // Re-throw container crash errors.
            if (err instanceof Error && (err.message.includes("exited") || err.message.includes("dead"))) {
                throw err;
            }
            // inspect may fail briefly while container is starting
        }
        await sleep(500);
    }
    throw new Error(`Container ${containerId} did not become healthy within ${timeoutMs}ms`);
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
// ---------------------------------------------------------------------------
// Docker exec helper
// ---------------------------------------------------------------------------
async function dockerExec(containerId, command) {
    const { stdout } = await execFile("docker", [
        "exec",
        containerId,
        ...command,
    ]);
    return stdout;
}
/**
 * Start a MinIO container, wait for it to be healthy, and create a test
 * bucket using `mc mb`.
 */
export async function startMinioContainer(options) {
    const rootUser = options?.rootUser ?? "minioadmin";
    const rootPassword = options?.rootPassword ?? "minioadmin";
    const bucket = options?.bucket ?? "test-bucket";
    const image = options?.image ?? "minio/minio:latest";
    const container = await startContainer({
        image,
        ports: [{ host: 0, container: 9000 }],
        env: {
            MINIO_ROOT_USER: rootUser,
            MINIO_ROOT_PASSWORD: rootPassword,
        },
        healthCheck: {
            command: "mc ready local",
            interval: "2s",
            startPeriod: "2s",
            timeout: "5s",
            retries: 10,
        },
        command: ["server", "/data"],
        healthTimeout: options?.healthTimeout ?? 30_000,
    });
    const hostPort = container.ports["9000/tcp"];
    const endpoint = `http://127.0.0.1:${hostPort}`;
    // Create the test bucket via docker exec
    await dockerExec(container.id, [
        "mc",
        "alias",
        "set",
        "local",
        "http://localhost:9000",
        rootUser,
        rootPassword,
    ]);
    await dockerExec(container.id, ["mc", "mb", `local/${bucket}`]);
    return {
        ...container,
        endpoint,
        accessKeyId: rootUser,
        secretAccessKey: rootPassword,
        bucket,
    };
}
/**
 * Start a Sandbox Agent container and return a connected SandboxAgent client.
 */
export async function startSandboxAgentContainer(options) {
    const image = options?.image ?? "sandbox-agent-test:dev";
    const port = options?.port ?? 2468;
    const container = await startContainer({
        image,
        ports: [{ host: 0, container: port }],
        command: ["server", "--host", "0.0.0.0", "--port", String(port), "--no-token"],
    });
    const hostPort = container.ports[`${port}/tcp`];
    const baseUrl = `http://127.0.0.1:${hostPort}`;
    // Poll health from the host since the container may not have curl.
    const timeout = options?.healthTimeout ?? 60_000;
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        try {
            const resp = await fetch(`${baseUrl}/`);
            if (resp.ok)
                break;
        }
        catch {
            // Server not ready yet.
        }
        await sleep(500);
    }
    if (Date.now() >= deadline) {
        await container.stop();
        throw new Error(`Sandbox Agent at ${baseUrl} did not become healthy within ${timeout}ms`);
    }
    // Dynamically import sandbox-agent to avoid requiring it at module load time.
    const { SandboxAgent } = await import("sandbox-agent");
    let client;
    try {
        client = await SandboxAgent.connect({ baseUrl });
    }
    catch (err) {
        await container.stop();
        throw new Error(`Failed to connect to Sandbox Agent at ${baseUrl}: ${err instanceof Error ? err.message : err}`);
    }
    return {
        ...container,
        baseUrl,
        client,
    };
}
/**
 * Start a Postgres container, wait for it to be healthy, and return
 * connection details.
 */
export async function startPostgresContainer(options) {
    const user = options?.user ?? "test";
    const password = options?.password ?? "test";
    const database = options?.database ?? "testdb";
    const image = options?.image ?? "postgres:16-alpine";
    const container = await startContainer({
        image,
        ports: [{ host: 0, container: 5432 }],
        env: {
            POSTGRES_USER: user,
            POSTGRES_PASSWORD: password,
            POSTGRES_DB: database,
            // pg_isready reads these env vars natively, avoiding shell interpolation.
            PGUSER: user,
            PGDATABASE: database,
        },
        healthCheck: {
            command: "pg_isready",
            interval: "2s",
            startPeriod: "2s",
            timeout: "5s",
            retries: 15,
        },
        healthTimeout: options?.healthTimeout ?? 30_000,
    });
    const hostPort = container.ports["5432/tcp"];
    const host = "127.0.0.1";
    const connectionString = `postgresql://${user}:${password}@${host}:${hostPort}/${database}`;
    return {
        ...container,
        connectionString,
        host,
        port: hostPort,
        user,
        password,
        database,
    };
}
