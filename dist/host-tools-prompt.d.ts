import type { ToolKit } from "./host-tools.js";
/**
 * Generate a markdown tool reference from a list of toolkits.
 * One line per tool in the summary to keep prompt size manageable.
 * Agents can run `--help` for full details.
 */
export declare function generateToolReference(toolKits: ToolKit[]): string;
