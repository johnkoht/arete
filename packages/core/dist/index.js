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
export { isAreteWorkspace, findWorkspaceRoot, getWorkspacePaths, parseSourceType, getSourcePaths, getRelevantContext, searchMemory, assembleBriefing, routeToSkill, resolveEntity, resolveEntities, listPeople, getPersonBySlug, getPersonByEmail, updatePeopleIndex, slugifyPersonName, PEOPLE_CATEGORIES, } from './compat/index.js';
// Model router (task classification)
export { classifyTask } from './model-router.js';
// Config (for calendar, etc.)
export { loadConfig, getWorkspaceConfigPath } from './config.js';
// Package root resolution (for install, etc.)
export { getPackageRoot } from './package-root.js';
// Adapters and integrations
export { getAdapter, detectAdapter, getAdapterFromConfig } from './adapters/index.js';
export { getCalendarProvider, } from './integrations/calendar/index.js';
export { saveMeetingFile, meetingFilename, } from './integrations/meetings.js';
export { saveConversationFile, conversationFilename, updateConversationFrontmatter, parseConversation, extractInsights, } from './integrations/conversations/index.js';
// Service container factory
export { createServices } from './factory.js';
// Google Calendar integration
export { getGoogleCalendarProvider, listCalendars } from './integrations/calendar/google-calendar.js';
export { authenticate as authenticateGoogle, loadGoogleCredentials, getClientCredentials } from './integrations/calendar/google-auth.js';
// Krisp integration
export { KrispMcpClient } from './integrations/krisp/client.js';
export { loadKrispCredentials, saveKrispCredentials, } from './integrations/krisp/config.js';
// Notion integration
export { pullNotionPages } from './integrations/notion/index.js';
export { loadNotionApiKey } from './integrations/notion/config.js';
export { resolvePageId } from './integrations/notion/url.js';
//# sourceMappingURL=index.js.map