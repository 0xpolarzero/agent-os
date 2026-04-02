import coreutils from "@rivet-dev/agent-os-coreutils";
import sed from "@rivet-dev/agent-os-sed";
import grep from "@rivet-dev/agent-os-grep";
import gawk from "@rivet-dev/agent-os-gawk";
import findutils from "@rivet-dev/agent-os-findutils";
import diffutils from "@rivet-dev/agent-os-diffutils";
import tar from "@rivet-dev/agent-os-tar";
import gzip from "@rivet-dev/agent-os-gzip";
declare const common: ({
    name: string;
    aptName: string;
    description: string;
    source: "rust";
    commands: ({
        name: string;
        permissionTier: "full";
        aliasOf?: undefined;
    } | {
        name: string;
        permissionTier: "full";
        aliasOf: string;
    } | {
        name: string;
        permissionTier: "read-write";
        aliasOf?: undefined;
    } | {
        name: string;
        permissionTier: "read-only";
        aliasOf?: undefined;
    } | {
        name: string;
        permissionTier: "read-only";
        aliasOf: string;
    })[];
    readonly commandDir: string;
} | {
    name: string;
    aptName: string;
    description: string;
    source: "rust";
    commands: ({
        name: string;
        permissionTier: "read-only";
    } | {
        name: string;
        permissionTier: "full";
    })[];
    readonly commandDir: string;
})[];
export default common;
export { coreutils, sed, grep, gawk, findutils, diffutils, tar, gzip };
