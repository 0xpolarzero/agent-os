import { readFileSync, realpathSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
/**
 * Resolve a package directory by walking up the directory tree.
 * Supports both nested (pnpm) and flat (npm) node_modules layouts.
 */
function resolvePackageDir(startDir, packageName) {
    let searchDir = startDir;
    while (true) {
        const candidate = join(searchDir, "node_modules", packageName);
        if (existsSync(join(candidate, "package.json"))) {
            return realpathSync(candidate);
        }
        const parent = dirname(searchDir);
        if (parent === searchDir)
            break;
        searchDir = parent;
    }
    throw new Error(`Package "${packageName}" not found starting from ${startDir}. ` +
        `Ensure it is installed.`);
}
/**
 * Create a SoftwareContext for a software descriptor.
 * Resolves npm package paths relative to the descriptor's packageDir.
 */
function createSoftwareContext(packageDir, requires) {
    // Pre-resolve all required packages to host paths
    const resolvedPackages = new Map();
    for (const reqPkg of requires) {
        const hostDir = resolvePackageDir(packageDir, reqPkg);
        const pkg = JSON.parse(readFileSync(join(hostDir, "package.json"), "utf-8"));
        const vmDir = `/root/node_modules/${reqPkg}`;
        resolvedPackages.set(reqPkg, { hostDir, vmDir, pkg });
    }
    return {
        resolveBin(packageName, binName) {
            const resolved = resolvedPackages.get(packageName);
            if (!resolved) {
                throw new Error(`Package "${packageName}" is not in the requires list. ` +
                    `Available: ${[...resolvedPackages.keys()].join(", ")}`);
            }
            const { pkg, vmDir } = resolved;
            let binEntry;
            const effectiveBinName = binName ?? packageName;
            if (typeof pkg.bin === "string") {
                binEntry = pkg.bin;
            }
            else if (typeof pkg.bin === "object" && pkg.bin !== null) {
                const binMap = pkg.bin;
                binEntry = binMap[effectiveBinName] ?? Object.values(binMap)[0];
            }
            if (!binEntry) {
                throw new Error(`No bin entry "${effectiveBinName}" found in ${packageName}/package.json`);
            }
            return `${vmDir}/${binEntry}`;
        },
        resolvePackage(packageName) {
            const resolved = resolvedPackages.get(packageName);
            if (!resolved) {
                throw new Error(`Package "${packageName}" is not in the requires list. ` +
                    `Available: ${[...resolvedPackages.keys()].join(", ")}`);
            }
            return resolved.vmDir;
        },
    };
}
// ── defineSoftware ───────────────────────────────────────────────────
/**
 * Define a software descriptor. This is a type-safe identity function that
 * validates the descriptor shape at compile time.
 */
export function defineSoftware(desc) {
    return desc;
}
/** Check if a descriptor is a typed software descriptor (has a `type` field). */
function isTypedDescriptor(desc) {
    return "type" in desc && typeof desc.type === "string";
}
/**
 * Process an array of software descriptors at boot time.
 * Collects WASM command dirs, module access roots, and agent configurations.
 *
 * Any object with a `commandDir` property (e.g., registry packages) is treated
 * as a WASM command source. Typed descriptors with `type: "agent"` or `type: "tool"`
 * are processed for module mounting and agent registration.
 */
export function processSoftware(software) {
    const commandDirs = [];
    const softwareRoots = [];
    const agentConfigs = new Map();
    // Flatten nested arrays (meta-packages export arrays of sub-packages).
    const flat = software.flat();
    for (const pkg of flat) {
        if (!isTypedDescriptor(pkg)) {
            // Duck-typed: any object with commandDir is a WASM command source.
            commandDirs.push(pkg.commandDir);
            continue;
        }
        switch (pkg.type) {
            case "wasm-commands": {
                commandDirs.push(pkg.commandDir);
                break;
            }
            case "agent": {
                // Collect module roots for all required npm packages.
                // Walks up directory tree to support flat (npm) and nested (pnpm) layouts.
                const ctx = createSoftwareContext(pkg.packageDir, pkg.requires);
                for (const reqPkg of pkg.requires) {
                    const hostDir = resolvePackageDir(pkg.packageDir, reqPkg);
                    const vmDir = `/root/node_modules/${reqPkg}`;
                    softwareRoots.push({ hostPath: hostDir, vmPath: vmDir });
                }
                // Compute static + dynamic env vars.
                const staticEnv = pkg.agent.staticEnv ?? {};
                const dynamicEnv = pkg.agent.env ? pkg.agent.env(ctx) : {};
                const combinedEnv = { ...staticEnv, ...dynamicEnv };
                // Register agent config.
                const agentConfig = {
                    acpAdapter: pkg.agent.acpAdapter,
                    agentPackage: pkg.agent.agentPackage,
                    defaultEnv: Object.keys(combinedEnv).length > 0 ? combinedEnv : undefined,
                    prepareInstructions: pkg.agent.prepareInstructions,
                };
                agentConfigs.set(pkg.agent.id, agentConfig);
                break;
            }
            case "tool": {
                // Collect module roots for all required npm packages.
                // Walks up directory tree to support flat (npm) and nested (pnpm) layouts.
                for (const reqPkg of pkg.requires) {
                    const hostDir = resolvePackageDir(pkg.packageDir, reqPkg);
                    const vmDir = `/root/node_modules/${reqPkg}`;
                    softwareRoots.push({ hostPath: hostDir, vmPath: vmDir });
                }
                // Tool bin registration is handled by the caller (AgentOs.create)
                // since it requires kernel access.
                break;
            }
        }
    }
    return { commandDirs, softwareRoots, agentConfigs };
}
