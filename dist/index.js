import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = {
    name: "codex",
    aptName: "codex",
    description: "OpenAI Codex integration (codex, codex-exec)",
    source: "rust",
    commands: [
        { name: "codex", permissionTier: "full" },
        { name: "codex-exec", permissionTier: "full" },
    ],
    get commandDir() {
        return resolve(__dirname, "..", "wasm");
    },
};
export default pkg;
