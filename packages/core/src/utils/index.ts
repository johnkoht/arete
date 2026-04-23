/**
 * Utilities barrel export.
 */

export { slugify } from './slugify.js';
export { parseDate, formatDuration } from './dates.js';
export {
  renderTemplate,
  renderTemplateString,
  resolveTemplatePath,
  resolveTemplateContent,
  TEMPLATE_REGISTRY,
} from './templates.js';
export { checkDuplicate } from './dedup.js';
export {
  buildContextDumpArtifacts,
  buildContextDumpQualityReport,
} from './context-dump-quality.js';
export type {
  ContextDumpInput,
  ContextDumpInputType,
  ContextDumpArtifact,
  ContextDumpQualityReport,
} from './context-dump-quality.js';
export { findAvailableSlots } from './availability.js';
export type {
  AvailableSlot,
  FindAvailableSlotsOptions,
} from './availability.js';
export {
  generateIntegrationSection,
  injectIntegrationSection,
  deriveIntegrationFromLegacy,
} from './integration.js';
export { parseAgendaItems, getUncheckedAgendaItems, getCompletedItems, getOpenTasks } from './agenda.js';
export type { AgendaItem } from './agenda.js';
export { extractAttendeeSlugs } from './attendees.js';
export { jaccardSimilarity, normalizeForJaccard } from './similarity.js';
