import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = {
    name: "diffutils",
    aptName: "diffutils",
    description: "GNU diffutils (diff)",
    source: "rust",
    commands: [{ name: "diff", permissionTier: "read-only" }],
    get commandDir() {
        return resolve(__dirname, "..", "wasm");
    },
};
export default pkg;
