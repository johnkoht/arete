/**
 * ToolService — manages tool discovery from workspace tools directory.
 *
 * Business logic only. No chalk, inquirer, or other CLI dependencies.
 * Mirrors SkillService pattern for consistency.
 */
import { join, basename } from 'path';
import { parse as parseYaml } from 'yaml';
function readToolFrontmatter(content) {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match)
        return {};
    try {
        return parseYaml(match[1]) ?? {};
    }
    catch {
        return {};
    }
}
export class ToolService {
    storage;
    constructor(storage) {
        this.storage = storage;
    }
    /**
     * List all tools in the given tools directory.
     *
     * @param toolsDir - Resolved absolute path to the tools directory
     *   (e.g. WorkspacePaths.tools). The caller is responsible for
     *   resolving the IDE-specific path.
     */
    async list(toolsDir) {
        const exists = await this.storage.exists(toolsDir);
        if (!exists)
            return [];
        const subdirs = await this.storage.listSubdirectories(toolsDir);
        const results = [];
        for (const toolPath of subdirs) {
            const def = await this.getInfo(toolPath);
            results.push(def);
        }
        return results;
    }
    /**
     * Get a specific tool by id from the tools directory.
     *
     * @param id - Tool identifier (directory name)
     * @param toolsDir - Resolved absolute path to the tools directory
     */
    async get(id, toolsDir) {
        const toolPath = join(toolsDir, id);
        const exists = await this.storage.exists(toolPath);
        if (!exists)
            return null;
        return this.getInfo(toolPath);
    }
    /**
     * Read tool metadata from a tool directory.
     * If no TOOL.md exists, returns a minimal definition with id and name from dirname.
     */
    async getInfo(toolPath) {
        const id = basename(toolPath);
        const toolFile = join(toolPath, 'TOOL.md');
        const exists = await this.storage.exists(toolFile);
        if (!exists) {
            return {
                id,
                name: id,
                description: '',
                path: toolPath,
                triggers: [],
            };
        }
        const content = await this.storage.read(toolFile);
        const frontmatter = content ? readToolFrontmatter(content) : {};
        const fm = frontmatter;
        const name = fm.name || id;
        const description = fm.description || '';
        const triggers = Array.isArray(fm.triggers) ? fm.triggers : [];
        const lifecycle = typeof fm.lifecycle === 'string'
            ? fm.lifecycle
            : undefined;
        const duration = typeof fm.duration === 'string' ? fm.duration : undefined;
        const workType = typeof fm.work_type === 'string'
            ? fm.work_type
            : undefined;
        const category = typeof fm.category === 'string'
            ? fm.category
            : undefined;
        return {
            id,
            name,
            description,
            path: toolPath,
            triggers,
            lifecycle,
            duration,
            workType,
            category,
        };
    }
}
//# sourceMappingURL=tools.js.map