/**
 * Service container factory — creates all services with correct dependencies.
 *
 * Single entry point for wiring up the Areté service graph.
 * Accepts a workspace root and returns a typed AreteServices object.
 */
import type { SearchProvider } from './search/types.js';
import type { AreteConfig } from './models/workspace.js';
import { FileStorageAdapter } from './storage/file.js';
import { ContextService } from './services/context.js';
import { MemoryService } from './services/memory.js';
import { EntityService } from './services/entity.js';
import { IntelligenceService } from './services/intelligence.js';
import { WorkspaceService } from './services/workspace.js';
import { SkillService } from './services/skills.js';
import { IntegrationService } from './services/integrations.js';
import { ToolService } from './services/tools.js';
/**
 * All services created by the factory, keyed by role.
 */
export type AreteServices = {
    storage: FileStorageAdapter;
    search: SearchProvider;
    context: ContextService;
    memory: MemoryService;
    entity: EntityService;
    intelligence: IntelligenceService;
    workspace: WorkspaceService;
    skills: SkillService;
    tools: ToolService;
    integrations: IntegrationService;
};
/**
 * Options for createServices. All optional — sensible defaults are used.
 */
export interface CreateServicesOptions {
    /** Override the AreteConfig instead of loading from workspace. */
    config?: AreteConfig;
}
/**
 * Create all Areté services wired with correct dependencies.
 *
 * Loads AreteConfig from the workspace (arete.yaml) unless overridden via options.
 * The returned object gives typed access to every service.
 *
 * @param workspaceRoot - Absolute path to the workspace root directory
 * @param options - Optional overrides (e.g. pre-loaded config)
 */
export declare function createServices(workspaceRoot: string, options?: CreateServicesOptions): Promise<AreteServices>;
//# sourceMappingURL=factory.d.ts.map