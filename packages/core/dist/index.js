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
// Generators
export * from './generators/index.js';
// Utilities
export * from './utils/index.js';
// Compatibility shims (legacy function APIs)
export { isAreteWorkspace, findWorkspaceRoot, getWorkspacePaths, parseSourceType, getSourcePaths, getRelevantContext, searchMemory, assembleBriefing, routeToSkill, resolveEntity, resolveEntities, listPeople, getPersonBySlug, getPersonByEmail, updatePeopleIndex, slugifyPersonName, PEOPLE_CATEGORIES, } from './compat/index.js';
// Model router (task classification)
export { classifyTask } from './model-router.js';
// Config (for calendar, etc.)
export { loadConfig, getWorkspaceConfigPath } from './config.js';
// AI credentials management
export { loadCredentials, saveCredential, getApiKey, getEnvVarName, getConfiguredProviders, getCredentialsPath, hasSecurePermissions, loadCredentialsIntoEnv, 
// OAuth support
getOAuthPath, loadOAuthCredentials, saveOAuthCredentials, getAvailableOAuthProviders, hasOAuthCredentials, getOAuthApiKeyForProvider, } from './credentials.js';
// Package root resolution (for install, etc.)
export { getPackageRoot } from './package-root.js';
// Adapters and integrations
export { getAdapter, detectAdapter, getAdapterFromConfig } from './adapters/index.js';
export { getCalendarProvider, } from './integrations/calendar/index.js';
export { saveMeetingFile, meetingFilename, findMatchingAgenda, findMatchingAgendaPath, findMatchingCalendarEvent, inferMeetingImportance, } from './integrations/meetings.js';
export { generateItemId, parseStagedSections, parseStagedItemStatus, parseStagedItemEdits, parseStagedItemOwner, writeItemStatusToFile, commitApprovedItems, } from './integrations/staged-items.js';
export { saveConversationFile, conversationFilename, updateConversationFrontmatter, parseConversation, extractInsights, } from './integrations/conversations/index.js';
// Service container factory
export { createServices } from './factory.js';
// Topic wiki memory (L3)
export { renderTopicPage, parseTopicPage, getTopicHeadline, selectSectionsForBudget, SECTION_NAMES, } from './models/topic-page.js';
export { getActiveTopics, renderActiveTopicsAsWikilinks, renderActiveTopicsAsSlugList, maxLastRefreshed, } from './models/active-topics.js';
export { loadMemorySummary } from './services/memory-summary-loader.js';
export { TopicMemoryService, hashSource, hashMeetingSource, classifyByJaccard, tokenizeSlug, estimateRefreshCostUsd, ESTIMATED_USD_PER_INTEGRATION, discoverTopicSources, SLACK_DIGEST_FILENAME_RE, } from './services/topic-memory.js';
export { detectTopicsLexical, detectTopicsLexicalDetailed, STOP_TOKENS } from './services/topic-detection.js';
export { MemoryIndexService, renderMemoryIndex } from './services/memory-index.js';
export { MemoryLogService } from './services/memory-log.js';
export { acquireSeedLock, readSeedLock, breakSeedLock, SeedLockHeldError, } from './services/seed-lock.js';
export { formatEvent as formatMemoryLogEvent, parseEvent as parseMemoryLogEvent, parseLog as parseMemoryLog, appendEvent as appendMemoryLogEvent, nowIsoSeconds, } from './utils/memory-log.js';
// Meeting parsing helper
export { parseMeetingFile } from './services/meeting-context.js';
// Google Calendar integration
export { getGoogleCalendarProvider, listCalendars } from './integrations/calendar/google-calendar.js';
export { authenticate as authenticateGoogle, loadGoogleCredentials, getClientCredentials } from './integrations/calendar/google-auth.js';
// Krisp integration
export { KrispMcpClient } from './integrations/krisp/client.js';
export { loadKrispCredentials, saveKrispCredentials, } from './integrations/krisp/config.js';
// Google Workspace (gws CLI) integration
export { detectGws, gwsExec, getEmailProvider, getDriveProvider, getDocsProvider, getSheetsProvider, getDirectoryProvider, GmailProvider, getGmailProvider, GwsDriveProvider, getGwsDriveProvider, GwsDocsProvider, getGwsDocsProvider, GwsSheetsProvider, getGwsSheetsProvider, GwsDirectoryProvider, getGwsDirectoryProvider, GwsNotInstalledError, GwsAuthError, GwsTimeoutError, GwsExecError, } from './integrations/gws/index.js';
// Notion integration
export { pullNotionPages } from './integrations/notion/index.js';
export { loadNotionApiKey } from './integrations/notion/config.js';
export { resolvePageId } from './integrations/notion/url.js';
//# sourceMappingURL=index.js.map