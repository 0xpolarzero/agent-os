/** Maximum length for tool and toolkit descriptions (characters). */
export const MAX_TOOL_DESCRIPTION_LENGTH = 200;
/** Helper to create a HostTool with type inference. */
export function hostTool(def) {
    return def;
}
/** Helper to create a ToolKit. */
export function toolKit(def) {
    return def;
}
/**
 * Validate all description lengths in the given toolkits.
 * Throws if any toolkit or tool description exceeds MAX_TOOL_DESCRIPTION_LENGTH.
 */
export function validateToolkits(toolKits) {
    for (const tk of toolKits) {
        if (tk.description.length > MAX_TOOL_DESCRIPTION_LENGTH) {
            throw new Error(`Toolkit "${tk.name}" description is ${tk.description.length} characters, max is ${MAX_TOOL_DESCRIPTION_LENGTH}`);
        }
        for (const [toolName, tool] of Object.entries(tk.tools)) {
            if (tool.description.length > MAX_TOOL_DESCRIPTION_LENGTH) {
                throw new Error(`Tool "${tk.name}/${toolName}" description is ${tool.description.length} characters, max is ${MAX_TOOL_DESCRIPTION_LENGTH}`);
            }
        }
    }
}
