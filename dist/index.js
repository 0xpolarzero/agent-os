import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = {
    name: "ripgrep",
    aptName: "ripgrep",
    description: "ripgrep fast recursive search",
    source: "rust",
    commands: [{ name: "rg", permissionTier: "read-only" }],
    get commandDir() {
        return resolve(__dirname, "..", "wasm");
    },
};
export default pkg;
