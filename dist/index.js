import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = {
    name: "findutils",
    aptName: "findutils",
    description: "GNU findutils (find, xargs)",
    source: "rust",
    commands: [
        { name: "find", permissionTier: "read-only" },
        { name: "xargs", permissionTier: "full" },
    ],
    get commandDir() {
        return resolve(__dirname, "..", "wasm");
    },
};
export default pkg;
