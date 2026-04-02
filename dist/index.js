import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = {
    name: "gawk",
    aptName: "gawk",
    description: "GNU awk text processing",
    source: "rust",
    commands: [{ name: "awk", permissionTier: "read-only" }],
    get commandDir() {
        return resolve(__dirname, "..", "wasm");
    },
};
export default pkg;
