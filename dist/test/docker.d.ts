/**
 * Docker test helpers for spinning up containers in integration tests.
 *
 * Uses the Docker CLI via child_process.execFile so no Docker SDK dependency
 * is required. Each helper returns a handle with a `stop()` method that
 * removes the container.
 */
export interface PortMapping {
    /** Host port. Use 0 for a random available port. */
    host: number;
    /** Container port. */
    container: number;
    /** Protocol (default "tcp"). */
    protocol?: string;
}
export interface HealthCheck {
    /** Shell command to run inside the container. */
    command: string;
    /** How often to check (default "2s"). */
    interval?: string;
    /** How long to wait before first check (default "1s"). */
    startPeriod?: string;
    /** Per-check timeout (default "5s"). */
    timeout?: string;
    /** Number of consecutive failures before unhealthy (default 5). */
    retries?: number;
}
export interface StartContainerOptions {
    /** Docker image (e.g. "minio/minio:latest"). */
    image: string;
    /** Optional container name. A random name is generated if omitted. */
    name?: string;
    /** Port mappings. */
    ports?: PortMapping[];
    /** Environment variables. */
    env?: Record<string, string>;
    /** Docker health check configuration. */
    healthCheck?: HealthCheck;
    /** Command and arguments to pass to the container entrypoint. */
    command?: string[];
    /** Maximum time in ms to wait for the container to become healthy (default 30000). */
    healthTimeout?: number;
}
export interface ContainerHandle {
    /** Docker container ID. */
    id: string;
    /** Container name. */
    name: string;
    /** Resolved host ports keyed by container port (e.g. "9000/tcp" → 49152). */
    ports: Record<string, number>;
    /** Stop and remove the container. */
    stop: () => Promise<void>;
}
/**
 * Start a Docker container and optionally wait for it to become healthy.
 */
export declare function startContainer(options: StartContainerOptions): Promise<ContainerHandle>;
export interface MinioContainerOptions {
    /** MinIO image (default "minio/minio:latest"). */
    image?: string;
    /** Root user (default "minioadmin"). */
    rootUser?: string;
    /** Root password (default "minioadmin"). */
    rootPassword?: string;
    /** Name of the test bucket to create (default "test-bucket"). */
    bucket?: string;
    /** Health timeout in ms (default 30000). */
    healthTimeout?: number;
}
export interface MinioContainerHandle extends ContainerHandle {
    /** S3-compatible endpoint URL (e.g. "http://127.0.0.1:49152"). */
    endpoint: string;
    /** Access key (root user). */
    accessKeyId: string;
    /** Secret key (root password). */
    secretAccessKey: string;
    /** Name of the created bucket. */
    bucket: string;
}
/**
 * Start a MinIO container, wait for it to be healthy, and create a test
 * bucket using `mc mb`.
 */
export declare function startMinioContainer(options?: MinioContainerOptions): Promise<MinioContainerHandle>;
export interface SandboxAgentContainerOptions {
    /** Sandbox Agent Docker image (default "sandbox-agent-test:dev"). */
    image?: string;
    /** Container port the server listens on (default 2468). */
    port?: number;
    /** Health timeout in ms (default 60000). */
    healthTimeout?: number;
}
export interface SandboxAgentContainerHandle extends ContainerHandle {
    /** Base URL for the Sandbox Agent API (e.g. "http://127.0.0.1:49152"). */
    baseUrl: string;
    /** Connected SandboxAgent client. */
    client: import("sandbox-agent").SandboxAgent;
}
/**
 * Start a Sandbox Agent container and return a connected SandboxAgent client.
 */
export declare function startSandboxAgentContainer(options?: SandboxAgentContainerOptions): Promise<SandboxAgentContainerHandle>;
export interface PostgresContainerOptions {
    /** Postgres Docker image (default "postgres:16-alpine"). */
    image?: string;
    /** Database user (default "test"). */
    user?: string;
    /** Database password (default "test"). */
    password?: string;
    /** Database name (default "testdb"). */
    database?: string;
    /** Health timeout in ms (default 30000). */
    healthTimeout?: number;
}
export interface PostgresContainerHandle extends ContainerHandle {
    /** Full connection string (e.g. "postgresql://test:test@127.0.0.1:5432/testdb"). */
    connectionString: string;
    /** Host (always 127.0.0.1). */
    host: string;
    /** Resolved host port. */
    port: number;
    /** Database user. */
    user: string;
    /** Database password. */
    password: string;
    /** Database name. */
    database: string;
}
/**
 * Start a Postgres container, wait for it to be healthy, and return
 * connection details.
 */
export declare function startPostgresContainer(options?: PostgresContainerOptions): Promise<PostgresContainerHandle>;
