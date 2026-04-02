import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = {
    name: "unzip",
    aptName: "unzip",
    description: "unzip archive extraction",
    source: "c",
    commands: [{ name: "unzip", permissionTier: "read-only" }],
    get commandDir() {
        return resolve(__dirname, "..", "wasm");
    },
};
export default pkg;
