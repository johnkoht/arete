// @arete/core - Intelligence and service layer
export const VERSION = '0.1.0';

// Model type definitions
export * from './models/index.js';

// Storage interface
export * from './storage/index.js';

// Search types
export * from './search/index.js';

// Services
export * from './services/index.js';

// Utilities
export * from './utils/index.js';

// Compatibility shims (legacy function APIs)
export {
  isAreteWorkspace,
  findWorkspaceRoot,
  getWorkspacePaths,
  parseSourceType,
  getSourcePaths,
  getRelevantContext,
  searchMemory,
  assembleBriefing,
  routeToSkill,
  resolveEntity,
  resolveEntities,
  listPeople,
  getPersonBySlug,
  getPersonByEmail,
  updatePeopleIndex,
  slugifyPersonName,
  PEOPLE_CATEGORIES,
} from './compat/index.js';
export type { ListPeopleOptions, BriefingOptions } from './compat/index.js';

// Adapters and integrations
export { getAdapter, detectAdapter, getAdapterFromConfig } from './adapters/index.js';
export type { IDEAdapter, IDETarget } from './adapters/index.js';
export { getCalendarProvider } from './integrations/calendar/index.js';
