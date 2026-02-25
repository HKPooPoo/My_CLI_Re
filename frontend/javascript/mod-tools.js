/**
 * MOD Tools - Cross-MOD Tool Registry
 * =================================================================
 * Allows MODs to expose callable tools (OpenAI function-calling
 * compatible schema). Other MODs or LLM agents can discover and
 * invoke these tools.
 *
 * Tools are registered declaratively via template.tools[] during
 * boot, or imperatively via ModTools.register().
 *
 * Tool names are namespaced: "{templateId}.{toolName}"
 * =================================================================
 */

const _tools = {};  // fullName → { definition, execute, templateId }

export const ModTools = {
    /**
     * Register a tool.
     * @param {string} templateId  Owning template ID
     * @param {object} tool        Tool definition
     * @param {string} tool.name         Short name (e.g. 'translate_text')
     * @param {string} tool.description  What this tool does
     * @param {object} tool.parameters   JSON Schema for arguments
     * @param {Function} tool.execute    async (args, ctx) => result
     */
    register(templateId, tool) {
        const fullName = `${templateId}.${tool.name}`;
        _tools[fullName] = {
            definition: {
                name: fullName,
                description: tool.description,
                parameters: tool.parameters || { type: 'object', properties: {} }
            },
            execute: tool.execute,
            templateId
        };
    },

    /**
     * Unregister all tools owned by a template.
     * @param {string} templateId
     */
    unregisterAll(templateId) {
        for (const key of Object.keys(_tools)) {
            if (_tools[key].templateId === templateId) {
                delete _tools[key];
            }
        }
    },

    /**
     * Execute a registered tool by full name.
     * @param {string} fullName  e.g. 'translate.translate_text'
     * @param {object} args      Arguments matching the tool's parameter schema
     * @param {object} [ctx]     Optional ModContext for the calling MOD
     * @returns {Promise<any>}   Tool result
     */
    async executeTool(fullName, args, ctx = null) {
        const tool = _tools[fullName];
        if (!tool) {
            throw new Error(`Tool "${fullName}" not found`);
        }
        return await tool.execute(args, ctx);
    },

    /**
     * Get all tool definitions (OpenAI function-calling format).
     * Useful for feeding to an LLM as available functions.
     * @returns {object[]} Array of { name, description, parameters }
     */
    getToolDefinitions() {
        return Object.values(_tools).map(t => t.definition);
    },

    /**
     * Get tool definitions for a specific template.
     * @param {string} templateId
     * @returns {object[]}
     */
    getToolDefinitionsForTemplate(templateId) {
        return Object.values(_tools)
            .filter(t => t.templateId === templateId)
            .map(t => t.definition);
    },

    /**
     * Check if a tool exists.
     * @param {string} fullName
     * @returns {boolean}
     */
    hasTool(fullName) {
        return !!_tools[fullName];
    },

    /**
     * List all registered tool names.
     * @returns {string[]}
     */
    getToolNames() {
        return Object.keys(_tools);
    }
};
