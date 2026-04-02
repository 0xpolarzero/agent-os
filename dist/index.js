import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = {
    name: "fd",
    aptName: "fd-find",
    description: "fd fast file finder",
    source: "rust",
    commands: [{ name: "fd", permissionTier: "read-only" }],
    get commandDir() {
        return resolve(__dirname, "..", "wasm");
    },
};
export default pkg;
