/**
 * Service container factory — creates all services with correct dependencies.
 *
 * Single entry point for wiring up the Areté service graph.
 * Accepts a workspace root and returns a typed AreteServices object.
 */
import { FileStorageAdapter } from './storage/file.js';
import { getSearchProvider } from './search/factory.js';
import { loadConfig } from './config.js';
import { ContextService } from './services/context.js';
import { MemoryService } from './services/memory.js';
import { EntityService } from './services/entity.js';
import { IntelligenceService } from './services/intelligence.js';
import { WorkspaceService } from './services/workspace.js';
import { SkillService } from './services/skills.js';
import { IntegrationService } from './services/integrations.js';
import { ToolService } from './services/tools.js';
import { CommitmentsService } from './services/commitments.js';
import { AreaParserService } from './services/area-parser.js';
import { AIService } from './services/ai.js';
import { TaskService } from './services/tasks.js';
/**
 * Create all Areté services wired with correct dependencies.
 *
 * Loads AreteConfig from the workspace (arete.yaml) unless overridden via options.
 * The returned object gives typed access to every service.
 *
 * @param workspaceRoot - Absolute path to the workspace root directory
 * @param options - Optional overrides (e.g. pre-loaded config)
 */
export async function createServices(workspaceRoot, options) {
    // Infrastructure
    const storage = new FileStorageAdapter();
    const search = getSearchProvider(workspaceRoot);
    // Load config for IntegrationService
    const config = options?.config ?? await loadConfig(storage, workspaceRoot);
    // Core services (depend on storage + search)
    const context = new ContextService(storage, search);
    const memory = new MemoryService(storage, search);
    const entity = new EntityService(storage, search);
    // Orchestration (depends on core services)
    const intelligence = new IntelligenceService(context, memory, entity);
    // Workspace management (depends on storage only)
    const workspace = new WorkspaceService(storage);
    const skills = new SkillService(storage);
    const tools = new ToolService(storage);
    const integrations = new IntegrationService(storage, config);
    const commitments = new CommitmentsService(storage, workspaceRoot);
    const areaParser = new AreaParserService(storage, workspaceRoot);
    // Task management (depends on storage + workspace paths + commitments for auto-resolution)
    const workspacePaths = workspace.getPaths(workspaceRoot);
    const tasks = new TaskService(storage, workspacePaths, commitments);
    // Wire up cross-service dependencies
    // CommitmentsService needs to create tasks, but TaskService needs CommitmentsService.
    // Break the cycle by injecting the task creation function after construction.
    commitments.setCreateTaskFn(async (text, metadata) => {
        const task = await tasks.addTask(text, 'inbox', metadata);
        return { id: task.id, text: task.text };
    });
    // AI service (depends on config)
    const ai = new AIService(config);
    return {
        storage,
        search,
        context,
        memory,
        entity,
        intelligence,
        workspace,
        skills,
        tools,
        integrations,
        commitments,
        areaParser,
        ai,
        tasks,
    };
}
//# sourceMappingURL=factory.js.map