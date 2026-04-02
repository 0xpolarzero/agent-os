import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = {
    name: "grep",
    aptName: "grep",
    description: "GNU grep pattern matching (grep, egrep, fgrep)",
    source: "rust",
    commands: [
        { name: "grep", permissionTier: "read-only" },
        { name: "egrep", permissionTier: "read-only", aliasOf: "grep" },
        { name: "fgrep", permissionTier: "read-only", aliasOf: "grep" },
    ],
    get commandDir() {
        return resolve(__dirname, "..", "wasm");
    },
};
export default pkg;
