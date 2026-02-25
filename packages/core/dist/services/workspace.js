/**
 * WorkspaceService — manages workspace detection and lifecycle.
 *
 * Uses StorageAdapter for all file operations. No direct fs imports.
 */
import { join, dirname, resolve } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { getAdapter, detectAdapter, getAdapterFromConfig } from '../adapters/index.js';
import { BASE_WORKSPACE_DIRS, DEFAULT_FILES, PRODUCT_RULES_ALLOW_LIST, } from '../workspace-structure.js';
import { loadConfig, getDefaultConfig } from '../config.js';
export class WorkspaceService {
    storage;
    constructor(storage) {
        this.storage = storage;
    }
    async isWorkspace(dir) {
        const manifestExists = await this.storage.exists(join(dir, 'arete.yaml'));
        if (manifestExists)
            return true;
        const hasCursor = (await this.storage.exists(join(dir, '.cursor'))) ||
            (await this.storage.exists(join(dir, '.claude')));
        const hasContext = await this.storage.exists(join(dir, 'context'));
        const hasMemory = (await this.storage.exists(join(dir, '.arete', 'memory'))) ||
            (await this.storage.exists(join(dir, 'memory')));
        return !!(hasCursor && hasContext && hasMemory);
    }
    async findRoot(startDir = process.cwd()) {
        let current = resolve(startDir);
        const root = dirname(current);
        while (current !== root) {
            const manifestExists = await this.storage.exists(join(current, 'arete.yaml'));
            if (manifestExists)
                return current;
            const hasCursor = await this.storage.exists(join(current, '.cursor'));
            const hasClaude = await this.storage.exists(join(current, '.claude'));
            const hasContext = await this.storage.exists(join(current, 'context'));
            const hasAreteMemory = await this.storage.exists(join(current, '.arete', 'memory'));
            const hasLegacyMemory = await this.storage.exists(join(current, 'memory'));
            if ((hasCursor || hasClaude) &&
                hasContext &&
                (hasAreteMemory || hasLegacyMemory)) {
                return current;
            }
            current = dirname(current);
        }
        return null;
    }
    getPaths(workspaceRoot) {
        const adapter = detectAdapter(workspaceRoot);
        return {
            root: workspaceRoot,
            manifest: join(workspaceRoot, 'arete.yaml'),
            ideConfig: join(workspaceRoot, adapter.configDirName),
            rules: join(workspaceRoot, adapter.rulesDir()),
            agentSkills: join(workspaceRoot, '.agents', 'skills'),
            tools: join(workspaceRoot, adapter.toolsDir()),
            integrations: join(workspaceRoot, adapter.integrationsDir()),
            context: join(workspaceRoot, 'context'),
            memory: join(workspaceRoot, '.arete', 'memory'),
            now: join(workspaceRoot, 'now'),
            goals: join(workspaceRoot, 'goals'),
            projects: join(workspaceRoot, 'projects'),
            resources: join(workspaceRoot, 'resources'),
            people: join(workspaceRoot, 'people'),
            credentials: join(workspaceRoot, '.credentials'),
            templates: join(workspaceRoot, 'templates'),
        };
    }
    async create(targetDir, options) {
        const result = {
            directories: [],
            files: [],
            skills: [],
            tools: [],
            rules: [],
            errors: [],
        };
        const ideTarget = options.ideTarget ?? 'cursor';
        const adapter = getAdapter(ideTarget);
        const allDirs = [...BASE_WORKSPACE_DIRS, ...adapter.getIDEDirs()];
        for (const dir of allDirs) {
            const fullPath = join(targetDir, dir);
            const exists = await this.storage.exists(fullPath);
            if (!exists) {
                try {
                    await this.storage.mkdir(fullPath);
                    result.directories.push(dir);
                }
                catch (err) {
                    result.errors.push({
                        type: 'directory',
                        path: dir,
                        error: err.message,
                    });
                }
            }
        }
        for (const [filePath, content] of Object.entries(DEFAULT_FILES)) {
            const fullPath = join(targetDir, filePath);
            const exists = await this.storage.exists(fullPath);
            if (!exists) {
                try {
                    const parentDir = join(fullPath, '..');
                    await this.storage.mkdir(parentDir);
                    await this.storage.write(fullPath, content);
                    result.files.push(filePath);
                }
                catch (err) {
                    result.errors.push({
                        type: 'file',
                        path: filePath,
                        error: err.message,
                    });
                }
            }
        }
        const sourcePaths = options.sourcePaths;
        if (sourcePaths && this.storage.copy) {
            const paths = this.getPaths(targetDir);
            if (await this.storage.exists(sourcePaths.skills)) {
                const subdirs = await this.storage.listSubdirectories(sourcePaths.skills);
                for (const src of subdirs) {
                    const name = src.split(/[/\\]/).pop() ?? '';
                    const dest = join(paths.agentSkills, name);
                    const destExists = await this.storage.exists(dest);
                    if (!destExists) {
                        try {
                            await this.storage.mkdir(paths.agentSkills);
                            await this.storage.copy(src, dest, { recursive: true });
                            result.skills.push(name);
                        }
                        catch (err) {
                            result.errors.push({
                                type: 'skill',
                                path: name,
                                error: err.message,
                            });
                        }
                    }
                }
            }
            // Copy tools to IDE-specific tools directory (e.g. .cursor/tools/ or .claude/tools/)
            // Regression fix: tools were copied in the old CLI install command but were never
            // ported into WorkspaceService.create() during the CLI refactor (e3bc217, 2026-02-15).
            if (sourcePaths.tools && await this.storage.exists(sourcePaths.tools)) {
                const toolDirs = await this.storage.listSubdirectories(sourcePaths.tools);
                for (const src of toolDirs) {
                    const name = src.split(/[/\\]/).pop() ?? '';
                    if (!name)
                        continue;
                    const dest = join(paths.tools, name);
                    const destExists = await this.storage.exists(dest);
                    if (!destExists) {
                        try {
                            await this.storage.mkdir(paths.tools);
                            await this.storage.copy(src, dest, { recursive: true });
                            result.tools.push(name);
                        }
                        catch (err) {
                            result.errors.push({
                                type: 'tool',
                                path: name,
                                error: err.message,
                            });
                        }
                    }
                }
            }
            if (await this.storage.exists(sourcePaths.rules)) {
                const ruleFiles = await this.storage.list(sourcePaths.rules, {
                    extensions: ['.mdc'],
                });
                for (const src of ruleFiles) {
                    if (!PRODUCT_RULES_ALLOW_LIST.some((r) => src.endsWith(r)))
                        continue;
                    const baseName = src.split(/[/\\]/).pop() ?? '';
                    const destName = baseName.replace(/\.mdc$/, adapter.ruleExtension);
                    const dest = join(paths.rules, destName);
                    const destExists = await this.storage.exists(dest);
                    if (!destExists) {
                        try {
                            await this.storage.mkdir(paths.rules);
                            const content = await this.storage.read(src);
                            if (content) {
                                await this.storage.write(dest, content);
                                result.rules.push(destName);
                            }
                        }
                        catch (err) {
                            result.errors.push({
                                type: 'rule',
                                path: baseName,
                                error: err.message,
                            });
                        }
                    }
                }
            }
        }
        // Copy default templates (skip files that already exist)
        if (sourcePaths?.templates && this.storage.copy) {
            const templateSrc = sourcePaths.templates;
            const templateDest = join(targetDir, 'templates');
            const templateSrcExists = await this.storage.exists(templateSrc);
            if (templateSrcExists) {
                const templateFiles = await this.storage.list(templateSrc, { recursive: true });
                for (const src of templateFiles) {
                    const rel = src.slice(templateSrc.length).replace(/^[/\\]/, '');
                    const dest = join(templateDest, rel);
                    const destExists = await this.storage.exists(dest);
                    if (!destExists) {
                        try {
                            const parentDir = join(dest, '..');
                            await this.storage.mkdir(parentDir);
                            const content = await this.storage.read(src);
                            if (content !== null) {
                                await this.storage.write(dest, content);
                                result.files.push(join('templates', rel));
                            }
                        }
                        catch (err) {
                            result.errors.push({
                                type: 'file',
                                path: join('templates', rel),
                                error: err.message,
                            });
                        }
                    }
                }
            }
        }
        // Copy GUIDE.md to workspace root (skip if already exists)
        if (sourcePaths?.guide) {
            const guideSrc = sourcePaths.guide;
            const guideDest = join(targetDir, 'GUIDE.md');
            const guideDestExists = await this.storage.exists(guideDest);
            if (!guideDestExists) {
                try {
                    const content = await this.storage.read(guideSrc);
                    if (content !== null) {
                        await this.storage.write(guideDest, content);
                        result.files.push('GUIDE.md');
                    }
                }
                catch (err) {
                    result.errors.push({
                        type: 'file',
                        path: 'GUIDE.md',
                        error: err.message,
                    });
                }
            }
        }
        const manifest = {
            schema: 1,
            version: '0.1.0',
            source: options.source ?? 'npm',
            agent_mode: 'guide',
            created: new Date().toISOString().split('T')[0],
            ide_target: ideTarget,
            skills: { core: result.skills, overrides: [] },
            tools: [],
            integrations: {},
            settings: getDefaultConfig().settings,
        };
        const manifestPath = join(targetDir, 'arete.yaml');
        await this.storage.write(manifestPath, stringifyYaml(manifest));
        if (!result.files.includes('arete.yaml')) {
            result.files.push('arete.yaml');
        }
        const rootFiles = adapter.generateRootFiles(manifest, targetDir, sourcePaths?.rules);
        for (const [filename, content] of Object.entries(rootFiles)) {
            const filePath = join(targetDir, filename);
            await this.storage.write(filePath, content);
            if (!result.files.includes(filename)) {
                result.files.push(filename);
            }
        }
        return result;
    }
    async update(workspaceRoot, options = {}) {
        const config = await loadConfig(this.storage, workspaceRoot);
        const adapter = getAdapterFromConfig(config, workspaceRoot);
        const paths = this.getPaths(workspaceRoot);
        const structureResult = await this.ensureWorkspaceStructure(workspaceRoot, { getIDEDirs: () => adapter.getIDEDirs() });
        const result = {
            added: [...structureResult.directoriesAdded, ...structureResult.filesAdded],
            updated: [],
            preserved: config.skills?.overrides ? [...config.skills.overrides] : [],
            removed: [],
        };
        if (options.sourcePaths?.skills) {
            const syncResult = await this.syncCoreSkills(options.sourcePaths.skills, paths.agentSkills, new Set(config.skills?.overrides ?? []));
            result.added.push(...syncResult.added);
            result.updated.push(...syncResult.updated);
            result.preserved.push(...syncResult.preserved);
        }
        // Backfill missing tools and missing files within existing tools.
        // Uses file-level backfill (mirrors template backfill pattern below) so that partial
        // tool directories (e.g. onboarding/ exists but templates/ subdir is absent) get
        // completed on update, not just wholly-missing tool directories.
        if (options.sourcePaths?.tools) {
            const toolsSrc = options.sourcePaths.tools;
            const srcExists = await this.storage.exists(toolsSrc);
            if (srcExists) {
                const toolDirs = await this.storage.listSubdirectories(toolsSrc);
                for (const srcToolDir of toolDirs) {
                    const toolName = srcToolDir.split(/[/\\]/).pop() ?? '';
                    if (!toolName)
                        continue;
                    const destToolDir = join(paths.tools, toolName);
                    // Walk all files within the tool dir and backfill any that are missing.
                    // The +1 on slice skips the trailing path separator — mirrors templateSrc pattern.
                    const srcFiles = await this.storage.list(srcToolDir, { recursive: true });
                    for (const srcFile of srcFiles) {
                        const rel = srcFile.slice(srcToolDir.length + 1);
                        const destFile = join(destToolDir, rel);
                        const destExists = await this.storage.exists(destFile);
                        if (!destExists) {
                            try {
                                const content = await this.storage.read(srcFile);
                                if (content != null) {
                                    await this.storage.mkdir(join(destFile, '..'));
                                    await this.storage.write(destFile, content);
                                    result.added.push(join('tools', toolName, rel));
                                }
                            }
                            catch {
                                // Non-fatal: skip individual file on error
                            }
                        }
                    }
                }
            }
        }
        // Always refresh GUIDE.md (reference docs, not user content)
        if (options.sourcePaths?.guide) {
            const guideSrc = options.sourcePaths.guide;
            const guideDest = join(workspaceRoot, 'GUIDE.md');
            const guideSrcExists = await this.storage.exists(guideSrc);
            if (guideSrcExists) {
                try {
                    const content = await this.storage.read(guideSrc);
                    if (content != null) {
                        const guideExisted = await this.storage.exists(guideDest);
                        await this.storage.write(guideDest, content);
                        if (guideExisted) {
                            result.updated.push('GUIDE.md');
                        }
                        else {
                            result.added.push('GUIDE.md');
                        }
                    }
                }
                catch {
                    // Non-fatal: skip GUIDE.md refresh on error
                }
            }
        }
        // Backfill missing templates (never overwrite existing)
        if (options.sourcePaths?.templates) {
            const templateSrc = options.sourcePaths.templates;
            const templateDest = join(workspaceRoot, 'templates');
            const srcExists = await this.storage.exists(templateSrc);
            if (srcExists) {
                const srcFiles = await this.storage.list(templateSrc, { recursive: true });
                for (const srcFile of srcFiles) {
                    const rel = srcFile.slice(templateSrc.length + 1);
                    const destFile = join(templateDest, rel);
                    const destExists = await this.storage.exists(destFile);
                    if (!destExists) {
                        try {
                            const content = await this.storage.read(srcFile);
                            if (content != null) {
                                await this.storage.mkdir(join(destFile, '..'));
                                await this.storage.write(destFile, content);
                                result.added.push(join('templates', rel));
                            }
                        }
                        catch {
                            // Non-fatal: skip individual template backfill on error
                        }
                    }
                }
            }
        }
        // Regenerate AGENTS.md / CLAUDE.md on update (always refreshes to latest version)
        const rootFiles = adapter.generateRootFiles(config, workspaceRoot);
        for (const [filename, content] of Object.entries(rootFiles)) {
            const filePath = join(workspaceRoot, filename);
            await this.storage.write(filePath, content);
            result.updated.push(filename);
        }
        return result;
    }
    async copyDirectory(sourceDir, targetDir) {
        const files = await this.storage.list(sourceDir, { recursive: true });
        for (const sourcePath of files) {
            const relativePath = sourcePath.slice(sourceDir.length + 1);
            const targetPath = join(targetDir, relativePath);
            const parentDir = join(targetPath, '..');
            const content = await this.storage.read(sourcePath);
            if (content == null)
                continue;
            await this.storage.mkdir(parentDir);
            await this.storage.write(targetPath, content);
        }
    }
    async isCommunitySkill(skillDir) {
        const metaPath = join(skillDir, '.arete-meta.yaml');
        const exists = await this.storage.exists(metaPath);
        if (!exists)
            return false;
        const content = await this.storage.read(metaPath);
        if (!content)
            return false;
        try {
            const parsed = parseYaml(content);
            return parsed.category === 'community';
        }
        catch {
            return false;
        }
    }
    async syncCoreSkills(sourceSkillsDir, targetSkillsDir, overrides) {
        const added = [];
        const updated = [];
        const preserved = [];
        const sourceExists = await this.storage.exists(sourceSkillsDir);
        if (!sourceExists)
            return { added, updated, preserved };
        await this.storage.mkdir(targetSkillsDir);
        const sourceSkillDirs = await this.storage.listSubdirectories(sourceSkillsDir);
        for (const sourceSkillDir of sourceSkillDirs) {
            const skillName = sourceSkillDir.split(/[/\\]/).pop() ?? '';
            if (!skillName)
                continue;
            const targetSkillDir = join(targetSkillsDir, skillName);
            const targetExists = await this.storage.exists(targetSkillDir);
            if (overrides.has(skillName)) {
                preserved.push(skillName);
                continue;
            }
            if (targetExists && await this.isCommunitySkill(targetSkillDir)) {
                preserved.push(skillName);
                continue;
            }
            await this.copyDirectory(sourceSkillDir, targetSkillDir);
            if (targetExists) {
                updated.push(skillName);
            }
            else {
                added.push(skillName);
            }
        }
        return { added, updated, preserved };
    }
    async ensureWorkspaceStructure(workspaceRoot, options) {
        const directoriesAdded = [];
        const filesAdded = [];
        const allDirs = options.getIDEDirs
            ? [...BASE_WORKSPACE_DIRS, ...options.getIDEDirs()]
            : BASE_WORKSPACE_DIRS;
        for (const dir of allDirs) {
            const fullPath = join(workspaceRoot, dir);
            const exists = await this.storage.exists(fullPath);
            if (!exists) {
                await this.storage.mkdir(fullPath);
                directoriesAdded.push(dir);
            }
        }
        for (const [filePath, content] of Object.entries(DEFAULT_FILES)) {
            const fullPath = join(workspaceRoot, filePath);
            const exists = await this.storage.exists(fullPath);
            if (!exists) {
                const parentDir = join(fullPath, '..');
                await this.storage.mkdir(parentDir);
                await this.storage.write(fullPath, content);
                filesAdded.push(filePath);
            }
        }
        return { directoriesAdded, filesAdded };
    }
    /**
     * Update a single field in arete.yaml without overwriting the entire file.
     * Reads, patches, and writes back. Non-fatal on error.
     */
    async updateManifestField(workspaceRoot, field, value) {
        const manifestPath = join(workspaceRoot, 'arete.yaml');
        const exists = await this.storage.exists(manifestPath);
        if (!exists)
            return;
        const content = await this.storage.read(manifestPath);
        if (!content)
            return;
        try {
            const parsed = parseYaml(content);
            parsed[field] = value;
            await this.storage.write(manifestPath, stringifyYaml(parsed));
        }
        catch {
            // Non-fatal: if we can't update the manifest, the workspace still works
        }
    }
    async getStatus(workspaceRoot) {
        const errors = [];
        const manifestPath = join(workspaceRoot, 'arete.yaml');
        const hasManifest = await this.storage.exists(manifestPath);
        let version = null;
        let config = null;
        if (hasManifest) {
            const content = await this.storage.read(manifestPath);
            if (content) {
                try {
                    const parsed = parseYaml(content);
                    version = parsed.version ?? null;
                    config = parsed;
                }
                catch {
                    errors.push('Could not parse arete.yaml');
                }
            }
        }
        else {
            errors.push('No arete.yaml found');
        }
        return {
            initialized: hasManifest,
            version,
            ideTarget: config?.ide_target,
            agentMode: config?.agent_mode,
            errors,
        };
    }
}
//# sourceMappingURL=workspace.js.map