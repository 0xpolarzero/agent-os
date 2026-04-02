import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = {
    name: "zip",
    aptName: "zip",
    description: "zip archive creation",
    source: "c",
    commands: [{ name: "zip", permissionTier: "read-write" }],
    get commandDir() {
        return resolve(__dirname, "..", "wasm");
    },
};
export default pkg;
