import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = {
    name: "jq",
    aptName: "jq",
    description: "jq JSON processor",
    source: "rust",
    commands: [{ name: "jq", permissionTier: "read-only" }],
    get commandDir() {
        return resolve(__dirname, "..", "wasm");
    },
};
export default pkg;
