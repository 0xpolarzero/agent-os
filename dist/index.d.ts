declare const opencode: {
    name: string;
    type: "agent";
    packageDir: string;
    requires: string[];
    agent: {
        id: string;
        acpAdapter: string;
        agentPackage: string;
        prepareInstructions: (kernel: import("@secure-exec/core").Kernel, _cwd: string, additionalInstructions: string | undefined, opts: import("@rivet-dev/agent-os-core").PrepareInstructionsOptions | undefined) => Promise<{
            env?: undefined;
        } | {
            env: {
                OPENCODE_CONTEXTPATHS: string;
            };
        }>;
    };
};
export default opencode;
