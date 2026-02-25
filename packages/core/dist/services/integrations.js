/**
 * IntegrationService — manages integration pull and configuration.
 */
import { join } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { INTEGRATIONS } from '../integrations/registry.js';
import { pullFathom } from '../integrations/fathom/index.js';
import { pullKrisp } from '../integrations/krisp/index.js';
import { pullNotionPages } from '../integrations/notion/index.js';
import { loadKrispCredentials } from '../integrations/krisp/config.js';
import { loadNotionApiKey } from '../integrations/notion/config.js';
import { loadGoogleCredentials } from '../integrations/calendar/google-auth.js';
import { getWorkspaceConfigPath } from '../config.js';
import { getAdapterFromConfig } from '../adapters/index.js';
export class IntegrationService {
    storage;
    config;
    constructor(storage, config) {
        this.storage = storage;
        this.config = config;
    }
    async pull(workspaceRoot, integration, options) {
        const paths = this.getFullPaths(workspaceRoot);
        const status = await this.getIntegrationStatus(workspaceRoot, integration);
        if (status !== 'active') {
            return {
                integration,
                itemsProcessed: 0,
                itemsCreated: 0,
                itemsUpdated: 0,
                errors: [`Integration not active: ${integration}`],
            };
        }
        if (integration === 'fathom') {
            const days = options.days ?? 7;
            const result = await pullFathom(this.storage, workspaceRoot, paths, days);
            return {
                integration,
                itemsProcessed: result.saved + result.errors.length,
                itemsCreated: result.saved,
                itemsUpdated: 0,
                errors: result.errors,
            };
        }
        if (integration === 'krisp') {
            const days = options.days ?? 7;
            const result = await pullKrisp(this.storage, workspaceRoot, paths, days);
            return {
                integration,
                itemsProcessed: result.saved + result.errors.length,
                itemsCreated: result.saved,
                itemsUpdated: 0,
                errors: result.errors,
            };
        }
        // TODO: Refactor to provider registry pattern when adding 4th integration
        if (integration === 'notion') {
            const pages = options.pages ?? [];
            const destination = options.destination ?? 'resources/notion';
            const result = await pullNotionPages(this.storage, workspaceRoot, paths, {
                pages,
                destination,
            });
            return {
                integration,
                itemsProcessed: result.saved.length + result.skipped.length + result.errors.length,
                itemsCreated: result.saved.length,
                itemsUpdated: 0,
                errors: result.errors.map((e) => `${e.pageId}: ${e.error}`),
            };
        }
        return {
            integration,
            itemsProcessed: 0,
            itemsCreated: 0,
            itemsUpdated: 0,
            errors: [`Unknown or unsupported integration: ${integration}`],
        };
    }
    async list(workspaceRoot) {
        const paths = this.getPaths(workspaceRoot);
        const configsDir = join(paths.integrations, 'configs');
        const configsExist = await this.storage.exists(configsDir);
        const configured = {};
        // Primary source: workspace manifest integrations config
        const manifestIntegrations = await this.getManifestIntegrations(workspaceRoot);
        for (const [name, value] of Object.entries(manifestIntegrations)) {
            if (!value || typeof value !== 'object')
                continue;
            const status = value.status;
            if (typeof status === 'string') {
                configured[name] = status;
            }
        }
        // Calendar provider alias mapping:
        // configure writes integrations.calendar.provider ('google' or 'macos').
        // integration list entries are registry names ('google-calendar', 'apple-calendar').
        const manifestCalendar = manifestIntegrations.calendar;
        if (manifestCalendar && typeof manifestCalendar === 'object') {
            const calendarProvider = manifestCalendar.provider;
            const calendarStatus = manifestCalendar.status;
            if (typeof calendarStatus === 'string') {
                if (calendarProvider === 'google') {
                    configured['google-calendar'] = calendarStatus;
                }
                if (calendarProvider === 'macos' || calendarProvider === 'ical-buddy') {
                    configured['apple-calendar'] = calendarStatus;
                }
            }
        }
        // Backward-compat source: IDE integration config files
        if (configsExist) {
            const files = await this.storage.list(configsDir, {
                extensions: ['.yaml'],
            });
            for (const filePath of files) {
                const name = filePath.split(/[/\\]/).pop()?.replace(/\.yaml$/, '') ?? '';
                const content = await this.storage.read(filePath);
                if (!content)
                    continue;
                try {
                    const parsed = parseYaml(content);
                    const status = parsed.status ?? 'inactive';
                    if (!configured[name] || status === 'active') {
                        configured[name] = status;
                    }
                }
                catch {
                    if (!configured[name]) {
                        configured[name] = 'inactive';
                    }
                }
            }
        }
        const entries = [];
        for (const int of Object.values(INTEGRATIONS)) {
            const cfg = configured[int.name] ?? null;
            entries.push({
                name: int.name,
                displayName: int.displayName,
                description: int.description,
                implements: int.implements,
                status: int.status,
                configured: cfg,
                active: cfg === 'active',
            });
        }
        return entries;
    }
    async configure(workspaceRoot, integration, config) {
        const configPath = getWorkspaceConfigPath(workspaceRoot);
        let existing = { schema: 1 };
        const exists = await this.storage.exists(configPath);
        if (exists) {
            const content = await this.storage.read(configPath);
            if (content) {
                try {
                    existing = parseYaml(content) ?? existing;
                }
                catch {
                    // keep default
                }
            }
        }
        const integrations = existing.integrations ?? {};
        integrations[integration] = config;
        existing.integrations = integrations;
        await this.storage.write(configPath, stringifyYaml(existing));
    }
    getPaths(workspaceRoot) {
        const adapter = getAdapterFromConfig(this.config, workspaceRoot);
        return {
            root: workspaceRoot,
            integrations: join(workspaceRoot, adapter.integrationsDir()),
            resources: join(workspaceRoot, 'resources'),
        };
    }
    getFullPaths(workspaceRoot) {
        const adapter = getAdapterFromConfig(this.config, workspaceRoot);
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
    async getManifestIntegrations(workspaceRoot) {
        const configPath = getWorkspaceConfigPath(workspaceRoot);
        const exists = await this.storage.exists(configPath);
        if (!exists)
            return {};
        const content = await this.storage.read(configPath);
        if (!content)
            return {};
        try {
            const parsed = parseYaml(content);
            const integrations = parsed.integrations;
            if (!integrations || typeof integrations !== 'object')
                return {};
            return integrations;
        }
        catch {
            return {};
        }
    }
    async getIntegrationStatus(workspaceRoot, integration) {
        if (integration === 'fathom') {
            const manifestIntegrations = await this.getManifestIntegrations(workspaceRoot);
            const manifestCfg = manifestIntegrations.fathom;
            if (manifestCfg && typeof manifestCfg === 'object') {
                const status = manifestCfg.status;
                if (typeof status === 'string') {
                    return status;
                }
            }
            const paths = this.getPaths(workspaceRoot);
            const configPath = join(paths.integrations, 'configs', 'fathom.yaml');
            const exists = await this.storage.exists(configPath);
            if (exists) {
                const content = await this.storage.read(configPath);
                if (content) {
                    try {
                        const parsed = parseYaml(content);
                        return parsed.status ?? 'inactive';
                    }
                    catch {
                        return 'inactive';
                    }
                }
            }
            if (process.env.FATHOM_API_KEY)
                return 'active';
            return null;
        }
        if (integration === 'krisp') {
            return this.loadOAuthTokenStatus(workspaceRoot, 'krisp');
        }
        if (integration === 'notion') {
            // Manifest-only: check arete.yaml config + credential loader (no legacy IDE config files)
            const manifestIntegrations = await this.getManifestIntegrations(workspaceRoot);
            const manifestCfg = manifestIntegrations.notion;
            if (manifestCfg && typeof manifestCfg === 'object') {
                const status = manifestCfg.status;
                if (status === 'active') {
                    return 'active';
                }
            }
            const apiKey = await loadNotionApiKey(this.storage, workspaceRoot);
            return apiKey ? 'active' : 'inactive';
        }
        if (integration === 'google-calendar') {
            return this.loadOAuthTokenStatus(workspaceRoot, 'google-calendar');
        }
        return null;
    }
    async loadOAuthTokenStatus(workspaceRoot, name) {
        if (name === 'krisp') {
            const creds = await loadKrispCredentials(this.storage, workspaceRoot);
            return creds ? 'active' : 'inactive';
        }
        if (name === 'google-calendar') {
            const creds = await loadGoogleCredentials(this.storage, workspaceRoot);
            return creds ? 'active' : 'inactive';
        }
        return 'inactive';
    }
}
//# sourceMappingURL=integrations.js.map