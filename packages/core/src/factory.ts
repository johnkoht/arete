/**
 * Service container factory — creates all services with correct dependencies.
 *
 * Single entry point for wiring up the Areté service graph.
 * Accepts a workspace root and returns a typed AreteServices object.
 */

import type { SearchProvider } from './search/types.js';
import type { AreteConfig } from './models/workspace.js';
import type { GwsDetectionResult, EmailProvider, DriveProvider, DocsProvider, SheetsProvider, DirectoryProvider } from './integrations/gws/index.js';
import { FileStorageAdapter } from './storage/file.js';
import { getSearchProvider } from './search/factory.js';
import { loadConfig, getDefaultConfig } from './config.js';
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
import { AreaMemoryService } from './services/area-memory.js';
import { TopicMemoryService } from './services/topic-memory.js';
import { MemoryIndexService } from './services/memory-index.js';
import { MemoryLogService } from './services/memory-log.js';
import { HygieneService } from './services/hygiene.js';
import { detectGws, getEmailProvider, getDriveProvider, getDocsProvider, getSheetsProvider, getDirectoryProvider } from './integrations/gws/index.js';

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
  commitments: CommitmentsService;
  areaParser: AreaParserService;
  areaMemory: AreaMemoryService;
  topicMemory: TopicMemoryService;
  memoryIndex: MemoryIndexService;
  memoryLog: MemoryLogService;
  hygiene: HygieneService;
  ai: AIService;
  tasks: TaskService;
  gws: {
    detection: GwsDetectionResult;
    email: EmailProvider | null;
    drive: DriveProvider | null;
    docs: DocsProvider | null;
    sheets: SheetsProvider | null;
    directory: DirectoryProvider | null;
  };
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
export async function createServices(
  workspaceRoot: string,
  options?: CreateServicesOptions,
): Promise<AreteServices> {
  // Infrastructure
  const storage = new FileStorageAdapter();
  const search = getSearchProvider(workspaceRoot);

  // Load config for IntegrationService
  const config = options?.config ?? await loadConfig(storage, workspaceRoot);

  // GWS providers (null if google-workspace integration not active)
  // Created early so IntelligenceService can use email for enrichment
  // and EntityService can use directory for fallback resolution
  const gwsEmail = await getEmailProvider(config, storage, workspaceRoot);
  const gwsDrive = await getDriveProvider(config, storage, workspaceRoot);
  const gwsDocs = await getDocsProvider(config, storage, workspaceRoot);
  const gwsSheets = await getSheetsProvider(config, storage, workspaceRoot);
  const gwsDirectory = await getDirectoryProvider(config, storage, workspaceRoot);

  // Core services (depend on storage + search)
  const context = new ContextService(storage, search);
  const memory = new MemoryService(storage, search);
  const entity = new EntityService(storage, search, gwsDirectory);

  // Orchestration (depends on core services)
  const intelligence = new IntelligenceService(context, memory, entity, gwsEmail);

  // Workspace management (depends on storage only)
  const workspace = new WorkspaceService(storage);
  const skills = new SkillService(storage);
  const tools = new ToolService(storage);
  const integrations = new IntegrationService(storage, config);
  const commitments = new CommitmentsService(storage, workspaceRoot);
  const areaParser = new AreaParserService(storage, workspaceRoot);

  // Topic memory (L3 wiki — depends on storage + search for retrieval)
  const topicMemory = new TopicMemoryService(storage, search);

  // Area memory (depends on storage + areaParser + commitments + memory + topicMemory for Topics section enrichment)
  const areaMemory = new AreaMemoryService(storage, areaParser, commitments, memory, topicMemory);

  // Memory index (depends on topicMemory + entity + areaParser + commitments)
  const memoryIndex = new MemoryIndexService(storage, topicMemory, entity, areaParser, commitments);

  // Memory log — atomic-append writer-of-record for .arete/memory/log.md
  const memoryLog = new MemoryLogService(storage);

  // Workspace paths (used by hygiene + tasks)
  const workspacePaths = workspace.getPaths(workspaceRoot);

  // Hygiene (depends on storage + commitments + areaMemory + areaParser + memory + paths)
  const hygiene = new HygieneService(storage, workspaceRoot, commitments, areaMemory, areaParser, memory, workspacePaths);

  // Task management (depends on storage + workspace paths + commitments for auto-resolution)
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

  // GWS detection (non-blocking — returns { installed: false } if binary missing)
  const gwsDetection = await detectGws();

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
    areaMemory,
    topicMemory,
    memoryIndex,
    memoryLog,
    hygiene,
    ai,
    tasks,
    gws: {
      detection: gwsDetection,
      email: gwsEmail,
      drive: gwsDrive,
      docs: gwsDocs,
      sheets: gwsSheets,
      directory: gwsDirectory,
    },
  };
}
