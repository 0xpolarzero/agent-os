import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = {
    name: "gzip",
    aptName: "gzip",
    description: "GNU gzip compression (gzip, gunzip, zcat)",
    source: "rust",
    commands: [
        { name: "gzip", permissionTier: "read-only" },
        { name: "gunzip", permissionTier: "read-only", aliasOf: "gzip" },
        { name: "zcat", permissionTier: "read-only", aliasOf: "gzip" },
    ],
    get commandDir() {
        return resolve(__dirname, "..", "wasm");
    },
};
export default pkg;
