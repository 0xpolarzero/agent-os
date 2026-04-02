declare const piCli: {
    name: string;
    type: "agent";
    packageDir: string;
    requires: string[];
    agent: {
        id: string;
        acpAdapter: string;
        agentPackage: string;
        env: (ctx: import("@rivet-dev/agent-os-core").SoftwareContext) => {
            PI_ACP_PI_COMMAND: string;
        };
        prepareInstructions: (kernel: import("@secure-exec/core").Kernel, _cwd: string, additionalInstructions: string | undefined, opts: import("@rivet-dev/agent-os-core").PrepareInstructionsOptions | undefined) => Promise<{
            args?: undefined;
        } | {
            args: string[];
        }>;
    };
};
export default piCli;
