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
export { generateItemId, parseStagedSections, parseStagedItemStatus, parseStagedItemEdits, parseStagedItemOwner, parseStagedItemSkipReason, parseStagedItemImportance, parseStagedItemUncertain, parseStagedItemLinks, parseStagedItemElevated, writeItemStatusToFile, writeItemElevatedToFile, removeItemElevatedFromFile, writeMeetingTopicsToFile, commitApprovedItems, } from './integrations/staged-items.js';
export { renderStagedItemsAsChecklist, renderWinddownDoc, renderStagedBlock, buildChecklistMeeting, renderMeeting, renderChoices, renderActions, uncertainItemToChoice, itemAnchor, choiceAnchor, actionAnchor, isUncertain, prefillChecked, tierMarker, linkSuffix, sortByTier, ITEM_ANCHOR_RE, CHOICE_ANCHOR_RE, ACTION_ANCHOR_RE, } from './integrations/winddown-checklist.js';
export { parseWinddownDoc, buildApplyPlan, renderApplySummary, executeWinddownApply, } from './integrations/winddown-apply.js';
export { saveConversationFile, conversationFilename, updateConversationFrontmatter, parseConversation, extractInsights, } from './integrations/conversations/index.js';
// Service container factory
export { createServices } from './factory.js';
// Topic wiki memory (L3)
export { renderTopicPage, parseTopicPage, getTopicHeadline, selectSectionsForBudget, SECTION_NAMES, } from './models/topic-page.js';
export { getActiveTopics, renderActiveTopicsAsWikilinks, renderActiveTopicsAsSlugList, maxLastRefreshed, } from './models/active-topics.js';
export { loadMemorySummary } from './services/memory-summary-loader.js';
export { TopicMemoryService, hashSource, hashMeetingSource, classifyByJaccard, tokenizeSlug, estimateRefreshCostUsd, ESTIMATED_USD_PER_INTEGRATION, discoverTopicSources, SLACK_DIGEST_FILENAME_RE, DEFAULT_INTEGRATION_LLM_TIMEOUT_MS, resolveIntegrationLlmTimeoutMs, } from './services/topic-memory.js';
export { detectTopicsLexical, detectTopicsLexicalDetailed, STOP_TOKENS } from './services/topic-detection.js';
export { MemoryIndexService, renderMemoryIndex } from './services/memory-index.js';
export { MemoryLogService } from './services/memory-log.js';
export { acquireSeedLock, readSeedLock, breakSeedLock, isPidAlive, SeedLockHeldError, } from './services/seed-lock.js';
export { formatEvent as formatMemoryLogEvent, parseEvent as parseMemoryLogEvent, parseLog as parseMemoryLog, appendEvent as appendMemoryLogEvent, nowIsoSeconds, } from './utils/memory-log.js';
// Meeting parsing helper
export { parseMeetingFile } from './services/meeting-context.js';
// Phase 3.5 followup-5 — unified meeting-frontmatter writer (AC1).
// Shared across CLI `meeting apply` / `meeting extract --stage` and
// backend `/process`. Closes the path-3 regression where extract --stage
// silently dropped topics + counts.
export { writeMeetingApplyFrontmatter } from './services/meeting-frontmatter.js';
// Phase 3.5 D4 — backfill CLI needs to scan approved meeting bodies
// for staged-then-approved items. `parseApprovedSection` is the
// minimal pure helper exposed for that purpose.
export { parseApprovedSection } from './services/meeting-reconciliation.js';
// Google Calendar integration
export { getGoogleCalendarProvider, listCalendars } from './integrations/calendar/google-calendar.js';
export { authenticate as authenticateGoogle, loadGoogleCredentials, getClientCredentials } from './integrations/calendar/google-auth.js';
// Krisp integration
export { KrispMcpClient } from './integrations/krisp/client.js';
export { loadKrispCredentials, saveKrispCredentials, } from './integrations/krisp/config.js';
// Google Workspace (gws CLI) integration
export { detectGws, gwsExec, getEmailProvider, getDriveProvider, getDocsProvider, getSheetsProvider, getDirectoryProvider, GmailProvider, getGmailProvider, GwsDriveProvider, getGwsDriveProvider, GwsDocsProvider, getGwsDocsProvider, GwsSheetsProvider, getGwsSheetsProvider, GwsDirectoryProvider, getGwsDirectoryProvider, GwsNotInstalledError, GwsAuthError, GwsTimeoutError, GwsExecError, GMAIL_SENT_CACHE_VERSION, normalizeEmail, gmailSentCachePath, buildRecipientIndex, writeGmailSentCache, readGmailSentCache, deleteGmailSentCache, } from './integrations/gws/index.js';
// Notion integration
export { pullNotionPages } from './integrations/notion/index.js';
export { loadNotionApiKey } from './integrations/notion/config.js';
export { resolvePageId } from './integrations/notion/url.js';
//# sourceMappingURL=index.js.map